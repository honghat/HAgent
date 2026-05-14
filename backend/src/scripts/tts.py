#!/usr/bin/env python3
"""TTS via edge-tts — generate Vietnamese speech from text."""
import sys, json, asyncio
import edge_tts

async def synthesize(text, voice, output_path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    return {'success': True, 'output_path': output_path}

if __name__ == '__main__':
    try:
        params = json.loads(sys.argv[1])
        text = params['text']
        voice = params.get('voice', 'vi-VN-HoaiMyNeural')
        output_path = params['output_path']
        result = asyncio.run(synthesize(text, voice, output_path))
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
