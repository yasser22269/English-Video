#!/usr/bin/env node
/**
 * Weekly channel report — did the last change actually work?
 *
 *   node scripts/weekly-report.js                 # week ending yesterday
 *   node scripts/weekly-report.js --end 2026-09-21
 *
 * Month one taught the rule this script enforces: channel totals mix old and
 * new videos and can hide a regression. The 2 Sep retention fix looked fine in
 * aggregate while videos published after it were retaining 15.3% against 23.8%
 * for the ones before. So the headline comparison here is always SAME-AGE:
 * views and average view percentage in each video's first 7 days, for videos
 * published this week versus the week before.
 *
 * Writes reports/weekly-<end>.md and, on GitHub Actions, the job summary.
 * Uses only the Analytics and Data APIs (a few quota units).
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { env, paths } from '../src/lib/config.js';

const argv = process.argv.slice(2);
const endArg = argv.includes('--end') ? argv[argv.indexOf('--end') + 1] : null;

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => day(new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000));
const end = endArg || addDays(day(new Date()), -1);
const start = addDays(end, -6);
const prevEnd = addDays(start, -1);
const prevStart = addDays(prevEnd, -6);

const auth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
auth.setCredentials({ refresh_token: env.ytRefreshToken });
const ya = google.youtubeAnalytics({ version: 'v2', auth });
const yt = google.youtube({ version: 'v3', auth });

async function query(startDate, endDate, opts) {
  const r = await ya.reports.query({ ids: 'channel==MINE', startDate, endDate, ...opts });
  const cols = r.data.columnHeaders.map(h => h.name);
  return (r.data.rows || []).map(row => Object.fromEntries(row.map((v, i) => [cols[i], v])));
}

const weekTotals = async (s, e) => (await query(s, e, {
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,comments,likes',
}))[0] || {};

const traffic = async (s, e) => query(s, e, {
  metrics: 'views,averageViewDuration', dimensions: 'insightTrafficSourceType', sort: '-views',
});

// Videos published in a window, from the run log (lessons and Shorts alike).
const history = JSON.parse(fs.readFileSync(path.join(paths.state, 'history.json'), 'utf8'));
const publishedIn = (s, e) => history.filter(h => h.videoId && h.date >= s && h.date <= e);

/** Same-age cohort: each video's first 7 days, weighted by views. */
async function cohort(entries) {
  let views = 0, weighted = 0, zero = 0, subs = 0;
  const rows = [];
  for (const h of entries) {
    const s = h.date;
    const e = addDays(s, 6);
    const r = (await query(s, e, {
      metrics: 'views,averageViewPercentage,averageViewDuration,subscribersGained',
      filters: `video==${h.videoId}`,
    }))[0] || { views: 0, averageViewPercentage: 0, averageViewDuration: 0, subscribersGained: 0 };
    views += r.views;
    weighted += r.averageViewPercentage * r.views;
    subs += r.subscribersGained;
    if (!r.views) zero++;
    rows.push({ ...h, v7: r.views, pct7: r.averageViewPercentage, dur7: r.averageViewDuration });
  }
  return {
    videos: entries.length,
    views7: views,
    perVideo7: entries.length ? +(views / entries.length).toFixed(2) : 0,
    zeroViewShare: entries.length ? Math.round((zero / entries.length) * 100) : 0,
    retention7: views ? +(weighted / views).toFixed(1) : null,
    subs7: subs,
    rows,
  };
}

const [thisWeek, lastWeek, trafficThis, trafficLast] = await Promise.all([
  weekTotals(start, end), weekTotals(prevStart, prevEnd), traffic(start, end), traffic(prevStart, prevEnd),
]);

// Only cohorts old enough to have a full 7 days of data are compared.
const mature = (entries) => entries.filter(h => addDays(h.date, 6) <= end);
const cohortThis = await cohort(mature(publishedIn(prevStart, prevEnd)));
const cohortPrev = await cohort(mature(publishedIn(addDays(prevStart, -7), addDays(prevEnd, -7))));

const bySkill = {};
for (const r of cohortThis.rows) {
  const k = r.skill;
  bySkill[k] ??= { videos: 0, views: 0, weighted: 0 };
  bySkill[k].videos++;
  bySkill[k].views += r.v7;
  bySkill[k].weighted += (r.pct7 || 0) * r.v7;
}

const ch = (await yt.channels.list({ part: ['statistics'], mine: true })).data.items[0].statistics;

const delta = (a, b, unit = '') => {
  if (a == null || b == null) return '—';
  const d = +(a - b).toFixed(1);
  return `${d >= 0 ? '+' : ''}${d}${unit}`;
};
const fmt = (n) => (n == null ? '—' : String(n));

const md = [];
md.push(`# Weekly report — ${start} to ${end}`, '');
md.push(`Channel: **${ch.subscriberCount} subscribers · ${ch.viewCount} lifetime views · ${ch.videoCount} videos**`, '');

md.push('## This week vs last week', '');
md.push('| | This week | Last week | Change |', '|---|---|---|---|');
for (const [label, key, unit] of [
  ['Views', 'views', ''], ['Watch minutes', 'estimatedMinutesWatched', ''],
  ['Avg view duration (s)', 'averageViewDuration', 's'], ['Avg view percentage', 'averageViewPercentage', '%'],
  ['Subscribers gained', 'subscribersGained', ''], ['Comments', 'comments', ''],
]) {
  md.push(`| ${label} | ${fmt(thisWeek[key])} | ${fmt(lastWeek[key])} | ${delta(thisWeek[key], lastWeek[key], unit)} |`);
}
md.push('');

md.push('## Same-age cohorts — the comparison that matters', '');
md.push('Each video measured over its own first 7 days, so new and old videos are compared at the same age.', '');
md.push('| Published | Videos | Views in first 7 days | Per video | Zero-view | Retention (7d) |', '|---|---|---|---|---|---|');
md.push(`| ${prevStart} → ${prevEnd} | ${cohortThis.videos} | ${cohortThis.views7} | ${cohortThis.perVideo7} | ${cohortThis.zeroViewShare}% | ${fmt(cohortThis.retention7)}% |`);
md.push(`| ${addDays(prevStart, -7)} → ${addDays(prevEnd, -7)} | ${cohortPrev.videos} | ${cohortPrev.views7} | ${cohortPrev.perVideo7} | ${cohortPrev.zeroViewShare}% | ${fmt(cohortPrev.retention7)}% |`);
md.push('');
if (cohortThis.retention7 != null && cohortPrev.retention7 != null) {
  const better = cohortThis.retention7 >= cohortPrev.retention7;
  md.push(`**Verdict:** retention ${better ? 'improved' : 'fell'} ${delta(cohortThis.retention7, cohortPrev.retention7, ' points')} and views per video ${delta(cohortThis.perVideo7, cohortPrev.perVideo7)} at the same age.`, '');
}

md.push('### By format (newest mature cohort)', '');
md.push('| Format | Videos | Views (7d) | Retention (7d) |', '|---|---|---|---|');
for (const [k, v] of Object.entries(bySkill)) {
  md.push(`| ${k} | ${v.videos} | ${v.views} | ${v.views ? (v.weighted / v.views).toFixed(1) + '%' : '—'} |`);
}
md.push('');

md.push('## Where views came from', '');
md.push('| Source | This week | Last week |', '|---|---|---|');
const sources = new Set([...trafficThis, ...trafficLast].map(r => r.insightTrafficSourceType));
for (const s of sources) {
  const a = trafficThis.find(r => r.insightTrafficSourceType === s)?.views ?? 0;
  const b = trafficLast.find(r => r.insightTrafficSourceType === s)?.views ?? 0;
  md.push(`| ${s} | ${a} | ${b} |`);
}
md.push('');

const top = [...cohortThis.rows].sort((a, b) => b.v7 - a.v7);
md.push('## Best and worst of the cohort', '');
for (const r of top.slice(0, 5)) md.push(`- ▲ ${r.v7} views · ${r.pct7?.toFixed?.(1) ?? '—'}% · ${r.level.toUpperCase()} ${r.skill} — ${r.title}`);
for (const r of top.slice(-3).reverse()) md.push(`- ▼ ${r.v7} views · ${r.pct7?.toFixed?.(1) ?? '—'}% · ${r.level.toUpperCase()} ${r.skill} — ${r.title}`);
md.push('');

const text = md.join('\n');
const out = path.join(paths.root, 'reports', `weekly-${end}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
console.log(text);
console.log(`\nsaved ${path.relative(paths.root, out)}`);
