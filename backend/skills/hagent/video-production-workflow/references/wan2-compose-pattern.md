# Wan2.1 Image-to-Video Compose Pattern

Session: 2026-05-30 — "Tại sao bầu trời màu xanh?" (khoa học thường thức)

## What Wan2.1 produces

- Tool: `image_to_video_wan`
- Input: 1536×1024 PNG (ChatGPT landscape image)
- Params: `length=33, size="landscape"`
- Output: **832×480 MP4, ~2.06s** at 16fps (33 frames)
- Model: `Wan2.1-I2V-14B-480P-Q5_K_M` on hat-linux (100.69.50.64:8188)

## Why loop is required

TTS audio per scene = 7–10s. Wan2.1 output = ~2s.
Must loop clip `int(real_dur / clip.duration) + 1` times, then subclip to exact duration.

## Compose resolution

Output at **832×480** (Wan2.1 native), not 1536×1024. Compose all MoviePy at W=832, H=480.
FPS=16 matches Wan2.1 frame rate.

## Edge TTS rate limit pattern

With 6+ scenes, scenes 3-4-6 often hit `No audio was received` on first pass.
Fix: separate retry script with 5s delay between attempts (not 2.5s), up to 5 retries.

```python
# retry_tts.py pattern
RETRY_SCENES = [2, 3, 5]  # 0-indexed scene_numbers that failed
for sn in RETRY_SCENES:
    await asyncio.sleep(5)          # longer pre-delay
    await gen_audio(text, out)
    await asyncio.sleep(5)          # longer post-delay
```

## chatgpt2api proxy check

Always check before trying to start:
```bash
curl -s http://127.0.0.1:3011/health | head -5
```
If HTML response → already running (ignore startup). The proxy does NOT expose `/health` as JSON by default, but returns 200 HTML with pool status — treat any 200 as "running".

## Wan2.1 prompt tips for science/nature scenes

- Sky/clouds: "gentle breeze making clouds drift slowly, sunlight rays moving, cinematic motion"
- Science diagram: "particles floating, light rays spreading, dynamic motion, scientific visualization"
- Sunset: "sky colors shifting, sun slowly setting, atmospheric and cinematic"
- Abstract/space: "planet slowly rotating, stars visible, cinematic and inspiring"
- Keep prompts 10–20 words — Wan2.1 is motion-focused, not text-following.
- **Anime / Manga**: Dùng prompt chuyển động cực kỳ mượt mà, bay bổng (`high-quality 2D anime style, aesthetic animation, extremely smooth fluid motion, flowing beautiful hair, waving clothes, dynamic cinematic lighting, wind blowing`). Negative: `photorealistic, realistic, 3D render, digital sculpture, real life, low quality, blurry, static, watermark, text overlay, logo, deformed body, extra fingers, ugly eyes`.
- **Người que (Stick Figure)**: Dùng nét vẽ vector tối giản, chuyển động nẩy vui nhộn sinh động (`clean minimal stick figure animation, smooth vector stroke line art motion, bouncy lively physics movement, simple funny cartoon physics, cute mascot animation`). Negative: `photorealistic, realistic, 3D render, complex textures, realistic human body, detailed face, clothes, cluttered background, texts`.
- **Nhân vật hoạt hình / Cartoon**: Chuyển động co giãn đàn hồi flat vector (`vibrant 2D flat cartoon style, cute character animation, classic western animation style, squash and stretch bouncy physics, playful character motion, clean shapes`). Negative: `photorealistic, realistic, 3D render, dark tone, blurry, text overlay, watermark`.
- **⚠️ Kiểm tra chống chữ nhiều trước khi animate**: Trước khi animate bất kỳ ảnh nào, bắt buộc phải dùng vision check xem diện tích chữ có lớn hơn **15%** không, hoặc có phải dạng infographic/diagram/slide/biểu đồ không. Nếu có chữ, **TUYỆT ĐỐI CẤM** animate vì các chữ cái sẽ bị Wan2.1 bóp méo biến dạng kỳ dị làm hỏng thẩm mỹ video. Thay vào đó, dùng `ImageClip` tĩnh + zoom-in nhẹ (1→1.02) hoặc hiệu ứng fade trong MoviePy.

## Full compose script structure

See `templates/compose_wan_video.py` (to be added) or refer to session output at:
`/Users/nguyenhat/HAgent/data/make-video/bau-troi-xanh/compose_video.py`

## YouTube upload

See `templates/upload_youtube.py`. Requires `client_secret.json` from Google Cloud Console.
- YouTube Data API v3 → OAuth2 Desktop App credentials
- Token cached to `youtube_token.pickle` after first auth
- category_id "28" = Science & Technology
