# Thư mục giọng mẫu

Đặt file WAV vào đây để LuxTTS clone giọng nói.

## Cách thêm giọng:
1. Chuẩn bị file WAV (10-30 giây, giọng rõ, không có tiếng ồn)
2. Đặt vào thư mục này, ví dụ: `english_female.wav`
3. Restart server hoặc gọi POST http://localhost:8880/voices/reload

## Gợi ý:
- Tải sample giọng từ: https://commonvoice.mozilla.org
- Dùng giọng native English speaker cho việc học
- Tên file = tên voice trong app (ví dụ: `sky.wav` → voice "sky")
