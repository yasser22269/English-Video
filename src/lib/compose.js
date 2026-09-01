import fs from 'fs';
import path from 'path';
import { run } from './ffmpeg.js';

/**
 * Inside a filtergraph a Windows drive colon reads as the option separator, so
 * it needs escaping. Arguments go to ffmpeg directly with no shell in between,
 * so exactly one backslash is correct — doubling it makes ffmpeg look for a
 * file literally named "C\:/...".
 */
function filterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
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
    'fade=t=in:st=0:d=0.18',
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
 * Listening and speaking lessons: graded stock footage looped underneath,
 * branded overlays time-gated on top, then the karaoke track.
 *
 * These formats have a handful of scenes (a section card and the outro), not
 * eighty, so each gets its own `enable`d overlay. `OVERLAY_LIMIT` keeps the
 * filtergraph from exploding if a builder ever produces many more.
 */
const OVERLAY_LIMIT = 10;

export async function composeFootage({ footageFile, overlays, audioFile, assFile, outFile, video, fontsDir }) {
  const shown = overlays.slice(0, OVERLAY_LIMIT);

  // `-stream_loop` restarts the input's timestamps on every pass; regenerating
  // PTS from the frame counter is what keeps them monotonic across loops.
  const chain = [
    `[0:v]setpts=N/${video.fps}/TB,fps=${video.fps},` +
    `scale=${video.width}:${video.height}:flags=lanczos,setsar=1[bg0]`,
  ];

  shown.forEach((ov, i) => {
    const from = (ov.startSec ?? 0).toFixed(2);
    const to = (ov.startSec + ov.durationSec).toFixed(2);
    chain.push(`[bg${i}][${i + 1}:v]overlay=0:0:format=auto:enable='between(t,${from},${to})'[bg${i + 1}]`);
  });

  const lastLabel = `bg${shown.length}`;
  chain.push(`[${lastLabel}]${subtitleFilter(assFile, fontsDir)},format=yuv420p,fade=t=in:st=0:d=0.18[vo]`);

  const inputs = ['-stream_loop', '-1', '-i', footageFile];
  for (const ov of shown) inputs.push('-i', ov.file);
  inputs.push('-i', audioFile);

  await run('ffmpeg', ['-y',
    ...inputs,
    '-filter_complex', chain.join(';'),
    '-map', '[vo]', '-map', `${shown.length + 1}:a`,
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
