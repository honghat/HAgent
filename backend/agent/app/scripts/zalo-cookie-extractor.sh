#!/bin/bash
# Zalo Cookie Extractor - Simplified for macOS
set -e

echo "======================================================================"
echo "  🎯 ZALO COOKIE EXTRACTOR FOR MAC"
echo "======================================================================"
echo ""
echo "CÁCH DÙNG: Chỉ cần đăng nhập Zalo theo hướng dẫn!"
echo ""
echo ">>> PHƯƠNG PHÁP: Đăng nhập qua QR hoặc Password, lấy cookie thủ công"
echo ""

# Bước 1: Mở browser để đăng nhập Zalo
open_url() {
    local url="${1:-https://chat.zalo.me}"
    echo ""
    echo "📱 Mở browser với Zalo..."
    echo "URL: $url"
    echo ""
    
    case "$(uname)" in
        Darwin*)  # macOS
            /usr/bin/open "$url"
            ;;
        Linux*)
            if command -v google-chrome &>/dev/null; then
                google-chrome "$url"
            elif command -v chromium-browser &>/dev/null; then
                chromium-browser "$url"
            elif command -v firefox &>/dev/null; then
                firefox "$url"
            else
                echo "⚠️ Không tìm thấy trình duyệt! Hãy mở browser và truy cập: $url"
            fi
            ;;
        *)        # Windows
            start "$url"
            ;;
    esac
    
    echo ""
    echo "✓ Browser đã mở! Bây giờ:"
    echo "  1. Đăng nhập vào Zalo (qua QR hoặc password)"
    echo "  2. Nhấn F12 để mở DevTools"
    echo "  3. Chọn tab 'Application' → Cookies"
    echo "  4. Click domain 'zalome.com'"
    echo "  5. Copy cookie string (dùng icon 'Copy as curl')"
    echo ""
    echo "======================================================================"
}

# Hiển thị hướng dẫn
open_url

echo ""
echo ">>> SAU KHI ĐÃ LOGIN THÀNH CÔNG VÀ CÓ COOKIE STRING:"
echo ""
echo "Paste toàn bộ cookie vào terminal này và nhấn Enter:"
echo "(Cookie sẽ giống như: PHPSESSID=abc123; zalome_userid=xxx...)"
echo ""
read -p "Hoặc nhập 'help' để xem hướng dẫn chi tiết (y/n): " should_help

if [[ "$should_help" == "y" || "$should_help" == "Y" ]]; then
    echo ""
    echo "--------------------------------------------------------------------"
    echo "  📋 HƯỚNG DẪN CHI TIẾT LẤY COOKIE:"
    echo "--------------------------------------------------------------------"
    echo ""
    echo "1. Mở browser và truy cập https://chat.zalo.me"
    echo "2. Đăng nhập (qua QR code hoặc password)"
    echo "3. Nhấn F12 để mở Developer Tools"
    echo "4. Click tab 'Application' hoặc 'Storage'"
    echo "5. Chọn mục 'Cookies' trong sidebar bên trái"
    echo "6. Click vào domain 'zalome.com'"
    echo ""
    echo "7. Tìm cookie đầu tiên có tên 'PHPSESSID='"
    echo "   Nó sẽ trông giống như:"
    echo "      PHPSESSID=abc123xyz; path=/; ..."
    echo ""
    echo "8. Click vào icon clipboard (hoặc 3 dấu chấm) bên cạnh cookie"
    echo "   Chọn 'Copy as curl' để copy đúng format"
    echo ""
    echo "   HOẶC click 3 dấu chấm → Copy as JSON → Parse thủ công:"
    echo "      PHPSESSID=abc123xyz; zalome_userid=xxx; ..."
    echo ""
    echo "9. Paste toàn bộ string vào terminal này và nhấn Enter!"
    echo ""
    echo "======================================================================"
fi

echo ""
# Chờ user paste cookie
echo "📋 ĐANG CHỜ COOKIE STRING..."
echo ""
read -r -p "> " ZALO_COOKIE_STRING

if [[ -z "$ZALO_COOKIE_STRING" ]]; then
    echo ""
    echo "✗ Cookie string không được để trống!"
    echo "Hãy paste lại cookie string đầy đủ và thử nữa."
    exit 1
fi

echo ""
# Kiểm tra xem cookie hợp lệ chưa
if [[ ! "$ZALO_COOKIE_STRING" =~ ^PHPSESSID= ]]; then
    echo ""
    echo "⚠️ Cookie string không bắt đầu bằng PHPSESSID="
    echo "Có thể bạn đã copy sai! Hãy đảm bảo:"
    echo "  - Đã đăng nhập Zalo thành công trên chat.zalo.me"
    echo "  - Đã click vào tab 'Cookies' trong DevTools"
    echo "  - Đã chọn domain 'zalome.com'"
    echo "  - Đã copy cookie đầu tiên (PHPSESSID=...)"
    echo ""
fi

# Lưu vào file config
echo "export ZALO_COOKIE_STRING='$ZALO_COOKIE_STRING'" >> ~/.hagent/omnichannel.env

echo ""
echo "✓ Đã lưu cookie vào ~/.hagent/omnichannel.env"
source ~/.hagent/omnichannel.env

echo "======================================================================"
echo "  ✅ COOKIE SẴN SÀNG! BÂY GIỜ HÃY TEST ZALO:"
echo "======================================================================"
echo ""
echo "Chạy lệnh sau để test Zalo adapter:"
echo ""
echo "  cd ~/.hagent/plugins/platforms/omnichannel"
echo "  python3 test_omnichannel.py ~/.hagent/omnichannel.env"
echo ""
echo "HOẶC chạy nhanh hơn:"
echo ""
echo "  source ~/.hagent/omnichannel.env"
echo "  cd ~/.hagent/plugins/platforms/omnichannel"  
echo "  python3 test_omnichannel.py"
echo ""
