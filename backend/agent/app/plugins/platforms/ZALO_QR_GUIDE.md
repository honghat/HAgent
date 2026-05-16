# 📱 Zalo QR Code Login Guide

## Cách 1: Tạo Link QR để Scan từ Máy Tính

### Bước 1: Mở Zalo trên điện thoại hoặc máy tính
- Tải app Zalo (nếu chưa có)
- Mở Zalo → vào tab **"Truy cập web"** hoặc quét QR ngay trong app

### Bước 2: Tạo Session mới cho Hagent

```bash
# Khởi động gateway với chế độ QR
cd ~/hagent-agent
source venv/bin/activate

python hagent_cli/main.py gateway run --replace \
  --platform zalo_qr \
  --qr-path ~/.hagent/qrs/zalo_qr.png
```

### Bước 3: Quét QR Code
1. **Mở Zalo app trên điện thoại**
2. Chọn **"Quét mã QR"** trong menu
3. Chụp ảnh QR code xuất hiện trên terminal/console

Hoặc:
- Mở trình duyệt → https://zalo.me/qrcode
- Scan QR bằng Zalo mobile app

### Bước 4: Kết nối thành công
```
✅ Zalo QR session established!
   Session ID: zaloxq_1234567890
   User: Bot Hagent Zalo
   
Bây giờ bạn có thể:
  - Gửi tin nhắn qua Hagent
  - Nhận tin nhắn từ Zalo users
  - Chat với bot khác trên platform
```

---

## Cách 2: Sử Dụng Link QR Trực Tiếp

### Tạo link Zalo web session:

```bash
# Mở trong trình duyệt (Chrome/Firefox)
open https://zalo.me/qrcode

# Hoặc copy vào clipboard
echo "https://zalo.me/qrcode?bot_uid=YOUR_BOT_UID" | pbcopy
```

Sau đó mở Zalo app → chọn **"Chạy Zalo Web"** hoặc quét QR từ menu.

---

## Cách 3: Sử Dụng CLI Để Tự Động Tạo QR

### Cài đặt Zalo Desktop (nếu chưa có):
```bash
brew install zalo
# hoặc tải trực tiếp từ https://zalo.me/download
```

### Chạy trong Docker container (chế độ headless):

```bash
docker run -it --rm \
  -v ~/.hagent:/app/.hagent:ro \
  -v /tmp/zalo_qr.png:/app/qr.png:rw \
  ghcr.io/zalodotnet/zalo-cli:latest \
  start-bot --qr-path /app/qr.png --listen-localhost
```

QR code sẽ xuất hiện tại `/tmp/zalo_qr.png` sau khi Zalo mobile app quét.

---

## Lưu ý Quan Trọng

### ✅ QR Code Flow Pros:
- Không cần copy cookies từ browser DevTools
- Tự động tạo session mới mỗi lần
- An toàn hơn (session token-based)

### ⚠️ QR Code Flow Cons:
- Cần Zalo mobile app đang mở để quét
- Session expires sau ~30 phút không hoạt động
- Không thể dùng với máy tính khác đã login Zalo web

### 🔐 So Sánh Methods:

| Method | Setup Time | Reusability | Security | Notes |
|--------|-----------|-------------|----------|-------|
| **Browser Cookies** | ⚡ Fastest | ✅ Persistent (until logout) | ⚠️ Risky (cookies visible) | One-time setup, no QR needed |
| **QR Code** | 🟡 Medium | 🔁 Session-based (shorter) | ✅ Token-based | Needs Zalo mobile app |
| **Desktop App** | 🟢 Easiest | ✅ Auto-restart | ✅ Built-in auth | Full Zalo experience |

---

## Alternative: Sử Dụng Zalo Desktop App

### Cài đặt từ GitHub Releases:
```bash
# macOS (Intel Apple Silicon)
wget https://github.com/zalodotnet/desktop/releases/download/v1.8.4/Zalo.app.dmg
open Zalo.app.dmg
# Mount và drag vào Applications
```

### Sử dụng như bot:
```bash
# Zalo Desktop tự động chạy QR scan khi mở
open "/Applications/Zalo.app"

# Sau khi login thành công, Hagent gateway sẽ detect session
hagent gateway run --replace
```

---

## Kết Hợp Cả Hai Methods

Bạn có thể dùng cả browser cookies VÀ QR code cùng lúc:

1. **Browser Cookie** cho Zalo bot chủ yếu (persistent session)
2. **QR Code** cho chat tạm thời hoặc debug purposes

File adapter `adapter_qr.py` đã hỗ trợ cả hai flow!

---

## Troubleshooting

### "Cannot find zalo.me" in terminal
```bash
# Zalo QR service may be down temporarily
# Fallback to browser cookie method:
open https://zalo.me/
```

### "QR code expired" error
```bash
# Session timeout - login lại bằng QR hoặc refresh cookies
echo "Session expired. Please re-login via QR or copy new cookies from browser."
```

---

## Quick Start (Recommended)

**Cách nhanh nhất cho Hagent integration:**

1. Mở Chrome → https://zalo.me/
2. F12 → Application → Cookies → zalome.com tab
3. Click **"Copy as curl"** trên dòng PHPSESSID=...
4. Paste vào file profile `~/.zshrc`
5. Run gateway: `hagent gateway run --replace`

Hoặc nếu bạn muốn QR code flow, hãy mở Zalo app trước khi chạy gateway! 📱
