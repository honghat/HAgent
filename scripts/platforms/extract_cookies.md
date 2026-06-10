# 🍪 Hướng Dẫn Lấy Facebook Cookies Từ Browser

## Mục Lục
1. [Chrome - Cách Nhanh](#chrome-cách-nhanh)
2. [Firefox - Cách Nhanh](#firefox-cách-nhanh)  
3. [Edge/Opera - Cách Nhanh](#edgeopera-cách-nhanh)
4. [Cấu Hình Cookies Tự Động](#cấu-hình-cookies-tự-động)

---

## 🚀 CHROME - CÁCH NHANH

### Bước 1: Mở DevTools và Đăng Nhập Facebook

```bash
1. Mở Chrome, vào https://facebook.com
2. F12 (hoặc Ctrl+Shift+J) để mở DevTools
3. Tab **Application** → **Cookies**
4. Scroll xuống chọn tab **fbsbx.com** (quan trọng!)
5. Đăng nhập Facebook nếu chưa login

💡 Mẹo: Nếu thấy "No cookies yet", đăng xuất rồi lại vào lần nữa!
```

### Bước 2: Copy Cookies

**Cách A - Copy Manual:**
```bash
1. Chọn tab **fbsbx.com**
2. Kéo xuống cuối danh sách cookies
3. Click icon **"Copy as curl"** bên phải dòng cookie đầu tiên (c_user)
4. Dán vào text file, chỉ giữ phần giá trị:

Ví dụ kết quả:
c_user=123456; ux=abc_xyz; datr=def_ghi; fr=xxx.xxx.xxx; lsd=yyy.zzz; _ga=aaa.bbb; _gid=ccc
```

**Cách B - Copy Full:**
```bash
Copy tất cả dòng trong tab fbsbx.com (từ đầu đến cuối)
Lưu vào file ~/hagent_facebook_cookies.txt để paste sau
```

### Bước 3: Lưu Vào Environment Variables

```bash
# Tạo hoặc mở file ~/.bashrc hoặc ~/.zshrc:
vim ~/.bashrc

# Dán nội dung cookies đã copy:
export FACEBOOK_COOKIE_STRING="c_user=123456; ux=abc_xyz; datr=def_ghi; ..."

# Apply ngay:
source ~/.bashrc

# Hoặc để persistent cho tất cả sessions:
echo 'export FACEBOOK_COOKIE_STRING="YOUR_COOKIES_HERE"' >> ~/.zshrc
```

---

## 🦊 FIREFOX - CÁCH NHANH

### Bước 1: Mở DevTools và Cookies

```bash
1. Mở Firefox, vào https://facebook.com
2. F12 → Tab **Storage** → **Cookies**
3. Click dấu `+` hoặc expand domain **fbsbx.net** (Facebook)
4. Chọn tab "All" để thấy toàn bộ cookies
5. Đăng nhập Facebook nếu cần

💡 Lưu ý: Firefox group cookies theo domain, khác Chrome!
```

### Bước 2: Copy Cookies

```bash
1. Click dòng đầu tiên (c_user) → Tab **Storage Inspector**
2. Click icon **"Copy as cURL"**
3. Dán vào text editor
4. Copy toàn bộ nội dung cookie từ fbsbx.net

Ví dụ:
c_user=123456; ux=abc_xyz; datr=def_ghi; fr=...; _fbm=xxx; _ga=yyy
```

### Bước 3: Lưu Vào Profile

```bash
# Nếu dùng Firefox profile cá nhân, cookies vẫn còn trong session.
# Để persistent giữa các restart, copy vào .bashrc/.zshrc:

export FACEBOOK_COOKIE_STRING="YOUR_COOKIES_HERE"
```

---

## 🌈 EDGE/OPERA - CÁCH NHANH

### Edge

```bash
1. Edge → F12 → Tab **Application** → **Cookies**
2. Chọn domain **fbsbx.com**
3. Copy như hướng dẫn Chrome (cách B)
```

### Opera GX

```bash
1. Opera → Ctrl+Shift+I → Application tab
2. Cookies → fbsbx.com
3. Follow same steps as Chrome
```

---

## 🎯 CẤU HÌNH COOKIES TỰ ĐỘNG

### Tạo File Cookie Helper Script

<tool_call>
<function=write_file>
<parameter=content>
#!/bin/bash
# Facebook/Zalo Cookie Extractor - Automated helper

# Usage: follow this guide and save cookies to <output_file>
# Examples:
#   ~/hagent/facebook_cookies.txt
#   ~/hagent/zalo_cookies.txt

OUTPUT_FILE="${1:-$HOME/hagent_facebook_cookies.txt}"
BROWSER=${2:-"chrome"}  # chrome, firefox, edge

echo "Extracting cookies to $OUTPUT_FILE..."

case $BROWSER in
    chrome|chromium)
        echo "Opening Chrome and navigating to facebook.com..."
        open -a "Google Chrome" "https://facebook.com"
        
        # Wait for browser to open and login
        sleep 5
        
        echo ""
        echo "=== MANUAL INSTRUCTIONS ==="
        echo "1. In Chrome DevTools (F12):"
        echo "   Tab → Application → Cookies → fbsbx.com tab"
        echo ""
        echo "2. Click 'Copy as curl' icon on first cookie line"
        echo "3. Paste into: $OUTPUT_FILE"
        echo ""
        echo "4. Run: source ~/.bashrc (after saving)"
        echo ""
        ;;
    firefox)
        echo "Opening Firefox and navigating to facebook.com..."
        open -a "Firefox" "https://facebook.com"
        
        sleep 5
        
        echo ""
        echo "=== MANUAL INSTRUCTIONS ==="
        echo "1. In Firefox DevTools (F12):"
        echo "   Tab → Storage → Cookies → fbsbx.net"
        echo ""
        echo "2. Click 'Copy as cURL' on first cookie line"
        echo "3. Paste into: $OUTPUT_FILE"
        echo ""
        ;;
    edge)
        echo "Opening Edge and navigating to facebook.com..."
        open -a "Microsoft Edge" "https://facebook.com"
        
        sleep 5
        
        echo ""
        echo "=== MANUAL INSTRUCTIONS ==="
        echo "1. In Edge DevTools (F12):"
        echo "   Tab → Application → Cookies → fbsbx.com tab"
        echo ""
        echo "2. Click 'Copy as curl' on first cookie line"
        echo "3. Paste into: $OUTPUT_FILE"
        echo ""
        ;;
    *)
        echo "Unsupported browser: $BROWSER (use chrome, firefox, or edge)"
        exit 1
        ;;
esac

echo ""
echo "Browser opened! Please follow instructions above."
