---
name: video-dubbing
description: Tự động dịch và lồng tiếng Việt cho video từ YouTube, Bilibili, Douyin hoặc file upload bằng công cụ dub_video.
---

# 🎬 Tự động Dịch và Lồng tiếng Video

Kỹ năng này cho phép Agent lồng tiếng Việt cho các video từ YouTube, Bilibili, Douyin hoặc file upload bằng cách sử dụng công cụ `dub_video`.

## 🛠 Cách sử dụng

Khi người dùng cung cấp một URL video (hoặc yêu cầu lồng tiếng cho video vừa upload), hãy thực hiện các bước sau:

1.  **Phân tích URL:** Xác định nền tảng (YouTube, Bilibili, Douyin).
2.  **Lựa chọn Giọng đọc:** 
    *   Sử dụng `hoaimy` (nữ) nếu không có yêu cầu đặc biệt.
    *   Sử dụng `namminh` (nam) nếu người dùng yêu cầu giọng nam.
3.  **Kích hoạt Tool:** Gọi công cụ `dub_video` với URL và giọng đọc tương ứng.
4.  **Thông báo:** Sau khi gọi tool, hãy thông báo cho người dùng rằng tác vụ đã được tạo và họ có thể theo dõi tiến trình trong tab **Video**.

## 📝 Ví dụ câu lệnh

- "Lồng tiếng cho video YouTube này giúp mình: https://www.youtube.com/watch?v=..."
- "Dịch và lồng tiếng Việt cho video Bilibili này bằng giọng nam nhé."

## ⚠️ Lưu ý

- Công cụ này hỗ trợ lồng tiếng AI với chất lượng cao.
- Quá trình xử lý video (tải về, dịch sub, lồng tiếng) có thể mất vài phút tùy thuộc vào độ dài video.
- Agent không cần phải chờ video xử lý xong, chỉ cần xác nhận tác vụ đã được đưa vào hàng đợi.
