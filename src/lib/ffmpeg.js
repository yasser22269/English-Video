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
 * The mastering chain that decides whether the channel sounds like a person at
 * a microphone or like a screen reader.
 *
 * Neural TTS comes out clean, flat and dead-centred: no room, no proximity, a
 * fixed dynamic range, and a sibilant top end. Each stage below fixes one of
 * those tells, in the order a real vocal chain would:
 *   1. highpass       - drop sub-bass the voice never produced
 *   2. subtractive EQ - cut the 180/420 Hz "boxy laptop speaker" build-up
 *   3. additive EQ    - lift presence (2.6k) and air (8.5k) for intelligibility
 *   4. de-esser       - tame the sibilance step 3 just exaggerated
 *   5. two compressors- slow one for level, fast one for peaks: chest and grip
 *   6. exciter        - subtle harmonics, the "recorded through hardware" sheen
 *   7. aecho          - a single 18 ms reflection: the voice is now in a room
 *   8. loudnorm       - EBU R128 to the streaming target
 *   9. limiter        - safety ceiling, never clip
 */
export const MASTER_CHAIN = [
  'highpass=f=80',
  'equalizer=f=180:t=q:w=1.1:g=-2.5',
  'equalizer=f=420:t=q:w=1.4:g=-1.5',
  'equalizer=f=2600:t=q:w=1.0:g=2.0',
  'equalizer=f=8500:t=q:w=0.9:g=1.5',
  'deesser=i=0.35:m=0.5:f=0.35:s=o',
  'acompressor=threshold=-19dB:ratio=2.8:attack=12:release=180:makeup=2.5:knee=6',
  'acompressor=threshold=-9dB:ratio=4:attack=3:release=90:makeup=1',
  'aexciter=level_in=1:level_out=1:amount=0.6:drive=4:blend=0:freq=7200:ceil=15000',
  'aecho=0.9:0.85:18:0.045',
  'loudnorm=I=-15:TP=-1.5:LRA=11',
  'alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50',
].join(',');

export async function masterVoice(inFile, outFile) {
  await run('ffmpeg', ['-y', '-i', inFile, '-af', MASTER_CHAIN,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', outFile]);
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
