# 📱 Hướng Dẫn Setup Zalo & Facebook Messenger Integration

## ✅ Tổng Quan

Hagent Gateway hiện hỗ trợ:
- ✅ **Zalo** - Đã có cấu hình cơ bản, cần thêm credentials
- ⚠️ **Facebook Messenger** - Cần cookies + Playwright

---

## 🔐 1. SETUP ZALO - Lấy Credentials

### Bước 1: Mở Browser & Lấy Cookies

```bash
# Mở Chrome/Firefox và đăng nhập Zalo tại zalo.me
# Khi đã vào được chat với một người, làm theo các bước sau:

# CHROME (DevTools -> F12)
# Application -> Cookies -> zalome.com

# Copy full cookie string giống hệt nhau:
# PHPSESSID=xxx.xxx.xxx; zalome_userid=yyy; _zalo_session=zzz; etc.
```

**HƯỚNG DẪN CHI TIẾT:**
1. Mở Chrome, vào https://zalo.me/
2. Đăng nhập Zalo bằng tài khoản cá nhân/bot của bạn
3. F12 -> Tab **Application** -> **Cookies** -> chọn `zalome.com` (hoặc `zalo.me`)
4. Kéo xuống dưới cùng, copy dòng **"Copy as curl"** hoặc **"All cookies"**
5. Chỉ giữ lại giá trị trong **Value** cột (bao gồm cả dấu `=`)

Ví dụ cookie string:
```
PHPSESSID=abc123xyz; zalome_userid=987654321; _zalo_session=def456; _ga=xxx; _gid=yyy
```

### Bước 2: Lấy Bot UID (User ID)

```bash
# F12 -> Console tab, chạy lệnh sau để lấy user_id hiện tại:
document.querySelector('div[data-tab="user"]')?.shadowRoot?.querySelector('span[id="userid"]')?.textContent
```

Hoặc: DevTools -> Elements -> Tìm `data-user-id` hoặc `id` trong các thẻ `<div>` có class chứa "user"

### Bước 3: Set Environment Variables

```bash
export ZALO_COOKIE_STRING="PHPSESSID=abc123; zalome_userid=987654"
export ZALO_IMEI="iPhone16,1"  # Hoặc Samsung SM-xxx nếu dùng Android
export ZALO_BOT_UID="1234567890"  # User ID của bot

# Thêm vào ~/.bashrc hoặc ~/.zshrc cho persistent:
echo 'export ZALO_COOKIE_STRING="YOUR_COOKIE_HERE"' >> ~/.bashrc
```

### Bước 4: Khởi Động Hagent Gateway

```bash
hagent gateway run --replace
```

✅ Zalo sẽ sẵn sàng nhận/gửi tin nhắn!

---

## 🔐 2. SETUP FACEBOOK MESSENGER - Lấy Cookies

### Bước 1: Mở Browser & Đăng Nhập Facebook

```bash
# CHROME (F12 -> Application -> Cookies -> fbsbx.com)

# 1. Mở https://facebook.com và đăng nhập
# 2. F12 -> Tab **Application** -> **Cookies**
# 3. Scroll đến tab **fbsbx.com** (chứ không phải facebook.com)
# 4. Copy cookie string từ dòng cuối cùng:

c_user=123456; ux=abc_xyz; datr=def_ghi; fr=xxx; _ga=yyy; _gid=zzz
```

### Bước 2: Cài Playwright (Nếu chưa có)

```bash
pip install playwright
playwright install chromium
```

Hoặc dùng Homebrew trên macOS:
```bash
brew install node
npm install -g @playwright-core
playwright install chromium
```

### Bước 3: Set Environment Variables

```bash
export FACEBOOK_COOKIE_STRING="c_user=123; ux=abc; datr=def"
export FACEBOOK_HEADLESS="false"  # =true để chạy ngầm (không nhìn thấy browser)

# Thêm vào shell profile:
echo 'export FACEBOOK_COOKIE_STRING="YOUR_FACEBOOK_COOKIE"' >> ~/.bashrc
```

### Bước 4: Kiểm Tra Setup

```bash
hagent list-platforms
# Sẽ hiển thị cả Zalo và Facebook Messenger trong danh sách platforms

hagent gateway run --replace
# Khởi động lại gateway với cả 2 platform
```

---

## ⚙️ 3. CẤU HÌNH CROSCHEDULE (Tự Động Gửi Tin)

### Thêm vào `backend/config.yaml`:

```yaml
cron_delivery:
  zalo:
    schedule: "*/5 * * * *"      # Kiểm tra mỗi 5 phút
  facebook:
    schedule: "*/10 * * * *"     # Kiểm tra mỗi 10 phút (FB chậm hơn)

zalo:
  enabled: true
  
facebook:
  enabled: true
```

---

## 🚨 4. LƯU Ý QUAN TRỌNG

### Zalo Pitfalls:
- ⚠️ **60s cooldown** - Zalo block reply nhanh quá, cần `_keep_typing()` giữa các message
- ⚠️ **Cookie expires** - Zalo refresh cookie thường xuyên, re-auth nếu disconnect
- ⚠️ **Max 40KB images** - Zalo compress ảnh lớn

### Facebook Messenger Pitfalls:
- ⚠️ **E2EE PIN** - Threads end-to-end encrypted cần PIN mới gửi được
- ⚠️ **Rate limits** - Facebook block spam, đừng gửi quá nhanh
- ⚠️ **Browser must be open** - Playwright cần browser chạy (headless=false mặc định)

---

## ✅ 5. KIỂM TRA KẾT QUẢ

```bash
# Xem logs:
tail -f backend/logs/gateway-autostart-output.log | grep -i "zalo\|facebook"

# Test gửi message qua terminal:
hagent deliver zalo --chat 1234567890 --message "Test từ Hagent!"
hagent deliver facebook --chat 987654321 --message "Test từ Hagent!"

# Xem platforms đã load:
hagent list-platforms
```

---

## 📞 Support Files

Files tham khảo thêm:
- `~/hagent-agent/hagent-agent/gateway/platforms/telegram.py` - Telegram adapter reference
- `backend/plugins/platforms/zalo/adapter.py` - Zalo implementation
- `backend/plugins/platforms/facebook/adapter.py` - FB Messenger implementation

---

## 🛠️ Troubleshooting

### Zalo "Connection refused"
```bash
# Kiểm tra gateway đang chạy:
lsof -i :8000  # hoặc cổng bạn dùng

# Xem logs:
tail -f backend/logs/gateway-autostart-error.log
```

### Facebook "No page found"
```bash
# Check Playwright browser installed:
ls ~/Library/Application\ Support/microsoft/playwright/chromium-*

# Nếu chưa có, install lại:
playwright install chromium
```

### Zalo/FB gửi không kịp
```yaml
# Tweak trong config.yaml:
cron_delivery:
  zalo:
    schedule: "*/10 * * * *"  # Tăng interval xuống chậm hơn
  facebook:
    schedule: "*/15 * * * *"   # Facebook chậm hơn nên polling lâu hơn
```

---

## 📝 Author Notes

**Setup hoàn thành:** Zalo ✅ + Facebook Messenger ⚠️ (cần credentials)

**Tiếp theo:**
- Lấy credentials cho platform của bạn
- Cấu hình schedule tự động gửi tin
- Test deliver qua terminal
- Xem logs để debug issues

**Questions?** Kiểm tra Hagent GitHub docs hoặc mở issue. 🎉
