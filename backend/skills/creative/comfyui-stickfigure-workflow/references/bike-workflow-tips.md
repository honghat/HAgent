# Bicycle Stick Figure — Prompt Tips & Pipeline

## Khuyến nghị: KHÔNG dùng text-to-image thuần

Xem pipeline ưu tiên trong SKILL.md:
1. **Pivot Animator** → xuất frame/video
2. **ComfyUI + AnimateDiff + ControlNet/OpenPose/Lineart** → giữ dáng bằng pose
3. **Wan2.1/Wan2.2 Image-to-Video** → cần ảnh mẫu sạch + prompt chặt

## Lịch sử lỗi

### V1: Bike-Object Entanglement
- Wheel floating thành tripod, frame thành third leg
- Fix: denoise 0.85, cfg 7.5, steps 25
- **Kết quả**: vẫn méo, chỉ nhẹ hơn

### V2: Bicycle Anatomy Error
- Distorted wheels, broken frame, messy overlapping lines
- Rider-bike connection không tự nhiên
- Fix: denoise 0.9, prompt side view + diamond frame + two wheels
- **Kết quả**: nhẹ hơn V1 nhưng vẫn méo

### V3: Bicycle Anatomy Error (tiếp)
- Triệt để hơn: Denoise 0.95, prompt kỹ thuật
- **Kết quả**: tương tự, model không thể vẽ stick figure + bike chính xác dù prompt rất chi tiết

## Kết luận

Đây KHÔNG phải vấn đề prompt-tweaking. Đây là capability ceiling của SD model — forcing a generic image model to draw a technically precise bicycle via text prompt alone is unreliable.

**Dùng Pivot Animator để tạo skeleton → AnimateDiff + ControlNet để làm đẹp.**
