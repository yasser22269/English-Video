import fs from 'fs';
import path from 'path';
import { channel, curriculum, paths } from './config.js';

const STATE_FILE = path.join(paths.state, 'used-topics.json');

export function dayIndex(date = new Date()) {
  // Whole UTC days since epoch — stable regardless of the runner's timezone.
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

/**
 * One video per level per day, with the skill staggered across levels so a
 * single day's batch covers all four skills instead of four copies of one.
 * Each level still walks the full skill cycle every 4 days.
 */
export function skillFor(level, date = new Date()) {
  const levelIdx = channel.levels.indexOf(level);
  const cycle = channel.skillCycle;
  return cycle[(dayIndex(date) + levelIdx) % cycle.length];
}

export function todaysBatch(date = new Date()) {
  return channel.levels.map(level => ({ level, skill: skillFor(level, date), date }));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { used: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { used: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Pick the least-recently-used topic for this (level, skill) pair. Every topic
 * is used once for a given skill before any repeats, so a 48-topic bank yields
 * 48 unique lessons per skill per level (~6 months at one skill every 4 days).
 */
export function pickTopic(level, skill, date = new Date()) {
  const bank = curriculum(level).topics;
  const state = loadState();
  const key = `${level}:${skill}`;
  const used = state.used[key] || [];

  const unused = bank.filter(t => !used.includes(t.topic));
  const pool = unused.length ? unused : bank;
  // Deterministic within a day so a re-run of the same day picks the same topic.
  const chosen = pool[dayIndex(date) % pool.length];

  return {
    ...chosen,
    commit() {
      const s = loadState();
      const list = s.used[key] || [];
      if (unused.length === 0) s.used[key] = [chosen.topic];
      else s.used[key] = [...list, chosen.topic];
      s.updatedAt = new Date().toISOString();
      saveState(s);
    },
  };
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/* ── publish slots ──────────────────────────────────────────────────────────
 * All five lessons are built in one morning run, but dropping them within
 * minutes of each other wastes them: they compete with each other in the same
 * subscriber feed. Each level instead owns a fixed hour, so a viewer following
 * B1 learns that B1 lands at 19:00 and comes back for it.
 */

/**
 * How far `tz` is ahead of UTC at a given instant, in milliseconds.
 * Read back from Intl rather than hard-coded: Cairo is UTC+2 in winter and
 * UTC+3 in summer, and a fixed offset would drift by an hour twice a year.
 */
function zoneOffsetMs(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - instant.getTime();
}

/** The UTC instant of local wall-clock `hh:mm` in `tz`, on the UTC day of `date`. */
function wallClockToUtc(date, hhmm, tz) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const naive = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0);
  // Two passes: the offset at the naive guess can differ from the offset at the
  // real instant when the slot sits near a DST transition.
  let ts = naive - zoneOffsetMs(new Date(naive), tz);
  ts = naive - zoneOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/**
 * The scheduled publish instant for this level, or null to publish immediately.
 *
 * Null is the deliberate answer when the slot has already passed — a run that
 * started late should still get the day's lesson out, not hold it for 24 hours.
 */
export function publishAtFor(level, date = new Date(), now = new Date()) {
  const cfg = channel.publish;
  const slot = cfg?.slots?.[level];
  if (!slot) return null;

  const at = wallClockToUtc(date, slot, cfg.timezone || 'UTC');
  const leadMs = (cfg.minLeadMinutes ?? 15) * 60_000;
  return at.getTime() - now.getTime() >= leadMs ? at : null;
}

/** "19:00 Africa/Cairo · 16:00 UTC" — for run logs and the --plan table. */
export function describeSlot(level, date = new Date()) {
  const cfg = channel.publish;
  const slot = cfg?.slots?.[level];
  if (!slot) return 'immediately';
  const at = wallClockToUtc(date, slot, cfg.timezone || 'UTC');
  return `${slot} ${cfg.timezone} · ${at.toISOString().slice(11, 16)} UTC`;
}
