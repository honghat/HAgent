---
name: video-production-workflow
category: hagent
description: Tạo video hoàn chỉnh cho agent. Mặc định gọi tool `auto_video_project` (project editor + ảnh + Wan2.1 + TTS Nam Minh + timeline + render). Chỉ rơi về workflow tay khi user yêu cầu kiểm soát từng cảnh.
---

# Video Production Workflow

## Quick path — gọi `auto_video_project`

Khi user chỉ nói "tạo video về X" / "làm 1 video người que về Y", gọi 1 tool:

```python
auto_video_project(
    topic="Vì sao bầu trời màu xanh",
    scenes=5,                    # 2-12, mặc định 5
    aspect="landscape",          # landscape | portrait | square
    style="stick_figure",        # stick_figure | anime | cartoon | photo_realistic
    voice="vi-VN-NamMinhNeural", # edge_tts voice
    skip_animation=False,        # True nếu user vội — bỏ Wan2.1
)
```

Tool tự làm:

1. Tạo project mới trong Video Editor (`editor_projects`).
2. Sinh script JSON (ChatGPT2API proxy local, model `gpt-5-mini`).
3. Tạo ảnh từng scene — `image_chatgpt2api` (gpt-image-2), fallback `image_generate` (FAL Flux).
4. Tạo hoạt ảnh — `image_to_video_wan` (Wan2.1 I2V, ~10 phút/scene trên GPU remote). Scene fail → giữ ảnh tĩnh.
5. Tạo TTS — `edge_tts` voice `vi-VN-NamMinhNeural` trực tiếp.
6. Copy assets vào `data/editor/assets/`, insert `editor_assets`, build timeline 3 track (video / subtitle / audio).
7. Render qua editor (ffmpeg-based, `data/editor/output/render_*.mp4`).
8. Trả về `{project_id, project_url, output_path, scenes:[...], summary}`.

Progress được lưu ở bảng `auto_video_jobs` (tra cứu được qua DB).

### Pitfalls khi gọi tool

- Wan2.1 cần ComfyUI server chạy (mặc định `http://100.69.50.64:8188`). Nếu chưa lên: tool vẫn chạy, **fallback ảnh tĩnh**.
- ChatGPT2API proxy phải chạy ở `127.0.0.1:3011` (cho cả sinh script + tạo ảnh). Kiểm tra: `curl http://127.0.0.1:3011/health`.
- Edge TTS rate limit: tool đã retry 3 lần + fallback silent. Không cần gì thêm.
- **Tổng thời gian**: 5 cảnh ≈ 50-60 phút (Wan2.1 là bottleneck). User cần báo trước nếu vội → `skip_animation=True` cắt xuống còn ~5 phút.
- Trả về `project_url` dạng `/video?project={pid}` — user mở frontend để xem/edit.

### Khi nào KHÔNG dùng tool

- User muốn tự viết script và chỉ nhờ render → dùng API editor trực tiếp (`/api/editor/projects`).
- User cần kiểm soát ảnh từng cảnh (chọn ảnh có sẵn) → workflow tay (mục dưới).
- User muốn video TikTok TikTok-Style đặc thù (caption gold trên đỉnh) → workflow tay với template `references/`.

---

## Workflow tay (khi cần kiểm soát từng bước)

### 1. Script

`scene_number` 0..M-1, mỗi scene đủ 6 field: `subtitle`, `narration`, `duration_seconds`, `scene_description`, `camera_move`, `animation_hint`.

`duration_seconds` chỉ là **ước lượng** — luôn đo lại từ audio TTS thật.

### 2. Tạo ảnh

```python
image_chatgpt2api(prompt="<scene_description>, stick figure, flat white bg, 2D cartoon",
                  size="landscape")  # 1536x1024
```

Fallback: `image_generate` (FAL Flux).

### 3. TTS

```python
import edge_tts
await edge_tts.Communicate(narration, "vi-VN-NamMinhNeural").save("audio_NN.mp3")
# Delay 2.5s giữa các scene để tránh rate limit
```

Rate `+0%` (không giảm tốc — voice Neural tiếng Việt vấp ở -10%). Text chunk thành nhóm 5-12 từ, dùng `…` (U+2026) để pause dài.

### 4. Hoạt ảnh (optional)

```python
image_to_video_wan(image_path="scene_NN.png", length=33, size="landscape",
                   prompt="<motion>", negative="static, blurry, ...")
# Output ~2s clip, loop để khớp TTS duration
```

Phân loại style ảnh trước (`anime` / `stick_figure` / `cartoon` / `photo_realistic`) để pick prompt+negative phù hợp. **Skip Wan nếu ảnh có chữ** (text overlay/infographic) — Wan sẽ méo chữ.

### 5. Compose

Render 1 lần bằng `concatenate_videoclips + write_videofile`, KHÔNG concat từng scene MP4.

Subtitle nên dùng **Pillow** (`PIL.ImageDraw`) + `ImageClip(np.array(pil_img))` thay vì `MoviePy.TextClip` — anti-aliasing tốt hơn, hỗ trợ font `.ttf`.

Template đầy đủ: `references/` (landscape/portrait/tiktok-portrait) và `templates/`.

### 6. Verification checklist

| Mục | Kiểm tra |
|-----|----------|
| Script | `scene_number` 0..M-1, không thiếu field |
| Ảnh | Tất cả `scene_NN.png` tồn tại, đúng ratio |
| TTS | Mỗi scene có audio, voice Nam Minh, không vấp |
| Duration | **Real audio duration** đã đo từ .mp3, không dùng script |
| Build | Render 1 lần, không concat |
| Output | Aspect đúng, audio sync, không giật |

### 7. Edge cases (xem `references/` cho chi tiết)

- Provider shadowing: `image_chatgpt2api` ép proxy 3011, không qua `image_generate` config.
- Edge TTS scene 3+ fail liên tục: tách retry script, delay 5s, tối đa 5 lần.
- Wan2.1 output 832×480 (không phải 1536×1024 dù ảnh gốc) — compose ở 832×480.
- MoviePy `AudioClip` silent bị bug duration (~0.08s) — dùng ffmpeg `anullsrc` thay thế.

---

## YouTube upload (sau khi có final.mp4)

Xem `templates/upload_youtube.py`. Setup OAuth2 1 lần, token cache pickle. `category_id="28"` cho Science & Technology.

---

## Tham khảo

- Template Python: `templates/build_landscape.py`, `build_portrait.py`, `build_tiktok_portrait.py`, `upload_youtube.py`
- Pitfall log: `references/` — từng vấn đề + cách fix gặp trong production
