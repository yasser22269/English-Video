import { generateJson } from './llm.js';
import { levelConfig, skillConfig } from './config.js';

const COMMON_RULES = `
GLOBAL RULES
- The learner's first language is Arabic. Every "..._ar" field is a natural Modern Standard Arabic rendering — meaning-for-meaning, never word-for-word, and never a transliteration.
- All English must sit strictly inside the CEFR level described. Do not show off vocabulary above the level.
- The lesson opens on teaching, not on throat-clearing. Never write "in this video", "today we will learn", "let's get started", "by the end of this lesson", or any sentence whose only job is to announce a later sentence. Measured: viewers leave after 46 seconds, so every second of preamble is a second of the lesson nobody sees.
- Narration is spoken aloud by a text-to-speech voice. Write for the ear: no bullet symbols, no markdown, no emoji, no parentheses, no "e.g.", no abbreviations. Spell out anything that must be pronounced.
- Never use stage directions, speaker labels inside the text, or phrases like "in this video".
- Vary sentence length. A teacher who speaks in identical-length sentences sounds like a machine.
- Return ONE JSON object. No prose before or after it.
`;

function head(level, topic, focus) {
  const lvl = levelConfig(level);
  return `You are writing one lesson for an English-teaching YouTube channel.

LEVEL: ${lvl.label} (CEFR ${level.toUpperCase()})
LEVEL CONSTRAINTS: ${lvl.cefrGuide}
TOPIC: ${topic}
LANGUAGE FOCUS: ${focus}
${COMMON_RULES}`;
}

const PROMPTS = {
  vocabulary(level, topic, focus) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a "${lvl.wordCount} new words" lesson about ${topic}.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters, no level name",
  "hook": "ONE spoken sentence, 10-16 words, that states the concrete benefit — never a tease, never a question, never 'in this video'",
  "intro": "unused, return an empty string",
  "words": [
    {
      "word": "the target word or short phrase",
      "ipa": "IPA transcription between slashes",
      "pos": "noun | verb | adjective | adverb | phrase",
      "meaning": "definition in English SIMPLER than the word itself, one sentence",
      "meaning_ar": "the Arabic meaning",
      "examples": ["natural example sentence", "a second example in a different situation"],
      "examples_ar": ["Arabic of example 1", "Arabic of example 2"],
      "collocation": "one very common collocation or chunk using this word",
      "image_prompt": "a concrete, literal photo description that illustrates the word, 10-18 words, no text in image, no people's faces close up"
    }
  ],
  "recap": ["one short spoken line per word, in the same order, reminding the meaning"],
  "quiz": [
    { "prompt": "a gap-fill sentence using ___ for the missing word", "answer": "the word", "prompt_ar": "Arabic of the sentence" }
  ],
  "outro": "two spoken sentences: tell them to say the words out loud, and to subscribe for a lesson every day"
}

Exactly ${lvl.wordCount} items in "words", ${lvl.wordCount} lines in "recap", and 4 items in "quiz".
Choose genuinely useful, high-frequency words a learner at this level does not know yet. No proper nouns.`;
  },

  reading(level, topic, focus) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a guided reading lesson about ${topic}.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "ONE spoken sentence, 10-16 words, that states the concrete benefit — never a tease, never a question, never 'in this video'",
  "intro": "unused, return an empty string",
  "passage_title": "a title for the text itself",
  "passage": [
    { "en": "one sentence of the passage", "ar": "its Arabic translation" }
  ],
  "glossary": [
    { "word": "a word from the passage worth teaching", "meaning": "simple English definition", "meaning_ar": "Arabic meaning" }
  ],
  "questions": [
    {
      "q": "a comprehension question in English",
      "q_ar": "Arabic of the question",
      "options": ["option A", "option B", "option C"],
      "answer": 0,
      "explain": "one spoken sentence explaining why that answer is right, quoting the passage"
    }
  ],
  "outro": "two spoken sentences encouraging re-reading and daily practice"
}

The passage must be ${lvl.targetMinutes <= 7 ? '12 to 15' : '16 to 20'} sentences, tell a small connected story or explanation with a beginning and an end, and use the language focus naturally.
"answer" is the 0-based index of the correct option. Include 6 glossary items and exactly ${lvl.questionCount} questions.
Distractor options must be plausible and drawn from the passage, never obviously silly.`;
  },

  listening(level, topic, focus) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a listening-comprehension lesson about ${topic}, built around a two-person conversation.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "ONE spoken sentence, 10-16 words, that states the concrete benefit — never a tease, never a question, never 'in this video'",
  "intro": "unused, return an empty string",
  "setting": "one sentence describing where the conversation happens",
  "footage_query": "three or four English stock-footage search words matching the setting",
  "dialogue": [
    { "speaker": "A", "en": "what this person says", "ar": "Arabic translation" }
  ],
  "key_phrases": [
    { "phrase": "a useful chunk from the dialogue", "meaning": "simple English explanation", "meaning_ar": "Arabic meaning" }
  ],
  "questions": [
    {
      "q": "a comprehension question about the conversation",
      "q_ar": "Arabic of the question",
      "options": ["option A", "option B", "option C"],
      "answer": 0,
      "explain": "one spoken sentence explaining the answer"
    }
  ],
  "outro": "two spoken sentences encouraging the viewer to listen again without subtitles"
}

The dialogue alternates strictly between speaker "A" and speaker "B", is ${lvl.targetMinutes <= 7 ? '12 to 16' : '16 to 22'} turns long, and sounds like real spontaneous speech: contractions, short replies, hesitation words such as well, actually, I mean. Keep every turn inside the CEFR level.
Include 5 key phrases and exactly ${lvl.questionCount} questions. "answer" is the 0-based index.`;
  },

  speaking(level, topic, focus) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a speaking and pronunciation practice lesson about ${topic}, in listen-and-repeat format.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "ONE spoken sentence, 10-16 words, that states the concrete benefit — never a tease, never a question, never 'in this video'",
  "intro": "unused, return an empty string",
  "footage_query": "three or four English stock-footage search words matching the situation",
  "drills": [
    {
      "phrase": "a genuinely useful spoken phrase for this topic",
      "phrase_ar": "Arabic meaning",
      "when": "one short spoken sentence saying when you use this phrase",
      "focus": "the pronunciation point, such as word stress on the second syllable, or the linking of two words",
      "focus_ar": "Arabic of the pronunciation point"
    }
  ],
  "dialogue": [
    { "speaker": "A", "en": "line of a short model conversation that reuses the drilled phrases", "ar": "Arabic translation" }
  ],
  "shadowing": ["three to five sentences the viewer will shadow at natural speed, reusing the phrases"],
  "outro": "two spoken sentences telling them to record themselves and compare, and to come back tomorrow"
}

Include ${lvl.targetMinutes <= 7 ? 8 : 10} drills and a dialogue of 8 to 12 turns alternating strictly between "A" and "B".
Phrases must be things people actually say, not textbook sentences. Every pronunciation "focus" must be specific and different from the others: stress, linking, weak forms, a difficult consonant, intonation of a question, contractions.`;
  },
};

const VALIDATORS = {
  vocabulary: (lesson, lvl) => {
    if (!Array.isArray(lesson.words) || lesson.words.length < Math.min(6, lvl.wordCount)) return 'too few words';
    for (const w of lesson.words) {
      if (!w.word || !w.meaning || !w.meaning_ar) return `word entry incomplete: ${JSON.stringify(w).slice(0, 80)}`;
      if (!Array.isArray(w.examples) || w.examples.length < 1) return `no examples for "${w.word}"`;
    }
    if (!lesson.outro) return 'missing outro';
    return null;
  },
  reading: (lesson) => {
    if (!Array.isArray(lesson.passage) || lesson.passage.length < 6) return 'passage too short';
    if (lesson.passage.some(s => !s.en || !s.ar)) return 'passage sentence missing en or ar';
    if (!Array.isArray(lesson.questions) || lesson.questions.length < 3) return 'too few questions';
    if (lesson.questions.some(q => !Array.isArray(q.options) || q.options.length < 2)) return 'question without options';
    return null;
  },
  listening: (lesson) => {
    if (!Array.isArray(lesson.dialogue) || lesson.dialogue.length < 8) return 'dialogue too short';
    if (lesson.dialogue.some(d => !d.en || !d.ar || !d.speaker)) return 'dialogue turn incomplete';
    if (!Array.isArray(lesson.questions) || lesson.questions.length < 3) return 'too few questions';
    return null;
  },
  speaking: (lesson) => {
    if (!Array.isArray(lesson.drills) || lesson.drills.length < 5) return 'too few drills';
    if (lesson.drills.some(d => !d.phrase || !d.phrase_ar || !d.focus)) return 'drill incomplete';
    if (!Array.isArray(lesson.dialogue) || lesson.dialogue.length < 4) return 'dialogue too short';
    return null;
  },
};

/** Small deterministic PRNG so a re-run of the same lesson shuffles identically. */
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Move the correct answer around.
 *
 * The prompt has to show the model a shape, and that shape contains
 * `"answer": 0`. Models copy it: a sample of generated lessons came back
 * A A A A B. A viewer notices that within two videos and stops reading the
 * options. Shuffling here is model-independent and cannot regress.
 *
 * Any "A)" / "B." prefix the model glued onto an option is stripped first,
 * otherwise the letters contradict the new positions.
 */
function shuffleAnswers(lesson) {
  if (!Array.isArray(lesson.questions)) return lesson;

  lesson.questions.forEach((q, qi) => {
    if (!Array.isArray(q.options) || q.options.length < 2) return;

    const options = q.options.map(o => String(o).replace(/^\s*[A-Da-d]\s*[).:-]\s+/, '').trim());
    const correct = options[q.answer] ?? options[0];

    const rand = seededRandom(`${lesson.level}|${lesson.skill}|${lesson.topic}|q${qi}`);
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    q.options = options;
    q.answer = options.indexOf(correct);
    if (q.answer === -1) q.answer = 0;
  });
  return lesson;
}

export async function writeLesson({ level, skill, topic, focus }) {
  const lvl = levelConfig(level);
  const build = PROMPTS[skill];
  if (!build) throw new Error(`No prompt for skill "${skill}"`);

  const lesson = await generateJson(build(level, topic, focus), {
    temperature: 0.9,
    maxTokens: 12000,
    validate: (l) => VALIDATORS[skill](l, lvl),
  });

  lesson.level = level;
  lesson.skill = skill;
  shuffleAnswers(lesson);
  lesson.topic = topic;
  lesson.focus = focus;
  lesson.levelLabel = lvl.label;
  lesson.skillLabel = skillConfig(skill).label;
  if (!lesson.title) lesson.title = topic;
  return lesson;
}

/** Titles/descriptions the channel uses. Kept here so wording stays in one place. */
export function buildMetadata(lesson, { channel: ch, playlists = [], chapters = [] }) {
  const skill = skillConfig(lesson.skill);
  const lvl = levelConfig(lesson.level);
  const wordCount = lesson.words?.length || lvl.wordCount;

  // A phone shows roughly 48 characters of a title, and 47% of this channel's
  // views are on a phone. So the searchable half goes first and the pattern is
  // measured against that cut, not against YouTube's 100-character maximum.
  const title = skill.titlePattern
    .replace('{topic}', lesson.topic)
    .replace('{levelLabel}', lvl.label)
    .replace('{level}', lesson.level.toUpperCase())
    .replace('{wordCount}', wordCount)
    .slice(0, 98);

  // YouTube shows roughly the first 100 characters before "...more", and those
  // are the characters search weighs most. They used to hold `lesson.hook` —
  // narration written for the ear, containing no phrase anyone would type. Now
  // they state the topic, the skill and the level in plain search language.
  const opener = `${lesson.topic} — ${skill.label.toLowerCase()} for ${lvl.label.split('·').pop().trim()} English learners (${lesson.level.toUpperCase()}).`;

  const lines = [
    opener,
    lesson.hook || '',
    '',
    // Chapters. YouTube turns these into jump-links in search results and on
    // the scrubber, and they let a viewer skip to word 7 instead of leaving.
    // The timings already exist — they come back from the TTS service.
    ...(chapters.length ? [...chapters.map(c => `${c.stamp} ${c.label}`), ''] : []),
    `${skill.emoji} ${skill.label} — ${lvl.label}`,
    lesson.focus ? `Language focus: ${lesson.focus}` : '',
    '',
    'A new English lesson every single day, for every level from A1 to C1.',
    'Turn on subtitles for the Arabic translation. الترجمة العربية متاحة داخل الفيديو.',
    '',
    'IN THIS LESSON',
  ];

  if (lesson.words) lines.push(...lesson.words.map((w, i) => `${i + 1}. ${w.word} — ${w.meaning}`));
  if (lesson.key_phrases) lines.push(...lesson.key_phrases.map((p, i) => `${i + 1}. ${p.phrase} — ${p.meaning}`));
  if (lesson.drills) lines.push(...lesson.drills.map((d, i) => `${i + 1}. ${d.phrase}`));
  if (lesson.glossary) lines.push(...lesson.glossary.map((g, i) => `${i + 1}. ${g.word} — ${g.meaning}`));

  // Playlist links are the cheapest way to turn one view into a session: the
  // viewer who finishes this lesson gets an obvious next one in their level.
  if (playlists.length) {
    lines.push('', 'KEEP GOING');
    for (const pl of playlists) {
      lines.push(`${pl.title}`, `https://www.youtube.com/playlist?list=${pl.id}`);
    }
  }

  lines.push(
    '',
    `Level: ${lvl.label}  |  Skill: ${skill.label}`,
    '',
    `#LearnEnglish #English${lesson.level.toUpperCase()} #${skill.label.replace(/\s+/g, '')} #ESL`,
  );

  const tags = [
    ...ch.youtube.baseTags,
    `english ${lesson.level}`,
    `${lesson.level} english lesson`,
    `english ${lesson.skill}`,
    lesson.topic.toLowerCase(),
    `learn english ${lesson.skill}`,
  ].slice(0, 30);

  return { title, description: lines.filter(l => l !== undefined).join('\n').slice(0, 4900), tags };
}
