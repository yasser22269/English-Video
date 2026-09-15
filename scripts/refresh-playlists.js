#!/usr/bin/env node
/**
 * Bring the live playlists' titles and descriptions in line with the code.
 *
 *   node scripts/refresh-playlists.js              # dry run
 *   node scripts/refresh-playlists.js --apply      # 50 quota units per changed playlist
 *   node scripts/refresh-playlists.js --apply --limit 1
 *
 * Playlist copy is only written when a playlist is created, so the nine made
 * in August still said "with Arabic subtitles" after the channel went global.
 * The daily workflow runs this with leftover quota; unchanged playlists cost
 * nothing, so once they match it is a no-op.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { channel, levelConfig, skillConfig, env, paths } from '../src/lib/config.js';
import { playlistsFor, quotaStatus, spendQuota } from '../src/lib/youtube.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT = Number((argv.includes('--limit') && argv[argv.indexOf('--limit') + 1]) || 20);
const COST = 50;
const RESERVE = 100;

const cache = JSON.parse(fs.readFileSync(path.join(paths.state, 'playlists.json'), 'utf8'));

// Every playlist the code would create today, keyed like the cache.
const wanted = new Map();
for (const level of channel.levels) {
  for (const skill of channel.skillCycle) {
    for (const spec of playlistsFor({ level, skill }, { levelConfig, skillConfig })) wanted.set(spec.key, spec);
  }
}

const auth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
auth.setCredentials({ refresh_token: env.ytRefreshToken });
const yt = google.youtube({ version: 'v3', auth });

const ids = Object.values(cache).map(c => c.id).filter(Boolean);
const live = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const r = await yt.playlists.list({ part: ['snippet', 'status'], id: ids.slice(i, i + 50) });
  for (const p of r.data.items) live.set(p.id, p);
}

let changed = 0;
for (const [key, entry] of Object.entries(cache)) {
  if (changed >= LIMIT) break;
  const spec = wanted.get(key);
  const pl = live.get(entry.id);
  if (!spec || !pl) continue;

  const sameTitle = pl.snippet.title === spec.title;
  const sameDesc = (pl.snippet.description || '').trim() === spec.description.trim();
  if (sameTitle && sameDesc) continue;

  console.log(`\n${key}  ${entry.id}`);
  if (!sameTitle) console.log(`  title: ${pl.snippet.title}\n     -> ${spec.title}`);
  if (!sameDesc) console.log(`  description: ${JSON.stringify((pl.snippet.description || '').slice(0, 90))}\n     -> ${JSON.stringify(spec.description.slice(0, 90))}`);
  if (!APPLY) { changed++; continue; }

  if (quotaStatus().remaining < COST + RESERVE) {
    console.log(`\nstopping — keeping ${RESERVE} quota units in reserve`);
    break;
  }
  await yt.playlists.update({
    part: ['snippet', 'status'],
    requestBody: {
      id: entry.id,
      snippet: { title: spec.title, description: spec.description, defaultLanguage: pl.snippet.defaultLanguage || channel.youtube.defaultLanguage },
      status: { privacyStatus: pl.status.privacyStatus },
    },
  });
  spendQuota(COST, `playlist ${key}`);
  changed++;
  console.log('  updated');
}

console.log(`\n${changed} playlist(s) ${APPLY ? 'updated' : 'would change'}`);
