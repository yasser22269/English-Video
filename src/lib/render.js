import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';
import { paths } from './config.js';

const SCENE_TEMPLATE = path.join(paths.templates, 'scene.html');
const THUMB_TEMPLATE = path.join(paths.templates, 'thumbnail.html');

/**
 * One browser, one page load, N screenshots. Re-navigating per scene was the
 * slow part of the old pipeline; swapping innerHTML and re-shooting is ~20x
 * faster and matters when a lesson has 80 scenes.
 */
export class SceneRenderer {
  constructor({ width = 1920, height = 1080 } = {}) {
    this.width = width;
    this.height = height;
  }

  async open() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: this.width, height: this.height, deviceScaleFactor: 1 });
    await this.page.goto(pathToFileURL(SCENE_TEMPLATE).href, { waitUntil: 'load' });
    return this;
  }

  /**
   * @param {object} scene  payload for window.renderScene
   * @param {string} outFile PNG destination
   */
  async shoot(scene, outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    // Local images have to be inlined: file:// pages cannot load sibling files
    // reliably across platforms, and a half-loaded <img> would screenshot blank.
    const payload = { ...scene, data: { ...(scene.data || {}) } };
    if (payload.data.image && fs.existsSync(payload.data.image)) {
      const ext = path.extname(payload.data.image).slice(1).toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      payload.data.image = `data:${mime};base64,${fs.readFileSync(payload.data.image).toString('base64')}`;
    } else {
      delete payload.data.image;
    }

    await this.page.evaluate((s) => window.renderScene(s), payload);
    await this.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (payload.data.image) {
      await this.page.evaluate(async () => {
        await Promise.all([...document.images].map(img => img.complete
          ? Promise.resolve()
          : new Promise(res => { img.onload = img.onerror = res; })));
      });
    }

    await this.page.screenshot({ path: outFile, type: 'png', omitBackground: !!scene.transparent });
    return outFile;
  }

  async close() {
    await this.page?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}

/** Thumbnails get their own page: different size, different visual rules. */
export async function renderThumbnail(payload, outFile) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(THUMB_TEMPLATE).href, { waitUntil: 'load' });

    const data = { ...payload };
    if (data.image && fs.existsSync(data.image)) {
      const ext = path.extname(data.image).slice(1).toLowerCase() || 'jpg';
      data.image = `data:${ext === 'png' ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(data.image).toString('base64')}`;
    } else {
      delete data.image;
    }

    await page.evaluate((d) => window.renderThumb(d), data);
    await page.evaluate(async () => {
      await Promise.all([...document.images].map(img => img.complete
        ? Promise.resolve()
        : new Promise(res => { img.onload = img.onerror = res; })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile, type: 'jpeg', quality: 92 });
    return outFile;
  } finally {
    await browser.close().catch(() => {});
  }
}
