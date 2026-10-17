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

/**
 * Whole UTC days since 1970-01-01 for a Date or a 'YYYY-MM-DD' string. The
 * same arithmetic as schedule.js dayIndex(), duplicated so this module keeps
 * depending on config.js only. Anything unparseable counts as today.
 */
export function dayNumber(date) {
  let d = date;
  if (typeof d === 'string' || typeof d === 'number') {
    d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? `${d}T12:00:00Z` : d);
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

/**
 * Experiment E4 (growth plan C7): which opening a long lesson gets.
 * channel.experiments.newOpening: "on" → 'new', "alternate" → 'new' on even
 * day numbers and 'old' on odd ones, anything else (or missing) → 'old'.
 */
export function openingVariant(date, ch = channel) {
  const mode = String(ch?.experiments?.newOpening ?? 'off').trim().toLowerCase();
  if (mode === 'on' || mode === 'true' || mode === 'new') return 'new';
  if (mode === 'alternate') return dayNumber(date) % 2 === 0 ? 'new' : 'old';
  return 'old';
}

/** Experiment E5 (growth plan C8): the mid-lesson comment ask. Off unless set. */
export function midAskEnabled(ch = channel) {
  const v = ch?.experiments?.midAsk;
  return v === true || v === 'on' || v === 'true';
}

/** Emoji and pictographs: fine in a description, wrong for the TTS voice and libass. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu;

function nameOptions(noun, items) {
  const opts = items.map(s => String(s || '').trim()).filter(Boolean).slice(0, 3);
  if (opts.length === 3) {
    const named = `Which ${noun} will you use first: 1 "${opts[0]}", 2 "${opts[1]}" or 3 "${opts[2]}"? 👇`;
    if (named.length <= 110) return named;
  }
  return `Which ${noun} will you use first? Comment 1, 2 or 3 👇`;
}

/**
 * The one-tap comment question (growth plan C8), used when the model did not
 * return a usable `commentQuestion`. Deterministic, so a re-run matches.
 */
export function defaultCommentQuestion(lesson = {}) {
  switch (lesson.skill) {
    case 'short': return 'Which word was new for you — 1, 2 or 3? 👇';
    case 'vocabulary': return nameOptions('word', (lesson.words || []).map(w => w.word));
    case 'reading': return nameOptions('word', (lesson.glossary || []).map(g => g.word));
    case 'listening': return nameOptions('phrase', (lesson.key_phrases || []).map(p => p.phrase));
    case 'speaking': return nameOptions('phrase', (lesson.drills || []).map(d => d.phrase));
    default: return 'Which part was new for you? Comment 1, 2 or 3 👇';
  }
}

/** The model's question if it is one line, question-shaped and short; otherwise the fallback. */
export function normalizeCommentQuestion(question, lesson = {}) {
  const q = typeof question === 'string' ? question.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim() : '';
  if (q.length >= 12 && q.length <= 140 && q.includes('?') && !/[<>{}#]/.test(q)) return q;
  return defaultCommentQuestion(lesson);
}

/** The question as the voice should say it. */
function spokenQuestion(q) {
  return String(q).replace(EMOJI, ' ').replace(/[—–]/g, ',').replace(/["“”]/g, '').replace(/\s+([,?.!])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** The question as the frame should show it (no emoji: the fonts may not have them). */
function screenQuestion(q) {
  return String(q).replace(EMOJI, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The label of the 00:00 chapter. Google key moments and the YouTube scrubber
 * show it, so it names the topic a searcher typed — never a drill sentence.
 */
export function openingChapterLabel(lesson = {}) {
  const raw = String(lesson.searchTopic || lesson.topic || '').trim() || 'Today';
  // It begins the label, so it begins with a capital ("at the Restaurant" → "At the Restaurant").
  const t = raw.charAt(0).toUpperCase() + raw.slice(1);
  switch (lesson.skill) {
    case 'vocabulary': return `${t}: the first 3 words`;
    case 'reading': return `${t}: the story begins`;
    case 'listening': return `${t} — the conversation`;
    case 'speaking': return `${t}: the first 3 phrases`;
    default: return t;
  }
}

class Plan {
  constructor({ level, skill, lesson }) {
    this.level = level;
    this.skill = skill;
    this.lesson = lesson;
    this.lvl = levelConfig(level);
    // The opening the hook was written for travels with the lesson; a cached
    // lesson from before the experiment falls back to today's flag.
    this.opening = lesson.opening === 'new' || lesson.opening === 'old'
      ? lesson.opening
      : openingVariant(lesson.date || new Date(), channel);
    this.midAsk = skill !== 'short' && midAskEnabled(channel);
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

  const firstLine = plan.lines.length;
  if (taste) taste();

  // Experiment E4 (C7), 'new': no full-screen title card at all — the hook (a
  // one-line challenge) is spoken over the taste frame, so the first ten
  // seconds are all lesson. 'old' keeps the title bumper exactly as it was.
  if (plan.opening !== 'new' || !taste || plan.lines.length === firstLine) {
    plan.scene('title', {
      eyebrow,
      title: lesson.title,
      subtitle: lesson.topic,
      chips: chips || [lvl.label, plan.lesson.skillLabel],
    });
  }
  // One sentence only. `lesson.intro` is deliberately never spoken.
  plan.say(lesson.hook || `${lesson.title}. Let us begin.`, { note: eyebrow, pauseAfterMs: 260 });

  // The 00:00 chapter is a topic label rather than whatever the first drill
  // happened to say (growth plan §4.2).
  const opener = plan.lines[firstLine];
  if (opener && !opener.chapter) opener.chapter = openingChapterLabel(lesson);
}

/**
 * Experiment E5 (C8): one one-tap question, spoken and on screen, placed by
 * each builder right after its first check block near the middle of the
 * lesson. Measured: 0 comments on ~4,000 views when the only ask sat in the
 * outro, which most viewers never reach.
 */
function midAsk(plan, { stills, choices = [] } = {}) {
  if (!plan.midAsk) return;
  const q = normalizeCommentQuestion(plan.lesson.commentQuestion, plan.lesson);
  const shown = screenQuestion(q);
  if (stills) {
    plan.scene('drill', { eyebrow: 'Quick question — comment below', phrase: shown, cue: 'One tap: comment your answer' });
  } else {
    plan.scene('overlay', { eyebrow: 'Quick question', title: shown, note: 'One tap: comment your answer' }, { transparent: true });
  }
  plan.say(`Quick question for you. ${spokenQuestion(q)}`, {
    note: 'Quick question', cue: 'Answer in the comments', pauseAfterMs: 1800,
  });
  // Footage lessons go back to a clear frame for whatever comes next.
  if (!stills) plan.scene('overlay', {}, { transparent: true });
  void choices;
}

function outro(plan) {
  const { lesson } = plan;
  plan.scene('outro', {
    eyebrow: 'Same time tomorrow',
    title: 'One lesson. Every day. Every level.',
    cards: ['A1 · A2 · B1 · B2 · C1', 'Speaking · Vocabulary · Reading · Listening', 'Subscribe to keep the streak'],
  });
  if (lesson.outro) plan.say(lesson.outro);
  if (plan.midAsk) {
    // The real ask already happened mid-lesson; this is only the reminder.
    plan.say("Don't forget today's question. Answer it in the comments.", {
      cue: screenQuestion(normalizeCommentQuestion(lesson.commentQuestion, lesson)), pauseAfterMs: 1600,
    });
  } else {
    // 0 comments across the first 108 videos. Asking for one concrete, useful
    // thing — a sentence with today's language — is practice for the learner and
    // the only engagement signal the channel is not currently sending at all.
    plan.say('Practise right now. Write one sentence in the comments using something from today.', {
      cue: 'Write your sentence in the comments', pauseAfterMs: 1600,
    });
  }
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
    // E5: the say-it-back check at the halfway word is the mid-lesson ask point.
    if (i === Math.ceil(words.length / 2) - 1) midAsk(plan, { stills: true });
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

  // E5: after the key-word check, before the fluent read — about halfway.
  midAsk(plan, { stills: true });

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
    // E5: right after the first comprehension check.
    if (i === 0) midAsk(plan, { stills: false });
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
    // E5: after the halfway repeat-check.
    if (i === Math.ceil(lesson.drills.length / 2) - 1) midAsk(plan, { stills: false });
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

/* ── short ──────────────────────────────────────────────────────────────── */
/**
 * A vertical micro-lesson: three words in under a minute.
 *
 * The channel published 108 long videos in its first month and no Shorts, and
 * Shorts are where a channel with nine subscribers gets shown to strangers. The
 * shape follows the one thing month one proved about attention: value from the
 * first second. The hook names the three words' payoff, every word arrives on
 * its own frame with its picture, and nothing asks the viewer to wait.
 */
function buildShort(plan) {
  const { lesson, lvl } = plan;
  const words = lesson.words;

  plan.scene('short-hook', { hook: lesson.hook, chips: words.map(w => w.word) });
  plan.say(lesson.hook, { pauseAfterMs: 260 });

  words.forEach((w, i) => {
    const imgId = plan.image(`short-${i + 1}`, w.image_prompt || `${w.word}, ${lesson.topic}`, `${w.word} ${lesson.topic}`);
    plan.scene('short-word', {
      counter: `${i + 1}/${words.length}`,
      word: w.word, ipa: w.ipa, meaning_ar: w.meaning_ar, imageId: imgId,
    });
    plan.say(`${w.word}.`, { rate: shiftRate(lvl.rate, -6), pauseAfterMs: 380 });
    plan.say(w.meaning, { ar: w.meaning_ar, pauseAfterMs: 240 });

    plan.scene('short-example', { counter: `${i + 1}/${words.length}`, word: w.word, example: w.example, imageId: imgId });
    // C8: after the last word, a 1.5 s on-screen-only question in the silence
    // (the cue runs from end+260 ms to end+pause-160 ms), right before the end frame.
    const last = i === words.length - 1;
    plan.say(w.example, {
      ar: w.example_ar || null,
      pauseAfterMs: last ? 1920 : 320,
      ...(last ? { cue: 'Which one was new? 1, 2 or 3' } : {}),
    });
  });

  // C2: the end frame names the paired long lesson and points at the
  // related-video pill. Kept under ~3 s so the loop survives: the spoken line
  // is capped at 9 words and spoken a little faster than the teaching lines.
  const paired = lesson.pairedVideo?.topic ? lesson.pairedVideo : null;
  const pairedLevel = String(paired?.level || lesson.level).toUpperCase();
  plan.scene('short-end', {
    level: lvl.label,
    chips: words.map(w => w.word),
    pairedTopic: paired ? paired.topic : null,
    pairedLevel,
  });
  if (paired) {
    plan.say(shortCta(lesson.cta, paired.topic), { rate: shiftRate(lvl.rate, 8), pauseAfterMs: 300 });
  } else {
    plan.say(lesson.cta || 'The full lesson is on the channel.', { pauseAfterMs: 500 });
  }

  return { mode: 'stills', format: 'vertical' };
}

/** The spoken Short CTA that names the paired lesson, at most 9 words. */
function shortCta(cta, topic) {
  const words = (s) => String(s).trim().split(/\s+/).length;
  const c = String(cta || '').trim();
  if (c && /above my name/i.test(c) && c.toLowerCase().includes(String(topic).toLowerCase()) && words(c) <= 11) return c;
  for (const s of [
    `The full ${topic} lesson is linked above my name.`,
    `Full ${topic} lesson: linked above my name.`,
  ]) if (words(s) <= 9) return s;
  return 'The full lesson is linked above my name.';
}

const BUILDERS = {
  vocabulary: buildVocabulary,
  reading: buildReading,
  listening: buildListening,
  speaking: buildSpeaking,
  short: buildShort,
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

  // The last chapter must also run for at least ten seconds.
  const last = timeline[timeline.length - 1];
  const endMs = last ? (last.endMs ?? last.startMs) + (last.pauseAfterMs || 0) : 0;
  while (marks.length && endMs && endMs - marks[marks.length - 1].startMs < 10_000) marks.pop();

  if (marks.length < 3) return [];
  marks[0] = { ...marks[0], startMs: 0 };
  return marks.map(c => ({ stamp: stamp(c.startMs), label: c.label }));
}
