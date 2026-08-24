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
