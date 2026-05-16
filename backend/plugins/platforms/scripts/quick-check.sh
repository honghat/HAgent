# 📱 Hagent Platform Plugins - Zalo & Facebook Messenger

## ✅ Đã Cài Đặt

| Platform | Status | Location |
|----------|--------|----------|
| **Zalo** | ⚠️ Plugin-ready (credentials needed) | `~/.hagent/plugins/platforms/zalo/` |
| **Facebook Messenger** | ⚠️ Plugin-ready (Playwright) | `~/.hagent/plugins/platforms/facebook/` |
| **Telegram** | ✅ Built-in (already running) | `gateway/platforms/telegram.py` |

---

## 📂 Cấu Trúc Thư Mục

```
~/.hagent/plugins/platforms/
├── zalo/
│   ├── plugin.yaml         # Zalo configuration
│   └── adapter.py          # Zalo API implementation
├── facebook/
│   ├── plugin.yaml         # Facebook Messenger config
│   └── adapter.py          # Playwright automation
└── scripts/
    ├── extract_cookies.sh  # Cookie extraction helper
    └── setup-wizard.sh     # Full setup script
```

---

## 🔧 Cách Sử Dụng

### 1. Khởi Động Gateway Với Tất Cả Platforms

```bash
cd ~/hagent-agent
source venv/bin/activate

# Gateway tự động load tất cả plugins được enable trong config.yaml
hagent gateway run --replace
```

Gateway sẽ:
- ✅ Load Telegram (built-in)
- ⚠️ Load Zalo (nếu có ZALO_COOKIE_STRING)
- ⚠️ Load Facebook Messenger (nếu có FACEBOOK_COOKIE_STRING)

---

### 2. Gửi Tin Nhắn Qua Platforms

**Zalo:**
```bash
hagent deliver zalo \
  --chat 1234567890 \
  --message "Hello từ Hagent! 🤖"
```

**Facebook Messenger:**
```bash
hagent deliver facebook \
  --chat YOUR_THREAD_ID \
  --message "Hi from Hagent bot!"
```

**Telegram (đã có sẵn):**
```bash
hagent deliver telegram \
  --chat 8524428325 \
  --message "Test message"
```

---

### 3. Tự Động Cron Delivery

Gateway sẽ tự động polling theo schedule trong config.yaml:

- **Zalo**: Kiểm tra mỗi 5 phút (`*/5 * * * *`)
- **Facebook**: Kiểm tra mỗi 10 phút (`*/10 * * * *`)
- **Telegram**: Real-time (instant delivery)

---

## 🔐 Setup Credentials

### Zalo Credentials Required:
```bash
# 1. Login to https://zalo.me/
# 2. F12 → Application → Cookies → zalome.com
# 3. Copy cookie string (from "Copy as curl")

export ZALO_COOKIE_STRING="PHPSESSID=xxx; zalome_userid=yyy"
export ZALO_IMEI="iPhone16,1"        # Optional: device type
export ZALO_BOT_UID="9876543210"     # Optional: bot user ID

# Add to ~/.zshrc for persistence:
echo 'export ZALO_COOKIE_STRING="YOUR_COOKIES"' >> ~/.zshrc
```

### Facebook Messenger Cookies Required:
```bash
# 1. Login to https://facebook.com/
# 2. F12 → Application → Cookies → fbsbx.com tab
# 3. Copy cookie string from fbsbx.com domain

export FACEBOOK_COOKIE_STRING="c_user=xxx; ux=yyy; datr=zzz"
export FACEBOOK_HEADLESS="false"    # Default: show browser window

# Add to ~/.zshrc for persistence:
echo 'export FACEBOOK_COOKIE_STRING="YOUR_FACEBOOK_COOKIES"' >> ~/.zshrc
```

---

## 🚀 Quick Setup Script

Tự động setup cả Zalo và Facebook:

```bash
cd ~/.hagent/plugins/platforms
chmod +x scripts/setup-wizard.sh
./scripts/setup-wizard.sh
```

Hoặc dùng lệnh ngắn gọn:

<tool_call>
<function=write_file>
<parameter=content>
#!/bin/bash
# Quick Zalo & Facebook Setup

echo "🚀 Hagent Zalo-FB Quick Setup"
echo ""

ZALO_COOKIES="${ZALO_COOKIE_STRING:-}"
FB_COOKIES="${FACEBOOK_COOKIE_STRING:-}"

if [ -n "$ZALO_COOKIES" ] && [[ "$ZALO_COOKIES" == *"PHPSESSID"* ]]; then
    echo "✅ Zalo credentials found!"
else
    echo "⚠️  Zalo: No cookies detected. Login first, then run setup-wizard.sh"
fi

if [ -n "$FB_COOKIES" ] && [[ "$FB_COOKIES" == *"c_user"* ]]; then
    echo "✅ Facebook cookies found!"
else
    echo "⚠️  Facebook: No cookies detected. Login first, then run setup-wizard.sh"
fi

echo ""
echo "To set up Zalo/Facebook credentials:"
echo "  1. Run: ./scripts/setup-wizard.sh"
echo "  2. Or follow manual instructions in SETUP_ZALO_FB.md"
echo ""
echo "Gateway will auto-start with available platforms."
