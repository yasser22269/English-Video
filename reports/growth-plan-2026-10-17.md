# Growth plan — 17 Oct 2026

Read-only analysis of the channel (Daily English Lessons, `@daily_english_lessons_new`,
`UC-o-ibKNt-FpCrSxyTVq9zQ`). No product code, config, state or existing report was changed.

Sources:

- the git data on `origin/main`: `reports/weekly-2026-09-27.md`, `reports/weekly-2026-10-04.md`, `reports/weekly-2026-10-11.md`, `state/history.json` (252 uploads) and `state/quota.json`
- the local reports: `audit-2026-09-01`, `weekly-2026-09-14`, `weekly-2026-09-20`, `keywords-markets-2026-09-15.json`, and the message of commit `be96557`
- a fresh **read-only** pull on 17 Oct from the YouTube Analytics API v2 and the Data API v3. Analytics data runs through **14 Oct**, because the API reports with a 2–3 day lag.
- fresh YouTube autocomplete research made with `scripts/keywords.js`

Note on totals: the Analytics API revises recent days upward, so its weekly totals differ slightly from the
weekly reports. For example, the week of 5–11 Oct shows 736 views in the API against 656 in the report. The
direction of every change is the same in both.

---

## 1. Data summary

### 1.1 Channel snapshot

| Metric | Weekly report, 11 Oct | Fresh, 17 Oct (Data API) | Analytics lifetime, to 16 Oct |
|---|---|---|---|
| Lifetime views | 4,393 ✔ | **4,835** | 4,705 |
| Subscribers | 43 ✔ | **48** | +49 / −4 |
| Videos | 233 ✔ | **252** (all public, processed) | — |
| Watch time | — | — | 1,471 min |
| Avg view duration / % | 37 s / 23.0 % | — | 42 s / 23.2 % |
| Likes / comments / shares | — / 0 | 102 likes · **0 comments** ✔ | 100 · 0 · 38 |

All of the "known facts" check out:

- The views (4,393), subscribers (43) and videos (233) match `weekly-2026-10-11.md`.
- Views went 1,433 → 656. The sources moved as stated: SHORTS 826 → 306, search 265 → 167 and suggested 173 → 72.
- The channel has never had a comment.
- Shorts run 18–31 s.
- B2 and C1 lessons earn close to nothing.

**Mojibake: not real.** The `Â·` sequence is a display artefact.

- The raw bytes of `origin/main:state/history.json` contain 39 correctly encoded `·` (C2 B7) and 0 `Â·`. The old-pattern titles look like `… | A2 · Elementary`.
- No live YouTube title contains `Â` (0 of 252).
- The `Â·` appears when PowerShell decodes the UTF-8 output of `git show` as cp1252.
- Separately, 109 titles in `history.json` no longer match the live titles. `retitle-published.js` changed them on YouTube, so treat the titles in history.json as stale. A dry run of `retitle-published.js` reported 0 pending changes.

**Missing uploads**, from history.json and the state-commit times:

- 8 Oct: 2 uploads instead of 5 (1 Short, 1 A1 reading).
- 12 Oct: **0 uploads**. No state commit exists, so the run did not complete.
- 27 Sep, 28 Sep, 4 Oct and 16 Oct: 4 uploads each.

### 1.2 Weekly views by content type (Analytics, Monday–Sunday)

| Week of | Shorts views | Long views | Total | Subs from Shorts | Subs from long | Long watch min |
|---|---|---|---|---|---|---|
| 14 Sep | 296 | 263 | 559 | 2 | 0 | 185 |
| 21 Sep | 894 | 341 | 1,235 | 3 | 7 | 203 |
| 28 Sep | **1,024** | **409** | **1,433** | 3 | 7 | 264 |
| 5 Oct | **464** (−55 %) | **272** (−33 %) | **736** | 1 | 5 | 134 |
| 12 Oct (3 days) | 113 | 165 | 278 | 0 | 3 | 129 |

The week-on-week drop was −697 views. Shorts account for −560 of it (80 %) and long-form for −137 (20 %).

### 1.3 Weekly views by traffic source (Analytics)

| Source | 14 Sep | 21 Sep | 28 Sep | 5 Oct | Δ 28 Sep → 5 Oct | 12 Oct (3 d) |
|---|---|---|---|---|---|---|
| SHORTS feed | 262 | 757 | 826 | 326 | **−500 (−61 %)** | 70 |
| YT_SEARCH | 107 | 219 | 265 | 199 | −66 (−25 %) | 102 |
| RELATED_VIDEO | 83 | 137 | 173 | 79 | −94 (−54 %) | 39 |
| SUBSCRIBER | 28 | 35 | 76 | 53 | −23 | 7 |
| EXT_URL | 51 | 38 | 39 | 43 | +4 (flat) | 44 |
| PLAYLIST | 5 | 8 | 9 | 8 | — | 3 |
| YT_CHANNEL | 2 | 9 | 15 | 3 | — | 3 |

### 1.4 Last 28 days (19 Sep – 16 Oct): what each format does

| | Shorts | Long lessons |
|---|---|---|
| Views | **2,662 (68 %)** | 1,263 (32 %) |
| Subscribers gained | **8** | **22** |
| **Subs per 100 views** | **0.30** | **1.74 (5.8×)** |
| Likes / shares | 68 / 6 | 17 / 17 |
| Main sources | SHORTS feed 2,128 · **search 480** | related 450 · search 343 · EXT_URL 183 (of which Google Search 114) · subscribers 169 |
| Device | 84 % mobile | 51 % mobile, **39 % desktop** |

Another 7 subscribers came from "unspecified" sources, such as the channel page. Of the 823 search views in
the period, 58 % went to Shorts.

Playback location: SHORTS_FEED 2,452 · WATCH 1,290 · BROWSE 134 · EMBEDDED 49.
Operating system: Android 2,409 · iOS 744 · Windows 589 · macOS 110.
Subscribed vs unsubscribed viewers: 137 views at 29.5 % average view percentage against 3,788 views at 23.3 %. So 96.5 % of views come from non-subscribers.

### 1.5 Performance by level

Last 28 days, counting videos with at least one view:

| Kind / level | Videos | Views | Views per video | Avg view % | Avg view duration | Subs | Subs/100 views |
|---|---|---|---|---|---|---|---|
| Short A1 | 16 | 904 | 56.5 | 105 % | 21 s | 2 | 0.22 |
| Short A2 | 14 | 1,228 | **87.7** | 72 % | 18 s | 5 | 0.41 |
| Short B1 | 8 | 393 | 49.1 | 69 % | 18 s | 1 | 0.25 |
| Short B2 | 4 | 133 | 33.3 | 76 % | 20 s | 0 | 0 |
| Long A1 | 42 | 420 | **10.0** | 21.9 % | 40 s | 7 | 1.67 |
| Long A2 | 40 | 318 | 8.0 | 18.1 % | 44 s | 7 | 2.20 |
| Long B1 | 25 | 224 | 9.0 | 21.8 % | **71 s** | 6 | **2.68** |
| Long B2 | 24 | 147 | 6.1 | 17.3 % | 57 s | 2 | 1.36 |
| Long C1 | 23 | 135 | 5.9 | **14.7 %** | 49 s | **0** | **0** |

Lifetime views per video (Data API) tell the same story:

- Shorts: A2 82.8 · A1 64.3 · B1 49.9 · B2 30.4.
- Long lessons: A1 14.0 · A2 10.0 · B1 9.5 · B2 7.1 · C1 6.3.

By long-lesson format (28 days):

| Format | Views | Avg view % | Avg view duration | Subs |
|---|---|---|---|---|
| Listening (conversation) | 497 | 20.9 % | 59 s | 6 |
| Reading (story) | 297 | 21.5 % | 51 s | 7 |
| Speaking (shadowing) | 247 | 15.8 % | 34 s | 3 |
| Vocabulary | 203 | 18.3 % | 45 s | 6 |

### 1.6 Publish-week cohorts

Lifetime views as of 17 Oct, so older cohorts have had more time:

| Published week | Shorts | Short views | **Per Short** | Best Short | Long videos | Long views | Per long |
|---|---|---|---|---|---|---|---|
| 14 Sep | 5 | 344 | 68.8 | 131 | 30 | 183 | 6.1 |
| 21 Sep (1 Short/day) | 6 | 861 | **143.5** | **532** | 28 | 372 | 13.3 |
| 28 Sep (2 Shorts/day starts) | 14 | 1,102 | 78.7 | 173 | 19 | 281 | 14.8 |
| 5 Oct | 13 | 376 | **28.9** | 51 | 19 | 133 | 7.0 |
| 12 Oct (young) | 7 | 187 | 26.7 | 41 | 12 | 35 | 2.9 |

Shorts distribution is driven by hits. One Short, "Talking on the Phone at Work (A2)", earned 532 views, which
is 20 % of all Shorts views in the 28 days. Since 5 Oct, no Short has passed 51 views.

### 1.7 Long-form audience retention

Lifetime retention curves for the eight long lessons with the most views:

| Lesson | Length | at ~10 s | at ~30 s | at ~60 s | End | Relative retention at ~30 s* |
|---|---|---|---|---|---|---|
| Numbers, Age and Phone Numbers (vocab A1) | 207 s | 70 % | 50 % | 33 % | 13 % | 0.14 |
| Learning Languages Faster (story B1) | 303 s | 70 % (15 s) | 53 % | 33 % | 6 % | 0.12 |
| Describing Your Best Friend (conv A2) | 269 s | 56 % (13 s) | 41 % (27 s) | 24 % | 7 % | 0.20 |
| Transport and Travel (speaking A1) | 175 s | 72 % (9 s) | 44 % (26 s) | 23 % | 8 % | 0.05 |
| In the City (conv A1) | 206 s | 57 % | **27 %** | 20 % | 3 % | 0.08 |
| Feelings and Emotions (conv A1) | 194 s | 77 % | 52 % | 26 % | 10 % | 0.40 |
| Colours and Clothes (conv A1) | 186 s | **53 %** (9 s) | 44 % | 16 % | 3 % | 0.05 |
| Talking About Your Studies (vocab A2) | 276 s | 53 % (14 s) | 32 % | 21 % | 11 % | 0.075 |

\* `relativeRetentionPerformance` compares a video with YouTube videos of similar length on a 0–1 scale, where
0.5 is median. Almost every opening sits in the bottom 10–20 %.

Retention does not depend much on length:

| Length bucket (videos with ≥5 views) | Videos | Avg view % | Avg view duration |
|---|---|---|---|
| < 3 min | 13 | 25.8 % | 41 s |
| 3–4.5 min | 49 | 20.6 % | 45 s |
| 4.5–6 min | 32 | 20.4 % | 62 s |
| > 6 min | 17 | 19.5 % | 76 s |

Shorts retention curves:

- Talking on the Phone at Work (25 s): 141 % at 0 s, 86 % at 8 s, 47 % at the end.
- My Friends (19 s): 42 % at the end.
- Breakfast, Lunch and Dinner (21 s): 36 % at the end.
- Holiday Memories (25 s): 56 % at 8 s and **8 %** at the end.

The good Shorts loop, meaning more than 100 % of viewers are still watching at the start. Weak Shorts lose
half their viewers by 8 s.

### 1.8 Search terms

YT_SEARCH terms, 19 Sep – 16 Oct, top 25 shown, all with 1–5 views each:

`giving instructions` 5 · `beach ball` 4 · `confidence` 3 · `a1 english` 2 · `b2 cambridge` 2 · `countries and
nationalities` 2 · `directions` 2 · `directions in english` 2 · `english phone call conversation` 2 · `lunch
spelling` 2 · `shadowing english speaking practice c1` 2 · `swimming lessons for adults` 2 · `transportes em
inglês` 2 · `a day at the beach` · `a1 playlist` · `angreji photo` · `bánh trung thu` · `dinner spelling` ·
`describe your best friend` · `phrasal verbs with get` · `shadowing a2` · `technology pronunciation` · `tiếng anh
nhà hàng` …

What the terms show:

- The listed terms add up to only about 50 of the roughly 820 search views. The rest is a long tail below YouTube's reporting threshold.
- Search hits come from **topic nouns** ("directions", "lunch", "beach ball", "giving instructions") and from "topic + english" phrasings. None come from the head terms such as "learn english", "english for beginners" or "english vocabulary".
- Searches arrive in several languages: Portuguese, Vietnamese, Hindi transliterated ("angreji"), Korean and Spanish.
- The format phrases that already match real searches are `shadowing … a2` and `english phone call conversation`.

### 1.9 Autocomplete demand

Fresh autocomplete research with `scripts/keywords.js`:

- `topics --level a1` → `reports/keywords-topics-2026-10-17.json`. **10 of 48 A1 topics have zero autocomplete demand**, almost all of them compound names: "Numbers, Age and Phone Numbers", "Colours and Clothes", "Birthdays and Celebrations", "Making Plans with Friends", "Things in My Bag", "Technology at Home", "Sports I Play", "Simple Online Shopping", "Saying Goodbye Politely" and "Common Verbs of Movement". Simple place and object topics score at the cap of about 40: "My Family", "In the Classroom", "The Weather", "Parts of the Body", "In the City", "My Friends", "At the Hotel", "At the Restaurant", "At the Airport", "On the Phone" and "Fruits and Vegetables".
- `expand "english words"` → `reports/keywords-expand-2026-10-17.json`. This produced 252 suggestions, including `english words with pictures`, `english words with meaning in arabic`, `english words you must know`, `english words used in daily life` and `english words pronunciation`.
- `markets "english vocabulary"` → `reports/keywords-markets-2026-10-17.json`. Level codes show up in every market: `english vocabulary a1`, `b1`, `b2` and `c1`.

Extra probes, made with `suggest()` and saved nowhere:

- `english conversation at the …` completes to restaurant, airport, hotel, supermarket, bank and doctor.
- `english conversation for beginners …` completes to `a1`, `with subtitles`, `slow`, **`with arabic translation`** and `– greetings and introductions`.
- `daily use english sentences` is a strong suggestion.
- `phone call english conversation` is a strong suggestion.
- `english listening practice for beginners a1` and `… slow` both appear.
- `learn english through story level 1…6` all appear.
- `english shadowing a1/a2/b1/b2` all appear.

### 1.10 Publish times

The schedule in config is not what happens:

- The workflow cron is 08:17 UTC, but state commits land between **13:29 and 17:29 UTC** every day. That is the GitHub queue delay plus about an hour of building.
- The 12:30 Short slot and the 13:00 A1 slot therefore can never be met. **0 of 29** "first" Shorts have a `publishAt`; they go out whenever the run ends, between 13:42 and 17:29 UTC.
- 35 of 50 long lessons since 28 Sep also published immediately.
- The second Short (18:00) sometimes lands **1 minute** after the first. On 28 Sep they went out at 16:59 and 18:00, and on 5 Oct at 17:29 and 18:00.
- Since 28 Sep, actual publish hours (UTC) for long lessons were 13:00 ×4, 14:00 ×10, 15:00 ×13, 16:00 ×11, 17:00 ×7 and 19:00 ×5.

### 1.11 What I could not pull

| Wanted | Result |
|---|---|
| Impressions and thumbnail CTR | **Failed.** The YouTube Reporting API returned `Insufficient Permission`. The local token's scopes are only `youtube` and `youtube.upload`, without `yt-analytics.readonly`. `scripts/youtube-auth.js` already requests that scope, so the token in `.env.local` predates the change. I could not tell whether the CI secret has the scope. |
| Audience geography | Effectively unavailable. Country rows fall under privacy thresholds: the 28-day query returned 4 rows, all 0, and lifetime shows only BR 25 and US 19. The search-term languages above are the best proxy. |
| Age / gender | 0 rows (below threshold). |
| Shorts → long-form click-through (`SHORTS_CONTENT_LINKS`) | `The query is not supported` in the API. Read it in Studio under Analytics → Content → the video → Traffic source. |
| Search terms per video | Not supported as a query. |
| Whether comments are enabled | `commentThreads.list` returned `Insufficient Permission`, because it needs `youtube.force-ssl`. `madeForKids=false`, so comments are not forced off by that setting. |
| Audience active hours | Not exposed by the API. Available in Studio under Audience → "When your viewers are on YouTube". |

---

## 2. Hypotheses: verdicts and evidence

### H1. The 5–11 Oct drop is mainly a Shorts distribution drop, from sameness/fatigue or the missed days

**Verdict: mostly true, but missed days are not the cause.**

- **Shorts made 80 % of the drop.** The SHORTS feed lost 500 views and total Shorts views fell 560 out of a 697-view decline.
- **Long-form also fell 33 %.** RELATED fell 54 % (173 → 79), so long-form did not hold steady. The 28 Sep week was lifted by one long hit, "Learning Languages Faster" (86 views, published 28 Sep), and by the subscriber spike from the late-September Short hits (SUBSCRIBER 35 → 76 → 53).
- **The missed days explain at most a day each.** 12 Oct, a day with no upload, recorded 11 Shorts views, the lowest of any day since Shorts began, against a 3-day neighbourhood average of about 50. A missed day costs that day's Shorts views, because the feed pushes each new Short for about 48 h. But daily Shorts views had already fallen on 5–7 Oct, from an average of 146/day in the 28 Sep week to 92, 63 and 55, before the 8 Oct gap. The 8 Oct gap removed one Short, worth about 30–50 views at the cohort's rate, which is well under 10 % of the weekly loss.
- **The real mechanism is fewer breakouts.** Per-Short views by cohort went 143.5 → 78.7 → **28.9**. No Short since 5 Oct has passed 51 views; before that, five of fourteen passed 95.
- **Sameness is plausible but not proven.** All 46 Shorts share one title template ("{topic}: 3 English Words in 60 Seconds ({level}) #shorts"), one structure and one length band. The weak recent Shorts are mostly low-demand or abstract topics: "At the Park" 6 views, "Learning a New Skill" 9, "Healthy Habits" 11, "The Weather" 13, "Describing a Place You Love" 13. A topic or level effect is just as likely as fatigue: B2 Shorts average 30 views against 83 for A2.

### H2. Shorts barely convert to long-form or subscribers, and nothing in a Short links to the lesson

**Verdict: true, and it is the cheapest gap to close.**

- Shorts bring **0.30 subscribers per 100 views** against **1.74** for long lessons, which convert 5.8× better. Shorts produced 68 % of the views and 8 of the 37 subscribers in the 28 days.
- Nothing in a Short points to the lesson:
  - **Description:** no link, only the opener, the word list and hashtags.
  - **On-screen end frame:** a generic "Full lesson on the channel" (`src/templates/short.html`, `short-end`).
  - **Spoken CTA:** the LLM's `cta` field, which `src/lib/lesson.js` `PROMPTS.short` defines as "telling them the full lesson is on the channel", followed by `buildShort` in `src/lib/build.js`.
  - **Related video:** not set, and the Data API cannot set it.
- The link target usually exists already: **28 of 46 Shorts** have a long lesson with the same topic and level, and for 22 of them it was published on or before the Short's date.
- Limits to plan around:
  - Links in Shorts descriptions and comments are **not clickable** in the Shorts player.
  - The Data API **cannot pin** a comment and cannot set the Shorts "Related video".
  - Posting comments at all needs the `youtube.force-ssl` scope, which the current token lacks.
- So the effective link is the Studio **Related video** field, which is manual and costs 0 quota, supported by a spoken and on-screen CTA that names the lesson.

### H3. Long-form loses viewers in the first 30 s, the hook is the main lever, and A1/A2 lessons may be too long

**Verdict: the first half is true; "too long" is false.**

- Viewers leave very early: 23–47 % are gone by about 10 s and 47–73 % by about 30 s. Relative retention at 30 s is 0.05–0.40 (table 1.7), mostly in the bottom quintile for videos of similar length.
- Length is not the problem:
  - Average view percentage is about **flat at ~20 %** from 3 to over 6 minutes, and average view duration *rises* with length (41 s → 76 s).
  - A1 lessons already average only 188 s.
  - Shortening would cut watch time without fixing the exit point.
- The curves flatten after about 60 s. Viewers who stay that long tend to stay, so effort should go into the first 10–20 s.
- What the opening is now, in `src/lib/build.js` `coldOpen()`: a taste beat, then a full-screen `title` scene, then the hook sentence. The LLM hook rule forbids questions ("never a tease, never a question").
- Format matters too. Speaking/shadowing has the worst average view percentage (15.8 %) and the worst average view duration (34 s). "Transport and Travel (speaking A1)" has a relative retention of 0.05.

### H4. Search is the #2 and most durable source; titles are topic-first and tags generic

**Verdict: half true. Search is durable, but the titles are already query-shaped; the topic names are the weak part.**

- **Search is durable.**
  - Across 28 days search brought 823 views (21 %), second only to the Shorts feed.
  - Week on week it fell 25 %, while the Shorts feed fell 61 % and suggested 54 %.
  - In the 3 days of 12–14 Oct it was already back to 34 views/day. 14 Oct had 61 search views, the second-best day on record.
  - Google web search (EXT_URL → Google Search, 114 views in 28 days) is the steadiest external source, at about 40 views/week. Those visits watch the most per view: 173 min across 183 EXT_URL views. Chapters (Google "key moments") are part of why.
- **The titles are not purely topic-first any more.** Current long patterns carry the query family:
  - "Learn English Through Story Level N (A1)"
  - "English Conversation Practice (A1 Beginner)"
  - "English Speaking Practice & Shadowing"
  - "N English Words with Pictures"
  
  These match real autocomplete. The hypothesis's example is the old pattern, and `retitle-published.js` has already converged the catalogue (dry run: 0 pending).
- **The weak part is the topic string.** Compound curriculum names have zero demand ("Colours and Clothes", "Numbers, Age and Phone Numbers"), while searchers type single concepts: "directions", "lunch spelling", "giving instructions", "english phone call conversation". Autocomplete wants "english conversation **at the restaurant**", not "At a Restaurant — English Conversation Practice".
- **The Arabic translation is never mentioned.** Every lesson shows an Arabic translation on screen, yet "with arabic translation" appears nowhere in titles. It is a real autocomplete completion for "english conversation for beginners" and "english words with meaning in arabic".
- **Tags are mostly generic.** About 7 of 15–16 tags are the same `baseTags` on every video. Tags carry little ranking weight, so this is low priority.
- **58 % of search views go to Shorts.** People search single words, and a 25 s Short answers those. Short titles therefore matter for search too, and every Short has the same title.

### H5. Volume and B2/C1 dilute the channel; fewer, better A1/A2 lessons plus more Shorts would do better

**Verdict: true for C1, false for B1, and "more Shorts" is not supported.**

- **C1 earns nothing:** 5.9 views/video, 14.7 % average view percentage, **0 subscribers** in 28 days and 4 zero-view videos in its lifetime. B2 is weak at 6.1 views/video and 1.36 subs/100 views.
- **B1 is the best converter** on the channel: 2.68 subs/100 views and the longest average view duration (71 s). The best long lesson in 28 days was B1. Keep B1.
- **Doubling Shorts did not double views.**
  - Going from 1 to 2 Shorts a day on 28 Sep raised weekly Shorts views only 894 → 1,024 (+15 %).
  - Per-Short views halved, then fell again.
  - The two Shorts now land 1 minute to 4 hours apart and compete with each other.
  - "More Shorts" is the wrong lever; "better Shorts" is the right one.
- **Long lessons are expensive.** Each costs 1,600 + 50 + 100 = **1,750 quota units** and earns 7–15 views in its first week. The quota on 16 Oct was 6,950/10,000 for 4 uploads.

### H6. Zero comments means no engagement signal; ask one answerable question

**Verdict: true, but the ask already exists and is badly placed.**

- `outro()` in `src/lib/build.js` already says "Write one sentence in the comments using something from today", but it comes at the very end. End-of-video retention is **3–13 %**, so roughly 40–160 of the 1,263 long-lesson views in 28 days ever heard it.
- Writing a full sentence is a high-effort ask for an A1 learner.
- Shorts have **no ask at all**, even though 36–60 % of their viewers reach the end.
- I could not verify the Studio comment settings: the token lacks `force-ssl`. A "hold all comments for review" default on a new channel would also produce exactly 0 public comments. Check it in Studio first.

### H7 (mine). CTR and thumbnails may be the real bottleneck for long-form

**Verdict: unknown, so measure before acting.**

- Long-form gets BROWSE 134 and SUBSCRIBER 169 views in 28 days. Without impressions there is no way to tell a thumbnail problem from a topic-demand problem.
- Thumbnails show `lesson.title`, the LLM's "punchy" title, as the headline, plus a level chip (`src/generate.js`, about line 230).
- Fix the OAuth scope first (Quick win Q2) and read CTR for 14 days. A typical small education channel sits at 2–6 %; below 2 % on long-form would justify thumbnail work.

### H8 (mine). Publish times are accidental, not chosen

**Verdict: true that they are accidental; whether time of day matters is inconclusive and low priority.**

- Section 1.10 shows publishing follows when the run finishes, not the schedule.
- Comparing 18:00 Shorts with immediately published Shorts (28 Sep – 15 Oct, n = 17 each) gives 42.5 against 55.5 average views. The split is confounded by level, so there is no evidence that the hour matters.
- The channel description still advertises a "13:00 A1 · … · 19:00 C1" schedule and "a one-minute Short", neither of which is true.

### H9 (mine). Short titles over-promise and are all identical

**Verdict: true; the fix is cheap.**

- Shorts are titled "in 60 Seconds" but run 18–31 s.
- All 46 Short titles share one pattern, so the Shorts shelf and search results show a wall of near-identical titles.
- The topic-word searches that do reach Shorts ("lunch spelling", "beach ball") get there despite the title, not because of it.

### H10 (mine). Shorts sit inside the long-lesson level playlists

**Verdict: true; low impact.**

- History shows each Short joining `level:<lvl>` (for example `PLMUHkdE-F1_Q` for A2).
- A learner binge-watching a level playlist gets a 25 s vertical clip between 4-minute lessons.
- The PLAYLIST source is tiny (31 views in 28 days), so this is cleanup, not growth.

### H11 (mine). Localization and audience language

**Verdict: partly working; geography is unmeasurable.**

- Search terms arrive in Portuguese ("transportes em inglês"), Vietnamese, Hindi, Korean and Spanish, so the 8 localized titles are being matched.
- The burned-in translation is Arabic. The channel country is EG, but the visible geography is BR and US, and country data sits below thresholds.
- Before changing the translation language, read Studio Audience → Geography by hand. The API returns nothing usable here.

### H12 (mine). Brand and channel page are incoherent

**Verdict: true; low impact.**

- The channel name is "Daily English Lessons" and the handle carries a `_new` suffix.
- The thumbnail template's fallback brand reads "English Every Day".
- The About text describes an obsolete schedule.
- YT_CHANNEL brings only about 30 views in 28 days. Fix the About text cheaply; do not rebrand now.

---

## 3. Prioritized actions

Impact: **H** = likely ≥ +20 % on its target metric, **M** = +5–20 %, **L** = hygiene.
Effort: **S** < 1 h · **M** half a day · **L** more than a day.

### 3.1 Quick wins (no code or config only)

| # | Action | Target | Impact | Effort | Quota |
|---|---|---|---|---|---|
| Q1 | **Set the "Related video" on every Short in Studio.** Point it at the same-topic, same-level long lesson (28 of 46 Shorts have one); otherwise use the best lesson of that level, such as "Learning Languages Faster" for B1, "In the City" for A1 or "Describing Your Best Friend" for A2. Start with the 15 Shorts with the most views. Repeat for each new Short until C1 automates the pairing. | Shorts → long views, subs | **H** | S (≈1 min per Short) | 0 (Studio) |
| Q2 | **Re-authorize OAuth** with `yt-analytics.readonly` and `youtube.force-ssl`. Run `npm run auth:youtube` after adding `force-ssl` to `SCOPES` in `scripts/youtube-auth.js`, which is a one-line change. Update `.env.local` and the `YOUTUBE_REFRESH_TOKEN` secret. This unlocks impressions, CTR and comment calls. | Measurement | **H** (enables H7/H6) | S | 0 |
| Q3 | **Check Studio → Settings → Community → Defaults** and make sure comments are not "Hold all for review". Check one Short and one lesson individually as well. | Comments | M | S | 0 |
| Q4 | **Pin a one-tap question comment by hand** on the 10 Shorts and 10 long lessons with the most views, for example "Which word was new for you — 1, 2 or 3? 👇" or "A or B: what does Tom order?". | Comments | M | S | 0 (Studio) |
| Q5 | **Drop C1 from the daily rotation and keep B1.** In `config/channel.json`, change `batch.alternate` from `["b1","b2","c1"]` to `["b1","b2"]`, or make B1 daily with B2 on alternate days. This frees about 1,750 units on C1 days. | Quality, quota | M | S | −1,750 on C1 days |
| Q6 | **Read three Studio panels once** and paste them into the next weekly report: Audience → Geography, "When your viewers are on YouTube", and Shorts → "Related video" clicks. | Measurement | M | S | 0 |
| Q7 | **Correct the channel About text**: 2 Shorts a day, real times, the levels actually published, and "Arabic translation on screen". Use `scripts/update-channel-about.js` after editing `config/channel-about.txt`. | Channel page | L | S | 50 (`channels.update`) |
| Q8 | **Set one end screen by hand** on the 20 long lessons with the most views ("best for viewer" + playlist + subscribe). End screens cannot be set through the API. | Session time | L–M | S | 0 |

### 3.2 Code changes

Each item gives the exact place to change. Quota is per day unless noted.

| # | File / function | Change | Impact | Effort | Quota |
|---|---|---|---|---|---|
| C1 | `src/lib/schedule.js` `todaysShorts()`/`pickTopic()`; `src/generate.js` (where the Short topic is chosen) | **Pair every Short with a published long lesson.** Choose the Short's topic from `state/history.json`: a long lesson at the same level from the last 3–14 days, preferring the most viewed. Store `pairedVideoId` on the Short entry. Today Shorts use an independent `${level}:short` rotation, so only 28 of 46 match by chance. | **H** (H2) | M | 0 |
| C2 | `src/lib/lesson.js` `PROMPTS.short` (`cta`), `src/lib/build.js` `buildShort()` (the `short-end` scene), `src/templates/short.html` `'short-end'` | **Make the CTA specific.** The spoken line names the lesson, e.g. "The full Phone at Work lesson is linked right above my name." The on-screen text replaces "Full lesson on the channel" with `▶ Full lesson: {topic} ({level})` and an arrow pointing at the related-video pill near the bottom. Keep it under 3 s so the loop survives. | **H** (H2) | S | 0 |
| C3 | `src/lib/lesson.js` `buildMetadata()` | **Put the paired lesson link on description line 2 of Shorts**, e.g. `▶ Full lesson: https://youtu.be/<pairedVideoId>`. It is clickable on desktop and in the watch page even though it is not clickable in the Shorts player. Also add a "Watch the 60-second version" line pointing from long lessons back to their Short. | M | S | 0 at upload; back-filling 46 Shorts = 2,300 (`videos.update` 50 each, over 2 days) |
| C4 | `config/channel.json` `skillConfig.short.titlePattern` → array; `src/lib/lesson.js` `buildMetadata()`/`fillPattern()` (pick a pattern by `dayIndex`) | **Rotate 4–5 Short title formats and drop "in 60 Seconds"** (see the SEO section). Use the LLM `title`, which is generated and then discarded for Shorts, as one of the slots. | M–H (H1/H9) | S | 0 |
| C5 | `config/curriculum/*.json` (new optional `searchTopic` per topic); `src/lib/lesson.js` `fillPattern()` (prefer `searchTopic` for `{topic}` in titles and tags) | **Search-shaped topic strings.** "Colours and Clothes" → "Colours in English", "Numbers, Age and Phone Numbers" → "Numbers in English", "At a Restaurant" → "at the Restaurant". Seed from `reports/keywords-topics-2026-10-17.json`; anything scoring 0 gets a rename. | M (H4) | M | 0 for new uploads; retitling old ones through `retitle-published.js` costs 50 each |
| C6 | `config/channel.json` `skillConfig.*.titlePattern` | **Level-aware, query-matching title patterns.** For A1/A2 listening use "English Conversation {at the X} for Beginners ({LEVEL}) — Slow, with Subtitles" (each phrase is a live autocomplete completion). Keep "Learn English Through Story Level N". See section 4. Run it as experiment E6 before a full rollout. | M (H4) | S | Retitle 50 each |
| C7 | `src/lib/build.js` `coldOpen()`; `src/lib/lesson.js` (`hook` rule in all four long prompts) | **Rebuild the first 10 s.** (a) Drop or shrink the full-screen `title` scene to ≤1.5 s, or overlay it on the taste beat. (b) Change the hook rule from "never a question" to "a one-line challenge the viewer can answer in their head, e.g. 'Can you understand this conversation at the hotel? Let's see.'". (c) For listening, start with the first line of dialogue *before* any voice-over. Ship it behind a flag so experiment E4 can alternate days. | **H** (H3) | M | 0 |
| C8 | `src/lib/build.js` `outro()` → new `midAsk()`; `buildShort()` | **Move the comment ask.** Put a one-tap question (`"Which phrase will you use? Comment 1, 2 or 3"`) right after the first quiz or check question, around 40–60 % of runtime, and keep a short reminder in the outro. In Shorts, add a 1.5 s on-screen-only question ("Which one was new? 1, 2 or 3") on the end frame. | M (H6) | S | 0 |
| C9 | `.github/workflows/daily-lessons.yml` `cron`; `src/generate.js` (build Shorts first) | **Make publish slots reachable.** Runs finish at 13:29–17:29 against an 08:17 cron. Move the cron earlier, e.g. `'17 7 * * *'` after the summer quota reset, or keep it and set realistic slots (Shorts 17:00 and 20:00 UTC, long 17:30/18:30/19:30). Build and upload the Shorts first so they are never squeezed together. | L–M (H8) | S | 0 |
| C10 | `src/lib/youtube.js` (new `postComment()` using `commentThreads.insert`) | **After Q2**, post the question from C8 as the channel's own first comment on each upload. The API cannot pin it, so pin it in Studio where it matters. | L–M | S | 50 per video → **250/day** for 5 uploads |
| C11 | `src/lib/youtube.js` `playlistsFor()` | Stop adding Shorts to the long-form level playlists; optionally add a single "3 Words a Day (Shorts)" playlist. | L | S | 0 (saves 50 per Short) |
| C12 | `scripts/retitle-published.js` | Write the live title back to `state/history.json` after an `--apply`, or note that the history titles are stale. 109 of them no longer match YouTube, and any analysis keyed on history titles will be wrong. | L | S | 0 |

The quota budget after these changes, for a typical day with 3 long lessons and 2 Shorts:

| Item | Units |
|---|---|
| 5 inserts | 8,000 |
| 3 thumbnails | 150 |
| 6 playlist adds (8 today) | 300 |
| C10 comments | 250 |
| **Total** | **≈ 8,700** |
| Left for retitles | ≈ 1,300, about 26 `videos.update` |

Dropping C1 (Q5) does not change this, because C1 only ever took the alternating slot. The second Short
remains up for review in E3.

### 3.3 Experiments

Change one variable at a time. Shorts are driven by hits (one Short made 20 % of 28-day Shorts views), so
compare **medians**, not totals.

| # | Test | Primary metric | Duration | Success threshold | Cost |
|---|---|---|---|---|---|
| E1 | Q1 + C2: Related video plus a specific CTA on every Short | Shorts → long-form views (Studio "Related video" clicks); subs per 100 Short views | 14 days | ≥ 1 % of Short views click through (≈ 20+ long views/week at current volume) **and** Short sub rate ≥ 0.6/100 (2× today's 0.30) | 0 quota |
| E2 | Short format variety (C4 plus content). Alternate days between A, the current "3 words", and B, a "quiz" version ("Which word means X? 3…2…1", 30–40 s) or "Say it before me" | Median 7-day views per Short; % viewed through vs swiped away | 14 days (≈14 Shorts per arm) | B median ≥ 1.5× A, or A wins and we keep it | 0 |
| E3 | 1 Short/day vs 2/day, alternating weeks once E2 settles the format | Weekly Shorts views and subs | 4 weeks (2 + 2) | If 1/day reaches ≥ 85 % of 2/day weekly views, go to 1/day and put the 1,750 units into retitles or a better Short | −1,750/day on 1/day weeks |
| E4 | New opening (C7) vs current, alternating days for A1/A2 long lessons | Retention at ~10 s and ~30 s (`audienceWatchRatio`), `relativeRetentionPerformance` at 30 s | 14 days (≈ 20 lessons) | +10 points at 30 s (e.g. 45 % → 55 %) **or** relative retention ≥ 0.35 median | 0 |
| E5 | Mid-lesson one-tap ask plus the Shorts end-frame question (C8) | Comments per 1,000 views | 14 days | ≥ 2 comments per 1,000 views (today 0 per ~4,000 in 28 days) | 0 (+250/day with C10) |
| E6 | Title formula on the back catalogue. Retitle 30 A1/A2 lessons to the section 4 formulas and keep 30 matched lessons unchanged as controls | YT_SEARCH views per video, 28 days before vs after, treated vs control | 28 days | Treated search views +30 % relative to control | 30 × 50 = **1,500** once |
| E7 | Drop C1 (Q5) | Weekly long-form views and subs | 3 weeks | Total long views and subs not down > 10 % (C1 earns 0 subs, so the expectation is no change) | Saves quota |
| E8 | "with Arabic translation" in 10 A1/A2 titles (the translation already exists) | YT_SEARCH views, Arabic-UI viewers (if Q6 shows any) | 28 days | +25 % search views vs control | 10 × 50 = 500 |

---

## 4. SEO: titles, descriptions, tags, chapters

Rules drawn from the data above:

1. **Lead with the phrase a learner types.** That is a single concrete concept such as "at the restaurant", "directions", "phone call" or "telling the time", followed by the format phrase autocomplete confirms ("english conversation for beginners", "learn english through story level 1", "english shadowing a2", "english words with pictures").
2. **Keep the level code**, because "a1", "a2" and "b2" appear in every market's autocomplete. Spell out "for Beginners" at A1/A2, since `english for beginners a1` is a real query.
3. **Put the key phrase in the first ~48 characters**, which is what a phone shows.
4. **Promise only what is true.** Shorts are 20–30 s, so drop "in 60 Seconds".
5. Use **"Slow"**, **"with Subtitles"** and **"with Arabic translation"** only where true. All three are autocomplete completions and the videos already have them.

### 4.1 Improved title examples

| # | Format | Current (live pattern) | Proposed |
|---|---|---|---|
| 1 | Listening A1 | At a Restaurant — English Conversation Practice (A1 Beginner) | **English Conversation at the Restaurant for Beginners (A1) — Slow, with Subtitles** |
| 2 | Listening A1 | At the Hotel — English Conversation Practice (A1 Beginner) | **English Conversation at the Hotel — Easy English for Beginners (A1)** |
| 3 | Listening A2 | Talking on the Phone at Work — English Conversation Practice (A2 Elementary) | **Phone Call English Conversation at Work — Listening Practice (A2)** |
| 4 | Listening A1 | Asking for Directions — English Conversation Practice (A1 Beginner) | **Directions in English: Ask and Give Directions — A1 Conversation for Beginners** |
| 5 | Reading A1 | My Family — Learn English Through Story Level 1 (A1) | **Learn English Through Story Level 1 ⭐ My Family (A1 Beginner)** (query-first; test against topic-first in E6) |
| 6 | Reading B1 | Learning Languages Faster — Learn English Through Story Level 3 (B1) | **Learn English Through Story Level 3: How to Learn Languages Faster (B1)** ("how to learn other languages fast" was a real search term) |
| 7 | Speaking A1 | At the Doctor — English Speaking Practice & Shadowing (A1) | **English Speaking Practice for Beginners: At the Doctor — Shadowing (A1)** |
| 8 | Speaking A2 | Describing Your Best Friend — English Speaking Practice & Shadowing (A2) | **Describe Your Best Friend in English — A2 Shadowing Practice** ("describe your best friend" was a real search term) |
| 9 | Vocabulary A1 | Parts of the Body: 10 English Words with Pictures (A1 Beginner) | **Parts of the Body in English — 10 Words with Pictures and Pronunciation (A1)** |
| 10 | Vocabulary A1 | Numbers, Age and Phone Numbers: 10 English Words with Pictures (A1 Beginner) | **Numbers in English: Say Your Age and Phone Number — A1 Vocabulary with Pictures** |
| 11 | Vocabulary A1 | Telling the Time: 10 English Words with Pictures (A1 Beginner) | **Telling the Time in English — How to Say the Time (A1, with Pictures)** |
| 12 | Daily use A1/A2 | At the Supermarket — English Speaking Practice & Shadowing (A1) | **Daily Use English Sentences at the Supermarket — Speaking Practice (A1)** |
| 13 | Listening A1 (E8) | At the Airport — English Conversation Practice (A1 Beginner) | **English Conversation for Beginners with Arabic Translation — At the Airport (A1)** |
| 14 | Short A1 | Breakfast, Lunch and Dinner: 3 English Words in 60 Seconds (A1) #shorts | **Breakfast, Lunch, Dinner — Spelling & Pronunciation 🍳 (A1) #shorts** ("lunch spelling" and "dinner spelling" were real search terms) |
| 15 | Short A2 | Talking on the Phone at Work: 3 English Words in 60 Seconds (A2) #shorts | **3 Phone Call Words Every Office Worker Needs 📞 (A2) #shorts** |
| 16 | Short A1 | At a Restaurant: 3 English Words in 60 Seconds (A1) #shorts | **English Words You Must Know at the Restaurant (A1) #shorts** |
| 17 | Short B1 | Phrasal Verbs With Get: 3 English Words in 60 Seconds (B2) #shorts | **Phrasal Verbs with GET You'll Hear Every Day (B2) #shorts** ("phrasal verbs with get" was a real search term) |

The rotating Short title formats for C4 come from rows 14–17:

- `{concept} — Spelling & Pronunciation ({LEVEL}) #shorts`
- `3 {topic} Words Every Learner Needs ({LEVEL}) #shorts`
- `English Words You Must Know: {topic} ({LEVEL}) #shorts`
- `{LLM title} | {topic} in English ({LEVEL}) #shorts`
- `Do You Know These 3 {topic} Words? ({LEVEL}) #shorts`

### 4.2 Description template (long lessons)

```
{Search topic} in English — {format phrase} for {level name} learners ({LEVEL}). Slow English, English subtitles and Arabic translation on screen.
{Hook: the concrete payoff in one sentence.}
▶ 60-second version: https://youtube.com/shorts/{pairedShortId}      ← C3
▶ Next lesson ({LEVEL}): {level playlist URL}

❓ Today's question: {one-tap question from C8} — answer in the comments.

00:00 {Search topic}: the first 3 words          ← preview chapter, not "Intro"
00:25 The conversation — with subtitles
01:40 Key phrases: {phrase 1}, {phrase 2}, {phrase 3}
02:30 Check your understanding (quiz)
03:10 Listen again — no text

IN THIS LESSON
1. {word} — {meaning}
…

KEEP GOING
{Level playlist} {URL}
{Skill playlist} {URL}

#LearnEnglish #English{LEVEL} #{SkillHashtag}
```

Notes on the template:

- The first **two** lines are all that shows before "…more", and they carry the query phrase plus "slow / subtitles / Arabic translation".
- Use **3 hashtags at most**. YouTube shows the first three above the title, and today's line has four (`#ESL` is the weakest).
- **Chapters**: the first starts at 00:00, there are at least 3, each lasts at least 10 s, and labels say what a searcher wants ("Key phrases: book a table, the bill, a tip"). Some current chapter labels are whole drill sentences, e.g. "00:00 Clothes are made from recycled fabrics." Keep phrase-labels for drills, but make the **first** chapter a topic label. Google key moments, which drive the 114 Google Search views, show these labels.

### 4.3 Description template (Shorts)

```
{Concept} in English: {word 1}, {word 2}, {word 3} — pictures, pronunciation and examples ({LEVEL}).
▶ Full lesson: https://youtu.be/{pairedVideoId}
Which word was new for you — 1, 2 or 3? 👇
#shorts #LearnEnglish #English{LEVEL}
```

### 4.4 Tags (8–10, most specific first; tags are a minor signal)

1. The exact topic query, e.g. `english conversation at the restaurant` or `parts of the body in english`.
2. The topic plus the level, e.g. `restaurant english a1`.
3. The format query family plus the level, e.g. `english conversation for beginners a1`, `learn english through story level 1` or `english shadowing a2`.
4. `english for beginners a1` (A1/A2) or `english b1` (B1+).
5. `english with arabic translation`, only where true.
6. `learn english` and `daily english`, the two generic tags worth keeping.

Drop `cefr`, `esl`, `english practice` and `english lesson`, which are generic and identical on all 252 videos.

---

## 5. What NOT to do

- **Do not add upload volume.** The second daily Short added 15 % more Shorts views for 100 % more uploads, and C1 lessons earn 0 subscribers. Spend quota on retitles and linking instead.
- **Do not cut lessons shorter to fix retention.** Average view percentage is flat at ~20 % from 3 to over 6 minutes. The loss happens in the first 10–30 s whatever the length.
- **Do not drop B1** along with C1. B1 has the best subscriber conversion on the channel (2.68/100 views).
- **Do not expect clicks from description or comment links on Shorts.** They are not clickable in the Shorts player. Use Studio "Related video".
- **Do not try to pin comments or set related videos through the API.** No endpoint exists; attempts only burn quota.
- **Do not chase head terms** such as "learn english" or "english vocabulary". Zero search views came from them. The traffic is in concrete topic phrases.
- **Do not mass-retitle the whole catalogue at once.** It costs about 12,600 units (5+ days of leftover quota) and leaves nothing to compare against. Use E6's treated and control design.
- **Do not change several variables in one week** (format, title, time, CTA together). With weekly Shorts views swinging ±50 % on single hits, effects would be unreadable.
- **Do not judge a week by its total.** One Short made 20 % of 28-day Shorts views. Use medians and same-age cohorts, as the weekly report already does.
- **Do not "fix" mojibake.** None exists in live titles or in the raw history bytes; it is a console decoding artefact.
- **Do not delete low-view B2/C1 videos.** They still collect long-tail search ("shadowing english speaking practice c1", "b2 cambridge"), and deleting them gains nothing.
- **Do not over-promise in titles or thumbnails** ("in 60 Seconds" on a 22 s video, clickbait faces). Viewers who swipe away right after clicking teach the algorithm the wrong lesson.
- **Do not run `scripts/reach-report.js` or `scripts/weekly-report.js` ad hoc from a dev machine.** They write state and report files that CI also commits. Re-auth first (Q2), then let CI run them.

---

### Appendix: how this was produced

- **Git (read-only):** `git status --short`; `git log`; `git show origin/main:reports/weekly-*.md`; `git show origin/main:state/history.json` (and `state/quota.json`); `git show be96557`; `git ls-tree`.
- **API pull:** a throwaway read-only script in `%TEMP%\eed-analysis\` using `googleapis` with the repo's `.env.local`. It made Analytics `reports.query` calls, Data API `channels.list`, `playlistItems.list`, `videos.list` and `playlists.list` calls, Reporting `jobs.list` (failed: scope), `commentThreads.list` (failed: scope) and an OAuth tokeninfo request.
- **Repo scripts:** `node scripts/keywords.js expand "english words"`, `markets "english vocabulary"` and `topics --level a1`. These wrote the three new `reports/keywords-*-2026-10-17.json` files.
- **Retitle dry run:** `node scripts/retitle-published.js` (no `--apply`) reported 0 changes.
- **Not done:** no YouTube writes and no repo files modified.
