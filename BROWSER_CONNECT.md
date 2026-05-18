# Kết nối HAgent với trình duyệt đang mở

HAgent có thể điều khiển trình duyệt Chrome/Edge đang mở sẵn của bạn thay vì tạo session mới.

## Cách 1: Tự động (Khuyến nghị)

```bash
# Tự động tìm và kết nối
python backend/tools/auto_connect_browser.py

# Xem danh sách trình duyệt có thể kết nối
python backend/tools/auto_connect_browser.py --list

# Kết nối vào port cụ thể
python backend/tools/auto_connect_browser.py --port 9222

# Tự động mở Chrome nếu chưa có
python backend/tools/auto_connect_browser.py --launch
```

## Cách 2: Thủ công

### Bước 1: Mở Chrome với remote debugging

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### Bước 2: Kết nối HAgent

**Tạm thời (session hiện tại):**
```bash
export BROWSER_CDP_URL="http://localhost:9222"
```

**Vĩnh viễn (thêm vào config.yaml):**
```yaml
browser:
  cdp_url: "http://localhost:9222"
```

## Kiểm tra kết nối

```bash
# Kiểm tra Chrome có bật debugging không
curl http://localhost:9222/json/version

# Test với HAgent
python -c "from tools.browser_tool import _get_cdp_override; print(_get_cdp_override())"
```

## Sử dụng

Sau khi kết nối, tất cả browser tools sẽ dùng trình duyệt đang mở:

```python
from tools.browser_tool import browser_navigate, browser_snapshot, browser_click

# Điều khiển tab hiện tại
browser_navigate("https://google.com", task_id="test")
snapshot = browser_snapshot(task_id="test")
browser_click("@e5", task_id="test")
```

## Lưu ý

- Chrome phải được mở với `--remote-debugging-port` trước
- Mặc định port là 9222, có thể dùng 9223, 9224... nếu bận
- Tất cả tabs trong Chrome đều có thể điều khiển được
- Đóng Chrome sẽ ngắt kết nối, cần kết nối lại

## Ngắt kết nối

```bash
# Xóa biến môi trường
unset BROWSER_CDP_URL

# Hoặc xóa khỏi config.yaml
# Xóa dòng: cdp_url: "http://localhost:9222"
```

## Troubleshooting

**Lỗi: "No CDP endpoint available"**
- Kiểm tra Chrome có chạy với `--remote-debugging-port` không
- Thử: `curl http://localhost:9222/json/version`

**Lỗi: "Connection refused"**
- Port 9222 có thể bị chiếm, thử port khác (9223, 9224...)
- Firewall có thể chặn, kiểm tra cài đặt

**Chrome không nhận lệnh**
- Restart Chrome với debugging flag
- Kiểm tra `BROWSER_CDP_URL` đã set đúng chưa
