#!/usr/bin/env node
/**
 * Voice preview bench.
 *
 *   node scripts/preview-voice.js                 # default level a1 teacher voice
 *   node scripts/preview-voice.js --level b2
 *   node scripts/preview-voice.js --voice en-GB-RyanNeural --rate -4%
 *
 * Writes output/preview/raw.mp3 and output/preview/mastered.mp3 so the two can
 * be compared back to back. Use it whenever the mastering chain is touched.
 */
import path from 'path';
import fs from 'fs';
import { synthesizeLines, assembleVoiceTrack } from '../src/lib/tts.js';
import { masterVoice, run, ffprobeDuration } from '../src/lib/ffmpeg.js';
import { levelConfig, paths } from '../src/lib/config.js';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const level = arg('level', 'a1');
const lvl = levelConfig(level);
const voice = arg('voice', lvl.teacher);
const rate = arg('rate', lvl.rate);

const SAMPLE = [
  'Welcome back to English Every Day. Today we are learning ten new words about travelling on a budget.',
  'The first word is affordable.',
  'Affordable means cheap enough that you can pay for it without any trouble.',
  'Listen to this example. We finally found an affordable hotel right next to the station.',
  'Now say it with me. Affordable.',
  'So, why does a word like this matter so much when you are planning a long trip?',
];

const out = path.join(paths.output, 'preview');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log(`voice=${voice}  rate=${rate}  level=${level}`);

const started = Date.now();
const lines = await synthesizeLines(
  SAMPLE.map((text, i) => ({ id: `s${String(i + 1).padStart(2, '0')}`, text, voice, baseRate: rate })),
  { outDir: path.join(out, 'lines') },
);
console.log(`synthesized ${lines.length} lines in ${((Date.now() - started) / 1000).toFixed(1)}s`);
for (const l of lines) console.log(`  ${l.id}  ${l.durationMs}ms  pause ${l.pauseAfterMs}ms  ${l.words.length} words`);

const track = await assembleVoiceTrack(lines, {
  outFile: path.join(out, 'voice.wav'),
  workDir: path.join(out, 'work'),
});

await masterVoice(track.file, path.join(out, 'mastered.wav'));
await run('ffmpeg', ['-y', '-i', track.file, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(out, 'raw.mp3')]);
await run('ffmpeg', ['-y', '-i', path.join(out, 'mastered.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', path.join(out, 'mastered.mp3')]);

console.log(`\nraw      ${(await ffprobeDuration(path.join(out, 'raw.mp3'))).toFixed(2)}s  ->  ${path.join(out, 'raw.mp3')}`);
console.log(`mastered ${(await ffprobeDuration(path.join(out, 'mastered.mp3'))).toFixed(2)}s  ->  ${path.join(out, 'mastered.mp3')}`);
console.log(`\nfirst words on the timeline: ${track.timeline[0].words.slice(0, 5).map(w => `${w.text}@${Math.round(w.startMs)}ms`).join('  ')}`);
