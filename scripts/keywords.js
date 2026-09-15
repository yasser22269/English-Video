#!/usr/bin/env node
/**
 * YouTube keyword research from real search demand.
 *
 *   node scripts/keywords.js topics                # score every curriculum topic
 *   node scripts/keywords.js topics --level a1     # one level
 *   node scripts/keywords.js expand "english words for"   # a-z expansion of a seed
 *   node scripts/keywords.js markets "english listening practice"  # same seed, 8 UI languages
 *
 * Source: YouTube's own search autocomplete (suggestqueries, ds=yt) — the list a
 * viewer sees while typing. It is what the paid YouTube SEO tools build on, it
 * needs no key and it costs no API quota. A suggestion only appears when enough
 * people have typed it, so presence in the list is real demand; absence is a
 * strong hint that nobody searches for that phrasing.
 *
 * Reports are written to reports/keywords-<date>.json.
 */
import fs from 'fs';
import path from 'path';
import { channel, curriculum, paths } from '../src/lib/config.js';

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// UI languages where English learners are concentrated. hl changes both the
// ranking and which suggestions appear.
const MARKETS = ['en', 'es', 'pt', 'hi', 'ar', 'id', 'tr', 'vi'];

const cache = new Map();
export async function suggest(query, hl = 'en') {
  const key = `${hl}|${query}`;
  if (cache.has(key)) return cache.get(key);
  const url = 'https://suggestqueries.google.com/complete/search'
    + `?client=firefox&ds=yt&hl=${hl}&ie=utf-8&oe=utf-8&q=${encodeURIComponent(query)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = new TextDecoder('utf-8').decode(await res.arrayBuffer());
      const list = JSON.parse(text)[1] || [];
      cache.set(key, list);
      await sleep(160);
      return list;
    } catch (err) {
      if (attempt === 3) { console.warn(`  [suggest] ${query} (${hl}) failed: ${err.message}`); return []; }
      await sleep(900 * attempt);
    }
  }
  return [];
}

const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'my', 'about', 'how', 'talking', 'describing', 'is', 'it', 'that', 'what', 'like', 'do']);
const coreWords = (s) => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w));

/**
 * Demand score for one topic: how many distinct autocomplete suggestions, across
 * the phrasings a learner might use, contain the topic's core words.
 */
async function scoreTopic(topic) {
  const core = coreWords(topic);
  const short = core.slice(0, 3).join(' ');
  const probes = [
    `${short} english`,
    `english ${short}`,
    `${short} vocabulary`,
    `${short} in english`,
  ];
  const hits = new Set();
  const examples = [];
  for (const q of probes) {
    for (const s of await suggest(q, 'en')) {
      const n = norm(s);
      const matched = core.filter(w => n.includes(w)).length;
      if (matched >= Math.min(2, core.length) && /english|vocabulary|words|conversation|speaking|listening|learn/.test(n)) {
        if (!hits.has(n)) { hits.add(n); examples.push(s); }
      }
    }
  }
  return { topic, core: short, score: hits.size, examples: examples.slice(0, 5) };
}

async function topicsReport() {
  const levels = arg('level') ? [arg('level')] : channel.levels;
  const report = {};
  for (const level of levels) {
    const bank = curriculum(level).topics;
    console.log(`\n${level.toUpperCase()} — ${bank.length} topics`);
    const rows = [];
    for (const entry of bank) {
      const r = await scoreTopic(entry.topic);
      rows.push(r);
      process.stdout.write(`  ${String(r.score).padStart(2)}  ${entry.topic}\n`);
    }
    rows.sort((a, b) => b.score - a.score);
    report[level] = rows;
    const zero = rows.filter(r => r.score === 0).length;
    console.log(`  → ${zero} of ${rows.length} topics show no search demand at all`);
  }
  return report;
}

async function expand(seed) {
  const out = new Set(await suggest(seed, 'en'));
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    for (const s of await suggest(`${seed} ${ch}`, 'en')) out.add(s);
  }
  const list = [...out].sort();
  list.forEach(s => console.log('  ' + s));
  console.log(`\n${list.length} suggestions for "${seed}"`);
  return list;
}

async function markets(seed) {
  const report = {};
  for (const hl of MARKETS) {
    const list = await suggest(seed, hl);
    report[hl] = list;
    console.log(`\n[${hl}] ${list.length}\n  ${list.slice(0, 10).join(' · ')}`);
  }
  return report;
}

function save(kind, data) {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(paths.root, 'reports', `keywords-${kind}-${stamp}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nsaved ${path.relative(paths.root, file)}`);
}

// Importable (suggest() is reused elsewhere) and runnable as a CLI.
const isMain = /keywords\.js$/.test(process.argv[1] || '');
if (isMain) {
  if (cmd === 'topics') save('topics', await topicsReport());
  else if (cmd === 'expand' && argv[1]) save('expand', { seed: argv[1], suggestions: await expand(argv[1]) });
  else if (cmd === 'markets' && argv[1]) save('markets', { seed: argv[1], markets: await markets(argv[1]) });
  else {
    console.log('usage: node scripts/keywords.js topics [--level a1] | expand "<seed>" | markets "<seed>"');
    process.exit(1);
  }
}
