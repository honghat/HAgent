import asyncio
import edge_tts
import sys
import os
import json

async def amain() -> None:
    try:
        sys.stderr.write("Python helper started\n")
        # Đọc tham số từ stdin (JSON)
        raw = sys.stdin.read()
        sys.stderr.write(f"Read {len(raw)} bytes from stdin\n")
        params = json.loads(raw)
        
        text = params.get("text", "")
        voice = params.get("voice", "vi-VN-HoaiMyNeural")
        rate = params.get("rate", "+0%")
        output_file = params.get("output_file", None)
        
        sys.stderr.write(f"Synthesis started: voice={voice}, rate={rate}, text_len={len(text)}\n")

        if not text:
            sys.stderr.write("No text provided\n")
            sys.exit(1)

        communicate = edge_tts.Communicate(text, voice, rate=rate)

        if output_file:
            await communicate.save(output_file)
            sys.stderr.write(f"File saved: {output_file}\n")
        else:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    sys.stdout.buffer.write(chunk["data"])
            sys.stdout.buffer.flush()
            sys.stderr.write("Stream finished to stdout\n")

    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(amain())
