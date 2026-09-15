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
 * The daily workflow runs this after the uploads with whatever quota is left,
 * so the back catalogue converges on the current patterns a batch at a time.
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
import { channel, levelConfig, skillConfig, env, paths } from '../src/lib/config.js';
import { quotaStatus, spendQuota } from '../src/lib/youtube.js';
import { fillPattern, localizeMetadata } from '../src/lib/lesson.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LOCALIZE = !argv.includes('--no-localize');
const LIMIT = Number((argv.includes('--limit') && argv[argv.indexOf('--limit') + 1]) || 25);
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

const history = JSON.parse(fs.readFileSync(path.join(paths.state, 'history.json'), 'utf8'));
const seen = new Set();
const targets = history.filter(h => h.videoId && h.topic && !seen.has(h.videoId) && seen.add(h.videoId));

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
    const title = fillPattern(skill.titlePattern, entry).slice(0, 98);
    const description = reopenDescription(entry, video.snippet.description);
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
    spent += COST_PER_VIDEO;
    changed++;
    console.log(`  updated${withLoc ? ` · localized ${Object.keys(localizations).length}` : ''}`);
  }
}

console.log(`\n${changed} lesson(s) ${APPLY ? 'updated' : 'would be updated'} · ${APPLY ? spent : changed * COST_PER_VIDEO} quota units`);
