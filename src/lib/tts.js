import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { paths, env } from './config.js';
import { ffprobeDuration, run } from './ffmpeg.js';

const WORKER = path.join(paths.root, 'scripts/tts_worker.py');
const PYTHON = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

/** Stable 32-bit hash so a re-run of the same lesson produces the same voice jitter. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Real speakers never hold one tempo or pitch for eight minutes; TTS does, and
 * that constancy is the single loudest "this is a robot" cue. We nudge each
 * sentence a few percent either way, deterministically.
 */
function jitter(baseRate, seedKey) {
  const h = hash(seedKey);
  const basePct = parseInt(String(baseRate).replace('%', ''), 10) || 0;
  const rateDelta = ((h % 7) - 3);              // -3 .. +3 percent
  const pitchDelta = (((h >> 3) % 7) - 3);      // -3 .. +3 Hz
  return {
    rate: `${basePct + rateDelta >= 0 ? '+' : ''}${basePct + rateDelta}%`,
    pitch: `${pitchDelta >= 0 ? '+' : ''}${pitchDelta}Hz`,
  };
}

/** Pause length that follows the punctuation, with a little human wobble. */
export function naturalPause(text, seedKey = text) {
  const last = text.trim().slice(-1);
  const base = last === '?' ? 460 : last === '!' ? 430 : last === '.' ? 390
    : last === ':' ? 340 : last === ',' ? 220 : 320;
  return base + ((hash(seedKey) % 9) - 4) * 15;   // +/- 60 ms
}

class WorkerPool {
  constructor(size) {
    this.size = Math.max(1, size);
    this.workers = [];
    this.queue = [];
  }

  async start() {
    this.workers = await Promise.all(
      Array.from({ length: this.size }, () => this.#spawnOne()),
    );
  }

  #spawnOne() {
    return new Promise((resolve, reject) => {
      if (process.env.DEBUG_TTS) console.log('[tts] spawn', PYTHON, WORKER);
      const proc = spawn(PYTHON, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'] });
      const worker = { proc, busy: false, buffer: '', pending: null };

      proc.stdout.on('data', (chunk) => {
        worker.buffer += chunk.toString();
        let idx;
        while ((idx = worker.buffer.indexOf('\n')) !== -1) {
          const line = worker.buffer.slice(0, idx).trim();
          worker.buffer = worker.buffer.slice(idx + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (process.env.DEBUG_TTS) console.log('[tts] msg', JSON.stringify(msg).slice(0,120));
          if (msg.ready) { resolve(worker); continue; }
          const pending = worker.pending;
          worker.pending = null;
          worker.busy = false;
          if (pending) (msg.ok ? pending.resolve : pending.reject)(msg.ok ? msg : new Error(msg.error));
          this.#drain();
        }
      });

      proc.stderr.on('data', d => {
        const text = d.toString().trim();
        if (text) console.warn(`[tts:py] ${text.slice(0, 300)}`);
      });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (worker.pending) {
          worker.pending.reject(new Error(`TTS worker exited (${code})`));
          worker.pending = null;
        }
      });
      // First import of edge-tts/aiohttp can take a while on a cold filesystem
      // (bytecode compilation), so this is deliberately generous.
      setTimeout(() => reject(new Error('TTS worker did not become ready in 60s')), 60_000);
    });
  }

  #drain() {
    while (this.queue.length) {
      const worker = this.workers.find(w => !w.busy && w.proc.exitCode === null);
      if (!worker) return;
      const job = this.queue.shift();
      worker.busy = true;
      worker.pending = job;
      worker.proc.stdin.write(JSON.stringify(job.req) + '\n');
    }
  }

  request(req) {
    return new Promise((resolve, reject) => {
      this.queue.push({ req, resolve, reject });
      this.#drain();
    });
  }

  stop() {
    for (const w of this.workers) {
      try { w.proc.stdin.end(); } catch { /* already closed */ }
    }
  }
}

/**
 * Synthesize every narration line of a lesson.
 * @param {Array<{id:string,text:string,voice:string,baseRate:string,pauseAfterMs?:number}>} lines
 * @returns the same lines with { file, durationMs, pauseAfterMs, words:[{text,startMs,endMs}] }
 */
export async function synthesizeLines(lines, { outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const pool = new WorkerPool(env.ttsWorkers);
  await pool.start();

  try {
    const results = await Promise.all(lines.map(async (line) => {
      const file = path.join(outDir, `${line.id}.mp3`);
      const meta = path.join(outDir, `${line.id}.json`);
      const { rate, pitch } = jitter(line.baseRate, `${line.id}|${line.text}`);

      // Reuse a clip whose text and voice settings are unchanged. Retrying a
      // build after a late failure then costs nothing at the TTS service.
      const format = process.env.EDGE_TTS_FORMAT || 'audio-24khz-96kbitrate-mono-mp3';
      const signature = `${format}|${line.voice}|${rate}|${pitch}|${line.text}`;
      let cached = null;
      if (fs.existsSync(file) && fs.existsSync(meta)) {
        try {
          const saved = JSON.parse(fs.readFileSync(meta, 'utf8'));
          if (saved.signature === signature) cached = saved;
        } catch { /* rewrite it below */ }
      }

      const res = cached || await pool.request({
        id: line.id,
        text: line.text,
        voice: line.voice,
        rate,
        pitch,
        volume: '+0%',
        output: file,
      });

      const durationMs = Math.round((await ffprobeDuration(file)) * 1000);
      const words = (res.words || []).map(w => ({
        text: w.t,
        startMs: w.o / 10000,
        endMs: (w.o + w.d) / 10000,
      }));
      if (!cached) fs.writeFileSync(meta, JSON.stringify({ signature, words: res.words || [] }));

      return {
        ...line,
        file,
        durationMs,
        words,
        pauseAfterMs: line.pauseAfterMs ?? naturalPause(line.text, line.id),
      };
    }));
    return results;
  } finally {
    pool.stop();
  }
}

/**
 * Glue the per-line clips into one voice track, inserting each line's pause as
 * real silence, and return where every line and every word landed on the
 * finished timeline.
 */
export async function assembleVoiceTrack(lines, { outFile, workDir, leadInMs = 400 }) {
  fs.mkdirSync(workDir, { recursive: true });

  const parts = [];
  const timeline = [];
  let cursorMs = leadInMs;

  const leadIn = path.join(workDir, 'lead-in.wav');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`,
    '-t', (leadInMs / 1000).toFixed(3), '-c:a', 'pcm_s16le', leadIn]);
  parts.push(leadIn);

  for (const line of lines) {
    // Every clip arrives with ~100 ms of service-added silence at each end.
    // Left in place it stacks on top of the pause we insert ourselves, so the
    // lesson drifts gappy and stilted — the rhythm stops sounding like speech.
    // Trim to the words, then let pauseAfterMs be the only thing that spaces
    // sentences out.
    const first = line.words[0];
    const last = line.words[line.words.length - 1];
    const trimStartMs = first ? Math.max(0, first.startMs - 60) : 0;
    const trimEndMs = last ? Math.min(line.durationMs, last.endMs + 140) : line.durationMs;
    const speechMs = Math.max(120, trimEndMs - trimStartMs);

    const padded = path.join(workDir, `${line.id}.wav`);
    const fadeOutAt = Math.max(0, speechMs / 1000 - 0.014);
    // The trim has to happen inside the filter chain. Using -ss/-t as output
    // options instead truncates the stream *after* apad, which silently ate
    // every pause and ran the sentences together.
    await run('ffmpeg', ['-y', '-i', line.file,
      '-af', `atrim=start=${(trimStartMs / 1000).toFixed(3)}:end=${(trimEndMs / 1000).toFixed(3)},`
           + `asetpts=N/SR/TB,aresample=24000,`
           // 8/14 ms fades kill the click an MP3 boundary can leave behind
           // once segments are butt-joined.
           + `afade=t=in:st=0:d=0.008,`
           + `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.014,`
           + `apad=pad_dur=${(line.pauseAfterMs / 1000).toFixed(3)}`,
      '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', padded]);
    parts.push(padded);

    timeline.push({
      ...line,
      durationMs: speechMs,
      startMs: cursorMs,
      endMs: cursorMs + speechMs,
      words: line.words.map(w => ({
        ...w,
        startMs: cursorMs + w.startMs - trimStartMs,
        endMs: cursorMs + w.endMs - trimStartMs,
      })),
    });
    cursorMs += speechMs + line.pauseAfterMs;
  }

  const listFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(listFile, parts.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile]);

  return { file: outFile, totalMs: cursorMs, timeline };
}
