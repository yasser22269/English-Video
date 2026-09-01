#!/usr/bin/env python3
"""
Persistent Edge-TTS worker.

Node spawns a small pool of these and streams requests over stdin, one JSON
object per line, so we pay Python's start-up cost once per run instead of once
per sentence.

stdin  : {"id":"s01","text":"...","voice":"en-US-AndrewNeural","rate":"-6%","pitch":"+0Hz","volume":"+0%","output":"/abs/path.mp3"}
stdout : {"id":"s01","ok":true,"bytes":12345,"words":[{"t":"Hello","o":1052500,"d":2236660}]}
         {"id":"s01","ok":false,"error":"..."}

Why this talks to the websocket directly instead of calling edge_tts.Communicate
=============================================================================
The library hard-codes `audio-24khz-48kbitrate-mono-mp3`. At 48 kbps the top of
the band is a mess of encoder artefacts, and any presence/air lift in the
mastering chain amplifies exactly that mush. The same endpoint happily serves
`audio-24khz-96kbitrate-mono-mp3` — same voices, same WordBoundary events, half
the artefacts. (48 kHz formats are rejected by this endpoint, so 12 kHz of
bandwidth is the hard ceiling; the mastering chain is built around that.)

Everything else — DRM token, SSML construction, text splitting — is still the
library's, so upstream fixes to Microsoft's handshake keep working.
"""
import sys, json, asyncio, os, re

import aiohttp
import certifi
import ssl

from edge_tts.communicate import (
    TTSConfig, connect_id, date_to_string, mkssml, ssml_headers_plus_data,
    escape, remove_incompatible_characters, split_text_by_byte_length,
)
from edge_tts.constants import WSS_URL, WSS_HEADERS, SEC_MS_GEC_VERSION
from edge_tts.drm import DRM

OUTPUT_FORMAT = os.environ.get('EDGE_TTS_FORMAT', 'audio-24khz-96kbitrate-mono-mp3')
BITRATE_BPS = int(re.search(r'-(\d+)kbitrate', OUTPUT_FORMAT).group(1)) * 1000
TICKS_PER_SECOND = 10_000_000
MAX_ATTEMPTS = 3

# Zero-width and bidi control marks: the service rejects some and silently
# mis-times word boundaries around the rest.
INVISIBLE = {c: None for c in list(range(0x200B, 0x2010)) + list(range(0x202A, 0x202F)) + [0xFEFF]}

SSL_CTX = ssl.create_default_context(cafile=certifi.where())


def clean(text: str) -> str:
    """Strip anything the service rejects or reads out loud as punctuation noise."""
    # Lone surrogates survive JSON transport but cannot be UTF-8 encoded. One
    # stray half of a surrogate pair from the model raised UnicodeEncodeError
    # and failed the whole lesson, so drop them before anything else runs.
    text = text.encode('utf-8', 'ignore').decode('utf-8', 'ignore')
    text = text.translate(INVISIBLE)
    text = text.replace('&', ' and ')
    text = re.sub(r'[<>]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


async def _synth_chunk(session, cfg, chunk: bytes):
    """One websocket round trip. Returns (audio_bytes, word_boundaries)."""
    url = (f"{WSS_URL}&Sec-MS-GEC={DRM.generate_sec_ms_gec()}"
           f"&Sec-MS-GEC-Version={SEC_MS_GEC_VERSION}&ConnectionId={connect_id()}")

    audio = bytearray()
    words = []

    async with session.ws_connect(url, headers=WSS_HEADERS, ssl=SSL_CTX,
                                  compress=15, autoping=False) as ws:
        await ws.send_str(
            f"X-Timestamp:{date_to_string()}\r\n"
            "Content-Type:application/json; charset=utf-8\r\n"
            "Path:speech.config\r\n\r\n"
            '{"context":{"synthesis":{"audio":{"metadataoptions":{'
            '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},'
            f'"outputFormat":"{OUTPUT_FORMAT}"'
            "}}}}\r\n"
        )
        await ws.send_str(ssml_headers_plus_data(connect_id(), date_to_string(), mkssml(cfg, chunk)))

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.BINARY:
                # Binary frames are: 2-byte big-endian header length, header, payload.
                marker = msg.data.find(b"Path:audio\r\n")
                if marker != -1:
                    audio += msg.data[marker + len(b"Path:audio\r\n"):]
            elif msg.type == aiohttp.WSMsgType.TEXT:
                if "Path:turn.end" in msg.data:
                    break
                if "Path:audio.metadata" in msg.data:
                    body = msg.data.split("\r\n\r\n", 1)[-1]
                    for meta in json.loads(body).get("Metadata", []):
                        if meta.get("Type") == "WordBoundary":
                            d = meta["Data"]
                            words.append({
                                "t": d["text"]["Text"],
                                "o": d["Offset"],
                                "d": d["Duration"],
                            })
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                break

    return bytes(audio), words


async def synth(req: dict) -> dict:
    text = clean(req['text'])
    if not text:
        raise ValueError('empty text')

    cfg = TTSConfig(
        req.get('voice', 'en-US-AndrewNeural'),
        req.get('rate', '+0%'),
        req.get('volume', '+0%'),
        req.get('pitch', '+0Hz'),
        'WordBoundary',
    )
    chunks = split_text_by_byte_length(escape(remove_incompatible_characters(text)), 4096)

    audio = bytearray()
    words = []
    async with aiohttp.ClientSession(trust_env=True) as session:
        for chunk in chunks:
            # Offsets restart at zero per chunk; shift by the audio already
            # written. Constant-bitrate MP3 makes bytes -> ticks exact.
            offset = len(audio) * 8 * TICKS_PER_SECOND // BITRATE_BPS
            part_audio, part_words = await _synth_chunk(session, cfg, chunk)
            for w in part_words:
                w['o'] += offset
            audio += part_audio
            words += part_words

    if len(audio) < 500:
        raise IOError(f'suspiciously small audio ({len(audio)} bytes)')

    out = req['output']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(audio)

    return {'id': req['id'], 'ok': True, 'bytes': len(audio), 'words': words}


async def handle(req: dict) -> dict:
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await synth(req)
        except aiohttp.ClientResponseError as exc:
            # A 403 here is nearly always the DRM clock-skew dance; the library
            # knows how to correct it, and the retry then succeeds.
            last = exc
            try:
                DRM.handle_client_response_error(exc)
            except Exception:                      # noqa: BLE001
                pass
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(1.5 * attempt)
        except Exception as exc:                   # noqa: BLE001 - reported back to Node
            last = exc
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(1.5 * attempt)
    return {'id': req.get('id'), 'ok': False, 'error': f'{type(last).__name__}: {last}'}


async def main() -> None:
    # A thread-based readline keeps this identical on Windows, where the
    # Proactor loop cannot connect_read_pipe() to stdin.
    loop = asyncio.get_running_loop()

    print(json.dumps({'ready': True, 'format': OUTPUT_FORMAT}), flush=True)

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
