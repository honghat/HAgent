# TTS Audio Duration Mismatch → Video Giật

## Vấn đề

Khi TTS edge-tts tạo file audio, duration thực tế không khớp với `duration_seconds` trong `script.json`.

Ví dụ:
| Scene | script.json duration | TTS thực tế |
|-------|---------------------|-------------|
| 1     | 8s                  | 6.82s       |
| 2     | 10s                 | 8.21s       |
| 3     | 10s                 | 7.34s       |

Nếu dùng duration từ script → video dài hơn audio → TTS ngắt → âm thanh bị giật.

## Fix

**Luôn đo real audio duration từ file .mp3 sau khi TTS xong.**

```python
from moviepy import AudioFileClip

scene_durs = []
for i, scene in enumerate(script["scenes"]):
    sn = scene["scene_number"]
    audio_path = Path(f"audio_nam_minh_{sn+1:02d}.mp3")
    if audio_path.exists():
        ac = AudioFileClip(str(audio_path))
        scene_durs.append(ac.duration)
        ac.close()  # Giải phóng file
    else:
        scene_durs.append(scene["duration_seconds"])
```

Sau đó dùng `scene_durs[i]` thay vì `scene["duration_seconds"]` cho mọi thao tác: `with_duration()`, `fade`, `TextClip.duration`, v.v.

## Single-pass render

Cách cũ — concat từng scene MP4 → motion boundary, giật:

```python
for clip in clips:
    clip.write_videofile(f"scene_{i}.mp4")  # ❌ từng scene riêng
ffmpeg -f concat ...  # ghép → chuyển cảnh bị giật
```

Cách mới — render 1 lần:

```python
from moviepy import concatenate_videoclips
final = concatenate_videoclips(scene_clips, method="compose")
final.write_videofile("final.mp4", ...)  # ✅ 1 lần, mượt
```

## Kiểm tra

Dùng `ffprobe` để verify duration từng file audio:

```bash
for f in audio_nam_minh_*.mp3; do
  echo "$f: $(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 $f)s"
done
```

Nếu tổng audio duration = video duration → OK. Nếu video dài hơn → sửa lại duration.
