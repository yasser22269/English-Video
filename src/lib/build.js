import { levelConfig, skillConfig, channel } from './config.js';

/** Shift a rate string like "-6%" by a number of percentage points, clamped. */
function shiftRate(rate, by) {
  const base = parseInt(String(rate).replace('%', ''), 10) || 0;
  const next = Math.max(-28, Math.min(15, base + by));
  return `${next >= 0 ? '+' : ''}${next}%`;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** Text destined for the voice, not the screen: gaps and symbols read badly. */
function speakable(text) {
  return String(text)
    .replace(/_{2,}/g, ' blank ')
    .replace(/\s*\/\s*/g, ' or ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sentence-case after a full stop. Lesson fragments get stitched together
 * ("Now you." + a lowercase target word), and the caption track shows the seam.
 */
function sentenceCase(text) {
  return String(text)
    .replace(/^(\s*)([a-z])/, (_, sp, c) => sp + c.toUpperCase())
    .replace(/([.!?])(\s+)([a-z])/g, (_, p, sp, c) => p + sp + c.toUpperCase());
}

class Plan {
  constructor({ level, skill, lesson }) {
    this.level = level;
    this.skill = skill;
    this.lesson = lesson;
    this.lvl = levelConfig(level);
    this.lines = [];
    this.scenes = [];
    this.images = [];
    this.current = null;
    this.seq = 0;
  }

  scene(layout, data, { transparent = false } = {}) {
    this.current = { id: `sc${String(this.scenes.length + 1).padStart(3, '0')}`, layout, data, transparent, lineIds: [] };
    this.scenes.push(this.current);
    return this.current;
  }

  /**
   * Queue one spoken line. `text` is what the voice says; `caption` (when given)
   * is what the viewer reads, which differs wherever the script says "blank"
   * but the screen shows an underscore.
   */
  say(text, opts = {}) {
    const id = `ln${String(++this.seq).padStart(3, '0')}`;
    const line = {
      id,
      text: sentenceCase(speakable(text)),
      caption: opts.caption ?? null,
      voice: opts.voice || this.lvl.teacher,
      baseRate: opts.rate || this.lvl.rate,
      ar: opts.ar || null,
      note: opts.note || null,
      speakerName: opts.speakerName || null,
      captions: opts.captions || 'karaoke',
      cue: opts.cue || null,
      ...(opts.pauseAfterMs != null ? { pauseAfterMs: opts.pauseAfterMs } : {}),
    };
    this.lines.push(line);
    this.current?.lineIds.push(id);
    return line;
  }

  image(id, prompt, fallbackQuery) {
    this.images.push({ id, prompt, fallbackQuery });
    return id;
  }
}

function intro(plan, { eyebrow, chips }) {
  const { lesson, lvl } = plan;
  plan.scene('title', {
    eyebrow,
    title: lesson.title,
    subtitle: lesson.topic,
    chips: chips || [lvl.label, plan.lesson.skillLabel],
  });
  if (lesson.hook) plan.say(lesson.hook, { note: 'Today' });
  if (lesson.intro) plan.say(lesson.intro);
}

function outro(plan) {
  const { lesson } = plan;
  plan.scene('outro', {
    eyebrow: 'Same time tomorrow',
    title: 'One lesson. Every day. Every level.',
    cards: ['A1 · A2 · B1 · B2 · C1', 'Speaking · Vocabulary · Reading · Listening', 'Subscribe to keep the streak'],
  });
  if (lesson.outro) plan.say(lesson.outro);
  plan.say('Subscribe, and I will see you in tomorrow lesson.', { pauseAfterMs: 900 });
}

/* ── vocabulary ─────────────────────────────────────────────────────────── */
function buildVocabulary(plan) {
  const { lesson, lvl } = plan;
  const words = lesson.words;

  intro(plan, { eyebrow: `${words.length} new words`, chips: [lvl.label, `${words.length} words`, lesson.focus] });

  words.forEach((w, i) => {
    const imgId = plan.image(`word-${i + 1}`, w.image_prompt || `${w.word}, ${lesson.topic}`, `${w.word} ${lesson.topic}`);
    const counter = `${i + 1} / ${words.length}`;

    plan.scene('word', {
      counter,
      word: w.word,
      ipa: w.ipa,
      pos: w.pos,
      meaning_ar: w.meaning_ar,
      imageId: imgId,
    });

    const note = `Word ${i + 1} of ${words.length}`;
    plan.say(`${w.word}.`, { rate: shiftRate(lvl.rate, -9), note, pauseAfterMs: 620 });
    plan.say(w.meaning, { ar: w.meaning_ar, note });
    (w.examples || []).slice(0, 2).forEach((ex, k) => {
      plan.say(ex, { ar: w.examples_ar?.[k] || null, note });
    });
    if (w.collocation) plan.say(`You will often hear it like this. ${w.collocation}.`, { note });
    plan.say(`Now you. ${w.word}.`, {
      rate: shiftRate(lvl.rate, -9),
      note,
      cue: 'Your turn — say it out loud',
      pauseAfterMs: 1900,
    });
  });

  plan.scene('title', {
    eyebrow: 'Quick recap',
    title: 'Let us go through them one more time',
    subtitle: lesson.topic,
    chips: words.map(w => w.word),
  });
  (lesson.recap || []).forEach(line => plan.say(line));

  (lesson.quiz || []).forEach((q, i) => {
    const shown = q.prompt;
    plan.scene('drill', {
      counter: `Quiz ${i + 1} / ${lesson.quiz.length}`,
      eyebrow: 'Fill the gap',
      phrase: shown,
      cue: 'Say the missing word',
    });
    plan.say(shown, { caption: shown, ar: q.prompt_ar, note: 'Fill the gap', cue: 'Which word fits?', pauseAfterMs: 2400 });

    plan.scene('drill', {
      counter: `Quiz ${i + 1} / ${lesson.quiz.length}`,
      eyebrow: 'Answer',
      phrase: shown.replace(/_{2,}/, q.answer),
      focus: q.answer,
    });
    plan.say(`The answer is ${q.answer}.`, { note: 'Answer' });
  });

  outro(plan);
  return { mode: 'stills' };
}

/* ── reading ────────────────────────────────────────────────────────────── */
/**
 * Standard ELT running order, not an arbitrary one: pre-teach the vocabulary,
 * read the text straight through for gist, then walk it sentence by sentence
 * with the translation, then check comprehension. Reading it once and moving
 * on left a two-and-a-half minute lesson that taught very little.
 */
function buildReading(plan) {
  const { lesson, lvl } = plan;

  const heroId = plan.image('hero', `${lesson.passage_title || lesson.topic}, ${lesson.topic}`, lesson.topic);
  intro(plan, { eyebrow: 'Reading practice', chips: [lvl.label, `${lesson.passage.length} sentences`, lesson.focus] });

  // 1 ─ pre-teach, so the first read-through is actually comprehensible
  if (lesson.glossary?.length) {
    plan.scene('title', {
      eyebrow: 'Before you read',
      title: 'The words you will meet in the text',
      subtitle: lesson.passage_title || lesson.topic,
      chips: lesson.glossary.map(g => g.word),
    });
    plan.say('Before we read, here are the words from the text that you need.');

    lesson.glossary.forEach((g, i) => {
      plan.scene('word', {
        counter: `${i + 1} / ${lesson.glossary.length}`,
        word: g.word,
        meaning_ar: g.meaning_ar,
      });
      plan.say(`${g.word}.`, { rate: shiftRate(lvl.rate, -8), pauseAfterMs: 560, note: 'Before you read' });
      plan.say(g.meaning, { ar: g.meaning_ar, note: 'Before you read' });
    });
  }

  // 2 ─ straight through, English only: read for the gist, no translation crutch
  plan.scene('passage', {
    eyebrow: 'Read along',
    title: lesson.passage_title || lesson.topic,
    note: 'Follow the highlighted words. Do not stop at what you do not know.',
    imageId: heroId,
  });
  plan.say('Now read the whole text with me. Follow the words as I say them.', { note: 'Read along' });
  lesson.passage.forEach((sentence, i) => {
    plan.say(sentence.en, { note: `Read along · ${i + 1} of ${lesson.passage.length}`, pauseAfterMs: 260 });
  });

  // 3 ─ again, slower, sentence by sentence, with the Arabic
  plan.scene('passage', {
    eyebrow: 'Line by line',
    title: lesson.passage_title || lesson.topic,
    note: 'Same text, slower, with the meaning underneath.',
    imageId: heroId,
  });
  plan.say('Let us go through it again, slowly, one sentence at a time.', { note: 'Line by line' });
  lesson.passage.forEach((sentence, i) => {
    plan.say(sentence.en, {
      rate: shiftRate(lvl.rate, -7),
      ar: sentence.ar,
      note: `Line by line · ${i + 1} of ${lesson.passage.length}`,
      pauseAfterMs: 700,
    });
  });

  // 4 ─ comprehension
  lesson.questions.forEach((q, i) => {
    const label = `Question ${i + 1} of ${lesson.questions.length}`;
    plan.scene('question', { eyebrow: label, options: q.options, answer: q.answer, reveal: false });
    plan.say(q.q, { ar: q.q_ar, note: label, cue: 'Choose A, B or C', pauseAfterMs: 3200 });

    plan.scene('question', { eyebrow: label, options: q.options, answer: q.answer, reveal: true });
    plan.say(`The answer is ${LETTERS[q.answer] || 'A'}. ${q.options[q.answer]}.`, { note: label });
    if (q.explain) plan.say(q.explain, { note: label });
  });

  outro(plan);
  return { mode: 'stills' };
}

/* ── listening ──────────────────────────────────────────────────────────── */
function buildListening(plan) {
  const { lesson, lvl } = plan;
  const voiceOf = (s) => (s === 'B' ? lvl.speakerB : lvl.speakerA);

  // Title card for the opening only. Once the lesson proper starts the middle
  // of the frame is cleared: the footage is the visual, and the section label
  // lives in the top note line.
  plan.scene('overlay', {
    eyebrow: 'Listening practice',
    title: lesson.title,
    note: lesson.setting || lesson.topic,
  }, { transparent: true });

  if (lesson.hook) plan.say(lesson.hook, { note: 'Today' });
  if (lesson.intro) plan.say(lesson.intro, { note: 'How this works' });

  plan.scene('overlay', {}, { transparent: true });
  if (lesson.setting) plan.say(`Here is the situation. ${lesson.setting}`, { note: 'The situation' });

  // Pass 1 — ears only. No text on screen at all: this is the part that
  // actually trains listening, and subtitles would let the viewer skip it.
  plan.say('First, listen without any text. Just listen.', { note: 'Listen — no text', pauseAfterMs: 1100 });
  lesson.dialogue.forEach((turn, i) => {
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      rate: lvl.rate,
      captions: 'none',
      note: 'Listen — no text',
      pauseAfterMs: i === lesson.dialogue.length - 1 ? 1200 : 340,
    });
  });

  // Pass 2 — same conversation, a little slower, with karaoke and Arabic.
  plan.say('Now listen again. This time you can read every word.', { note: 'Listen again — with text', pauseAfterMs: 900 });
  lesson.dialogue.forEach((turn) => {
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      rate: shiftRate(lvl.rate, -10),
      ar: turn.ar,
      speakerName: turn.speaker === 'B' ? 'Speaker B' : 'Speaker A',
      note: 'Listen again — with text',
    });
  });

  if (lesson.key_phrases?.length) {
    plan.say('Let us look at the phrases you will hear again and again.', { note: 'Key phrases' });
    lesson.key_phrases.forEach((p) => {
      plan.say(`${p.phrase}.`, { rate: shiftRate(lvl.rate, -8), note: 'Key phrases', pauseAfterMs: 620 });
      plan.say(p.meaning, { ar: p.meaning_ar, note: 'Key phrases' });
    });
  }

  lesson.questions.forEach((q, i) => {
    const label = `Question ${i + 1} of ${lesson.questions.length}`;
    plan.say(q.q, { ar: q.q_ar, note: label, cue: 'Think — then answer', pauseAfterMs: 3200 });
    plan.say(`${LETTERS[q.answer] || 'A'}. ${q.options[q.answer]}.`, { note: label });
    if (q.explain) plan.say(q.explain, { note: label });
  });

  outro(plan);
  return { mode: 'footage', footageQuery: lesson.footage_query || lesson.topic };
}

/* ── speaking ───────────────────────────────────────────────────────────── */
function buildSpeaking(plan) {
  const { lesson, lvl } = plan;
  const voiceOf = (s) => (s === 'B' ? lvl.speakerB : lvl.speakerA);

  plan.scene('overlay', {
    eyebrow: 'Speaking practice',
    title: lesson.title,
    note: 'Listen, then repeat out loud in the silence.',
  }, { transparent: true });

  if (lesson.hook) plan.say(lesson.hook, { note: 'Today' });
  if (lesson.intro) plan.say(lesson.intro, { note: 'How this works' });

  plan.scene('overlay', {}, { transparent: true });

  lesson.drills.forEach((d, i) => {
    const note = `Phrase ${i + 1} of ${lesson.drills.length}`;
    if (d.when) plan.say(d.when, { note });
    plan.say(`${d.phrase}`, { note, pauseAfterMs: 520 });
    plan.say(`Listen to the sound of it. ${d.focus}.`, { ar: d.focus_ar, note });
    plan.say(`${d.phrase}`, { rate: shiftRate(lvl.rate, -9), ar: d.phrase_ar, note, pauseAfterMs: 420 });
    plan.say('Your turn.', {
      note,
      cue: 'Repeat it out loud',
      // Long enough to actually say the phrase back, scaled to its length.
      pauseAfterMs: Math.min(4200, 1500 + d.phrase.length * 55),
    });
  });

  plan.say('Now put it together. Listen to the whole conversation.', { note: 'Model conversation', pauseAfterMs: 800 });
  lesson.dialogue.forEach((turn) => {
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      ar: turn.ar,
      speakerName: turn.speaker === 'B' ? 'Speaker B' : 'Speaker A',
      note: 'Model conversation',
    });
  });

  if (lesson.shadowing?.length) {
    plan.say('Last part. Shadowing. Speak at the same time as me, do not wait.', { note: 'Shadowing', pauseAfterMs: 900 });
    lesson.shadowing.forEach((s) => {
      plan.say(s, { note: 'Shadowing', cue: 'Speak with me', pauseAfterMs: 1400 });
    });
  }

  outro(plan);
  return { mode: 'footage', footageQuery: lesson.footage_query || lesson.topic };
}

const BUILDERS = {
  vocabulary: buildVocabulary,
  reading: buildReading,
  listening: buildListening,
  speaking: buildSpeaking,
};

export function buildPlan(lesson) {
  const plan = new Plan({ level: lesson.level, skill: lesson.skill, lesson });
  const meta = BUILDERS[lesson.skill](plan);

  const lvl = levelConfig(lesson.level);
  const theme = {
    accent: lvl.accent, accentDark: lvl.accentDark,
    bgA: lvl.bgA, bgB: lvl.bgB, bgC: lvl.bgC,
  };

  const total = plan.scenes.length;
  plan.scenes.forEach((scene, i) => {
    scene.theme = theme;
    scene.brand = channel.channelName;
    scene.levelLabel = lvl.label;
    scene.progress = total > 1 ? Math.round((i / (total - 1)) * 100) : 100;
  });

  return {
    ...meta,
    lesson,
    theme,
    lines: plan.lines,
    scenes: plan.scenes,
    images: plan.images,
    skillLabel: skillConfig(lesson.skill).label,
  };
}

/**
 * After synthesis every line knows where it sits on the timeline, so scene
 * durations and the "your turn" cue windows fall out of the same data.
 */
export function resolveTimings(plan, timeline) {
  const byId = new Map(timeline.map(l => [l.id, l]));

  const scenes = plan.scenes.map(scene => {
    const lines = scene.lineIds.map(id => byId.get(id)).filter(Boolean);
    if (!lines.length) return { ...scene, startMs: 0, durationSec: 0 };
    const startMs = lines[0].startMs;
    const endMs = lines[lines.length - 1].endMs + (lines[lines.length - 1].pauseAfterMs || 0);
    return { ...scene, startMs, durationSec: (endMs - startMs) / 1000 };
  }).filter(s => s.durationSec > 0.05);

  const cues = timeline
    .filter(l => l.cue && (l.pauseAfterMs || 0) > 900)
    .map(l => ({
      startMs: l.endMs + 260,
      endMs: l.endMs + l.pauseAfterMs - 160,
      text: l.cue,
    }));

  return { scenes, cues };
}
