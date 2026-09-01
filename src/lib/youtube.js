import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { env, paths, channel } from './config.js';

const QUOTA_FILE = path.join(paths.state, 'quota.json');

const PLAYLIST_FILE = path.join(paths.state, 'playlists.json');

// YouTube Data API v3 costs, in quota units.
const COST = {
  videosInsert: 1600,
  thumbnailsSet: 50,
  playlistItemsInsert: 50,
  playlistsInsert: 50,
  playlistsList: 1,
};
const DAILY_QUOTA = Number(process.env.YOUTUBE_DAILY_QUOTA || 10000);
// Quota resets at midnight Pacific Time, not UTC.
const quotaDay = () => new Date(Date.now() - 8 * 3600_000).toISOString().slice(0, 10);

function readQuota() {
  try {
    const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    return data.day === quotaDay() ? data : { day: quotaDay(), used: 0 };
  } catch {
    return { day: quotaDay(), used: 0 };
  }
}

function spend(units, label) {
  const q = readQuota();
  q.used += units;
  q.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
  fs.writeFileSync(QUOTA_FILE, JSON.stringify(q, null, 2));
  console.log(`[youtube] quota ${q.used}/${DAILY_QUOTA} after ${label}`);
}

/** For one-off maintenance scripts that spend against the same daily budget. */
export function spendQuota(units, label) {
  spend(units, label);
}

export function quotaAvailable(units = COST.videosInsert + COST.thumbnailsSet) {
  const q = readQuota();
  return q.used + units <= DAILY_QUOTA;
}

export function quotaStatus() {
  const q = readQuota();
  return { ...q, limit: DAILY_QUOTA, remaining: DAILY_QUOTA - q.used };
}

function oauthClient() {
  const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
  const clientId = clean(env.ytClientId);
  const clientSecret = clean(env.ytClientSecret);
  const refreshToken = clean(env.ytRefreshToken);

  if (!clientId || !clientSecret) throw new Error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set');
  if (!refreshToken) throw new Error('YOUTUBE_REFRESH_TOKEN is not set — run `npm run auth:youtube`');

  const client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:8765/callback');
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Fails fast, before any expensive generation, if the refresh token is dead. */
export async function verifyCredentials() {
  const auth = oauthClient();
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error('Could not exchange the refresh token for an access token');
  return true;
}

export async function uploadVideo({ videoPath, thumbPath, title, description, tags, publishAt }) {
  if (!quotaAvailable()) {
    const q = quotaStatus();
    throw new Error(`YouTube quota exhausted for ${q.day}: ${q.used}/${q.limit} units used. Try again after the Pacific-midnight reset.`);
  }

  const youtube = google.youtube({ version: 'v3', auth: oauthClient() });
  const privacy = publishAt ? 'private' : env.ytPrivacy;

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: process.env.YOUTUBE_NOTIFY === '1',
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: channel.youtube.categoryId,
        defaultLanguage: channel.youtube.defaultLanguage,
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
        ...(publishAt ? { publishAt: new Date(publishAt).toISOString() } : {}),
      },
    },
    media: { body: fs.createReadStream(videoPath) },
  });

  spend(COST.videosInsert, `upload "${title.slice(0, 40)}"`);
  const videoId = res.data.id;

  if (thumbPath && fs.existsSync(thumbPath)) {
    try {
      await youtube.thumbnails.set({ videoId, media: { body: fs.createReadStream(thumbPath) } });
      spend(COST.thumbnailsSet, 'thumbnail');
    } catch (err) {
      // Custom thumbnails need a verified channel; never fail a whole run over it.
      console.warn(`[youtube] thumbnail rejected — ${err.message}`);
    }
  }

  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

/* ── playlists ─────────────────────────────────────────────────────────────
 * A viewer who finishes a lesson either leaves or watches the next one, and a
 * playlist is what makes the second outcome the default. Two axes are worth
 * having: by level, because that is the course a learner is actually following,
 * and by skill, because "english listening practice" is what people search for.
 *
 * Ids are cached in state/playlists.json and committed, so the 50-unit create
 * happens once per playlist in the channel's lifetime, not once per day.
 */

function readPlaylistCache() {
  try {
    return JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writePlaylistCache(cache) {
  fs.mkdirSync(path.dirname(PLAYLIST_FILE), { recursive: true });
  fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(cache, null, 2));
}

/**
 * The playlists a given lesson belongs to, as { key, title, description }.
 * Keys are stable strings — renaming a playlist on YouTube must not orphan it.
 */
export function playlistsFor(lesson, { levelConfig, skillConfig }) {
  const cfg = channel.youtube.playlists || {};
  const out = [];

  if (cfg.byLevel !== false) {
    const lvl = levelConfig(lesson.level);
    const name = lvl.label.split('·')[1]?.trim() || lvl.label;
    out.push({
      key: `level:${lesson.level}`,
      title: `${name} English (${lesson.level.toUpperCase()}) — One Lesson Every Day`.slice(0, 150),
      description:
        `Every ${lvl.label} lesson from ${channel.channelName}, in the order it was published.\n\n` +
        `Four skills on a rotating cycle: speaking, vocabulary, reading and listening. ` +
        `One new lesson every day, with Arabic subtitles.\n\n` +
        `Start at the beginning and work forward — the vocabulary builds on itself.`,
    });
  }

  if (cfg.bySkill !== false) {
    const skl = skillConfig(lesson.skill);
    out.push({
      key: `skill:${lesson.skill}`,
      title: (skl.playlistTitle || `English ${skl.label} — Every Level, Every Day`).slice(0, 150),
      description:
        `Every ${skl.label.toLowerCase()} lesson from ${channel.channelName}, across all five CEFR levels ` +
        `from A1 beginner to C1 advanced.\n\n` +
        `Pick the level that matches you — the level is in every title. Arabic subtitles included.`,
    });
  }

  return out;
}

/**
 * Resolve a playlist id, creating the playlist the first time.
 * Before creating, the channel's existing playlists are checked by title, so a
 * lost state file re-adopts the real playlists instead of making duplicates.
 */
async function ensurePlaylist(youtube, { key, title, description }) {
  const cache = readPlaylistCache();
  if (cache[key]?.id) return cache[key].id;

  let existingId = null;
  try {
    const res = await youtube.playlists.list({ part: ['id', 'snippet'], mine: true, maxResults: 50 });
    spend(COST.playlistsList, 'playlists.list');
    existingId = res.data.items?.find(p => p.snippet?.title === title)?.id || null;
  } catch (err) {
    console.warn(`[youtube] could not list playlists — ${err.message}`);
  }

  let id = existingId;
  if (!id) {
    if (!quotaAvailable(COST.playlistsInsert)) throw new Error('not enough quota to create a playlist');
    const res = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description, defaultLanguage: channel.youtube.defaultLanguage },
        status: { privacyStatus: 'public' },
      },
    });
    spend(COST.playlistsInsert, `create playlist "${title.slice(0, 40)}"`);
    id = res.data.id;
  }

  const next = readPlaylistCache();
  next[key] = { id, title, createdAt: new Date().toISOString() };
  writePlaylistCache(next);
  return id;
}

/** Public playlist URL, for cross-linking from a video description. */
export function playlistUrl(id) {
  return `https://www.youtube.com/playlist?list=${id}`;
}

/**
 * Resolve every playlist this lesson belongs to, before the upload, so their
 * URLs can go into the description. Returns [] rather than throwing: a playlist
 * problem must never cost us the video itself.
 */
export async function resolvePlaylists(specs) {
  if (!specs.length || env.dryRun) return [];
  const youtube = google.youtube({ version: 'v3', auth: oauthClient() });
  const out = [];
  for (const spec of specs) {
    try {
      out.push({ ...spec, id: await ensurePlaylist(youtube, spec) });
    } catch (err) {
      console.warn(`[youtube] playlist "${spec.title}" unavailable — ${err.message}`);
    }
  }
  return out;
}

export async function addToPlaylists(videoId, playlists) {
  const added = [];
  if (!videoId || !playlists?.length) return added;

  const youtube = google.youtube({ version: 'v3', auth: oauthClient() });
  for (const pl of playlists) {
    if (!quotaAvailable(COST.playlistItemsInsert)) {
      console.warn(`[youtube] skipping playlist "${pl.title}" — quota exhausted`);
      continue;
    }
    try {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: { snippet: { playlistId: pl.id, resourceId: { kind: 'youtube#video', videoId } } },
      });
      spend(COST.playlistItemsInsert, `playlist "${pl.title.slice(0, 30)}"`);
      added.push(pl);
    } catch (err) {
      console.warn(`[youtube] could not add to "${pl.title}" — ${err.message}`);
    }
  }
  return added;
}

export { COST };
