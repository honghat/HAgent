#!/usr/bin/env python3
"""
Edge TTS Persistent Server — Luôn sẵn sàng trong RAM, phản hồi cực nhanh.
Chạy trên port 5002, nhận POST /tts với JSON { text, voice, rate }
Trả về audio/mpeg trực tiếp.
"""
import asyncio
import edge_tts
import io
import json
import sys
from aiohttp import web

PORT = 5002

async def handle_tts(request: web.Request) -> web.StreamResponse:
    """Xử lý yêu cầu TTS — stream audio trực tiếp về client."""
    try:
        data = await request.json()
        text = data.get('text', '')
        voice = data.get('voice', 'vi-VN-HoaiMyNeural')
        rate = data.get('rate', '+0%')
        
        if not text:
            return web.json_response({'error': 'No text'}, status=400)
        
        print(f"[EdgeTTS Server] Synthesizing: {text[:50]}... ({len(text)} chars) | Voice: {voice}")
        
        # Tạo communicator
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        
        # Stream và collect audio data
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        
        audio_bytes = audio_data.getvalue()
        print(f"[EdgeTTS Server] Done: {len(audio_bytes)} bytes")
        
        return web.Response(
            body=audio_bytes,
            content_type='audio/mpeg',
            headers={'Cache-Control': 'no-cache'}
        )
        
    except Exception as e:
        print(f"[EdgeTTS Server] Error: {e}", file=sys.stderr)
        return web.json_response({'error': str(e)}, status=500)

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({'status': 'ok', 'engine': 'edge-tts'})


@web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        return web.Response(
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        )
    response = await handler(request)
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


def main():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_post('/tts', handle_tts)
    app.router.add_get('/health', handle_health)

    print(f"🔊 Edge TTS Server starting on port {PORT}...")
    print(f"   Voice: vi-VN-HoaiMyNeural (default)")
    print(f"   Engine: edge-tts (Microsoft)")
    web.run_app(app, host='0.0.0.0', port=PORT, print=None)

if __name__ == '__main__':
    main()
