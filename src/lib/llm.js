import { env } from './config.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function stripFences(text) {
  return String(text).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractJson(text) {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Models occasionally wrap the object in prose — grab the outermost braces.
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last <= first) throw new Error('No JSON object in model output');
    return JSON.parse(cleaned.slice(first, last + 1));
  }
}

async function callGemini(prompt, { temperature, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      // Thinking tokens count against maxOutputTokens and can silently truncate
      // a long lesson. This task is structured enough not to need them.
      thinkingConfig: { thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET || 0) },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error(`Gemini returned no text (finishReason=${json?.candidates?.[0]?.finishReason})`);
  return text;
}

async function callOpenAICompatible({ url, key, model, extraHeaders = {} }, prompt, { temperature, maxTokens }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a CEFR-certified English teacher and scriptwriter. You reply with a single valid JSON object and nothing else.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${model} returned no text`);
  return text;
}

function providers() {
  const list = [];
  if (env.geminiKey) list.push({ name: 'gemini', run: callGemini });
  if (env.groqKey) {
    list.push({
      name: 'groq',
      run: (p, o) => callOpenAICompatible(
        { url: 'https://api.groq.com/openai/v1/chat/completions', key: env.groqKey, model: env.groqModel }, p, o),
    });
  }
  if (env.openrouterKey) {
    list.push({
      name: 'openrouter',
      run: (p, o) => callOpenAICompatible(
        { url: 'https://openrouter.ai/api/v1/chat/completions', key: env.openrouterKey, model: env.openrouterModel,
          extraHeaders: { 'X-Title': 'English Every Day' } }, p, o),
    });
  }
  return list;
}

/**
 * Ask the first working provider for a JSON object. Each provider gets two
 * attempts before we fall through to the next, so a single 429 does not cost
 * us the whole lesson.
 */
export async function generateJson(prompt, { temperature = 0.85, maxTokens = 8192, validate } = {}) {
  const chain = providers();
  if (!chain.length) throw new Error('No LLM provider configured — set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY');

  const errors = [];
  for (const provider of chain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await provider.run(prompt, { temperature, maxTokens });
        const parsed = extractJson(raw);
        if (validate) {
          const problem = validate(parsed);
          if (problem) throw new Error(`Validation failed: ${problem}`);
        }
        console.log(`[llm] ✓ ${provider.name}`);
        return parsed;
      } catch (err) {
        errors.push(`${provider.name}#${attempt}: ${err.message}`);
        console.warn(`[llm] ${provider.name} attempt ${attempt} failed — ${err.message}`);
        if (attempt === 1) await sleep(2500);
      }
    }
  }
  throw new Error(`All LLM providers failed:\n  ${errors.join('\n  ')}`);
}
