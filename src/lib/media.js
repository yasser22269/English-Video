import fs from 'fs';
import path from 'path';
import { env } from './config.js';
import { run } from './ffmpeg.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function download(url, dest, { headers = {}, timeoutMs = 90_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error(`response too small (${buf.length} bytes)`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return dest;
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic seed so the same word always gets the same illustration. */
function seedFrom(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h % 1_000_000;
}

const STYLE_SUFFIX =
  'editorial photography, natural light, shallow depth of field, realistic, high detail, no text, no watermark, no letters';

async function pollinations(prompt, dest, { width = 1280, height = 720 } = {}) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${STYLE_SUFFIX}`)}`
    + `?width=${width}&height=${height}&nologo=true&model=flux&seed=${seedFrom(prompt)}`;
  return download(url, dest, { timeoutMs: 120_000 });
}

async function huggingface(prompt, dest) {
  const res = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.huggingfaceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: `${prompt}, ${STYLE_SUFFIX}` }),
  });
  if (!res.ok) throw new Error(`HuggingFace ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

async function pexelsPhoto(query, dest) {
  if (!env.pexelsKey) throw new Error('no PEXELS_API_KEY');
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
    { headers: { Authorization: env.pexelsKey } });
  if (!res.ok) throw new Error(`Pexels photos ${res.status}`);
  const json = await res.json();
  const photo = json.photos?.[seedFrom(query) % Math.max(json.photos.length, 1)];
  if (!photo) throw new Error('Pexels returned no photos');
  return download(photo.src.large2x || photo.src.large, dest);
}

/**
 * One illustration per vocabulary word / scene. Providers are tried in order
 * and a failure is never fatal — the templates look fine without an image, so
 * a flaky image host must not take down the whole night's batch.
 */
export async function generateImage(prompt, dest, { fallbackQuery } = {}) {
  if (fs.existsSync(dest)) return dest;
  if (env.imageProvider === 'off') return null;

  const attempts = [];
  if (env.imageProvider === 'pollinations') attempts.push(() => pollinations(prompt, dest));
  if (env.huggingfaceKey) attempts.push(() => huggingface(prompt, dest));
  if (env.pexelsKey) attempts.push(() => pexelsPhoto(fallbackQuery || prompt, dest));

  for (const attempt of attempts) {
    for (let tries = 0; tries < 2; tries++) {
      try {
        return await attempt();
      } catch (err) {
        console.warn(`[media] image attempt failed — ${err.message}`);
        await sleep(1500);
      }
    }
  }
  console.warn(`[media] no image for "${prompt.slice(0, 60)}" — the template will render without one`);
  return null;
}

export async function generateImages(items, { outDir, concurrency = 3 }) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = new Array(items.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      results[i] = await generateImage(item.prompt, path.join(outDir, `${item.id}.jpg`), {
        fallbackQuery: item.fallbackQuery,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function pexelsVideo(query, dest) {
  if (!env.pexelsKey) throw new Error('no PEXELS_API_KEY');
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=medium`,
    { headers: { Authorization: env.pexelsKey } });
  if (!res.ok) throw new Error(`Pexels videos ${res.status}`);
  const json = await res.json();
  const clips = (json.videos || []).filter(v => v.duration >= 8);
  if (!clips.length) throw new Error('Pexels returned no usable clips');

  const clip = clips[seedFrom(query) % clips.length];
  const file = clip.video_files
    .filter(f => f.file_type === 'video/mp4' && f.width >= 1280)
    .sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0];
  if (!file) throw new Error('no suitable mp4 rendition');
  return download(file.link, dest, { timeoutMs: 180_000 });
}

async function pixabayVideo(query, dest) {
  if (!env.pixabayKey) throw new Error('no PIXABAY_API_KEY');
  const res = await fetch(
    `https://pixabay.com/api/videos/?key=${env.pixabayKey}&q=${encodeURIComponent(query)}&per_page=20&safesearch=true`);
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const json = await res.json();
  const hits = (json.hits || []).filter(h => h.duration >= 8);
  if (!hits.length) throw new Error('Pixabay returned no usable clips');
  const hit = hits[seedFrom(query) % hits.length];
  const v = hit.videos.large || hit.videos.medium;
  return download(v.url, dest, { timeoutMs: 180_000 });
}

/**
 * Background footage for the listening and speaking formats. We deliberately
 * fetch one clip and loop it slowed-down and darkened rather than cutting
 * between many: the learner is reading subtitles, and busy video behind text
 * costs comprehension.
 */
export async function fetchFootage(query, dest) {
  if (fs.existsSync(dest)) return dest;
  const raw = dest.replace(/\.mp4$/, '-raw.mp4');

  for (const attempt of [() => pexelsVideo(query, raw), () => pixabayVideo(query, raw)]) {
    try {
      await attempt();
      return raw;
    } catch (err) {
      console.warn(`[media] footage attempt failed — ${err.message}`);
    }
  }
  console.warn(`[media] no footage for "${query}" — falling back to a generated background`);
  return null;
}

/**
 * Turn a stock clip into a calm, loopable, readable backplate: slowed, gently
 * zoomed, desaturated and darkened so white subtitles stay legible over it.
 */
export async function prepareFootage(src, dest, { durationSec, width, height, tint = '#000000' }) {
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setpts=1.35*PTS',
    'eq=saturation=0.72:brightness=-0.16:contrast=1.04',
    'gblur=sigma=2.2',
    `format=yuv420p`,
  ].join(',');

  await run('ffmpeg', ['-y',
    '-stream_loop', '-1', '-i', src,
    '-t', durationSec.toFixed(2),
    '-vf', filters,
    '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', dest]);
  return dest;
}

export { download };
