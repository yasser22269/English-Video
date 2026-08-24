import fs from 'fs';
import path from 'path';
import { run } from './ffmpeg.js';

/**
 * ffmpeg filter arguments are parsed twice — once by the filtergraph splitter,
 * once by the filter itself — so a Windows path needs its drive colon and
 * separators escaped or `subtitles=` silently looks for the wrong file.
 */
function filterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\\\:').replace(/'/g, "\\\\'");
}

function concatEntry(file, durationSec) {
  const safe = file.replace(/\\/g, '/').replace(/'/g, "'\\''");
  return durationSec == null ? `file '${safe}'` : `file '${safe}'\nduration ${durationSec.toFixed(3)}`;
}

/**
 * Concat demuxer script for a slideshow of stills.
 * The final image is listed twice: the demuxer ignores the last entry's
 * duration, and without the repeat the closing scene is dropped entirely.
 */
export function writeStillList(scenes, listFile) {
  const lines = scenes.map(s => concatEntry(s.file, s.durationSec));
  lines.push(concatEntry(scenes[scenes.length - 1].file, null));
  fs.mkdirSync(path.dirname(listFile), { recursive: true });
  fs.writeFileSync(listFile, lines.join('\n') + '\n');
  return listFile;
}

function subtitleFilter(assFile, fontsDir) {
  const parts = [`subtitles=filename='${filterPath(assFile)}'`];
  if (fontsDir && fs.existsSync(fontsDir)) parts.push(`fontsdir='${filterPath(fontsDir)}'`);
  return parts.join(':');
}

/**
 * Typography lessons: a slideshow of rendered stills, the karaoke track burned
 * on top, audio muxed — all in a single encode.
 */
export async function composeStills({ scenes, audioFile, assFile, outFile, video, fontsDir }) {
  const listFile = path.join(path.dirname(outFile), 'stills.txt');
  writeStillList(scenes, listFile);

  const vf = [
    `fps=${video.fps}`,
    `scale=${video.width}:${video.height}:flags=lanczos`,
    subtitleFilter(assFile, fontsDir),
    'format=yuv420p',
    'fade=t=in:st=0:d=0.7',
  ].join(',');

  await run('ffmpeg', ['-y',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', audioFile,
    '-vf', vf,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', video.preset, '-crf', String(video.crf),
    '-profile:v', 'high', '-level', '4.1',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-shortest',
    outFile]);
  return outFile;
}

/**
 * Listening and speaking lessons: prepared stock footage underneath, one static
 * branded overlay on top of it, then the karaoke track. The overlay is a single
 * still on purpose — chaining one overlay per scene over eight minutes of 1080p
 * costs several extra minutes of runner time for no pedagogical gain.
 */
export async function composeFootage({ footageFile, overlayPng, audioFile, assFile, outFile, video, fontsDir }) {
  const filter = [
    `[0:v]fps=${video.fps},scale=${video.width}:${video.height}:flags=lanczos,setsar=1[bg]`,
    `[bg][1:v]overlay=0:0:format=auto[ov]`,
    `[ov]${subtitleFilter(assFile, fontsDir)},format=yuv420p,fade=t=in:st=0:d=0.7[vo]`,
  ].join(';');

  await run('ffmpeg', ['-y',
    '-i', footageFile,
    '-i', overlayPng,
    '-i', audioFile,
    '-filter_complex', filter,
    '-map', '[vo]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', video.preset, '-crf', String(video.crf),
    '-profile:v', 'high', '-level', '4.1',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-shortest',
    outFile]);
  return outFile;
}

/** Solid-colour fallback background when no stock clip could be fetched. */
export async function generateGradientBackground({ outFile, durationSec, video, colorA = '#0B1220' }) {
  await run('ffmpeg', ['-y',
    '-f', 'lavfi',
    '-i', `color=c=${colorA.replace('#', '0x')}:s=${video.width}x${video.height}:r=${video.fps}:d=${durationSec.toFixed(2)}`,
    '-vf', 'noise=alls=6:allf=t+u,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    outFile]);
  return outFile;
}
