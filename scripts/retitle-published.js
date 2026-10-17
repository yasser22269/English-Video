#!/usr/bin/env node
/**
 * Bring already-published lessons onto the current title patterns, give their
 * descriptions a searchable opening line, and add localised titles.
 *
 *   node scripts/retitle-published.js                    # dry run, prints the diff
 *   node scripts/retitle-published.js --apply            # writes to YouTube
 *   node scripts/retitle-published.js --apply --limit 20
 *   node scripts/retitle-published.js --apply --no-localize
 *
 * --sample N --seed S assigns N matched A1/A2 long lessons per arm for E6.
 * Sample dry runs are offline; assignments are persisted only with --apply.
 *
 * `videos.update` costs 50 quota units per video; localisations ride along in
 * the same call. The script refuses to dip into the last 200 units, which stay
 * available for the publishing run.
 *
 * Only the title, the description's opening line and the localisations are
 * touched. The word lists, chapters, playlist links and hashtags already in each
 * description are left exactly as they are.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { channel, curriculum, levelConfig, skillConfig, env, paths } from '../src/lib/config.js';
import { quotaStatus, spendQuota } from '../src/lib/youtube.js';
import { fillPattern, localizeMetadata } from '../src/lib/lesson.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LOCALIZE = !argv.includes('--no-localize') && !argv.includes('--sample');
const LIMIT = Number((argv.includes('--limit') && argv[argv.indexOf('--limit') + 1]) || 25);
const value = name => argv[argv.indexOf('--' + name) + 1];
const SAMPLE = argv.includes('--sample') ? Number(value('sample')) : null;
const SEED = argv.includes('--seed') ? value('seed') : 'e6';
if (!Number.isInteger(LIMIT) || LIMIT < 1 || (SAMPLE !== null && (!Number.isInteger(SAMPLE) || SAMPLE < 1))) {
  throw new Error('--limit and --sample must be positive integers');
}
const EXPERIMENT = path.join(paths.state, 'experiments/e6-retitle.json');
const HISTORY = path.join(paths.state, 'history.json');
const COST_PER_VIDEO = 50;
const RESERVE = 200;

const FORMAT_PHRASE = {
  vocabulary: 'English vocabulary with pictures, pronunciation and examples',
  reading: 'learn English through a short story',
  listening: 'English conversation practice',
  speaking: 'English speaking practice with shadowing',
  short: 'three English words with pictures and examples',
};

function auth() {
  const client = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
  client.setCredentials({ refresh_token: env.ytRefreshToken });
  return client;
}

function openerFor(entry) {
  const lvl = levelConfig(entry.level);
  const levelName = (lvl.levelName || lvl.label.split('·').pop().trim()).toLowerCase();
  return `${entry.topic}: ${FORMAT_PHRASE[entry.skill] || skillConfig(entry.skill).label} for ${levelName} learners (${entry.level.toUpperCase()}).`;
}

/** Replace any opener this pipeline has written before, then prepend the current one. */
function reopenDescription(entry, current) {
  const body = String(current || '').split('\n');
  const ours = (line) => line.startsWith(`${entry.topic}: `) || line.startsWith(`${entry.topic} — `);
  while (body.length && ours(body[0])) body.shift();
  return [openerFor(entry), ...body].join('\n').slice(0, 4900);
}

const history = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
const seen = new Set();
let targets = history.filter(h => h.videoId && h.topic && !seen.has(h.videoId) && seen.add(h.videoId));


function titleFor(entry, experiment = false) {
  const skill = skillConfig(entry.skill);
  const searchTopic = entry.searchTopic || curriculum(entry.level).topics.find(t => t.topic === entry.topic)?.searchTopic;
  let pattern = skill.titlePatternByLevel?.[entry.level] || skill.titlePattern;
  if (experiment && entry.skill === 'vocabulary') pattern = '{topic} — {wordCount} Words with Pictures and Pronunciation ({level})';
  if (experiment && entry.skill === 'reading') pattern = 'Learn English Through Story Level {storyLevel}: {topic} ({level})';
  if (experiment && entry.skill === 'speaking') pattern = 'English Speaking Practice for Beginners: {topic} — Shadowing ({level})';
  return fillPattern(pattern, { ...entry, topic: searchTopic || entry.topic, searchTopic }).slice(0, 98);
}

let assignment = fs.existsSync(EXPERIMENT) ? JSON.parse(fs.readFileSync(EXPERIMENT, 'utf8')) : null;
if (SAMPLE !== null) {
  if (assignment && (assignment.seed !== SEED || assignment.sample !== SAMPLE)) {
    throw new Error('E6 assignment already exists with another seed/sample; preserve the existing experiment');
  }
  if (!assignment) {
    let hash = 2166136261;
    for (const ch of SEED) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    const random = () => { hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0; return hash / 4294967296; };
    const eligible = targets.filter(h => ['a1', 'a2'].includes(h.level) && h.skill !== 'short')
      .sort((a, b) => a.videoId.localeCompare(b.videoId));
    for (let i = eligible.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [eligible[i], eligible[j]] = [eligible[j], eligible[i]]; }
    const pairs = [];
    while (eligible.length && pairs.length < SAMPLE) {
      const treated = eligible.shift();
      const matches = eligible.filter(h => h.level === treated.level && h.skill === treated.skill)
        .sort((a, b) => Math.abs(new Date(a.date) - new Date(treated.date)) - Math.abs(new Date(b.date) - new Date(treated.date)));
      if (!matches.length) continue;
      const control = matches[0]; eligible.splice(eligible.indexOf(control), 1);
      pairs.push({ treated: { ...treated, newTitle: titleFor(treated, true) }, control });
    }
    if (pairs.length !== SAMPLE) throw new Error('Not enough matched A1/A2 long lessons for --sample ' + SAMPLE);
    assignment = { experiment: 'E6', seed: SEED, sample: SAMPLE, pairs, appliedVideoIds: [] };
  }
  console.log('E6 assignment (matched on level + skill, nearest publication date):');
  console.log(JSON.stringify(assignment, null, 2));
  if (!APPLY) { console.log('DRY RUN — assignment only; no API calls or state writes.'); process.exit(0); }
  fs.mkdirSync(path.dirname(EXPERIMENT), { recursive: true });
  fs.writeFileSync(EXPERIMENT, JSON.stringify(assignment, null, 2) + '\n');
  const treated = new Set(assignment.pairs.map(p => p.treated.videoId));
  targets = targets.filter(h => treated.has(h.videoId) && !assignment.appliedVideoIds.includes(h.videoId));
} else if (assignment) {
  // Preserve both arms and their measurement window during ordinary maintenance.
  const protectedIds = new Set(assignment.pairs.flatMap(p => [p.treated.videoId, p.control.videoId]));
  targets = targets.filter(h => !protectedIds.has(h.videoId));
}

console.log(`${targets.length} published lessons in the run log`);
if (!APPLY) console.log('DRY RUN — nothing will be written. Add --apply to publish.\n');

const yt = google.youtube({ version: 'v3', auth: auth() });
let changed = 0;
let spent = 0;

for (let i = 0; i < targets.length && changed < LIMIT; i += 50) {
  const chunk = targets.slice(i, i + 50);
  const res = await yt.videos.list({ part: ['snippet', 'localizations'], id: chunk.map(c => c.videoId) });
  const byId = new Map(res.data.items.map(v => [v.id, v]));

  for (const entry of chunk) {
    if (changed >= LIMIT) break;
    const video = byId.get(entry.videoId);
    if (!video) continue;

    const skill = skillConfig(entry.skill);
    const title = SAMPLE !== null ? assignment.pairs.find(p => p.treated.videoId === entry.videoId).treated.newTitle : titleFor(entry);
    const description = SAMPLE !== null ? video.snippet.description : reopenDescription(entry, video.snippet.description);
    // YouTube always echoes the video's own default language back as a
    // "localisation", so counting keys says every video is localised. Only the
    // languages we actually translate into count.
    const defaultLang = video.snippet.defaultLanguage || channel.youtube.defaultLanguage;
    const wanted = channel.youtube.localizations || [];
    const hasLocalizations = wanted.every(l => l === defaultLang || video.localizations?.[l]);

    const titleSame = title === video.snippet.title;
    const descSame = description === video.snippet.description;
    if (titleSame && descSame && (hasLocalizations || !LOCALIZE)) continue;

    console.log(`\n${entry.level.toUpperCase()} ${entry.skill}  ${entry.videoId}`);
    if (!titleSame) console.log(`  was: ${video.snippet.title}\n  now: ${title}`);

    if (!APPLY) { changed++; continue; }

    const left = quotaStatus().remaining;
    if (left < COST_PER_VIDEO + RESERVE) {
      console.log(`\nstopping — ${left} quota units left, keeping ${RESERVE} for the publishing run`);
      i = targets.length;
      break;
    }

    // Start from what is there, minus the echoed default-language entry, which
    // must not be sent back carrying a stale title.
    let localizations = { ...(video.localizations || {}) };
    delete localizations[defaultLang];
    if (LOCALIZE && !hasLocalizations) {
      try {
        const fresh = await localizeMetadata(
          { ...entry, title },
          { title, description },
          { languages: wanted.filter(l => l !== defaultLang) },
        );
        localizations = { ...localizations, ...fresh };
      } catch (err) {
        // The English title is the valuable part; never lose it to a translation.
        console.warn(`  [localize] skipped — ${err.message}`);
      }
    }
    const withLoc = Object.keys(localizations).length > 0;

    await yt.videos.update({
      part: withLoc ? ['snippet', 'localizations'] : ['snippet'],
      requestBody: {
        id: entry.videoId,
        snippet: {
          title,
          description,
          // categoryId is required on a snippet write; dropping it resets it.
          categoryId: video.snippet.categoryId,
          tags: video.snippet.tags,
          defaultLanguage: video.snippet.defaultLanguage || channel.youtube.defaultLanguage,
          defaultAudioLanguage: video.snippet.defaultAudioLanguage || 'en',
        },
        ...(withLoc ? { localizations } : {}),
      },
    });
    spendQuota(COST_PER_VIDEO, `retitle ${entry.videoId}`);
    // Re-read immediately: never overwrite unrelated history appended during this run.
    const latest = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
    for (const h of latest) if (h.videoId === entry.videoId) h.title = title;
    fs.writeFileSync(HISTORY, JSON.stringify(latest, null, 2) + '\n');
    if (SAMPLE !== null) {
      assignment.appliedVideoIds.push(entry.videoId);
      assignment.updatedAt = new Date().toISOString();
      fs.writeFileSync(EXPERIMENT, JSON.stringify(assignment, null, 2) + '\n');
    }
    spent += COST_PER_VIDEO;
    changed++;
    console.log(`  updated${withLoc ? ` · localized ${Object.keys(localizations).length}` : ''}`);
  }
}

console.log(`\n${changed} lesson(s) ${APPLY ? 'updated' : 'would be updated'} · ${APPLY ? spent : changed * COST_PER_VIDEO} quota units`);
