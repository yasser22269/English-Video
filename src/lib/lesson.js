import { generateJson } from './llm.js';
import { levelConfig, skillConfig, translation, channel } from './config.js';
import { openingVariant, normalizeCommentQuestion, openingChapterLabel, dayNumber } from './build.js';

const COMMON_RULES = `
GLOBAL RULES
- Every "..._ar" field holds the ${translation.name} translation shown on screen (the field name is historical). Write it as ${translation.promptStyle} — meaning-for-meaning, never word-for-word, and never a transliteration.
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

// Experiment E4 (C7). 'old' is the exact rule the channel shipped before.
const HOOK_RULES = {
  old: "ONE spoken sentence, 10-16 words, that states the concrete benefit — never a tease, never a question, never 'in this video'",
  new: "ONE spoken line, 10-16 words: a one-line challenge the viewer can answer in their head, for example 'Can you understand this conversation at the hotel? Let us see.' A question is allowed. Never 'in this video'",
};
const hookRule = (opening) => HOOK_RULES[opening === 'new' ? 'new' : 'old'];

// Growth plan C8: screen and description text, not narration.
const COMMENT_QUESTION_RULE = "ONE question a viewer can answer in the comments with one tap: a number, a letter or one word. Name the three choices from this lesson or end with 'Comment 1, 2 or 3'. Max 100 characters, may end with one 👇 emoji. Example: 'Which phrase will you use? Comment 1, 2 or 3 👇'";

// Growth plan C2: name the paired lesson when there is one.
function shortCtaRule(pairedVideo) {
  const t = String(pairedVideo?.topic || '').replace(/"/g, "'").trim();
  return t
    ? `exactly this sentence: The full ${t} lesson is linked above my name.`
    : 'one short spoken sentence, max 10 words, telling them the full lesson is on the channel';
}

const PROMPTS = {
  vocabulary(level, topic, focus, opts = {}) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a "${lvl.wordCount} new words" lesson about ${topic}.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters, no level name",
  "hook": "${hookRule(opts.opening)}",
  "intro": "unused, return an empty string",
  "words": [
    {
      "word": "the target word or short phrase",
      "ipa": "IPA transcription between slashes",
      "pos": "noun | verb | adjective | adverb | phrase",
      "meaning": "definition in English SIMPLER than the word itself, one sentence",
      "meaning_ar": "the ${translation.name} meaning",
      "examples": ["natural example sentence", "a second example in a different situation"],
      "examples_ar": ["${translation.name} of example 1", "${translation.name} of example 2"],
      "collocation": "one very common collocation or chunk using this word",
      "image_prompt": "a concrete, literal photo description that illustrates the word, 10-18 words, no text in image, no people's faces close up"
    }
  ],
  "recap": ["one short spoken line per word, in the same order, reminding the meaning"],
  "quiz": [
    { "prompt": "a gap-fill sentence using ___ for the missing word", "answer": "the word", "prompt_ar": "${translation.name} of the sentence" }
  ],
  "commentQuestion": "${COMMENT_QUESTION_RULE}",
  "outro": "two spoken sentences: tell them to say the words out loud, and to subscribe for a lesson every day"
}

Exactly ${lvl.wordCount} items in "words", ${lvl.wordCount} lines in "recap", and 4 items in "quiz".
Choose genuinely useful, high-frequency words a learner at this level does not know yet. No proper nouns.`;
  },

  reading(level, topic, focus, opts = {}) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a guided reading lesson about ${topic}.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "${hookRule(opts.opening)}",
  "intro": "unused, return an empty string",
  "passage_title": "a title for the text itself",
  "passage": [
    { "en": "one sentence of the passage", "ar": "its ${translation.name} translation" }
  ],
  "glossary": [
    { "word": "a word from the passage worth teaching", "meaning": "simple English definition", "meaning_ar": "${translation.name} meaning" }
  ],
  "questions": [
    {
      "q": "a comprehension question in English",
      "q_ar": "${translation.name} of the question",
      "options": ["option A", "option B", "option C"],
      "answer": 0,
      "explain": "one spoken sentence explaining why that answer is right, quoting the passage"
    }
  ],
  "commentQuestion": "${COMMENT_QUESTION_RULE}",
  "outro": "two spoken sentences encouraging re-reading and daily practice"
}

The passage must be ${lvl.targetMinutes <= 7 ? '12 to 15' : '16 to 20'} sentences, tell a small connected story or explanation with a beginning and an end, and use the language focus naturally.
"answer" is the 0-based index of the correct option. Include 6 glossary items and exactly ${lvl.questionCount} questions.
Distractor options must be plausible and drawn from the passage, never obviously silly.`;
  },

  listening(level, topic, focus, opts = {}) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a listening-comprehension lesson about ${topic}, built around a two-person conversation.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "${hookRule(opts.opening)}",
  "intro": "unused, return an empty string",
  "setting": "one sentence describing where the conversation happens",
  "footage_query": "three or four English stock-footage search words matching the setting",
  "dialogue": [
    { "speaker": "A", "en": "what this person says", "ar": "${translation.name} translation" }
  ],
  "key_phrases": [
    { "phrase": "a useful chunk from the dialogue", "meaning": "simple English explanation", "meaning_ar": "${translation.name} meaning" }
  ],
  "questions": [
    {
      "q": "a comprehension question about the conversation",
      "q_ar": "${translation.name} of the question",
      "options": ["option A", "option B", "option C"],
      "answer": 0,
      "explain": "one spoken sentence explaining the answer"
    }
  ],
  "commentQuestion": "${COMMENT_QUESTION_RULE}",
  "outro": "two spoken sentences encouraging the viewer to listen again without subtitles"
}

The dialogue alternates strictly between speaker "A" and speaker "B", is ${lvl.targetMinutes <= 7 ? '12 to 16' : '16 to 22'} turns long, and sounds like real spontaneous speech: contractions, short replies, hesitation words such as well, actually, I mean. Keep every turn inside the CEFR level.
Include 5 key phrases and exactly ${lvl.questionCount} questions. "answer" is the 0-based index.`;
  },

  short(level, topic, focus, opts = {}) {
    return `${head(level, topic, focus)}
TASK: a vertical YouTube Short under 50 seconds that teaches exactly THREE useful English words about ${topic}.
A Short is watched on a phone by someone scrolling. The first sentence decides whether they stay, and the video should feel complete and loop cleanly.

Return this exact shape:
{
  "title": "punchy title under 50 characters, no level name, no hashtags",
  "hook": "ONE spoken sentence of 6 to 10 words that challenges the viewer, e.g. 'Three words every beginner needs at the airport.' Never a question about subscribing.",
  "words": [
    {
      "word": "the target word or short phrase",
      "ipa": "IPA between slashes",
      "meaning": "definition in English simpler than the word, max 10 words",
      "meaning_ar": "the ${translation.name} meaning, one to three words",
      "example": "one short natural example sentence, max 9 words",
      "example_ar": "${translation.name} of the example",
      "image_prompt": "a concrete literal photo description of the word, 8-14 words, no text in image"
    }
  ],
  "cta": "${shortCtaRule(opts.pairedVideo)}",
  "commentQuestion": "${COMMENT_QUESTION_RULE}"
}

Exactly 3 items in "words". Choose words a learner at this level genuinely needs and probably does not know yet. No proper nouns.`;
  },

  speaking(level, topic, focus, opts = {}) {
    const lvl = levelConfig(level);
    return `${head(level, topic, focus)}
TASK: a speaking and pronunciation practice lesson about ${topic}, in listen-and-repeat format.

Return this exact shape:
{
  "title": "short punchy English title, max 60 characters",
  "hook": "${hookRule(opts.opening)}",
  "intro": "unused, return an empty string",
  "footage_query": "three or four English stock-footage search words matching the situation",
  "drills": [
    {
      "phrase": "a genuinely useful spoken phrase for this topic",
      "phrase_ar": "${translation.name} meaning",
      "when": "one short spoken sentence saying when you use this phrase",
      "focus": "the pronunciation point, such as word stress on the second syllable, or the linking of two words",
      "focus_ar": "${translation.name} of the pronunciation point"
    }
  ],
  "dialogue": [
    { "speaker": "A", "en": "line of a short model conversation that reuses the drilled phrases", "ar": "${translation.name} translation" }
  ],
  "shadowing": ["three to five sentences the viewer will shadow at natural speed, reusing the phrases"],
  "commentQuestion": "${COMMENT_QUESTION_RULE}",
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
  short: (lesson) => {
    if (!lesson.hook) return 'missing hook';
    if (!Array.isArray(lesson.words) || lesson.words.length !== 3) return 'a Short needs exactly three words';
    for (const w of lesson.words) {
      if (!w.word || !w.meaning || !w.meaning_ar || !w.example) return `word entry incomplete: ${JSON.stringify(w).slice(0, 80)}`;
    }
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

/**
 * Optional fields from the scheduler (growth plan contracts), all optional:
 * searchTopic, pairedVideo {videoId,url,topic,title,level} (Shorts),
 * pairedShort {videoId,url} (long lessons), shortIndex, date, opening.
 */
const CARRIED = ['searchTopic', 'pairedVideo', 'pairedShort', 'shortIndex'];

export async function writeLesson({ level, skill, topic, focus, footage, ...extra }) {
  const lvl = levelConfig(level);
  const build = PROMPTS[skill];
  if (!build) throw new Error(`No prompt for skill "${skill}"`);

  const date = extra.date instanceof Date && !Number.isNaN(extra.date.getTime())
    ? extra.date.toISOString().slice(0, 10)
    : (typeof extra.date === 'string' && extra.date ? extra.date.slice(0, 10) : null);
  // Experiment E4: the hook rule and the opening scenes must agree, so the
  // variant is decided once here and stored on the lesson.
  const opening = skill === 'short'
    ? null
    : (extra.opening === 'new' || extra.opening === 'old' ? extra.opening : openingVariant(date || new Date(), channel));

  const lesson = await generateJson(build(level, topic, focus, { opening, pairedVideo: extra.pairedVideo }), {
    temperature: 0.9,
    maxTokens: 12000,
    validate: (l) => VALIDATORS[skill](l, lvl),
  });

  lesson.level = level;
  lesson.skill = skill;
  // Hand-written stock-footage keywords from the curriculum entry. The model's
  // own footage_query still wins when it produced one; this is the fallback
  // that stops an abstract topic being sent to the video API as a literal
  // search string.
  if (footage) lesson.footage = footage;
  shuffleAnswers(lesson);
  lesson.topic = topic;
  lesson.focus = focus;
  lesson.levelLabel = lvl.label;
  lesson.skillLabel = skillConfig(skill).label;
  if (!lesson.title) lesson.title = topic;
  for (const k of CARRIED) if (extra[k] != null && extra[k] !== '') lesson[k] = extra[k];
  if (date) lesson.date = date;
  if (opening) lesson.opening = opening;
  lesson.commentQuestion = normalizeCommentQuestion(lesson.commentQuestion ?? lesson.comment_question, lesson);
  return lesson;
}

/** The topic as a learner types it: titles and tags use it, narration does not. */
function searchTopicOf(lesson) {
  return String(lesson.searchTopic || lesson.topic || '').trim();
}

/** "Colours in English" stays as it is; "At the Hotel" becomes "At the Hotel in English". */
function inEnglish(t) {
  const s = /\benglish\b/i.test(t) ? t : `${t} in English`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One line of description text: no newlines, no stray hashtags, no angle brackets (the API rejects them). */
const clean = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/[#<>]/g, '').replace(/\s{2,}/g, ' ').trim();

/** Titles/descriptions the channel uses. Kept here so wording stays in one place. */
/** Fill a title or tag pattern from the lesson and its level. */
export function fillPattern(pattern, lesson, { wordCount } = {}) {
  const lvl = levelConfig(lesson.level);
  const topic = searchTopicOf(lesson);
  const out = String(pattern ?? '')
    .replaceAll('{topic}', topic)
    .replaceAll('{concept}', topic)
    .replaceAll('{llmTitle}', clean(lesson.title || lesson.topic))
    .replaceAll('{levelLabel}', lvl.label)
    .replaceAll('{levelName}', lvl.levelName || lvl.label.split('·').pop().trim())
    .replaceAll('{level}', lesson.level.toUpperCase())
    .replaceAll('{LEVEL}', lesson.level.toUpperCase())
    .replaceAll('{storyLevel}', String(lvl.storyLevel ?? ''))
    .replaceAll('{wordCount}', String(wordCount ?? lvl.wordCount));
  return out
    .replace(/\{[^{}]*\}/g, '')          // unknown placeholders
    .replace(/[{}]/g, '')
    .replace(/\bin English in English\b/gi, 'in English')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,:;)])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s—–|:,-]+|[\s—–|:,-]+$/g, '')
    .trim();
}

/** Trim to `max` on a word boundary, keeping a trailing "#shorts". */
function fitTitle(title, max = 98) {
  if (title.length <= max) return title;
  const tail = title.match(/\s+#shorts$/i)?.[0] || '';
  const room = max - tail.length;
  let body = title.slice(0, title.length - tail.length).slice(0, room);
  const cut = body.lastIndexOf(' ');
  if (cut > room * 0.6) body = body.slice(0, cut);
  return `${body.replace(/[\s—–|:,-]+$/, '')}${tail}`;
}

/**
 * Growth plan C4/C6: titlePatternByLevel[level] wins, then a deterministic
 * rotation through titlePatterns (day number + shortIndex), then titlePattern.
 */
function pickTitlePattern(skill, lesson, { date, shortIndex } = {}) {
  const byLevel = skill.titlePatternByLevel?.[lesson.level];
  const index = dayNumber(lesson.date || date || new Date()) + (Number(lesson.shortIndex ?? shortIndex) || 0);
  if (typeof byLevel === 'string' && byLevel.trim()) return { pattern: byLevel, index: null };
  if (Array.isArray(byLevel) && byLevel.length) {
    const patternIndex = ((index % byLevel.length) + byLevel.length) % byLevel.length;
    return { pattern: byLevel[patternIndex], index: patternIndex };
  }
  const list = Array.isArray(skill.titlePatterns) ? skill.titlePatterns.filter(p => typeof p === 'string' && p.trim()) : [];
  if (list.length) {
    const patternIndex = ((index % list.length) + list.length) % list.length;
    return { pattern: list[patternIndex], index: patternIndex };
  }
  return { pattern: skill.titlePattern || '{topic} ({level})', index: null };
}

// Short, search-language names for each format, used in the description opener.
const FORMAT_PHRASE = {
  vocabulary: 'English vocabulary with pictures, pronunciation and examples',
  reading: 'learn English through a short story',
  listening: 'English conversation practice',
  speaking: 'English speaking practice with shadowing',
  short: 'three English words with pictures and examples',
};

// The query family a searcher types, with the level (growth plan §4.4 item 3).
const FORMAT_TAG = {
  vocabulary: (lv, b) => (b ? `english vocabulary for beginners ${lv}` : `english vocabulary ${lv}`),
  reading: (lv, b, story) => (story ? `learn english through story level ${story}` : `english story ${lv}`),
  listening: (lv, b) => (b ? `english conversation for beginners ${lv}` : `english conversation practice ${lv}`),
  speaking: (lv) => `english shadowing ${lv}`,
  short: (lv) => `english words ${lv}`,
};

const shortsUrl = (p) => p?.url || (p?.videoId ? `https://youtube.com/shorts/${p.videoId}` : null);
const watchUrl = (p) => p?.url || (p?.videoId ? `https://youtu.be/${p.videoId}` : null);
const playlistLink = (id) => `https://www.youtube.com/playlist?list=${id}`;

/** YouTube's tag budget: 500 characters, commas included, multi-word tags quoted. */
export function tagsLength(tags) {
  return tags.reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

function buildTags(lesson, skill, ch, { wordCount, levelName }) {
  const lv = lesson.level.toLowerCase();
  const beginner = lv === 'a1' || lv === 'a2';
  const lvl = levelConfig(lesson.level);
  const t = searchTopicOf(lesson).toLowerCase().replace(/[,"<>]/g, '').replace(/\s{2,}/g, ' ').trim();
  const core = t.replace(/\s+in english$/, '').replace(/^english\s+/, '').trim();
  const bare = core.replace(/^(at|in|on|to)\s+(a|an|the)\s+/, '').replace(/^(a|an|the)\s+/, '');

  const candidates = [
    // 1 the exact topic query
    lesson.skill === 'listening' ? `english conversation ${core}` : `${core} in english`,
    // 2 topic + level
    `${bare} english ${lv}`,
    // 3 format query + level
    FORMAT_TAG[lesson.skill]?.(lv, beginner, lvl.storyLevel),
    // 4 level phrase
    beginner ? `english for beginners ${lv}` : `english ${lv}`,
    // 5 only true because the translation is burned in on every video
    `english with ${String(translation.name || '').toLowerCase()} translation`,
    ...(skill.searchTags || []).map(p => fillPattern(p, lesson, { wordCount }).toLowerCase()),
    `english for ${levelName.toLowerCase()}`,
    ...((ch?.youtube?.baseTags) || []),
  ];

  const tags = [];
  for (const raw of candidates) {
    const tag = String(raw ?? '').toLowerCase().replace(/[,<>"]/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!tag || tag.length > 100 || tags.includes(tag)) continue;
    if (tagsLength([...tags, tag]) > 490) continue;
    tags.push(tag);
  }
  return tags;
}

export function buildMetadata(lesson, { channel: ch = channel, playlists = [], chapters = [], date = null, shortIndex = 0 } = {}) {
  const skill = skillConfig(lesson.skill);
  const lvl = levelConfig(lesson.level);
  const wordCount = lesson.words?.length || lvl.wordCount;
  const levelName = lvl.levelName || lvl.label.split('·').pop().trim();
  const LEVEL = lesson.level.toUpperCase();
  const topic = searchTopicOf(lesson);
  const isShort = lesson.skill === 'short';
  const question = normalizeCommentQuestion(lesson.commentQuestion, lesson);
  const levelPlaylist = playlists.find(p => p.key === `level:${lesson.level}`) || playlists.find(p => String(p.key || '').startsWith('level:'));

  // Patterns come from YouTube autocomplete data (scripts/keywords.js).
  const selectedTitlePattern = pickTitlePattern(skill, lesson, { date, shortIndex });
  let title = fillPattern(selectedTitlePattern.pattern, lesson, { wordCount });
  if (isShort && !/#shorts\b/i.test(title)) title = `${title} #shorts`;
  title = fitTitle(title, 98);

  const lines = [];
  const hashtags = isShort
    ? `#shorts #LearnEnglish #English${LEVEL}`
    : `#LearnEnglish #English${LEVEL} #${skill.label.replace(/[^A-Za-z0-9]/g, '')}`;

  if (isShort) {
    // Growth plan §4.3. Line 2 is the paired lesson: not clickable in the Shorts
    // player, but it is on the watch page and on desktop.
    const words = (lesson.words || []).map(w => clean(w.word)).filter(Boolean);
    lines.push(`${inEnglish(clean(topic))}: ${words.join(', ')} — pictures, pronunciation and examples (${LEVEL}).`);
    const paired = watchUrl(lesson.pairedVideo);
    if (paired) lines.push(`▶ Full lesson: ${paired}`);
    else if (levelPlaylist?.id) lines.push(`▶ Full lessons (${LEVEL}): ${playlistLink(levelPlaylist.id)}`);
    lines.push(clean(question), hashtags, '');
    if (lesson.words?.length) {
      lines.push('IN THIS SHORT');
      lines.push(...lesson.words.map((w, i) => `${i + 1}. ${clean(w.word)} — ${clean(w.meaning)}`));
      lines.push('');
    }
    lines.push(`English captions with ${translation.name} translation on screen.`);
  } else {
    // Growth plan §4.2. The two lines before "...more" carry the query phrase,
    // the format, the level and what is true of every lesson.
    const slow = (parseInt(String(lvl.rate).replace('%', ''), 10) || 0) <= -5 ? 'Slow English' : 'Clear English';
    lines.push(
      `${inEnglish(clean(topic))} — ${FORMAT_PHRASE[lesson.skill] || skill.label} for ${levelName.toLowerCase()} learners (${LEVEL}). ${slow}, English subtitles and ${translation.name} translation on screen.`,
      clean(lesson.hook),
    );
    const short = shortsUrl(lesson.pairedShort);
    if (short) lines.push(`▶ 60-second version: ${short}`);
    if (levelPlaylist?.id) lines.push(`▶ Next lesson (${LEVEL}): ${playlistLink(levelPlaylist.id)}`);

    const q = clean(question).replace(/\s*👇\s*$/u, '');
    lines.push('', `❓ Today's question: ${q}${/comment/i.test(q) ? '' : ' — answer in the comments.'}`);

    if (chapters.length) {
      const first = String(chapters[0].label || '');
      const topical = [topic, lesson.topic].some(t => t && first.toLowerCase().includes(String(t).toLowerCase()));
      const list = chapters.map((c, i) => `${c.stamp} ${clean(i === 0 && !topical ? openingChapterLabel(lesson) : c.label)}`);
      lines.push('', ...list);
    }

    lines.push('', 'IN THIS LESSON');
    if (lesson.words) lines.push(...lesson.words.map((w, i) => `${i + 1}. ${clean(w.word)} — ${clean(w.meaning)}`));
    if (lesson.key_phrases) lines.push(...lesson.key_phrases.map((p, i) => `${i + 1}. ${clean(p.phrase)} — ${clean(p.meaning)}`));
    if (lesson.drills) lines.push(...lesson.drills.map((d, i) => `${i + 1}. ${clean(d.phrase)}`));
    if (lesson.glossary) lines.push(...lesson.glossary.map((g, i) => `${i + 1}. ${clean(g.word)} — ${clean(g.meaning)}`));
    if (lesson.focus) lines.push('', `Language focus: ${clean(lesson.focus)}`);

    // Playlist links are the cheapest way to turn one view into a session.
    if (playlists.length) {
      lines.push('', 'KEEP GOING');
      for (const pl of playlists) lines.push(clean(pl.title), playlistLink(pl.id));
    }

    lines.push(
      '',
      `${skill.emoji} ${skill.label} — ${lvl.label}`,
      'A new English lesson every day, for every level from A1 to C1.',
      '',
      hashtags,
    );
  }

  const description = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4900);
  const tags = buildTags(lesson, skill, ch, { wordCount, levelName });
  return { title, description, tags, titlePatternIndex: selectedTitlePattern.index };
}

/**
 * Localised title and description for each language in
 * channel.youtube.localizations. YouTube shows a viewer the localisation that
 * matches their interface language, so a learner in São Paulo or Jakarta finds
 * and reads the lesson in their own language while the video stays English.
 * Sent inside videos.insert, so it costs no extra quota.
 *
 * One LLM call for all languages. Any language the model gets wrong is dropped
 * rather than shipped — an untranslated fallback is worse than none.
 */
export async function localizeMetadata(lesson, meta, { languages }) {
  if (!languages?.length) return {};
  const lvl = levelConfig(lesson.level);
  const levelName = lvl.levelName || lvl.label;
  const intro = meta.description.split('\n').slice(0, 2).join(' ');

  const prompt = `You localise YouTube metadata for an English-teaching channel.
The VIDEO stays in English. You write the title and a short description in each target language, the way learners in that language actually search YouTube for English lessons.

LESSON
- English title: ${meta.title}
- Topic: ${lesson.topic}
- Format: ${lesson.skill}
- Level: ${lesson.level.toUpperCase()} (${levelName})
- English opening lines: ${intro}

RULES
- Title in the target language, max 95 characters. Keep the level code (${lesson.level.toUpperCase()}) exactly as written. Say that it is an English lesson, in that language (for example Portuguese "inglês", Spanish "inglés", Hindi "अंग्रेज़ी").
- Keep any English target words or phrases from the topic in English inside quotes if they are what is being taught.
- Description: 2 natural sentences in the target language saying what the learner gets. No hashtags, no emoji, no links.
- Languages: ${languages.join(', ')}

Return ONE JSON object shaped exactly like:
{ ${languages.map(l => `"${l}": { "title": "...", "description": "..." }`).join(', ')} }`;

  const raw = await generateJson(prompt, {
    temperature: 0.4,
    maxTokens: 3000,
    validate: (j) => {
      const ok = languages.filter(l => j?.[l]?.title && j?.[l]?.description);
      if (ok.length < Math.ceil(languages.length / 2)) throw new Error(`only ${ok.length}/${languages.length} localisations returned`);
    },
  });

  const out = {};
  for (const lang of languages) {
    const loc = raw?.[lang];
    if (!loc?.title || !loc?.description) continue;
    const title = String(loc.title).replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    if (!title.includes(lesson.level.toUpperCase())) continue;
    out[lang] = {
      title,
      // Localised lead, then the English body (chapters, word list, playlists).
      description: `${String(loc.description).trim()}\n\n${meta.description}`.slice(0, 4900),
    };
  }
  return out;
}
