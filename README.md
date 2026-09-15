# English Every Day

An automated YouTube channel that publishes **five English lessons a day**, one for each CEFR level, rotating through the four skills.

```
day 0   A1 speaking   A2 vocabulary  B1 reading    B2 listening  C1 speaking
day 1   A1 vocabulary A2 reading     B1 listening  B2 speaking   C1 vocabulary
day 2   A1 reading    A2 listening   B1 speaking   B2 vocabulary C1 reading
day 3   A1 listening  A2 speaking    B1 vocabulary B2 reading    C1 listening
```

Every level walks the full skill cycle every four days, and each day's batch covers all four skills — so the channel never looks like four copies of the same lesson.

Everything from writing the script to publishing runs unattended in GitHub Actions.

---

## Why five a day and not twenty

The YouTube Data API gives a project **10,000 quota units per day**, and one `videos.insert` costs **1,600** (a thumbnail is another 50). That is a hard ceiling of about six automated uploads per day. Five lessons plus five thumbnails spend 8,050 units and leave headroom for a retry.

There is a second reason. High upload volume on one channel demonstrably dilutes reach — the sibling project cut from twelve uploads a day to three after the long-form uploads flatlined.

`src/lib/youtube.js` tracks spend in `state/quota.json` and refuses to start an upload that would go over.

### The daily budget

| Operation | Calls/day | Units |
|---|---|---|
| `videos.insert` — 4 lessons + 1 Short | 5 | 8,000 |
| `thumbnails.set` — lessons only | 4 | 200 |
| `playlistItems.insert` — level + skill, Short level only | 9 | 450 |
| **Publishing total** | | **8,650 / 10,000** |
| `videos.update` — back catalogue, leftover quota | ~20 | ~1,000 |

B2 and C1 share one daily slot (`channel.batch.alternate`) and the freed upload is a vertical Short (`channel.batch.shorts`). After month one A1 earned 9.5 views per video against 1.8 for B2 and C1, and the channel had no Shorts at all. Localised titles and descriptions in eight languages ride along inside `videos.insert` at no extra cost.

### Research tools

```bash
node scripts/keywords.js markets "learn english"          # autocomplete in 8 markets
node scripts/keywords.js expand "english words for"       # a-z expansion
node scripts/keywords.js topics --level a1                # demand score per curriculum topic
node scripts/reach-report.js                              # impressions + CTR (Reporting API)
node scripts/retitle-published.js                         # dry-run the back-catalogue refresh
```

Each lesson joins two playlists — its level and its skill — so a viewer who finishes one has an obvious next one either way. Ids are cached in `state/playlists.json`, so the 50-unit create happens once per playlist rather than once per day. Either axis can be turned off in `config/channel.json` under `youtube.playlists`.

---

## What each lesson looks like

**Vocabulary** — ten words. Each gets a card with an AI-generated illustration, IPA, part of speech and the Arabic meaning; the voice says the word slowly, defines it, gives two examples and a collocation, then leaves a silence for the viewer to repeat. Ends with a recap and four gap-fill questions.

**Reading** — pre-teach the six words that appear in the text, read the passage straight through for gist, then walk it again slowly sentence by sentence with the Arabic underneath, then comprehension questions with a pause to think before the answer is revealed.

**Listening** — a two-person conversation over stock footage. Played **once with no text on screen at all** (that is the part that trains listening), then again slightly slower with the karaoke line and the translation, then key phrases and comprehension questions.

**Speaking** — listen-and-repeat drills. Context, the phrase at natural speed, the pronunciation point, the phrase again slowly, then a silence scaled to the phrase's length with a "Repeat it out loud" cue. Ends with a model dialogue and a shadowing round.

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

`config/curriculum/<level>.json` holds 48 topics per level, each with a grammar focus and stock-footage keywords. `state/used-topics.json` records what has already been used for each `(level, skill)` pair, and a topic is not reused until every other topic has had its turn — 48 unique lessons per skill per level, about six months before the first repeat, and the repeat is a different lesson because the script is written fresh each time.

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
