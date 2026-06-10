# AnimateDiff & Stick Figure Pipeline

## Tổng quan

Pipeline này mô tả quy trình tạo stick figure animation **chính xác, không lỗi anatomy**:
1. **Pivot Animator**: tạo stick figure motion chuẩn (không AI)
2. **ComfyUI + AnimateDiff + ControlNet**: làm đẹp nét vẽ từ skeleton của Pivot Animator

## Bước 1: Pivot Animator

### Tải về
- Trang chủ: http://pivotanimator.net
- Platform: Windows (có thể chạy qua Wine/Crossover trên Mac)
- File: Pivot Animator v5.1.10 (freeware)

### Cách dùng
1. Vẽ stick figure với các khớp (joints)
2. Tạo keyframes cho từng frame animation
3. Xuất: GIF, MP4, AVI, hoặc PNG sequence
4. Output: hoặc là frames riêng lẻ, hoặc video hoàn chỉnh

### Lợi thế
- 100% kiểm soát anatomy — không lỗi tay/chân/xe đạp
- Keyframe-based — mượt, predict được
- File nhỏ, load nhanh

## Bước 2: ComfyUI AnimateDiff + ControlNet

### Yêu cầu
- ComfyUI đang chạy (Hat-Linux port 8188)
- **Custom nodes**:
  - `ComfyUI-AnimateDiff-Evolved` (Kosinkadink)
  - `ComfyUI-Advanced-ControlNet` (Kosinkadink)
  - `comfyui_controlnet_aux` (Fannovel16)
  - `ComfyUI-VideoHelperSuite` (AustinMroz)
- **Models**:
  - Motion module v3 (v3_sd15_mm)
  - ControlNet OpenPose / Lineart
  - SD1.5 checkpoint (DreamShaper 8)

### Workflow ý tưởng
1. Load Pivot Animator output frames làm input video
2. Dùng ControlNet OpenPose/Lineart để ép cấu trúc stick figure
3. AnimateDiff motion module tạo motion mượt
4. Kết hợp SparseCtrl để giữ original sketch style

### Tham số gợi ý
- Context length: 16 frames
- Steps: 20-25
- CFG: 7.0
- ControlNet strength: 0.6-0.8

## Bước 3: Wan2.1 / Wan2.2 (fallback)

Nếu AnimateDiff không khả thi, dùng Wan2.1 Image-to-Video:
- Upload ảnh stick figure mẫu sạch
- Prompt rất chặt (copy từ prompt template trong SKILL.md)
- Cần giám sát output để tránh "vẽ thêm"

## Prompt Template

Khi dùng bất kỳ pipeline nào, dùng prompt này làm base:

**Positive:**
```
clean simple stick figure animation, black line art, white background, correct anatomy, clear limbs, consistent body proportions, no extra lines, no malformed hands, no distorted bicycle, no floating wheels
```

**Negative:**
```
extra limbs, broken anatomy, deformed bicycle, floating wheel, messy sketch lines, cropped body, malformed hands, duplicated arms, disconnected limbs
```

## Notes

- Cần ComfyUI node list khả dụng trên Hat-Linux trước để biết cần install gì
- Pivot Animator có thể chạy trên Mac qua Wine, hoặc dùng các thay thế:
  - **Stick Nodes** (iOS/Android)
  - **Pivot Animator Online** (browser)
  - **Synfig Studio** (open source, complex hơn)
