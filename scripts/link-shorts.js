#!/usr/bin/env node
/** Back-fill same-topic full-lesson links. Offline dry-run by default; --apply --limit N writes. */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { paths, env, channel } from '../src/lib/config.js';
import { quotaAvailable, spendQuota } from '../src/lib/youtube.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
if (!(LIMIT > 0) || (LIMIT !== Infinity && !Number.isInteger(LIMIT))) throw new Error('--limit must be a positive integer');
const history = JSON.parse(fs.readFileSync(path.join(paths.state, 'history.json'), 'utf8'));
const seen = new Set();
const shorts = history.filter(h => h.videoId && h.skill === 'short' && !seen.has(h.videoId) && seen.add(h.videoId));
const plans = [];
for (const short of shorts) {
  const long = history.filter(h => h.videoId && h.skill !== 'short' && h.level === short.level && h.topic === short.topic)
    .sort((a, b) => Number(b.videoId === short.pairedVideoId) - Number(a.videoId === short.pairedVideoId) || new Date(b.publishAt || b.date) - new Date(a.publishAt || a.date))[0];
  if (long) plans.push({ short, long, line: `▶ Full lesson: https://youtu.be/${long.videoId}` });
}
console.log(`${shorts.length} published Shorts; ${plans.length} have a same-level, same-topic long lesson.`);
if (!APPLY) console.log('DRY RUN — no API calls or writes; live descriptions are checked only with --apply.');

function insertLink(description, line) {
  const lines = String(description || '').split('\n');
  if (lines.some(l => l.trim() === line)) return null;
  lines.splice(1, 0, line);
  const result = lines.join('\n');
  if (result.length > 5000) throw new Error('Description would exceed 5000 characters');
  return result;
}

let yt;
if (APPLY) {
  const auth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret);
  auth.setCredentials({ refresh_token: env.ytRefreshToken });
  yt = google.youtube({ version: 'v3', auth });
}
let edited = 0;
for (const plan of plans) {
  if (edited >= LIMIT) break;
  if (!APPLY) {
    let description;
    if (plan.short.dir) {
      const file = path.resolve(paths.root, plan.short.dir, 'metadata.json');
      try { description = JSON.parse(fs.readFileSync(file, 'utf8')).description; } catch { /* no local build */ }
    }
    if (description !== undefined && insertLink(description, plan.line) === null) continue;
    console.log(`${plan.short.videoId} (${plan.short.level} · ${plan.short.topic}): insert line 2 if absent\n  ${plan.line}`);
    edited++;
    continue;
  }
  if (!quotaAvailable(51)) { console.warn('Stopping — insufficient quota for videos.list + videos.update'); break; }
  const res = await yt.videos.list({ part: ['snippet'], id: [plan.short.videoId] });
  spendQuota(1, `link-shorts read ${plan.short.videoId}`);
  const snippet = res.data.items?.[0]?.snippet;
  if (!snippet) continue;
  const description = insertLink(snippet.description, plan.line);
  if (description === null) continue;
  const { title, categoryId, tags, defaultLanguage, defaultAudioLanguage } = snippet;
  await yt.videos.update({ part: ['snippet'], requestBody: { id: plan.short.videoId,
    snippet: { title, description, categoryId: categoryId || channel.youtube.categoryId,
      tags, defaultLanguage, defaultAudioLanguage } } });
  spendQuota(50, `link-shorts update ${plan.short.videoId}`);
  console.log(`Updated ${plan.short.videoId}: ${plan.line}`);
  edited++;
}
console.log(`${edited} description(s) ${APPLY ? 'updated' : 'planned (conditional on missing live link)'} · ${edited * 50} update quota units`);
