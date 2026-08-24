import { spawn } from 'child_process';
import fs from 'fs';

export const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_BIN || 'ffprobe';

export function run(cmd, args, { quiet = true } = {}) {
  const bin = cmd === 'ffmpeg' ? FFMPEG : cmd === 'ffprobe' ? FFPROBE : cmd;
  const full = bin === FFMPEG && quiet ? ['-hide_banner', '-loglevel', 'error', ...args] : args;

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, full, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${bin} exited ${code}\n  args: ${full.slice(0, 24).join(' ')}\n  ${stderr.trim().slice(-1200)}`));
    });
  });
}

/** EBU R128 measurement. ffmpeg reports it on stderr, which `run` discards. */
export function measureLoudness(file) {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, ['-hide_banner', '-nostats', '-i', file,
      '-af', 'ebur128=peak=true', '-f', 'null', '-'], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', () => {
      const tail = err.slice(-2000);
      resolve({
        lufs: parseFloat(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(tail)?.[1] ?? NaN),
        truePeak: parseFloat(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(tail)?.[1] ?? NaN),
        range: parseFloat(/LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/.exec(tail)?.[1] ?? NaN),
      });
    });
    proc.on('error', () => resolve({ lufs: NaN, truePeak: NaN, range: NaN }));
  });
}

export async function ffprobeDuration(file) {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]);
  const value = parseFloat(out);
  if (!Number.isFinite(value)) throw new Error(`Could not read duration of ${file}`);
  return value;
}

/**
 * Mastering presets.
 *
 * The source constraint drives everything here: the Edge endpoint only serves
 * 24 kHz mono, so there is nothing above ~11 kHz. An "air" shelf at 8.5 kHz or
 * an exciter reaching for 15 kHz has no real signal to work with and simply
 * amplifies codec noise — which is what made the first pass sound brittle and
 * metallic. So: no air band, no exciter, no artificial early reflection, and
 * all EQ moves kept well inside the band.
 *
 * Pick one with AUDIO_PRESET; `npm run preview:audio` renders all four side by
 * side from the same sentences.
 */
export const AUDIO_PRESETS = {
  // Untouched synthesis, for reference.
  raw: [],

  // Level and cleanup only. Most transparent, least "produced".
  clean: [
    'highpass=f=85',
    'equalizer=f=300:t=q:w=1.2:g=-1.5',
    'acompressor=threshold=-20dB:ratio=2.2:attack=15:release=220:makeup=2:knee=6',
    'loudnorm=I=-15:TP=-1.5:LRA=11',
    'alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50',
  ],

  // Default. Cuts the boxy low-mid, lifts presence where consonants live,
  // controls sibilance, one musical compressor.
  broadcast: [
    'highpass=f=85',
    'equalizer=f=200:t=q:w=1.1:g=-2',
    'equalizer=f=430:t=q:w=1.4:g=-1.5',
    'equalizer=f=2400:t=q:w=1.1:g=2',
    'deesser=i=0.3:m=0.5:f=0.3:s=o',
    'acompressor=threshold=-19dB:ratio=2.6:attack=12:release=200:makeup=2.5:knee=6',
    'loudnorm=I=-15:TP=-1.5:LRA=11',
    'alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50',
  ],

  // Fuller and softer: a little chest, a gentler presence lift. Easier on the
  // ear over a ten-minute lesson, slightly less crisp.
  warm: [
    'highpass=f=75',
    'equalizer=f=160:t=q:w=1.0:g=1',
    'equalizer=f=420:t=q:w=1.3:g=-2',
    'equalizer=f=2200:t=q:w=1.2:g=1.5',
    'deesser=i=0.35:m=0.5:f=0.3:s=o',
    'acompressor=threshold=-18dB:ratio=2.4:attack=18:release=240:makeup=2.5:knee=8',
    'loudnorm=I=-15:TP=-1.5:LRA=11',
    'alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50',
  ],
};

export const DEFAULT_PRESET = process.env.AUDIO_PRESET || 'broadcast';

export function masterChain(preset = DEFAULT_PRESET) {
  const chain = AUDIO_PRESETS[preset] || AUDIO_PRESETS.broadcast;
  return chain.join(',');
}

export async function masterVoice(inFile, outFile, preset = DEFAULT_PRESET) {
  const chain = masterChain(preset);
  const args = ['-y', '-i', inFile];
  if (chain) args.push('-af', chain);
  args.push('-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', outFile);
  await run('ffmpeg', args);
  return outFile;
}

/**
 * Lay a music bed under the voice and duck it out of the way with a sidechain
 * compressor, so the bed breathes instead of fighting the narration.
 */
export async function mixWithMusic(voiceFile, musicFile, outFile, { musicDb = -21 } = {}) {
  if (!musicFile || !fs.existsSync(musicFile)) {
    await run('ffmpeg', ['-y', '-i', voiceFile, '-c:a', 'aac', '-b:a', '192k', outFile]);
    return outFile;
  }
  await run('ffmpeg', ['-y',
    '-i', voiceFile,
    '-stream_loop', '-1', '-i', musicFile,
    '-filter_complex',
    `[1:a]volume=${musicDb}dB,aresample=48000[bed];` +
    `[0:a]asplit=2[v1][v2];` +
    `[bed][v1]sidechaincompress=threshold=0.03:ratio=8:attack=8:release=420[ducked];` +
    `[v2][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix];` +
    `[mix]alimiter=level_in=1:level_out=1:limit=0.97[out]`,
    '-map', '[out]', '-c:a', 'aac', '-b:a', '192k', outFile]);
  return outFile;
}
