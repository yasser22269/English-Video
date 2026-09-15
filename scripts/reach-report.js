#!/usr/bin/env node
/**
 * Impressions and click-through rate — the numbers the Analytics API does not
 * expose, and the only way to tell a thumbnail/title problem from a retention
 * problem.
 *
 *   node scripts/reach-report.js            # ensure the job exists, then summarise any reports
 *
 * One-time setup (needs a person in a browser):
 *   1. Google Cloud Console -> enable "YouTube Reporting API" for the project
 *   2. npm run auth:youtube   (the scope list now includes yt-analytics.readonly)
 *
 * The YouTube Reporting API works as a subscription: this script creates a job
 * for `channel_reach_basic_a1` once, YouTube starts generating a daily CSV about
 * 48 hours later, and every later run downloads the reports it has not seen and
 * writes a per-video summary to reports/reach-<date>.json.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { env, paths } from '../src/lib/config.js';

const REPORT_TYPE = 'channel_reach_basic_a1';
const STATE = path.join(paths.state, 'reach-reports.json');

const auth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
auth.setCredentials({ refresh_token: env.ytRefreshToken });
const reporting = google.youtubereporting({ version: 'v1', auth });

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { jobId: null, seen: [] }; }
}

async function ensureJob(state) {
  if (state.jobId) return state.jobId;
  const existing = (await reporting.jobs.list({})).data.jobs || [];
  const found = existing.find(j => j.reportTypeId === REPORT_TYPE);
  if (found) return found.id;
  const created = await reporting.jobs.create({ requestBody: { reportTypeId: REPORT_TYPE, name: 'reach-daily' } });
  console.log(`created reporting job ${created.data.id} — first report arrives in about 48 hours`);
  return created.data.id;
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}

let state = loadState();
try {
  state.jobId = await ensureJob(state);
} catch (err) {
  const hint = /Insufficient Permission|403/.test(err.message)
    ? 'The token lacks yt-analytics.readonly. Run `npm run auth:youtube` again.'
    : /has not been used|disabled/.test(err.message)
      ? 'Enable "YouTube Reporting API" in Google Cloud Console for this project.'
      : '';
  console.error(`reach report unavailable: ${err.message.slice(0, 160)}\n${hint}`);
  process.exit(1);
}

const reports = (await reporting.jobs.reports.list({ jobId: state.jobId })).data.reports || [];
const fresh = reports.filter(r => !state.seen.includes(r.id));
console.log(`${reports.length} report(s) on the job, ${fresh.length} new`);

const byVideo = {};
for (const r of fresh) {
  const { token } = await auth.getAccessToken();
  const res = await fetch(r.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.warn(`  could not download ${r.id}: HTTP ${res.status}`); continue; }
  for (const row of parseCsv(await res.text())) {
    const id = row.video_id;
    if (!id) continue;
    const v = (byVideo[id] ??= { impressions: 0, clicks: 0 });
    const imp = Number(row.video_thumbnail_impressions || 0);
    const ctr = Number(row.video_thumbnail_impressions_ctr || 0);
    v.impressions += imp;
    v.clicks += imp * ctr;
  }
  state.seen.push(r.id);
}

const rows = Object.entries(byVideo)
  .map(([id, v]) => ({ id, impressions: v.impressions, ctr: v.impressions ? +(v.clicks / v.impressions * 100).toFixed(2) : 0 }))
  .sort((a, b) => b.impressions - a.impressions);

if (rows.length) {
  const total = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.impressions * r.ctr / 100, 0);
  console.log(`impressions ${total} · channel CTR ${(clicks / total * 100).toFixed(2)}%`);
  rows.slice(0, 15).forEach(r => console.log(`  ${String(r.impressions).padStart(6)}  ${String(r.ctr).padStart(5)}%  ${r.id}`));
  const out = path.join(paths.root, 'reports', `reach-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ totalImpressions: total, rows }, null, 2) + '\n');
}

fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
