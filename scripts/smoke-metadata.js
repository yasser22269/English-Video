#!/usr/bin/env node
/**
 * Offline smoke test for titles, descriptions, tags and the opening flag.
 * No network, no LLM, no YouTube: it only calls pure functions with synthetic
 * lessons and the real config. Exits non-zero on the first broken rule.
 *
 *   node scripts/smoke-metadata.js
 */
import assert from 'node:assert/strict';
import { channel, skillConfig } from '../src/lib/config.js';
import { buildMetadata, fillPattern, tagsLength } from '../src/lib/lesson.js';
import { openingVariant, buildPlan, buildChapters } from '../src/lib/build.js';

const DATE = '2026-10-18';
const words = (n) => Array.from({ length: n }, (_, i) => ({
  word: ['ticket', 'passport', 'gate', 'luggage', 'boarding pass', 'delay', 'seat', 'flight', 'check-in', 'arrival'][i],
  meaning: 'a simple meaning', meaning_ar: 'معنى', example: 'I have my ticket.', examples: ['I have my ticket.'],
}));

const lessons = {
  'A1 short + pairedVideo': {
    level: 'a1', skill: 'short', topic: 'At the Airport', title: 'Airport Words You Need', date: DATE, shortIndex: 0,
    hook: 'Three words every beginner needs at the airport.', words: words(3),
    pairedVideo: { videoId: 'abcDEF12345', url: 'https://youtu.be/abcDEF12345', topic: 'At the Airport', title: 'x', level: 'a1' },
    commentQuestion: 'Which word was new for you — 1, 2 or 3? 👇',
  },
  'A1 short, no pairedVideo': {
    level: 'a1', skill: 'short', topic: 'Colours and Clothes', title: 'Colours You Wear', date: DATE, shortIndex: 1,
    hook: 'Three colour words for your clothes.', words: words(3),
  },
  'A2 listening + searchTopic + pairedShort': {
    level: 'a2', skill: 'listening', topic: 'At a Restaurant', searchTopic: 'at the Restaurant', title: 'Dinner for Two', date: DATE,
    hook: 'Can you understand this conversation at the restaurant? Let us see.',
    key_phrases: [{ phrase: 'a table for two', meaning: 'm' }, { phrase: 'the bill, please', meaning: 'm' }, { phrase: 'leave a tip', meaning: 'm' }],
    pairedShort: { videoId: 'shortID1234', url: 'https://youtube.com/shorts/shortID1234' },
    commentQuestion: 'Which phrase will you use? Comment 1, 2 or 3 👇',
  },
  'B1 reading, no optional fields': {
    level: 'b1', skill: 'reading', topic: 'Learning Languages Faster', title: 'The Fast Learner',
    hook: 'A short story about learning a language in half the time.',
    glossary: [{ word: 'habit', meaning: 'm' }, { word: 'progress', meaning: 'm' }, { word: 'fluent', meaning: 'm' }],
  },
};

const chapters = [
  { stamp: '00:00', label: 'Clothes are made from recycled fabrics.' },
  { stamp: '00:25', label: 'The conversation — with the words' },
  { stamp: '01:40', label: 'Did you understand?' },
];
const playlists = [
  { key: 'level:a2', id: 'PLlevel', title: 'English for A2' },
  { key: 'skill:listening', id: 'PLskill', title: 'Conversation Practice' },
];

const shortSkill = skillConfig('short');
const hasPatterns = Array.isArray(shortSkill.titlePatterns) && shortSkill.titlePatterns.length > 0;

for (const [name, lesson] of Object.entries(lessons)) {
  const isShort = lesson.skill === 'short';
  const meta = buildMetadata(lesson, { channel, playlists: isShort ? [] : playlists, chapters: isShort ? [] : chapters });
  console.log(`\n=== ${name} ===\nTITLE (${meta.title.length}): ${meta.title}\n--- description ---\n${meta.description}\n--- tags (${tagsLength(meta.tags)} chars) ---\n${meta.tags.join(', ')}`);

  assert.ok(meta.title.length <= 100, `${name}: title over 100 chars`);
  assert.ok(!meta.title.includes('{') && !meta.title.includes('}'), `${name}: unfilled placeholder in title`);
  if (isShort) {
    assert.ok(/#shorts/i.test(meta.title), `${name}: Short title lacks #shorts`);
    if (hasPatterns) assert.ok(!/60 Seconds/i.test(meta.title), `${name}: Short title still says 60 Seconds`);
    if (hasPatterns) assert.ok(Number.isInteger(meta.titlePatternIndex), `${name}: title pattern index was not recorded`);
  } else {
    assert.equal(meta.titlePatternIndex, null, `${name}: fixed title pattern should not have a rotation index`);
  }
  const lines = meta.description.split('\n');
  if (lesson.pairedVideo) assert.ok(lines[1]?.includes(lesson.pairedVideo.url), `${name}: description line 2 lacks the paired url`);
  if (lesson.pairedShort) assert.ok(meta.description.includes(lesson.pairedShort.url), `${name}: description lacks the 60-second version url`);
  const hashtags = meta.description.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || [];
  assert.ok(hashtags.length <= 3, `${name}: ${hashtags.length} hashtags`);
  assert.ok(!/[<>]/.test(meta.description), `${name}: angle bracket in description`);
  assert.ok(tagsLength(meta.tags) <= 500 && meta.tags.join(',').length <= 500, `${name}: tags over 500 chars`);
  if (!isShort && chapters.length) {
    const first = lines.find(l => l.startsWith('00:00')) || '';
    assert.ok(!first.includes('recycled fabrics'), `${name}: first chapter is still a drill sentence`);
  }
}

// Placeholders: {llmTitle}, searchTopic and stripping of unknown ones.
const filled = fillPattern('{llmTitle} | {topic} {unknown}({level}) #shorts', lessons['A2 listening + searchTopic + pairedShort']);
console.log(`\nfillPattern: ${filled}`);
assert.ok(!filled.includes('{') && filled.includes('Dinner for Two') && filled.includes('at the Restaurant'), 'fillPattern placeholders');

// Opening flag: every mode and both date shapes return 'new' | 'old'.
for (const mode of [undefined, 'off', 'on', 'alternate', 'nonsense']) {
  for (const d of [DATE, '2026-10-19', new Date(), 'garbage']) {
    const v = openingVariant(d, { experiments: mode === undefined ? undefined : { newOpening: mode } });
    assert.ok(v === 'new' || v === 'old', `openingVariant(${d}, ${mode}) = ${v}`);
  }
}
assert.equal(openingVariant(DATE, {}), 'old');
assert.equal(openingVariant(DATE, { experiments: { newOpening: 'on' } }), 'new');
assert.notEqual(openingVariant('2026-10-18', { experiments: { newOpening: 'alternate' } }), openingVariant('2026-10-19', { experiments: { newOpening: 'alternate' } }));
console.log(`openingVariant today with config: ${openingVariant(new Date(), channel)}`);

// The Short plan builds offline and the end frame carries the paired topic.
const shortPlan = buildPlan({ ...lessons['A1 short + pairedVideo'], skillLabel: 'Short' });
const end = shortPlan.scenes.find(s => s.layout === 'short-end');
assert.equal(end?.data.pairedTopic, 'At the Airport', 'short-end scene lacks the paired topic');
console.log(`Short CTA: "${shortPlan.lines[shortPlan.lines.length - 1].text}"`);

// Chapters: the 00:00 label from the plan is a topic label.
const fake = buildPlan({
  ...lessons['A2 listening + searchTopic + pairedShort'], skillLabel: 'Listening Practice', setting: 'A small restaurant.',
  dialogue: Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', en: `Line ${i} about the restaurant table.`, ar: 'x' })),
  questions: [{ q: 'Q?', options: ['a', 'b', 'c'], answer: 0 }],
});
let t = 0;
const timeline = fake.lines.map(l => { const s = t; t += 6000; return { ...l, startMs: s, endMs: s + 5000 }; });
const ch = buildChapters(timeline);
console.log(`chapters: ${ch.map(c => `${c.stamp} ${c.label}`).join(' | ')}`);
assert.ok(ch.length >= 3 && ch[0].stamp === '00:00' && /restaurant/i.test(ch[0].label), 'first chapter is not a topic label');

console.log('\nsmoke-metadata: all checks passed');
