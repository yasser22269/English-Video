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
  plan.say('Subscribe, and I will see you in tomorrow lesson.', { pauseAfterMs: 900 });
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
    plan.say(`${w.word}.`, { rate: shiftRate(lvl.rate, -9), note, pauseAfterMs: 620 });
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
  plan.say('Here they all are again.', { note: 'Quick recap', pauseAfterMs: 320 });

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
  // Taste: the situation and the first exchange, before any branding.
  coldOpen(plan, {
    eyebrow: 'Listening practice',
    chips: [lvl.label, `${lesson.dialogue.length} turns`, lesson.focus],
    taste: () => {
      plan.scene('overlay', {
        eyebrow: 'Listening practice',
        title: lesson.setting || lesson.topic,
        note: 'Can you follow this conversation?',
      }, { transparent: true });
      const opener = lesson.dialogue[0];
      if (opener) {
        plan.say(opener.en, {
          voice: voiceOf(opener.speaker),
          rate: lvl.rate,
          ar: opener.ar,
          speakerName: opener.speaker === 'B' ? 'Speaker B' : 'Speaker A',
          note: lesson.setting || lesson.topic,
          pauseAfterMs: 520,
        });
      }
    },
  });

  plan.scene('overlay', {}, { transparent: true });

  // Pass 1 — ears only. Hiding the words is the whole exercise, but the first
  // build put NOTHING on screen for 88.5 seconds (measured: 0:27.5 to 1:56.0)
  // over a dimmed 21-second stock loop, and the average view died 19 seconds
  // into it. The words stay hidden; everything else that can move, moves —
  // who is speaking, how far through we are, and how many turns are left.
  const turns = lesson.dialogue.length;
  plan.say('Listen once with no text. Just follow the sound.', {
    note: 'Listen — no text', cue: 'Ears only', pauseAfterMs: 800,
  });
  lesson.dialogue.forEach((turn, i) => {
    const who = turn.speaker === 'B' ? 'Speaker B' : 'Speaker A';
    plan.say(turn.en, {
      voice: voiceOf(turn.speaker),
      rate: lvl.rate,
      captions: 'none',
      // The big centred cue carries the speaker, so the small corner label
      // would just print the same words twice. Tracking who is talking is
      // itself a listening skill, so this is information, not filler.
      note: `Listen — no text · ${i + 1} of ${turns}`,
      cue: who,
      pauseAfterMs: i === turns - 1 ? 1200 : 340,
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
    // Footage lessons have no option card to render, so the choices go into the
    // caption track during the thinking pause. Without this the narrator asked
    // the viewer to choose between options that were never on screen.
    plan.say(q.q, { ar: q.q_ar, note: label, pauseAfterMs: 420 });
    plan.say(readOptions(q), { note: label, cue: optionsBlock(q), pauseAfterMs: 4200 });
    plan.say(`The answer is ${LETTERS[q.answer] || 'A'}. ${q.options[q.answer]}.`, { note: label });
    if (q.explain) plan.say(q.explain, { note: label });
  });

  outro(plan);
  return { mode: 'footage', footageQuery: lesson.footage_query || lesson.topic };
}

/* ── speaking ───────────────────────────────────────────────────────────── */
function buildSpeaking(plan) {
  const { lesson, lvl } = plan;
  const voiceOf = (s) => (s === 'B' ? lvl.speakerB : lvl.speakerA);

  // Taste: the first phrase, spoken and repeated, before any branding.
  coldOpen(plan, {
    eyebrow: 'Speaking practice',
    chips: [lvl.label, `${lesson.drills.length} phrases`, lesson.focus],
    taste: () => {
      plan.scene('overlay', {
        eyebrow: 'Say it like a native',
        title: lesson.drills[0]?.phrase || lesson.title,
        note: 'Listen, then say it out loud.',
      }, { transparent: true });
      const first = lesson.drills[0];
      if (first) {
        plan.say(first.phrase, { ar: first.phrase_ar, note: 'Phrase 1', pauseAfterMs: 420 });
        plan.say(first.phrase, {
          rate: shiftRate(lvl.rate, -9),
          ar: first.phrase_ar,
          note: 'Phrase 1',
          cue: 'Repeat it out loud',
          pauseAfterMs: 2100,
        });
      }
    },
  });

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
