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

/**
 * Which levels publish a long lesson today.
 *
 * `channel.batch.alternate` lists levels that share one slot, taking turns day
 * by day. Month one measured A1 at 9.5 views per video and B2/C1 at 1.8 (C1's
 * newest cohort: 5.7% average view percentage), so B2 and C1 now alternate
 * rather than each taking a daily slot — both stay on the channel, roughly
 * fifteen lessons a month each — and the freed upload goes to a Short. Set
 * `alternate` to [] to go back to one long lesson per level per day.
 */
export function levelsFor(date = new Date()) {
  const alternate = channel.batch?.alternate || [];
  const active = channel.levels.filter(l => !channel.batch?.excluded?.includes(l));
  const fixed = active.filter(l => !alternate.includes(l));
  if (!alternate.length) return active;
  const turn = alternate[dayIndex(date) % alternate.length];
  return active.filter(l => fixed.includes(l) || l === turn);
}

export function todaysBatch(date = new Date()) {
  return levelsFor(date).map(level => ({ level, skill: skillFor(level, date), date }));
}

/**
 * Today's Shorts: vertical micro-lessons, rotating through
 * `channel.batch.shorts.levels` so every level gets its turn.
 *
 * Measured 16-26 Sep, the first eleven days with Shorts: 11 Shorts earned 963
 * views (88 each) while 44 long lessons earned about 290 between them — 77% of
 * the channel's growth from a fifth of the uploads. `perDay` is why there are
 * now two.
 */
export function todaysShorts(date = new Date()) {
  const cfg = channel.batch?.shorts;
  if (!cfg?.enabled || !cfg.levels?.length) return [];
  const perDay = Math.max(1, cfg.perDay || 1);
  const out = [];
  for (let i = 0; i < perDay; i++) {
    const level = cfg.levels[(dayIndex(date) * perDay + i) % cfg.levels.length];
    // Each Short gets its own hour so two do not land in the same minute.
    out.push({ level, skill: 'short', date, shortIndex: i, slot: cfg.slots?.[i] || null });
  }
  return out;
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
export function publishedHistory() {
  try { return JSON.parse(fs.readFileSync(path.join(paths.state, 'history.json'), 'utf8')); }
  catch { return []; }
}

export function pairedShortFor(level, topic, date = new Date()) {
  return publishedHistory().filter(h => h.videoId && h.skill === 'short' && h.level === level && h.topic === topic &&
    new Date(h.publishAt || h.date).getTime() <= date.getTime())
    .sort((a, b) => new Date(b.publishAt || b.date) - new Date(a.publishAt || a.date))[0];
}

export function pickTopic(level, skill, date = new Date()) {
  const bank = curriculum(level).topics;
  if (skill === 'short') {
    const history = publishedHistory();
    const shorts = history.filter(h => h.videoId && h.skill === 'short' && h.level === level);
    const candidate = history.filter(h => {
      const age = dayIndex(date) - dayIndex(new Date(h.publishAt || h.date));
      return h.videoId && h.skill !== 'short' && h.level === level && age >= 3 && age <= 14 &&
        !shorts.some(short => short.topic === h.topic || short.pairedVideoId === h.videoId) && bank.some(t => t.topic === h.topic);
    }).sort((a, b) => {
      // Weekly/report tooling may enrich history with either field. Prefer the
      // proven lesson when it is available; otherwise the newest eligible one.
      const viewsA = Number(a.views ?? a.viewCount);
      const viewsB = Number(b.views ?? b.viewCount);
      const hasViewsA = Number.isFinite(viewsA);
      const hasViewsB = Number.isFinite(viewsB);
      if (hasViewsA || hasViewsB) {
        const byViews = (hasViewsB ? viewsB : -1) - (hasViewsA ? viewsA : -1);
        if (byViews) return byViews;
      }
      return new Date(b.publishAt || b.date) - new Date(a.publishAt || a.date);
    })[0];
    if (candidate) return {
      ...bank.find(t => t.topic === candidate.topic),
      pairedVideo: { videoId: candidate.videoId, url: candidate.url || 'https://youtu.be/' + candidate.videoId,
        topic: candidate.topic, title: candidate.title, level: candidate.level },
      commit() {}, // Pairing is tracked in published history, not the fallback rotation.
    };
  }
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
  return publishAtSlot(channel.publish?.slots?.[level], date, now);
}

/** The instant of a wall-clock slot, or null once it has already passed. */
export function publishAtSlot(slot, date = new Date(), now = new Date()) {
  const cfg = channel.publish;
  if (!slot) return null;

  const at = wallClockToUtc(date, slot, cfg?.timezone || 'UTC');
  const leadMs = (cfg.minLeadMinutes ?? 15) * 60_000;
  return at.getTime() - now.getTime() >= leadMs ? at : null;
}

/** "19:00 Africa/Cairo · 16:00 UTC" — for run logs and the --plan table. */
export function describeSlot(level, date = new Date(), overrideSlot = null) {
  const cfg = channel.publish;
  const slot = overrideSlot || cfg?.slots?.[level];
  if (!slot) return 'immediately';
  const at = wallClockToUtc(date, slot, cfg.timezone || 'UTC');
  return `${slot} ${cfg.timezone} · ${at.toISOString().slice(11, 16)} UTC`;
}
