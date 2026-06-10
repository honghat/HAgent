---
name: comfyui-stickfigure-workflow
description: "Tạo ảnh người que (stick figure) với các phụ kiện (mũ, kem, xe đạp...) bằng ComfyUI img2img trên Hat-Linux. Khi user yêu cầu tạo/vẽ ảnh người que với đồ vật, hãy dùng skill này."
version: 2.0.0
author: HAgent
platforms: [linux, macos]
compatibility: "Yêu cầu SSH access đến Hat-Linux (100.69.50.64) + ComfyUI port 8188. Khuyến nghị dùng Pivot Animator + ControlNet thay vì text-to-image thuần."
metadata:
  hagent:
    tags:
      - comfyui
      - stickfigure
      - img2img
      - image-generation
      - creative
    category: creative
---

# ComfyUI Stick Figure Workflow (Img2Img)

Tạo ảnh người que (stick figure) với phụ kiện/thay đổi bằng ComfyUI img2img workflow trên Hat-Linux server.

## 🚫 IMPORTANT: DO NOT

**Không dùng text-to-image thuần cho stick figure phức tạp.** 
SD img2img qua DreamShaper vẫn không đủ để tạo stick figure + vật thể (xe đạp, biểu cảm buồn, v.v.) chính xác — model không được train đủ dữ liệu này. Bắt AI tưởng tượng "stick figure riding bicycle" từ prompt text sẽ gây lỗi: bánh xe, tay, chân, khung xe biến dạng.

Nếu user muốn người que ảnh động đẹp, ít lỗi tay chân — **đề xuất pipeline dưới đây trước, không chạy ComfyUI img2img.**

## 🎯 Pipeline khuyến nghị (thứ tự ưu tiên)

### 1. Pivot Animator (Tốt nhất — recommended)
- **Mô tả**: Phần mềm chuyên làm stick figure, không phải AI
- **Ưu điểm**: Không lỗi anatomy, không biến dạng, xuất GIF/MP4 được
- **Quy trình**: Tạo motion người que chuẩn → xuất frame/video → đưa vào ComfyUI AnimateDiff + ControlNet để làm đẹp nét vẽ

### 2. ComfyUI + AnimateDiff + ControlNet/OpenPose/Lineart
- **Mô tả**: AI tạo phong cách đẹp nhưng vẫn giữ dáng nhờ pose control
- **Cần**: motion module v3, Gen2 nodes, Context Options
- **Companion nodes**: Advanced-ControlNet, VideoHelperSuite, controlnet_aux

### 3. Wan2.1 / Wan2.2 Image-to-Video
- **Mô tả**: Dễ tạo video đẹp hơn AnimateDiff
- **Nhược điểm**: Với người que dễ bị "vẽ thêm", biến dạng nếu không có control tốt
- **Dùng khi**: Có ảnh mẫu sạch + prompt rất chặt

## Khi nào dùng skill này (img2img bypass)

Chỉ dùng ComfyUI img2img (workflow hiện tại) khi:
1. User yêu cầu **tạo ảnh tĩnh** (không phải video/animation)
2. Đối tượng đơn giản (người que cơ bản, đội mũ, cầm kem)
3. User đã biết hạn chế và chấp nhận

## Quy trình thực hiện (img2img workflow)

### Bước 1: Xác định ảnh input

User có thể cung cấp ảnh gốc (path local hoặc upload). Nếu không có ảnh gốc:
- Dùng ảnh mặc định từ output trước (`stickfigure_img2img_result.png` trên Downloads)

### Bước 2: Upload ảnh input lên Hat-Linux

```bash
scp /path/to/input.png hatnguyen@100.69.50.64:~/ComfyUI/input/stickfigure_input.png
```

### Bước 3: Tạo workflow JSON với prompt phù hợp

Copy workflow từ template và điền các placeholder:

```bash
cp ~/ComfyUI/workflow_stickfigure_img2img.json ~/ComfyUI/temp_workflow.json
```

**Placeholder cần thay:**
- `w["6"]["inputs"]["text"]` → positive prompt (KSampler.positive trỏ tới node 6)
- `w["7"]["inputs"]["text"]` → negative prompt
- `w["10"]["inputs"]["image"]` → filename đã upload (VD: `"stickfigure_input.png"`)
- `w["3"]["inputs"]["denoise"]` — xem bảng tham số dưới

### Bước 4: Submit workflow qua API

```bash
WORKFLOW=$(cat ~/ComfyUI/temp_workflow.json)
curl -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": $WORKFLOW}" \
  2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('prompt_id','ERROR'))"
```

### Bước 5: Chờ và download kết quả

```bash
# Chờ 15-30s
ls -lt ~/ComfyUI/output/ | head -5

# Download ảnh mới nhất
scp hatnguyen@100.69.50.64:~/ComfyUI/output/stickfigure_output_00001_.png /Users/nguyenhat/Downloads/stickfigure_result.png
```

### Bước 6: Dọn dẹp

```bash
rm ~/ComfyUI/temp_workflow.json
```

## Tham số KSampler

| Tham số | Giá trị | Ghi chú |
|---------|---------|---------|
| steps | 20-25 | 25 cho chi tiết hơn |
| cfg | 7.0-7.5 | Cao hơn = bám prompt sát hơn |
| denoise | 0.75-0.95 | 0.75 (thay đổi nhẹ), 0.9-0.95 (gần như vẽ lại) |
| sampler | euler | Tốt cho img2img |
| scheduler | normal | |

## Prompt Template

### Positive (dùng kèm ControlNet — khuyến nghị)
```
clean simple stick figure animation, black line art, white background, correct anatomy, clear limbs, consistent body proportions, no extra lines, no malformed hands, no distorted [object], no floating [object parts]
```

### Positive (dùng riêng img2img — fallback)
```
simple black lineart of a stick figure, white background, [mô tả chi tiết tư thế/trang thai], MINIMALIST doodle, thick black strokes, centered, full body, no fill, flat vector
```

### Negative (cố định)
```
text, watermark, signature, realistic, photograph, 3d, shading, gradient, complex background, ugly, deformed, extra limbs, blurry, nude, nsfw, human face, realistic face
```

### Negative (extended — cho xe đạp/vật thể phức tạp)
```
extra limbs, broken anatomy, deformed bicycle, floating wheel, messy sketch lines, cropped body, malformed hands, duplicated arms, disconnected limbs, structural errors, malformed, tripod wheel, body merged with bike
```

## References

- `references/bike-workflow-tips.md` — Chi tiết lỗi + tham số cho bike object entanglement
- `references/animatediff-pipeline.md` — Hướng dẫn pipeline Pivot Animator → AnimateDiff → ControlNet

## Các lỗi đã ghi nhận (Known Failures)

### Lỗi 1: Bike-Object Entanglement
**Mô tả**: Xe đạp biến dạng, bánh xe lơ lửng sai vị trí, khung xe thành chân máy (tripod), tay chân người que không ăn khớp với xe. AI hiểu sai quan hệ giữa người và xe đạp.
**Nguyên nhân**: SD model không được train đủ dữ liệu stick figure + xe đạp.
**Giải pháp**: Pivot Animator + ControlNet. Không dùng text-to-image thuần.

### Lỗi 2: Stick Figure Sad — Severe anatomy & cropping failure
**Mô tả**: Oversized character bị crop, malformed hand, distorted legs, bad cropping. Tay phải biến thành nét móc, chân kéo dài và lệch.
**Nguyên nhân**: img2img từ ảnh gốc cười thành buồn, denoise cao cũng không fix được.
**Giải pháp**: Pivot Animator để vẽ pose buồn → AnimateDiff + ControlNet. Hoặc prompt rất nghiêm khắc.

### Lỗi 3: REGRESSION — Prompter càng văn hoa, lỗi càng nặng
**Mô tả**: Prompt nói "tears streaming", "drooping head", "heartbroken expression" — quá văn hoa, model hallucinate thêm chi tiết.
**Giải pháp**: Prompt phải kỹ thuật, mô tả đường nét cơ bản. Ví dụ: "head drooping downward, two black dots for eyes, no mouth, arms hanging down".
