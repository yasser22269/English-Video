#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { channel, levelConfig, skillConfig, paths, env, fontConfig } from './lib/config.js';
import { todaysBatch, pickTopic, slugify, dayIndex, publishAtFor, describeSlot } from './lib/schedule.js';
import { writeLesson, buildMetadata } from './lib/lesson.js';
import { buildPlan, resolveTimings, buildChapters } from './lib/build.js';
import { checkRetention } from './lib/guards.js';
import { synthesizeLines, assembleVoiceTrack } from './lib/tts.js';
import { masterVoice, mixWithMusic, ffprobeDuration } from './lib/ffmpeg.js';
import { generateImages, fetchFootage, gradeFootage, extractFrame } from './lib/media.js';
import { SceneRenderer, renderThumbnail } from './lib/render.js';
import { buildAss, buildSrt } from './lib/ass.js';
import { composeStills, composeFootage, generateGradientBackground } from './lib/compose.js';
import { uploadVideo, verifyCredentials, quotaStatus, playlistsFor, resolvePlaylists, addToPlaylists } from './lib/youtube.js';

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

/** The fragment the eye should land on first, coloured in the thumbnail. */
function thumbnailHighlight(lesson) {
  const headline = String(lesson.title || '').trim();
  if (!headline) return '';

  // The template colours the highlight by splitting the headline on it, so a
  // highlight that is not IN the headline renders nothing — which is what
  // happened to every vocabulary thumbnail: the first target word rarely
  // appears in the lesson's own title, so no thumbnail had any colour contrast
  // at all. Only use the word when it is really there; otherwise light the tail
  // of the headline, which always is.
  const first = lesson.words?.[0]?.word;
  if (first && headline.toLowerCase().includes(first.toLowerCase())) return first;

  const words = headline.split(/\s+/);
  if (words.length < 3) return '';
  return words.slice(words.length >= 5 ? -2 : -1).join(' ');
}

/**
 * The second line has to earn its space. It used to echo the topic, which the
 * headline already says; what a browsing learner wants to know is what they get.
 */
function thumbnailSub(lesson, skill) {
  switch (lesson.skill) {
    case 'vocabulary': return `${lesson.words?.length || 10} words · meanings + examples`;
    case 'reading':    return `${lesson.passage?.length || 12} sentences · read along + quiz`;
    case 'listening':  return 'Real conversation · listen twice';
    case 'speaking':   return `${lesson.drills?.length || 8} phrases · listen and repeat`;
    default:           return skill.label;
  }
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

  // 1 ─ script. A previously written lesson is reused unless --fresh is passed,
  // so re-running a failed build does not burn LLM quota rewriting it.
  const lessonFile = path.join(workDir, 'lesson.json');
  let lesson;
  if (fs.existsSync(lessonFile) && !has('fresh')) {
    lesson = JSON.parse(fs.readFileSync(lessonFile, 'utf8'));
    log('script', `"${lesson.title}" (cached — pass --fresh to rewrite)`);
  } else {
    lesson = await writeLesson({ level, skill, topic: topic.topic, focus: topic.focus, footage: topic.footage });
    fs.writeFileSync(lessonFile, JSON.stringify(lesson, null, 2));
    log('script', `"${lesson.title}"`);
  }

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

  await masterVoice(track.file, path.join(workDir, 'audio/mastered.wav'), env.audioPreset);
  const audioFile = path.join(workDir, 'audio/final.m4a');
  await mixWithMusic(path.join(workDir, 'audio/mastered.wav'), pickMusic(), audioFile);
  log('audio', `preset "${env.audioPreset}" -> -15 LUFS -> ${path.basename(audioFile)}`);

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

  // Measure the things that actually decided the first month's retention.
  const guard = checkRetention({ plan, timeline: track.timeline, scenes, cues, meta: { topic: topic.topic } });
  log('pacing', `first teaching ${guard.stats.firstTeachingSec}s · longest dead air ${guard.stats.deadAirSec}s · longest still ${guard.stats.longestStillSec}s · ${guard.stats.sceneCount} scenes`);
  for (const w of guard.warnings) console.warn(`  [guard] ${w}`);

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
      stillFiles.push({ file, durationSec: scene.durationSec, startSec: scene.startMs / 1000 });
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
      await gradeFootage(footageRaw, bg, { width: video.width, height: video.height, fps: video.fps });
    } else {
      // A short clip is enough — compose loops whatever it is given.
      await generateGradientBackground({ outFile: bg, durationSec: 12, video, colorA: lvl.bgB });
    }
    // The last overlay runs to the end of the audio so the outro card does not
    // blink out early if the closing scene is short.
    const overlays = stillFiles.map((s, i) => ({
      ...s,
      durationSec: i === stillFiles.length - 1 ? durationSec - s.startSec + 1 : s.durationSec,
    }));
    await composeFootage({
      footageFile: bg,
      overlays,
      audioFile, assFile, outFile: videoFile, video, fontsDir: fonts.dir,
    });
  } else {
    await composeStills({ scenes: stillFiles, audioFile, assFile, outFile: videoFile, video, fontsDir: fonts.dir });
  }
  const finalSec = await ffprobeDuration(videoFile);
  const sizeMb = (fs.statSync(videoFile).size / 1e6).toFixed(1);
  log('video', `${(finalSec / 60).toFixed(1)} min · ${sizeMb} MB · ${path.basename(videoFile)}`);

  // 8 ─ playlists, then metadata
  // Resolved before the upload so their URLs can go into the description; a
  // failure here returns an empty list rather than costing us the video.
  const playlists = upload
    ? await resolvePlaylists(playlistsFor(lesson, { levelConfig, skillConfig }))
    : [];
  if (playlists.length) log('playlists', playlists.map(p => p.title).join(' · '));

  const chapters = buildChapters(track.timeline);
  if (chapters.length) log('chapters', chapters.map(c => c.stamp).join(' '));
  const meta = buildMetadata(lesson, { channel, playlists, chapters });
  const thumbFile = path.join(workDir, 'thumbnail.jpg');

  let heroImage = plan.images.length ? path.join(mediaDir, `${plan.images[0].id}.jpg`) : null;
  if ((!heroImage || !fs.existsSync(heroImage)) && footageRaw) {
    heroImage = await extractFrame(footageRaw, path.join(mediaDir, 'thumb-frame.jpg'), 2)
      .catch(() => null);
  }

  await renderThumbnail({
    level: lvl.label.split('·')[0].trim(),
    skill: skl.label,
    headline: lesson.title,
    highlight: thumbnailHighlight(lesson),
    sub: thumbnailSub(lesson, skl),
    brand: channel.channelName,
    image: heroImage && fs.existsSync(heroImage) ? heroImage : null,
    accent: lvl.accent, accentDark: lvl.accentDark, bgA: lvl.bgA, bgB: lvl.bgB, bgC: lvl.bgC,
  }, thumbFile);
  log('thumbnail', path.basename(thumbFile));

  // 9 ─ publish
  let result = null;
  let publishAt = null;
  if (upload) {
    // Each level owns a fixed hour of the day; null means that hour is already
    // gone and the lesson should just go out now.
    publishAt = publishAtFor(level, date);
    result = await uploadVideo({
      videoPath: videoFile, thumbPath: thumbFile,
      title: meta.title, description: meta.description, tags: meta.tags,
      publishAt,
    });
    log('youtube', result.url);
    log('publish', publishAt
      ? `scheduled for ${describeSlot(level, date)}`
      : 'now — the slot had already passed when the build finished');

    const added = await addToPlaylists(result.videoId, playlists);
    if (added.length) log('added to', `${added.length} playlist(s)`);
  } else {
    log('youtube', 'skipped (dry run)');
  }

  // A dry run is a rehearsal: it must not burn a topic out of the rotation.
  if (upload) topic.commit();

  const entry = {
    date: stamp, level, skill, topic: topic.topic, title: meta.title,
    durationSec: Math.round(finalSec), sizeMb: Number(sizeMb),
    videoId: result?.videoId || null, url: result?.url || null,
    publishAt: publishAt ? publishAt.toISOString() : null,
    playlists: playlists.map(p => ({ key: p.key, id: p.id })),
    buildSeconds: Math.round((Date.now() - started) / 1000),
    dir: path.relative(paths.root, workDir),
  };
  // Rehearsals should leave no trace in the published run log.
  if (upload) appendHistory(entry);
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
      console.log(`  ${b.level.toUpperCase().padEnd(3)} ${skillConfig(b.skill).label.padEnd(18)} ${describeSlot(b.level, date).padEnd(34)} ${t.topic}`);
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
