import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { env, paths, channel } from './config.js';

const QUOTA_FILE = path.join(paths.state, 'quota.json');

// YouTube Data API v3 costs, in quota units.
const COST = { videosInsert: 1600, thumbnailsSet: 50, playlistItemsInsert: 50 };
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

export { COST };
