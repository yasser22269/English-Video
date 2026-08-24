#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { channel, levelConfig, skillConfig, paths, env, fontConfig } from './lib/config.js';
import { todaysBatch, pickTopic, slugify, dayIndex } from './lib/schedule.js';
import { writeLesson, buildMetadata } from './lib/lesson.js';
import { buildPlan, resolveTimings } from './lib/build.js';
import { synthesizeLines, assembleVoiceTrack } from './lib/tts.js';
import { masterVoice, mixWithMusic, ffprobeDuration } from './lib/ffmpeg.js';
import { generateImages, fetchFootage, prepareFootage } from './lib/media.js';
import { SceneRenderer, renderThumbnail } from './lib/render.js';
import { buildAss, buildSrt } from './lib/ass.js';
import { composeStills, composeFootage, generateGradientBackground } from './lib/compose.js';
import { uploadVideo, verifyCredentials, quotaStatus } from './lib/youtube.js';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(`--${flag}`);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const HISTORY = path.join(paths.state, 'history.json');
const fonts = fontConfig();
const video = channel.video;

function log(tag, msg) {
  console.log(`  ${String(tag).padEnd(11)} ${msg}`);
}

function pickMusic() {
  if (!fs.existsSync(paths.music)) return null;
  const files = fs.readdirSync(paths.music).filter(f => /\.(mp3|m4a|wav|ogg)$/i.test(f));
  if (!files.length) return null;
  return path.join(paths.music, files[dayIndex() % files.length]);
}

function appendHistory(entry) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch { /* first run */ }
  list.unshift(entry);
  fs.writeFileSync(HISTORY, JSON.stringify(list.slice(0, 500), null, 2));
}

async function buildOne({ level, skill, date, upload }) {
  const started = Date.now();
  const lvl = levelConfig(level);
  const skl = skillConfig(skill);
  const stamp = date.toISOString().slice(0, 10);

  console.log(`\n═══ ${level.toUpperCase()} · ${skl.label} · ${stamp} ═══`);

  const topic = pickTopic(level, skill, date);
  log('topic', `${topic.topic}  (focus: ${topic.focus})`);

  const workDir = path.join(paths.output, `${stamp}-${level}-${skill}-${slugify(topic.topic)}`);
  fs.mkdirSync(workDir, { recursive: true });

  // 1 ─ script
  const lesson = await writeLesson({ level, skill, topic: topic.topic, focus: topic.focus });
  fs.writeFileSync(path.join(workDir, 'lesson.json'), JSON.stringify(lesson, null, 2));
  log('script', `"${lesson.title}"`);

  // 2 ─ scene/narration plan
  const plan = buildPlan(lesson);
  log('plan', `${plan.scenes.length} scenes · ${plan.lines.length} spoken lines · ${plan.mode} background`);

  // 3 ─ images, footage and speech all hit the network, so run them together
  const mediaDir = path.join(workDir, 'media');
  const [, footageRaw, spoken] = await Promise.all([
    plan.images.length
      ? generateImages(plan.images, { outDir: mediaDir })
      : Promise.resolve([]),
    plan.mode === 'footage'
      ? fetchFootage(plan.footageQuery, path.join(mediaDir, 'footage.mp4'))
      : Promise.resolve(null),
    synthesizeLines(plan.lines, { outDir: path.join(workDir, 'audio/lines') }),
  ]);
  log('media', `${plan.images.length} images requested · footage: ${footageRaw ? 'yes' : plan.mode === 'footage' ? 'fallback' : 'n/a'}`);

  // 4 ─ voice track
  const track = await assembleVoiceTrack(spoken, {
    outFile: path.join(workDir, 'audio/voice.wav'),
    workDir: path.join(workDir, 'audio/work'),
  });
  const durationSec = track.totalMs / 1000;
  log('voice', `${(durationSec / 60).toFixed(1)} min narrated`);

  await masterVoice(track.file, path.join(workDir, 'audio/mastered.wav'));
  const audioFile = path.join(workDir, 'audio/final.m4a');
  await mixWithMusic(path.join(workDir, 'audio/mastered.wav'), pickMusic(), audioFile);
  log('audio', `mastered to -15 LUFS -> ${path.basename(audioFile)}`);

  // 5 ─ timings drive both the stills and the caption track
  const { scenes, cues } = resolveTimings(plan, track.timeline);

  const assFile = buildAss(track.timeline, {
    outFile: path.join(workDir, 'captions.ass'),
    width: video.width, height: video.height,
    fonts, accent: lvl.accent, cues,
  });
  buildSrt(track.timeline, path.join(workDir, 'captions.en.srt'), { field: 'text' });
  buildSrt(track.timeline.filter(l => l.ar), path.join(workDir, 'captions.ar.srt'), { field: 'ar' });
  log('captions', `${track.timeline.length} lines · ${cues.length} practice cues`);

  // 6 ─ frames
  const renderer = await new SceneRenderer({ width: video.width, height: video.height }).open();
  const framesDir = path.join(workDir, 'frames');
  let stillFiles = [];
  try {
    for (const scene of scenes) {
      const payload = { ...scene, data: { ...scene.data } };
      if (payload.data.imageId) {
        payload.data.image = path.join(mediaDir, `${payload.data.imageId}.jpg`);
        delete payload.data.imageId;
      }
      const file = path.join(framesDir, `${scene.id}.png`);
      await renderer.shoot(payload, file);
      stillFiles.push({ file, durationSec: scene.durationSec });
    }
  } finally {
    await renderer.close();
  }
  log('frames', `${stillFiles.length} rendered`);

  // 7 ─ compose
  const videoFile = path.join(workDir, 'video.mp4');
  if (plan.mode === 'footage') {
    const bg = path.join(workDir, 'background.mp4');
    if (footageRaw) {
      await prepareFootage(footageRaw, bg, { durationSec: durationSec + 2, width: video.width, height: video.height });
    } else {
      await generateGradientBackground({ outFile: bg, durationSec: durationSec + 2, video, colorA: lvl.bgB });
    }
    await composeFootage({
      footageFile: bg,
      overlayPng: stillFiles[0].file,
      audioFile, assFile, outFile: videoFile, video, fontsDir: fonts.dir,
    });
  } else {
    await composeStills({ scenes: stillFiles, audioFile, assFile, outFile: videoFile, video, fontsDir: fonts.dir });
  }
  const finalSec = await ffprobeDuration(videoFile);
  const sizeMb = (fs.statSync(videoFile).size / 1e6).toFixed(1);
  log('video', `${(finalSec / 60).toFixed(1)} min · ${sizeMb} MB · ${path.basename(videoFile)}`);

  // 8 ─ thumbnail
  const meta = buildMetadata(lesson, { channel });
  const thumbFile = path.join(workDir, 'thumbnail.jpg');
  const heroImage = plan.images.length ? path.join(mediaDir, `${plan.images[0].id}.jpg`) : null;
  await renderThumbnail({
    level: lvl.label.split('·')[0].trim(),
    skill: skl.label,
    headline: lesson.title,
    highlight: lesson.words?.[0]?.word || lesson.drills?.[0]?.phrase?.split(' ').slice(0, 2).join(' ') || '',
    sub: topic.topic,
    brand: channel.channelName,
    image: heroImage && fs.existsSync(heroImage) ? heroImage : null,
    accent: lvl.accent, accentDark: lvl.accentDark, bgA: lvl.bgA, bgB: lvl.bgB, bgC: lvl.bgC,
  }, thumbFile);
  log('thumbnail', path.basename(thumbFile));

  // 9 ─ publish
  let result = null;
  if (upload) {
    result = await uploadVideo({
      videoPath: videoFile, thumbPath: thumbFile,
      title: meta.title, description: meta.description, tags: meta.tags,
    });
    log('youtube', result.url);
  } else {
    log('youtube', 'skipped (dry run)');
  }

  topic.commit();

  const entry = {
    date: stamp, level, skill, topic: topic.topic, title: meta.title,
    durationSec: Math.round(finalSec), sizeMb: Number(sizeMb),
    videoId: result?.videoId || null, url: result?.url || null,
    buildSeconds: Math.round((Date.now() - started) / 1000),
    dir: path.relative(paths.root, workDir),
  };
  appendHistory(entry);
  fs.writeFileSync(path.join(workDir, 'metadata.json'), JSON.stringify({ ...entry, ...meta }, null, 2));
  log('done', `${entry.buildSeconds}s`);
  return entry;
}

async function main() {
  const date = arg('date') ? new Date(`${arg('date')}T12:00:00Z`) : new Date();
  const upload = !has('no-upload') && !env.dryRun;

  let batch;
  if (arg('level')) {
    batch = [{ level: arg('level'), skill: arg('skill') || 'vocabulary', date }];
  } else {
    batch = todaysBatch(date);
    if (arg('only')) batch = batch.filter(b => b.level === arg('only'));
  }

  if (has('plan')) {
    console.log(`\nSchedule for ${date.toISOString().slice(0, 10)} (day ${dayIndex(date)}):\n`);
    for (const b of batch) {
      const t = pickTopic(b.level, b.skill, date);
      console.log(`  ${b.level.toUpperCase().padEnd(3)} ${skillConfig(b.skill).label.padEnd(18)} ${t.topic}`);
    }
    console.log(`\nYouTube quota: ${JSON.stringify(quotaStatus())}\n`);
    return;
  }

  if (upload) {
    await verifyCredentials();
    console.log('[youtube] refresh token is valid');
  }

  console.log(`\nBuilding ${batch.length} video(s) for ${date.toISOString().slice(0, 10)}  (upload: ${upload ? 'on' : 'off'})`);

  const results = [];
  const failures = [];
  for (const item of batch) {
    try {
      results.push(await buildOne({ ...item, upload }));
    } catch (err) {
      // One bad level must not cost the other four.
      console.error(`\n!! ${item.level}/${item.skill} failed: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
      failures.push({ ...item, error: err.message });
    }
  }

  console.log('\n──────── summary ────────');
  for (const r of results) console.log(`  ok   ${r.level.toUpperCase()} ${r.skill.padEnd(11)} ${(r.durationSec / 60).toFixed(1)}m  ${r.url || '(not uploaded)'}`);
  for (const f of failures) console.log(`  FAIL ${f.level.toUpperCase()} ${f.skill.padEnd(11)} ${f.error.slice(0, 90)}`);
  console.log(`  quota: ${JSON.stringify(quotaStatus())}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = [
      '| | Level | Skill | Length | Link |', '|---|---|---|---|---|',
      ...results.map(r => `| ✅ | ${r.level.toUpperCase()} | ${r.skill} | ${(r.durationSec / 60).toFixed(1)} min | ${r.url ? `[watch](${r.url})` : '—'} |`),
      ...failures.map(f => `| ❌ | ${f.level.toUpperCase()} | ${f.skill} | — | \`${f.error.slice(0, 80)}\` |`),
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Daily English lessons\n\n${rows}\n`);
  }

  if (failures.length === batch.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
