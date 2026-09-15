import { levelConfig, skillConfig, channel } from './config.js';

/** Shift a rate string like "-6%" by a number of percentage points, clamped. */
function shiftRate(rate, by) {
  const base = parseInt(String(rate).replace('%', ''), 10) || 0;
  const next = Math.max(-28, Math.min(15, base + by));
  return `${next >= 0 ? '+' : ''}${next}%`;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** The choices, one per line, for the caption band during the thinking pause. */
function optionsBlock(q) {
  return (q.options || []).map((opt, i) => `${LETTERS[i]}. ${opt}`).join('\n');
}

/** The same choices as one spoken sentence — a listening lesson must not force reading. */
function readOptions(q) {
  return (q.options || []).map((opt, i) => `${LETTERS[i]}. ${opt}.`).join(' ');
}

/** Text destined for the voice, not the screen: gaps and symbols read badly. */
/** Half of a surrogate pair, left behind when a model mangles an emoji. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function speakable(text) {
  return String(text)
    // A lone surrogate cannot be UTF-8 encoded. One reaching the Python TTS
    // worker raised UnicodeEncodeError and failed a whole lesson, so it is
    // dropped here as well as there.
    .replace(LONE_SURROGATE, '')
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
      chapter: opts.chapter || null,
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

/**
 * The opening is the only part of the lesson most people watch.
 *
 * Measured on the first 34 published videos: average view duration 46 seconds,
 * average view percentage 20.9%. The old opening spent 13-27 of those seconds
 * on a title card, a hook and a two-sentence procedural explanation before the
 * first English word arrived — and in the reading format the passage did not
 * start until 52.7s, six seconds after the average viewer had already left.
 *
 * So the order is inverted: teach first, brand second. `taste` emits a real
 * teaching beat before anything else, and the title becomes a bumper measured
 * in seconds rather than a card the viewer stares at for seventeen. The
 * procedural "here is how this lesson works" narration is gone entirely — the
 * on-screen section note says the same thing without spending airtime.
 */
function coldOpen(plan, { eyebrow, chips, taste }) {
  const { lesson, lvl } = plan;

  if (taste) taste();

  plan.scene('title', {
    eyebrow,
    title: lesson.title,
    subtitle: lesson.topic,
    chips: chips || [lvl.label, plan.lesson.skillLabel],
  });
  // One sentence only. `lesson.intro` is deliberately never spoken.
  plan.say(lesson.hook || `${lesson.title}. Let us begin.`, { note: eyebrow, pauseAfterMs: 260 });
}

function outro(plan) {
  const { lesson } = plan;
  plan.scene('outro', {
    eyebrow: 'Same time tomorrow',
    title: 'One lesson. Every day. Every level.',
    cards: ['A1 · A2 · B1 · B2 · C1', 'Speaking · Vocabulary · Reading · Listening', 'Subscribe to keep the streak'],
  });
  if (lesson.outro) plan.say(lesson.outro);
  // 0 comments across the first 108 videos. Asking for one concrete, useful
  // thing — a sentence with today's language — is practice for the learner and
  // the only engagement signal the channel is not currently sending at all.
  plan.say('Practise right now. Write one sentence in the comments using something from today.', {
    cue: 'Write your sentence in the comments', pauseAfterMs: 1600,
  });
  // Was "see you in tomorrow lesson" — a grammar mistake in the closing line of
  // an English lesson.
  plan.say("Subscribe, and I will see you in tomorrow's lesson.", { pauseAfterMs: 900 });
}

/* ── vocabulary ─────────────────────────────────────────────────────────── */
function buildVocabulary(plan) {
  const { lesson, lvl } = plan;
  const words = lesson.words;

  // Taste first: the whole word list on screen while the voice fires the first
  // three. The viewer knows inside eight seconds exactly what they are getting.
  coldOpen(plan, {
    eyebrow: `${words.length} new words`,
    chips: [lvl.label, `${words.length} words`, lesson.focus],
    taste: () => {
      plan.scene('title', {
        eyebrow: `${words.length} words for ${lesson.topic}`,
        title: words.slice(0, 3).map(w => w.word).join(' · '),
        subtitle: 'and seven more, with meanings and examples',
        chips: words.map(w => w.word),
      });
      words.slice(0, 3).forEach(w => {
        plan.say(`${w.word}.`, { rate: shiftRate(lvl.rate, -6), pauseAfterMs: 300, note: 'Today' });
      });
    },
  });

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
    plan.say(`${w.word}.`, { rate: shiftRate(lvl.rate, -9), note, chapter: w.word, pauseAfterMs: 620 });
    plan.say(w.meaning, { ar: w.meaning_ar, note });

    // Each example gets its own frame. One 'word' card held for the whole 26
    // seconds meant the picture changed twice in the first 46 seconds of the
    // video; the sentence on screen is also worth more to a reader than the
    // same card again.
    (w.examples || []).slice(0, 2).forEach((ex, k) => {
      plan.scene('drill', {
        counter,
        eyebrow: `${w.word} — in a sentence`,
        phrase: ex,
        imageId: imgId,
      });
      plan.say(ex, { ar: w.examples_ar?.[k] || null, note });
    });

    if (w.collocation) {
      plan.scene('drill', {
        counter,
        eyebrow: 'You will often hear',
        phrase: w.collocation,
        imageId: imgId,
      });
      plan.say(`You will often hear it like this. ${w.collocation}.`, { note });
    }

    plan.scene('drill', {
      counter,
      eyebrow: 'Your turn',
      phrase: w.word,
      imageId: imgId,
      cue: 'Say it out loud',
    });
    plan.say(`Now you. ${w.word}.`, {
      rate: shiftRate(lvl.rate, -9),
      note,
      cue: 'Your turn — say it out loud',
      pauseAfterMs: 1900,
    });
  });

  // The recap used to be one card held for the whole run of ten lines. Giving
  // each word its own frame turns a 26-second freeze into a rhythm, and puts
  // the word being recapped on screen where the viewer can actually check it.
  plan.scene('title', {
    eyebrow: 'Quick recap',
    title: 'All ten, one more time',
    subtitle: lesson.topic,
    chips: words.map(w => w.word),
  });
  plan.say('Here they all are again.', { note: 'Quick recap', chapter: 'Recap — all ten words', pauseAfterMs: 320 });

  (lesson.recap || []).forEach((line, i) => {
    const w = words[i];
    plan.scene('drill', {
      counter: `${i + 1} / ${words.length}`,
      eyebrow: 'Quick recap',
      phrase: w ? w.word : '',
      focus: w ? w.word : '',
    });
    plan.say(line, { ar: w?.meaning_ar || null, note: 'Quick recap' });
  });

  (lesson.quiz || []).forEach((q, i) => {
    const shown = q.prompt;
    plan.scene('drill', {
      counter: `Quiz ${i + 1} / ${lesson.quiz.length}`,
      eyebrow: 'Fill the gap',
      phrase: shown,
      cue: 'Say the missing word',
    });
    plan.say(shown, { caption: shown, ar: q.prompt_ar, note: 'Fill the gap', chapter: i === 0 ? 'Quiz — fill the gap' : null, cue: 'Which word fits?', pauseAfterMs: 2400 });

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

  // Taste: the opening lines of the actual text. The old order put the passage
  // 52.7 seconds in — six seconds past the average view duration, so most
  // viewers never reached the thing the title promised.
  coldOpen(plan, {
    eyebrow: 'Reading practice',
    chips: [lvl.label, `${lesson.passage.length} sentences`, lesson.focus],
    taste: () => {
      plan.scene('passage', {
        eyebrow: lesson.passage_title || lesson.topic,
        title: lesson.passage_title || lesson.topic,
        note: 'Read along with me.',
        imageId: heroId,
      });
      lesson.passage.slice(0, 2).forEach((sentence, i) => {
        plan.say(sentence.en, { ar: sentence.ar, note: `Read along · ${i + 1} of ${lesson.passage.length}`, pauseAfterMs: 300 });
      });
    },
  });

  // 1 ─ keep reading, with the translation. The viewer is already inside the
  // text from the cold open. The old order stopped there for ~45 seconds of
  // pre-taught glossary before the passage resumed, and the September reading
  // cohort averaged 33 seconds watched — the same comprehensible-first order
  // that the listening retention curves argued for.
  const sentences = lesson.passage.map(s => s.en);

  plan.say('Let us read the whole text, one sentence at a time.', { note: 'Line by line', chapter: 'Read it line by line, with translation', pauseAfterMs: 300 });
  lesson.passage.forEach((sentence, i) => {
    plan.scene('reading', { eyebrow: `Line by line · ${i + 1} of ${sentences.length}`, sentences, active: i });
    plan.say(sentence.en, {
      rate: shiftRate(lvl.rate, -6),
      ar: sentence.ar,
      note: `Line by line · ${i + 1} of ${sentences.length}`,
      pauseAfterMs: 560,
    });
  });

  // 2 ─ the words worth keeping, now that the viewer has met them in context
  if (lesson.glossary?.length) {
    plan.scene('title', {
      eyebrow: 'Words from the text',
      title: 'The words worth keeping',
      subtitle: lesson.passage_title || lesson.topic,
      chips: lesson.glossary.map(g => g.word),
    });
    plan.say('Here are the words from the text worth keeping.', { chapter: 'Key words from the text' });

    lesson.glossary.forEach((g, i) => {
      plan.scene('word', {
        counter: `${i + 1} / ${lesson.glossary.length}`,
        word: g.word,
        meaning_ar: g.meaning_ar,
      });
      plan.say(`${g.word}.`, { rate: shiftRate(lvl.rate, -8), pauseAfterMs: 560, note: 'Key words' });
      plan.say(g.meaning, { ar: g.meaning_ar, note: 'Key words' });
    });
  }

  // 3 ─ the whole text at natural speed with no translation: the fluency test
  plan.scene('passage', {
    eyebrow: 'Now read it fluently',
    title: lesson.passage_title || lesson.topic,
    note: 'Natural speed, no translation. Follow the highlighted sentence.',
    imageId: heroId,
  });
  plan.say('Now read it again at natural speed, with no translation.', { note: 'Read along', chapter: 'Read it at natural speed' });

  lesson.passage.forEach((sentence, i) => {
    plan.scene('reading', { eyebrow: `Read along · ${i + 1} of ${sentences.length}`, sentences, active: i });
    plan.say(sentence.en, { note: `Read along · ${i + 1} of ${sentences.length}`, pauseAfterMs: 260 });
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

  // Taste: the line of the conversation that is most about the topic — not
  // simply dialogue[0], which is nearly always a greeting ("Hi, I am Sam") and
  // off-promise for a lesson titled, say, "Saying Goodbye Politely".
  const taste = pickTasteTurn(lesson);
  coldOpen(plan, {
    eyebrow: 'Listening practice',
    chips: [lvl.label, `${lesson.dialogue.length} turns`, lesson.focus],
    taste: () => {
      plan.scene('overlay', {
        eyebrow: 'Listening practice',
        title: lesson.setting || lesson.topic,
        note: 'Can you follow this conversation?',
      }, { transparent: true });
      if (taste) {
        plan.say(taste.en, {
          voice: voiceOf(taste.speaker),
          rate: lvl.rate,
          ar: taste.ar,
          speakerName: taste.speaker === 'B' ? 'Speaker B' : 'Speaker A',
          note: lesson.setting || lesson.topic,
          pauseAfterMs: 520,
        });
      }
    },
  });

  plan.scene('overlay', {}, { transparent: true });

  // Pass 1 — WITH the words. Measured on the September cohort: the ears-only
  // pass began 13.8s in (7% of the video), and the retention curves fell from
  // 54% to 15% and from 92% to 42% in exactly that window. A beginner who came
  // for a lesson does not stay through a conversation they cannot follow yet.
  // So the order is comprehensible input first, challenge last.
  const turns = lesson.dialogue.length;
  plan.say('Here is the conversation. Read along as you listen.', {
    note: 'The conversation', chapter: 'The conversation — with the words', pauseAfterMs: 500,
  });
  lesson.dialogue.forEach((turn, i) => {
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      rate: shiftRate(lvl.rate, -6),
      ar: turn.ar,
      speakerName: turn.speaker === 'B' ? 'Speaker B' : 'Speaker A',
      note: `The conversation · ${i + 1} of ${turns}`,
    });
  });

  if (lesson.key_phrases?.length) {
    plan.say('Let us look at the phrases you will hear again and again.', { note: 'Key phrases', chapter: 'The phrases worth stealing' });
    lesson.key_phrases.forEach((p) => {
      plan.say(`${p.phrase}.`, { rate: shiftRate(lvl.rate, -8), note: 'Key phrases', chapter: p.phrase, pauseAfterMs: 620 });
      plan.say(p.meaning, { ar: p.meaning_ar, note: 'Key phrases' });
    });
  }

  lesson.questions.forEach((q, i) => {
    const label = `Question ${i + 1} of ${lesson.questions.length}`;
    if (i === 0) plan.say('Now check what you understood.', { note: label, chapter: 'Did you understand?', pauseAfterMs: 300 });
    // Footage lessons have no option card to render, so the choices go into the
    // caption track during the thinking pause. Without this the narrator asked
    // the viewer to choose between options that were never on screen.
    plan.say(q.q, { ar: q.q_ar, note: label, pauseAfterMs: 420 });
    plan.say(readOptions(q), { note: label, cue: optionsBlock(q), pauseAfterMs: 4200 });
    plan.say(`The answer is ${LETTERS[q.answer] || 'A'}. ${q.options[q.answer]}.`, { note: label });
    if (q.explain) plan.say(q.explain, { note: label });
  });

  // The ears-only pass is still the part that actually trains listening — it
  // just belongs at the end, as a test for the viewers who stayed, instead of
  // at second fourteen, where it was losing the ones who had not decided yet.
  plan.say('Last challenge. Listen one more time, with no text at all. How much do you understand now?', {
    note: 'Challenge — no text', chapter: 'Challenge — listen with no text', cue: 'Ears only', pauseAfterMs: 900,
  });
  lesson.dialogue.forEach((turn, i) => {
    const who = turn.speaker === 'B' ? 'Speaker B' : 'Speaker A';
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      rate: lvl.rate,
      captions: 'none',
      // Words stay hidden; the speaker and the turn counter keep the frame alive
      // without giving any of them away.
      note: `Challenge — no text · ${i + 1} of ${turns}`,
      cue: who,
      pauseAfterMs: i === turns - 1 ? 1200 : 340,
    });
  });

  outro(plan);
  return { mode: 'footage', footageQuery: lesson.footage_query || lesson.footage || lesson.topic };
}

/**
 * The dialogue turn that best represents the lesson's topic, for the cold open.
 * Prefers a turn containing a key phrase, then the turn sharing the most words
 * with the topic, and never a bare greeting.
 */
function pickTasteTurn(lesson) {
  const turns = lesson.dialogue || [];
  if (!turns.length) return null;

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z\s']/g, ' ');
  const greeting = /^(hi|hello|hey|good (morning|afternoon|evening))\b/;

  for (const p of lesson.key_phrases || []) {
    const hit = turns.find(t => norm(t.en).includes(norm(p.phrase).trim()));
    if (hit) return hit;
  }

  const topicWords = new Set(norm(lesson.topic).split(/\s+/).filter(w => w.length > 3));
  let best = null;
  let bestScore = -1;
  for (const t of turns) {
    if (greeting.test(norm(t.en).trim())) continue;
    const score = norm(t.en).split(/\s+/).filter(w => topicWords.has(w)).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best || turns[Math.min(1, turns.length - 1)];
}

/* ── speaking ───────────────────────────────────────────────────────────── */
function buildSpeaking(plan) {
  const { lesson, lvl } = plan;
  const voiceOf = (s) => (s === 'B' ? lvl.speakerB : lvl.speakerA);

  // Taste: three of the phrases, back to back, with their meaning — the whole
  // value of the lesson in the first ten seconds. The old taste asked the viewer
  // to repeat a phrase aloud and then held 2.1 seconds of silence before the
  // title had even appeared; the C1 speaking lesson that search delivered 14
  // viewers to kept them for an average of 17 seconds.
  coldOpen(plan, {
    eyebrow: 'Speaking practice',
    chips: [lvl.label, `${lesson.drills.length} phrases`, lesson.focus],
    taste: () => {
      const preview = lesson.drills.slice(0, 3);
      plan.scene('overlay', {
        eyebrow: `${lesson.drills.length} phrases for ${lesson.topic}`,
        title: preview[0]?.phrase || lesson.title,
        note: 'Say them like a native speaker.',
      }, { transparent: true });
      preview.forEach((d, i) => {
        plan.say(d.phrase, { ar: d.phrase_ar, note: `Today · ${i + 1} of ${lesson.drills.length}`, pauseAfterMs: 360 });
      });
    },
  });

  plan.scene('overlay', {}, { transparent: true });

  lesson.drills.forEach((d, i) => {
    const note = `Phrase ${i + 1} of ${lesson.drills.length}`;
    // The phrase itself is the chapter label: someone scanning the scrubber is
    // looking for a phrase, not for "Phrase 4 of 10".
    if (d.when) plan.say(d.when, { note, chapter: d.phrase });
    plan.say(`${d.phrase}`, { note, chapter: d.when ? null : d.phrase, pauseAfterMs: 520 });
    plan.say(`Listen to the sound of it. ${d.focus}.`, { ar: d.focus_ar, note });
    plan.say(`${d.phrase}`, { rate: shiftRate(lvl.rate, -9), ar: d.phrase_ar, note, pauseAfterMs: 420 });
    plan.say('Your turn.', {
      note,
      cue: 'Repeat it out loud',
      // Long enough to actually say the phrase back, scaled to its length.
      pauseAfterMs: Math.min(4200, 1500 + d.phrase.length * 55),
    });
  });

  plan.say('Now put it together. Listen to the whole conversation.', { note: 'Model conversation', chapter: 'The whole conversation', pauseAfterMs: 800 });
  lesson.dialogue.forEach((turn) => {
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      ar: turn.ar,
      speakerName: turn.speaker === 'B' ? 'Speaker B' : 'Speaker A',
      note: 'Model conversation',
    });
  });

  if (lesson.shadowing?.length) {
    plan.say('Last part. Shadowing. Speak at the same time as me, do not wait.', { note: 'Shadowing', chapter: 'Shadowing — speak with me', pauseAfterMs: 900 });
    lesson.shadowing.forEach((s) => {
      plan.say(s, { note: 'Shadowing', cue: 'Speak with me', pauseAfterMs: 1400 });
    });
  }

  outro(plan);
  return { mode: 'footage', footageQuery: lesson.footage_query || lesson.footage || lesson.topic };
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

  // Two kinds of cue. On a normal line the cue belongs in the silence that
  // follows it ("Repeat it out loud"), so it needs a pause long enough to read
  // in. On an ears-only line there IS no caption to share the frame with, so
  // the cue runs for the whole line — that is what keeps the listening pass
  // from being a blank screen.
  const cues = timeline
    .map((l) => {
      if (!l.cue) return null;
      if (l.captions === 'none') {
        return { startMs: l.startMs, endMs: l.endMs + Math.min(l.pauseAfterMs || 0, 300), text: l.cue };
      }
      if ((l.pauseAfterMs || 0) > 900) {
        return { startMs: l.endMs + 260, endMs: l.endMs + l.pauseAfterMs - 160, text: l.cue };
      }
      return null;
    })
    .filter(Boolean);

  return { scenes, cues };
}

/**
 * YouTube chapters.
 *
 * Labels are declared by the builders, not derived from the section note: a
 * chapter reading "Word 2 of 10" is worthless, while one reading "reservation"
 * is the reason chapters exist — a learner scanning for the word they want.
 *
 * YouTube ignores the whole list unless it starts at 00:00, has at least three
 * entries, and each is at least ten seconds long, so a list that cannot meet
 * that is dropped rather than shipped broken.
 */
export function buildChapters(timeline) {
  const stamp = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const marks = [];
  for (const line of timeline) {
    if (!line.chapter) continue;
    const prev = marks[marks.length - 1];
    if (prev && prev.label === line.chapter) continue;
    if (prev && line.startMs - prev.startMs < 10_000) continue;
    marks.push({ startMs: line.startMs, label: line.chapter });
  }

  if (marks.length < 3) return [];
  marks[0] = { ...marks[0], startMs: 0 };
  return marks.map(c => ({ stamp: stamp(c.startMs), label: c.label }));
}
