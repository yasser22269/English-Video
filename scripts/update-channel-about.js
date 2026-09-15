#!/usr/bin/env node
/**
 * Publish config/channel-about.txt as the channel description, with the About
 * text localised into every language in channel.youtube.localizations.
 *
 *   node scripts/update-channel-about.js           # dry run: prints the translations
 *   node scripts/update-channel-about.js --apply   # one channels.update, 50 quota units
 *
 * YouTube shows a visitor the About localisation that matches their interface
 * language, so the English text stays the default and nobody sees a section in
 * a language they do not read. Read-modify-write on brandingSettings: posting a
 * partial object wipes the fields that were left out.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { channel, env, paths } from '../src/lib/config.js';
import { generateJson } from '../src/lib/llm.js';
import { quotaStatus, spendQuota } from '../src/lib/youtube.js';

const APPLY = process.argv.includes('--apply');
const about = fs.readFileSync(path.join(paths.root, 'config/channel-about.txt'), 'utf8').trim();
const languages = (channel.youtube.localizations || []).filter(l => l !== channel.youtube.defaultLanguage);

const prompt = `Translate this YouTube channel description for an English-teaching channel into each target language.
Keep the line breaks, the emoji, the level codes (A1 A2 B1 B2 C1), the times and "UTC" exactly as they are.
Write naturally, the way a learner in that language would read it — not word for word.
Also give a channel title in each language: "Daily English Lessons" rendered naturally, max 60 characters.

DESCRIPTION:
${about}

Languages: ${languages.join(', ')}
Return ONE JSON object: { ${languages.map(l => `"${l}": { "title": "...", "description": "..." }`).join(', ')} }`;

const raw = await generateJson(prompt, {
  temperature: 0.3,
  maxTokens: 6000,
  validate: (j) => {
    const ok = languages.filter(l => j?.[l]?.description && /A1/.test(j[l].description) && /UTC/.test(j[l].description));
    if (ok.length < languages.length - 1) throw new Error(`only ${ok.length}/${languages.length} usable translations`);
  },
});

const localizations = {};
for (const l of languages) {
  const t = raw?.[l];
  if (!t?.description || !/A1/.test(t.description) || !/UTC/.test(t.description)) continue;
  localizations[l] = { title: String(t.title || channel.channelName).slice(0, 60), description: String(t.description).slice(0, 1000) };
}

for (const [l, v] of Object.entries(localizations)) {
  console.log(`\n[${l}] ${v.title}\n${v.description.split('\n').slice(0, 3).join('\n')}`);
}
console.log(`\n${Object.keys(localizations).length}/${languages.length} languages`);
if (!APPLY) { console.log('DRY RUN — add --apply to publish.'); process.exit(0); }

// channels.update accepts exactly one part per request, so this is two calls.
if (quotaStatus().remaining < 100) { console.log('not enough quota left today (needs 100)'); process.exit(1); }

const auth = new google.auth.OAuth2(env.ytClientId, env.ytClientSecret, 'http://localhost:8765/callback');
auth.setCredentials({ refresh_token: env.ytRefreshToken });
const yt = google.youtube({ version: 'v3', auth });

const cur = (await yt.channels.list({ part: ['brandingSettings', 'localizations'], mine: true })).data.items[0];
const branding = JSON.parse(JSON.stringify(cur.brandingSettings));
branding.channel = { ...branding.channel, description: about, defaultLanguage: channel.youtube.defaultLanguage };

const b = await yt.channels.update({ part: ['brandingSettings'], requestBody: { id: cur.id, brandingSettings: branding } });
spendQuota(50, 'channel about');
console.log('\nlive description length:', b.data.brandingSettings.channel.description.length, '· keywords preserved:', (b.data.brandingSettings.channel.keywords || '').length > 0);

// Any existing English-variant localisation (Studio had left an en_US copy of
// the old Cairo-time, Arabic-only text) is overwritten with the current About,
// so no English visitor is shown the stale version.
const english = Object.fromEntries(Object.keys(cur.localizations || {})
  .filter(k => k.startsWith('en'))
  .map(k => [k, { title: cur.localizations[k].title || channel.channelName, description: about }]));

const l = await yt.channels.update({
  part: ['localizations'],
  requestBody: { id: cur.id, localizations: { ...english, ...localizations } },
});
spendQuota(50, 'channel localizations');
console.log('live localizations:', Object.keys(l.data.localizations || {}).join(', '));
