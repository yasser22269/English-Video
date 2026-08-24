#!/usr/bin/env python3
"""
Persistent Edge-TTS worker.

Node spawns a small pool of these and streams requests over stdin, one JSON
object per line, so we pay Python's start-up cost once per run instead of once
per sentence.

stdin  : {"id":"s01","text":"...","voice":"en-US-AriaNeural","rate":"-6%","pitch":"+0Hz","volume":"+0%","output":"/abs/path.mp3"}
stdout : {"id":"s01","ok":true,"bytes":12345,"words":[{"t":"Hello","o":1052500,"d":2236660}]}
         {"id":"s01","ok":false,"error":"..."}

Word offsets/durations are in 100-nanosecond ticks, straight from the service —
Node converts them to milliseconds for the karaoke subtitle track.
"""
import sys, json, asyncio, os, re

import edge_tts

MAX_ATTEMPTS = 3

# Zero-width and bidi control marks: the service rejects some and silently
# mis-times word boundaries around the rest.
INVISIBLE = {c: None for c in list(range(0x200B, 0x2010)) + list(range(0x202A, 0x202F)) + [0xFEFF]}


def clean(text: str) -> str:
    """Strip anything the service rejects or reads out loud as punctuation noise."""
    text = text.translate(INVISIBLE)
    text = text.replace('&', ' and ')
    text = re.sub(r'[<>]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


async def synth(req: dict) -> dict:
    text = clean(req['text'])
    if not text:
        raise ValueError('empty text')

    comm = edge_tts.Communicate(
        text,
        req.get('voice', 'en-US-AriaNeural'),
        rate=req.get('rate', '+0%'),
        pitch=req.get('pitch', '+0Hz'),
        volume=req.get('volume', '+0%'),
        boundary='WordBoundary',
    )

    words = []
    out = req['output']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        async for chunk in comm.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                words.append({'t': chunk['text'], 'o': chunk['offset'], 'd': chunk['duration']})

    size = os.path.getsize(out)
    if size < 500:
        raise IOError(f'suspiciously small audio ({size} bytes)')
    return {'id': req['id'], 'ok': True, 'bytes': size, 'words': words}


async def handle(req: dict) -> dict:
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await synth(req)
        except Exception as exc:                    # noqa: BLE001 - reported back to Node
            last = exc
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(1.5 * attempt)
    return {'id': req.get('id'), 'ok': False, 'error': f'{type(last).__name__}: {last}'}


async def main() -> None:
    # A thread-based readline keeps this identical on Windows, where the
    # Proactor loop cannot connect_read_pipe() to stdin.
    loop = asyncio.get_running_loop()

    print(json.dumps({'ready': True}), flush=True)

    while True:
        raw = await loop.run_in_executor(None, sys.stdin.readline)
        if not raw:
            break
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({'ok': False, 'error': f'bad request json: {exc}'}), flush=True)
            continue
        result = await handle(req)
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, BrokenPipeError):
        pass
