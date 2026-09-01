#!/usr/bin/env node
/**
 * Re-title and re-open the descriptions of already-published lessons.
 *
 *   node scripts/retitle-published.js            # dry run, prints the diff
 *   node scripts/retitle-published.js --apply    # writes to YouTube
 *   node scripts/retitle-published.js --apply --limit 20
 *
 * The first 34 videos shipped with the old title shape — 23-30 characters of
 * boilerplate before the topic, and a level suffix a phone never showed — and
 * with descriptions opening on narration copy instead of anything searchable.
 * Both are fixed for new builds; this brings the back catalogue in line.
 *
 * `videos.update` costs 50 quota units per video and the daily run leaves
 * roughly 1,250 spare, so the default limit spreads the work over two days.
 *
 * Only the title and the description's opening line are touched. The word
 * list, the playlist links and the hashtags in each description are left
 * exactly as they are — the structured lesson data that produced them was
 * deleted with output/, and rewriting from a guess would lose real content.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { channel, levelConfig, skillConfig, env, paths } from '../src/lib/config.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT = Number((argv[argv.indexOf('--limit') + 1]) || 25);

const COST_PER_VIDEO = 50;

function auth() {
  const client = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
  client.setCredentials({ refresh_token: env.ytRefreshToken });
  return client;
}

/** The same pattern new builds use, so old and new lessons read alike. */
function newTitle(entry) {
  const skill = skillConfig(entry.skill);
  const lvl = levelConfig(entry.level);
  return skill.titlePattern
    .replace('{topic}', entry.topic)
    .replace('{levelLabel}', lvl.label)
    .replace('{level}', entry.level.toUpperCase())
    .replace('{wordCount}', lvl.wordCount)
    .slice(0, 98);
}

/** Put a searchable sentence in the ~100 characters shown before "...more". */
function reopenDescription(entry, current) {
  const skill = skillConfig(entry.skill);
  const lvl = levelConfig(entry.level);
  const levelWord = lvl.label.split('·').pop().trim();
  const opener = `${entry.topic} — ${skill.label.toLowerCase()} for ${levelWord} English learners (${entry.level.toUpperCase()}).`;

  const body = current.split('\n');
  // Drop a previous opener of ours so repeated runs do not stack them.
  if (body[0] && body[0].includes(`— ${skill.label.toLowerCase()} for`)) body.shift();
  return [opener, ...body].join('\n').slice(0, 4900);
}

const history = JSON.parse(fs.readFileSync(path.join(paths.state, 'history.json'), 'utf8'));
const published = history.filter(h => h.videoId);
const seen = new Set();
const targets = published.filter(h => (seen.has(h.videoId) ? false : seen.add(h.videoId)));

console.log(`${targets.length} published lessons in the run log`);
if (!APPLY) console.log('DRY RUN — nothing will be written. Add --apply to publish.\n');

const yt = google.youtube({ version: 'v3', auth: auth() });
let changed = 0;
let spent = 0;

for (const entry of targets) {
  if (changed >= LIMIT) {
    console.log(`\nstopped at --limit ${LIMIT} (${targets.length - changed} left for another day)`);
    break;
  }

  const res = await yt.videos.list({ part: ['snippet'], id: [entry.videoId] });
  const video = res.data.items?.[0];
  if (!video) {
    console.log(`  ?? ${entry.videoId} — not found on the channel, skipping`);
    continue;
  }

  const title = newTitle(entry);
  const description = reopenDescription(entry, video.snippet.description || '');

  if (title === video.snippet.title && description === video.snippet.description) {
    continue;
  }

  console.log(`\n${entry.level.toUpperCase()} ${entry.skill}`);
  console.log(`  was: ${video.snippet.title}`);
  console.log(`  now: ${title}   (${title.length} chars, phone shows 48)`);

  if (!APPLY) { changed++; continue; }

  await yt.videos.update({
    part: ['snippet'],
    requestBody: {
      id: entry.videoId,
      snippet: {
        title,
        description,
        // categoryId is required on a snippet write; dropping it would reset
        // the video's category to the default.
        categoryId: video.snippet.categoryId,
        tags: video.snippet.tags,
        defaultLanguage: video.snippet.defaultLanguage || channel.youtube.defaultLanguage,
        defaultAudioLanguage: video.snippet.defaultAudioLanguage || 'en',
      },
    },
  });
  spent += COST_PER_VIDEO;
  changed++;
  console.log('  updated');
}

console.log(`\n${changed} lesson(s) ${APPLY ? 'updated' : 'would be updated'} · ${APPLY ? spent : changed * COST_PER_VIDEO} quota units${APPLY ? ' spent' : ' would be spent'}`);
