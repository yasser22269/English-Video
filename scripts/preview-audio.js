#!/usr/bin/env node
/**
 * Audio A/B bench.
 *
 *   node scripts/preview-audio.js                 # every level, every preset
 *   node scripts/preview-audio.js --level b1      # one level, every preset
 *   node scripts/preview-audio.js --voices        # one sample per level voice
 *
 * Writes output/preview/<level>-<preset>.mp3 so the mastering presets can be
 * compared back to back on the same synthesis. Nothing here touches the daily
 * pipeline — it exists so a human ear picks the preset, not a spectrum plot.
 */
import fs from 'fs';
import path from 'path';
import { synthesizeLines, assembleVoiceTrack } from '../src/lib/tts.js';
import { masterVoice, run, measureLoudness, AUDIO_PRESETS } from '../src/lib/ffmpeg.js';
import { channel, levelConfig, paths } from '../src/lib/config.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

// Deliberately mixed material: a long sentence, a short one, a question, and a
// slow drill repeat — the four rhythms the channel actually produces.
const SAMPLE = [
  'Welcome back to English Every Day. Today we are working on the phrases you need when you talk about your job.',
  'The first phrase is: I am in charge of.',
  'It means that something is your responsibility, and that other people expect you to handle it.',
  'Listen. I am in charge of the whole team while my manager is away.',
  'Now say it with me, slowly.',
  'I am in charge of.',
  'So, when was the last time you were in charge of something at work?',
];

const outDir = path.join(paths.output, 'preview');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const levels = arg('level') ? [arg('level')] : channel.levels;
const presets = arg('preset') ? [arg('preset')] : Object.keys(AUDIO_PRESETS);

for (const level of levels) {
  const lvl = levelConfig(level);
  console.log(`\n${lvl.label}  voice=${lvl.teacher}  rate=${lvl.rate}`);

  const lines = SAMPLE.map((text, i) => ({
    id: `${level}-s${i + 1}`,
    text,
    voice: lvl.teacher,
    // The drill repeat is the one line that gets slowed, same as in a lesson.
    baseRate: i === 5 ? `${parseInt(lvl.rate, 10) - 9}%` : lvl.rate,
  }));

  const spoken = await synthesizeLines(lines, { outDir: path.join(outDir, 'lines') });
  const track = await assembleVoiceTrack(spoken, {
    outFile: path.join(outDir, `${level}-voice.wav`),
    workDir: path.join(outDir, 'work', level),
  });

  for (const preset of presets) {
    const wav = path.join(outDir, `${level}-${preset}.wav`);
    const mp3 = path.join(outDir, `${level}-${preset}.mp3`);
    await masterVoice(track.file, wav, preset);
    await run('ffmpeg', ['-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
    fs.rmSync(wav, { force: true });

    const m = await measureLoudness(mp3);
    console.log(`  ${preset.padEnd(10)} ${m.lufs.toFixed(1).padStart(6)} LUFS   peak ${m.truePeak.toFixed(1)} dBFS   range ${m.range.toFixed(1)} LU   ${path.relative(paths.root, mp3)}`);
  }
  fs.rmSync(path.join(outDir, `${level}-voice.wav`), { force: true });
}

fs.rmSync(path.join(outDir, 'lines'), { recursive: true, force: true });
fs.rmSync(path.join(outDir, 'work'), { recursive: true, force: true });
console.log(`\nOpen ${path.join(paths.output, 'preview')} and listen. Set the winner with AUDIO_PRESET=<name> or config/channel.json -> audio.preset`);
