import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// .env.local wins over .env so a local override never leaks into git.
dotenv.config({ path: path.join(ROOT, '.env.local') });
dotenv.config({ path: path.join(ROOT, '.env') });

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export const channel = readJson(path.join(ROOT, 'config/channel.json'));

export function curriculum(level) {
  return readJson(path.join(ROOT, `config/curriculum/${level}.json`));
}

export const paths = {
  root: ROOT,
  output: path.join(ROOT, 'output'),
  state: path.join(ROOT, 'state'),
  templates: path.join(ROOT, 'src/templates'),
  fonts: path.join(ROOT, 'assets/fonts'),
  music: path.join(ROOT, 'assets/music'),
};

for (const dir of [paths.output, paths.state, paths.fonts, paths.music]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const env = {
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',

  pexelsKey: process.env.PEXELS_API_KEY || process.env.VITE_PEXELS_API_KEY || '',
  pixabayKey: process.env.PIXABAY_API_KEY || process.env.VITE_PIXABAY_API_KEY || '',
  imageProvider: process.env.IMAGE_PROVIDER || 'pollinations',
  huggingfaceKey: process.env.HUGGINGFACE_API_KEY || process.env.VITE_HUGGINGFACE_API_KEY || '',

  ytClientId: process.env.YOUTUBE_CLIENT_ID || '',
  ytClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
  ytRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
  ytPrivacy: process.env.YOUTUBE_PRIVACY || 'public',

  dryRun: process.env.DRY_RUN === '1',
  ttsWorkers: Number(process.env.TTS_WORKERS || 3),
};

/**
 * Font names handed to libass. A repo-local assets/fonts directory wins so the
 * output looks identical on Windows and on the ubuntu-latest runner; otherwise
 * we fall back to whatever each OS ships (Tahoma renders Arabic correctly on
 * Windows, Noto on Ubuntu).
 */
export function fontConfig() {
  const hasLocal = fs.existsSync(paths.fonts) && fs.readdirSync(paths.fonts).some(f => /\.(ttf|otf)$/i.test(f));
  if (hasLocal) {
    return { dir: paths.fonts, en: process.env.FONT_EN || 'Montserrat', ar: process.env.FONT_AR || 'Noto Sans Arabic' };
  }
  const onWindows = process.platform === 'win32';
  return {
    dir: null,
    en: process.env.FONT_EN || (onWindows ? 'Segoe UI' : 'DejaVu Sans'),
    ar: process.env.FONT_AR || (onWindows ? 'Tahoma' : 'Noto Sans Arabic'),
  };
}

export function levelConfig(level) {
  const cfg = channel.levelConfig[level];
  if (!cfg) throw new Error(`Unknown level: ${level}`);
  return cfg;
}

export function skillConfig(skill) {
  const cfg = channel.skillConfig[skill];
  if (!cfg) throw new Error(`Unknown skill: ${skill}`);
  return cfg;
}
