# English Every Day

An automated YouTube channel that publishes **three English lessons and two Shorts a day**: A1 and A2 daily, with B1/B2 alternating. C1 remains available for manual builds only. Skills rotate through speaking, vocabulary, reading and listening.

The workflow starts at **06:17 UTC** and builds/uploads Shorts first. Planned UTC slots:

| Content | Time |
|---|---|
| First Short | 14:00 |
| A1 | 15:00 |
| A2 | 16:30 |
| B1 or B2 | 18:00 |
| Second Short | 19:00 |

The Shorts slots are five hours apart. A slot already past when its build finishes falls back to immediate publication; delayed runs can therefore miss the planned spacing. Quota resets at Pacific midnight (07:00/08:00 UTC); the earlier workflow can start before reset, and accounting always follows the actual Pacific date.

Everything from writing the script to publishing runs unattended in GitHub Actions.

---

## Why five a day and not twenty

The YouTube Data API gives a project **10,000 quota units per day**, and one `videos.insert` costs **1,600** (a thumbnail is another 50). That is a hard ceiling of about six automated uploads per day. Five uploads cost 8,000 units before thumbnails, playlists and comments; the full daily budget below leaves maintenance headroom, not a full upload retry.

There is a second reason. High upload volume on one channel demonstrably dilutes reach — the sibling project cut from twelve uploads a day to three after the long-form uploads flatlined.

`src/lib/youtube.js` tracks spend in `state/quota.json` and refuses to start an upload that would go over.

### The daily budget

| Operation | Calls/day | Units |
|---|---|---|
| `videos.insert` — 3 lessons + 2 Shorts | 5 | 8,000 |
| `thumbnails.set` — long lessons only | 3 | 150 |
| `playlistItems.insert` — long level + skill only | 6 | 300 |
| `commentThreads.insert` — optional question comments | 5 | 250 |
| **Publishing total** | | **8,700 / 10,000** |
| Maintenance headroom (before reads/playlist creation) | | **1,300** |

B1 and B2 share the alternating slot; C1 is excluded from automatic rotation. Shorts retain their A1/A2-weighted level cycle. Localised titles and descriptions in eight languages ride inside `videos.insert` at no extra cost. Enabling `youtube.playlists.shorts` adds 100 units/day; new playlists cost 50 units each plus discovery reads. Question comments default on, cost 50 units per attempted request, and warn/continue if the token lacks permission or comments are disabled. The API cannot pin comments.

### Research tools

```bash
node scripts/keywords.js markets "learn english"          # autocomplete in 8 markets
node scripts/keywords.js expand "english words for"       # a-z expansion
node scripts/keywords.js topics --level a1                # demand score per curriculum topic
node scripts/reach-report.js                              # impressions + CTR (Reporting API)
node scripts/retitle-published.js                         # dry-run the back-catalogue refresh
node scripts/retitle-published.js --sample 30 --seed e6     # offline E6 assignment preview
node scripts/link-shorts.js --limit 20                    # offline link back-fill preview
node scripts/refresh-playlists.js                         # sync live playlist titles/descriptions
node scripts/update-channel-about.js                       # publish config/channel-about.txt in 8 languages
node scripts/weekly-report.js                              # same-age cohort report (also runs every Monday)
```

Each long lesson joins two playlists — its level and its skill — so a viewer who finishes one has an obvious next one either way. Ids are cached in `state/playlists.json`, so the 50-unit create happens once per playlist rather than once per day. Either axis can be turned off in `config/channel.json` under `youtube.playlists`. Shorts join neither by default; opt into a single Shorts playlist with `youtube.playlists.shorts`.

Retitling defaults to dry-run. `--sample N --seed S` deterministically assigns N treated A1/A2 long lessons and N controls matched by level, skill and nearest publication date. Only `--apply` persists the assignment to `state/experiments/e6-retitle.json` and updates treated videos (title only, no new descriptions/localizations); successful updates write titles back to history. Reusing the same assignment resumes it, and ordinary maintenance protects both arms. The daily workflow previews E6 instead of mass-retitling the catalogue. `--limit N` caps changes; each update costs 50 units.

`link-shorts.js` previews line-2 full-lesson links from local history/build metadata without API calls. With `--apply`, it checks live snippets, skips existing links, preserves other snippet fields and accounts for each 1-unit read and 50-unit update; `--limit N` caps edits. Shorts-player description links are not clickable: set the Related video in Studio manually (the API cannot set it).

---

## What each lesson looks like

Every format opens on teaching, not on a title card, and runs **comprehensible first, challenge last** — month one's retention curves showed viewers leaving exactly where the video asked them to follow English they could not yet read.

**Vocabulary** — ten words. Each gets a card with an illustration, IPA, part of speech and its translation, then its examples and collocation on their own frames, and a silence to repeat. Ends with a recap and four gap-fill questions.

**Reading** — the text from the first second: read line by line with the translation, then the key words from it, then the whole text again at natural speed, then comprehension questions.

**Listening** — a two-person conversation over stock footage, first with the karaoke line and translation, then key phrases and comprehension questions, and finally a **no-text challenge** pass for the viewers who stayed.

**Speaking** — opens on three of the phrases, then listen-and-repeat drills with a pronunciation point and a silence scaled to each phrase. Ends with a model dialogue and a shadowing round.

**Short** — vertical 1080x1920, under a minute: a hook, three words with a picture and an example each. Topics prefer the most recent published same-level long lesson aged 3–14 days with no published Short for that topic, falling back to the independent Short rotation. Five title patterns rotate without a 60-second promise. Paired lessons supply the specific CTA and description link; long lessons link back when a published matching Short exists.

The translation language is one block in `config/channel.json` (`translation`); titles and descriptions are localised separately into the languages in `youtube.localizations`.

---

## How it sounds

The hard requirement was that it must not sound like a machine reading a page. Three things get it there:

1. **A better source.** `edge_tts.Communicate` is hard-coded to 48 kbps. `scripts/tts_worker.py` talks to the same endpoint directly and asks for **96 kbps** — identical voices and word timings, half the codec artefacts. (48 kHz formats are refused by this endpoint, so ~11 kHz is the bandwidth ceiling.)
2. **Mastering that respects that ceiling.** No air shelf, no exciter, no fake room — on a 24 kHz source those amplify codec mush and ring. What is left is a highpass, a low-mid cut, a presence lift at 2.4 kHz, a de-esser, one compressor, and EBU R128 to −15 LUFS. Presets: `raw`, `clean`, `broadcast` (default), `warm`.
3. **Rhythm.** Each sentence is synthesized separately with a deterministic ±3 % nudge in rate and pitch, trimmed to its own first and last word, and spaced by a pause chosen from its final punctuation. Nothing in the track holds a constant tempo.

Compare presets by ear:

```bash
npm run preview:audio              # all five levels, all four presets
npm run preview:audio -- --level b1
```

### Voices

One male voice per level, at a speed that suits it:

| Level | Rate | Teacher | Dialogue A | Dialogue B |
|---|---|---|---|---|
| A1 | −16 % | Andrew (US) | Brian (US) | Ryan (UK) |
| A2 | −11 % | Brian (US) | Andrew (US) | Christopher (US) |
| B1 | −6 % | Guy (US) | Brian (US) | Ryan (UK) |
| B2 | −2 % | Ryan (UK) | Andrew (US) | Eric (US) |
| C1 | ±0 % | Christopher (US) | Thomas (UK) | Roger (US) |

---

## How the picture is made

Word timings come back from the TTS service, so the on-screen line is highlighted word by word exactly in time with the voice, and the Arabic translation sits underneath it. Both are burned in as an ASS subtitle track, which libass renders far faster than rendering thousands of frames in a browser.

- **Vocabulary and reading** — Puppeteer renders one still per scene; ffmpeg turns the stills into a slideshow and burns the caption track on top, in a single encode.
- **Listening and speaking** — a graded, looped stock clip from Pexels or Pixabay underneath, with time-gated branded overlays and the same caption track.

---

## Setup

### 1. Keys

```bash
cp .env.example .env.local
```

Fill in what you have. Only one LLM key is strictly required; the rest degrade gracefully.

| Variable | Needed for | If missing |
|---|---|---|
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | writing the lesson | at least one is required |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | stock footage, photo fallback | a generated gradient background |
| `IMAGE_PROVIDER=pollinations` | word illustrations (free, no key) | letter placeholder cards |
| `YOUTUBE_*` | publishing | build locally with `--no-upload` |

### 2. YouTube

```bash
npm run auth:youtube
```

OAuth requests `youtube.force-ssl` for comments and `yt-analytics.readonly` for measurement as well as upload/channel scopes. Older refresh tokens must be re-authorized manually and the CI secret updated.

Before you run it: in Google Cloud Console, set the OAuth consent screen's publishing status to **In production**. A refresh token issued while the app is in *Testing* silently expires after seven days, and every run will then fail at the credential check.

### 3. Repository secrets

```bash
gh secret set GEMINI_API_KEY --body "..."
gh secret set GROQ_API_KEY --body "..."
gh secret set PEXELS_API_KEY --body "..."
gh secret set PIXABAY_API_KEY --body "..."
gh secret set YOUTUBE_CLIENT_ID --body "..."
gh secret set YOUTUBE_CLIENT_SECRET --body "..."
gh secret set YOUTUBE_REFRESH_TOKEN --body "..."
```

Optional repository *variables*: `AUDIO_PRESET`, `IMAGE_PROVIDER`, `YOUTUBE_PRIVACY`, `GEMINI_MODEL`, `GROQ_MODEL`.

---

## Running it

```bash
npm run plan                                    # what would today build?
npm run daily                                   # today's five, uploaded
node src/generate.js --no-upload                # today's five, local only
node src/generate.js --level b1 --skill listening --no-upload
node src/generate.js --date 2026-09-01 --plan
```

Useful flags:

- `--no-upload` — build without publishing. **Does not consume a topic** from the rotation, so rehearsals are free.
- `--fresh` — rewrite the lesson script instead of reusing a cached `lesson.json`.
- `--only a1` — restrict today's batch to one level.

Each build lands in `output/<date>-<level>-<skill>-<topic>/` with the lesson JSON, per-line audio, frames, caption files, thumbnail and the finished MP4.

Failures are isolated per level: if B2 cannot be written, the other four still publish and the summary says what went wrong.

---

## Content rotation

`config/curriculum/<level>.json` holds 48 topics per level, each with a grammar focus and stock-footage keywords. Optional `searchTopic` supplies a query-shaped label without changing the stable `topic` rotation key. `state/used-topics.json` records what has already been used for each `(level, skill)` pair, and a topic is not reused until every other topic has had its turn — 48 unique lessons per skill per level, about six months before the first repeat, and the repeat is a different lesson because the script is written fresh each time.

History also records search topics, pairing IDs, opening variants and available title-pattern indices. `experiments.newOpening: "alternate"` supports the other worker's opening test; `experiments.midAsk: true` enables the mid-lesson ask.

---

## Layout

```
config/channel.json          levels, voices, rates, colours, YouTube metadata
config/curriculum/*.json     topic banks
src/generate.js              orchestrator
src/lib/schedule.js          which level gets which skill today, topic rotation
src/lib/lesson.js            per-skill prompts, validation, title/description
src/lib/llm.js               Gemini → Groq → OpenRouter with quota awareness
src/lib/build.js             lesson JSON → scenes and narration lines
src/lib/tts.js               worker pool, prosody jitter, timeline assembly
src/lib/ffmpeg.js            mastering presets, loudness, music ducking
src/lib/ass.js               karaoke captions, Arabic line, practice cues
src/lib/render.js            Puppeteer scene and thumbnail rendering
src/lib/compose.js           the single-pass encodes
src/lib/youtube.js           upload with quota accounting
scripts/tts_worker.py        96 kbps Edge TTS client with word boundaries
```

Drop any `.mp3`/`.m4a`/`.wav` into `assets/music/` and it becomes a ducked background bed; leave it empty for voice only.
