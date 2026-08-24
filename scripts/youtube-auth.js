#!/usr/bin/env node
/**
 * One-time YouTube OAuth setup.
 *
 *   1. console.cloud.google.com -> new project -> enable "YouTube Data API v3"
 *   2. OAuth consent screen -> publish it to **In production**
 *      (a Testing-mode refresh token silently expires every 7 days)
 *   3. Credentials -> OAuth client ID -> Desktop app
 *   4. Put the id/secret in .env.local, then run:  npm run auth:youtube
 *
 * Prints the refresh token and, when the gh CLI is authenticated, offers to
 * write it straight into the repository's Actions secrets.
 */
import http from 'http';
import { google } from 'googleapis';
import { execFile } from 'child_process';
import { env } from '../src/lib/config.js';

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

if (!env.ytClientId || !env.ytClientSecret) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local first.');
  process.exit(1);
}

const oauth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, REDIRECT);
const authUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',          // forces a refresh_token even on re-authorisation
  scope: SCOPES,
});

console.log('\nOpen this URL, pick the Google account that owns the channel, and approve:\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.writeHead(404).end();
    return;
  }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('No code in callback');
    return;
  }

  try {
    const { tokens } = await oauth.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2 style="font-family:system-ui">Done. You can close this tab.</h2>');

    console.log('\n──────────────────────────────────────────────');
    console.log('YOUTUBE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('──────────────────────────────────────────────\n');
    console.log('Add it to .env.local, then to the repo secrets:');
    console.log(`  gh secret set YOUTUBE_REFRESH_TOKEN --body "${tokens.refresh_token}"\n`);

    execFile('gh', ['secret', 'set', 'YOUTUBE_REFRESH_TOKEN', '--body', tokens.refresh_token], (err) => {
      console.log(err
        ? 'gh CLI not available or not logged in — set the secret manually with the command above.'
        : 'Repository secret YOUTUBE_REFRESH_TOKEN updated via gh.');
      server.close();
      process.exit(0);
    });
  } catch (err) {
    res.writeHead(500).end(String(err.message));
    console.error(err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => console.log(`Waiting for the callback on ${REDIRECT} ...`));
