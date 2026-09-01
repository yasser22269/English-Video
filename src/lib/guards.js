/**
 * Retention guards.
 *
 * Every rule here corresponds to a defect measured on the first 34 published
 * videos (reports/audit-2026-09-01.md): 20.9% average view percentage and a
 * 46-second average view duration. They run on the resolved timeline of every
 * build, so a regression shows up in the run log instead of on the channel.
 *
 * Guards WARN by default and only fail the build when STRICT_GUARDS=1 — a
 * generated lesson that trips one is still a publishable lesson, and losing a
 * day's upload is worse than shipping a slightly slow opening.
 */

const STRICT = process.env.STRICT_GUARDS === '1';

/** Narration whose only job is to announce a later sentence. */
const PREAMBLE = /\b(in this video|in today'?s? (video|lesson)|we will learn|we are going to learn|by the end of (this|the) (video|lesson)|let'?s get started|stay tuned|before we (begin|start))\b/i;

/**
 * How long until the viewer receives real teaching, as opposed to the channel
 * talking about itself. A line counts as teaching if it carries the lesson's
 * own content: a target word, a passage sentence, a dialogue turn, a drill.
 */
function firstTeachingMs(timeline, teachingIds) {
  for (const line of timeline) {
    if (teachingIds.has(line.id)) return line.startMs;
  }
  return Infinity;
}

/** The longest stretch with nothing on screen but the background. */
function longestDeadAirMs(timeline, cues) {
  const spans = [];
  for (const l of timeline) {
    // A "none" line still paints the speaker label and section note, so it is
    // not dead air — that is exactly the fix for the 88-second listening hole.
    spans.push([l.startMs, l.endMs + Math.min(l.pauseAfterMs || 0, 700)]);
  }
  for (const c of cues) spans.push([c.startMs, c.endMs]);
  spans.sort((a, b) => a[0] - b[0]);

  let worst = 0;
  let worstAt = 0;
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start - cursor > worst) {
      worst = start - cursor;
      worstAt = cursor;
    }
    cursor = Math.max(cursor, end);
  }
  return { ms: worst, atMs: worstAt };
}

/** The longest a single rendered frame stays on screen. */
function longestStillMs(scenes) {
  let worst = 0;
  let which = null;
  for (const s of scenes) {
    // A transparent overlay sits on top of looping video, so a long-lived one
    // is not a frozen picture — only the rendered stills can actually freeze.
    if (s.transparent) continue;
    if (s.durationSec * 1000 > worst) {
      worst = s.durationSec * 1000;
      which = s.id;
    }
  }
  return { ms: worst, sceneId: which };
}

/**
 * @returns {{ warnings: string[], stats: object }}
 */
export function checkRetention({ plan, timeline, scenes, cues, meta }) {
  const warnings = [];

  // Lines emitted inside a `teaching` scene layout, plus anything with an
  // Arabic gloss — both mean the viewer is receiving content, not preamble.
  const teachingLayouts = new Set(['word', 'drill', 'passage', 'question']);
  const teachingIds = new Set();
  for (const scene of plan.scenes) {
    if (teachingLayouts.has(scene.layout)) for (const id of scene.lineIds) teachingIds.add(id);
  }
  for (const l of timeline) if (l.ar || l.speakerName) teachingIds.add(l.id);

  const firstTeach = firstTeachingMs(timeline, teachingIds);
  const dead = longestDeadAirMs(timeline, cues);
  const still = longestStillMs(scenes);

  if (firstTeach > 12_000) {
    warnings.push(`first teaching at ${(firstTeach / 1000).toFixed(1)}s — the opening is talking about the lesson for too long (target: under 12s)`);
  }
  if (dead.ms > 12_000) {
    warnings.push(`${(dead.ms / 1000).toFixed(1)}s with nothing on screen, starting at ${(dead.atMs / 1000).toFixed(1)}s (target: under 12s)`);
  }
  if (still.ms > 30_000) {
    warnings.push(`scene ${still.sceneId} holds one frame for ${(still.ms / 1000).toFixed(1)}s (target: under 30s)`);
  }

  const preamble = timeline.filter(l => PREAMBLE.test(l.text)).slice(0, 3);
  for (const l of preamble) {
    warnings.push(`preamble in narration: "${l.text.slice(0, 70)}"`);
  }

  // A phone shows about 48 characters. Losing the trailing skill phrase there is
  // fine — YouTube still matches the whole string for search, and only the human
  // is reading the truncated version. Losing the TOPIC is not fine: that is the
  // half that earns the click.
  if (meta?.title && meta?.topic) {
    const visible = meta.title.slice(0, 48);
    if (!visible.includes(meta.topic)) {
      warnings.push(`the topic "${meta.topic}" is cut off on a phone — visible: "${visible}"`);
    }
  }

  const stats = {
    firstTeachingSec: Number.isFinite(firstTeach) ? +(firstTeach / 1000).toFixed(1) : null,
    deadAirSec: +(dead.ms / 1000).toFixed(1),
    longestStillSec: +(still.ms / 1000).toFixed(1),
    sceneCount: scenes.length,
  };

  if (warnings.length && STRICT) {
    throw new Error(`retention guards failed:\n  - ${warnings.join('\n  - ')}`);
  }
  return { warnings, stats };
}
