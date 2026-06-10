# HAgent YouTube Video

Chrome extension một nút để gửi video YouTube đang mở vào tab `Video` của HAgent.

## Cài đặt

1. Mở Chrome: `chrome://extensions`.
2. Bật `Developer mode`.
3. Chọn `Load unpacked`.
4. Chọn thư mục:
   `scripts/hagent-youtube-video-extension`

## Cách dùng

- Mở một video YouTube dạng `/watch?v=...`.
- Bấm nút nổi `Gửi HAgent` ở góc dưới bên phải.
- Video YouTube đang phát sẽ được dừng trước khi gửi.
- Extension lưu video qua API local và focus lại tab HAgent cũ ở `https://hatai.io.vn/`.
- Nếu muốn dùng icon trên thanh Chrome, bấm icon extension cũng gửi video đang mở ngay.

Nếu đã có tab `https://hatai.io.vn/` đang mở, extension sẽ focus lại tab đó và chuyển thẳng tới video vừa gửi.

Video được lưu qua API `POST /api/entertainment/videos` và sẽ hiện trong tab `Giải trí > Video`.
