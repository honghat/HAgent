
# Các bước cần làm khi di chuyển thư mục dự án NewHat

Nếu bạn di chuyển thư mục dự án sang một vị trí mới, hãy thực hiện đúng các bước sau để đảm bảo hệ thống tự động (Agent) và App hoạt động bình thường:

## 1. Cập nhật các Script khởi động
Mở 2 file sau và sửa biến `DIR` thành đường dẫn mới:
- `start.sh`
- `daemon_start.sh`

## 2. Cập nhật cấu hình Agent (.plist)
Mở file `io.vn.hatai.newhat.plist` và sửa toàn bộ các đường dẫn cũ thành đường dẫn mới tại các mục:
- `<key>WorkingDirectory</key>`
- `<key>ProgramArguments</key>` (phần đường dẫn tới `daemon_start.sh`)
- `<key>StandardOutPath</key>`
- `<key>StandardErrorPath</key>`

## 3. Cập nhật Next.js Config
Mở `next.config.ts` và sửa:
- `outputFileTracingRoot: 'đường/dẫn/mới'`

## 4. Đăng ký lại Agent với macOS
Chạy các lệnh sau trong Terminal:
```bash
# Gỡ bỏ cấu hình cũ
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/io.vn.hatai.newhat.plist

# Cập nhật file .plist mới vào hệ thống
cp [ĐƯỜNG_DẪN_MỚI]/io.vn.hatai.newhat.plist ~/Library/LaunchAgents/

# Nạp lại cấu hình mới
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.vn.hatai.newhat.plist
```

## 5. Build lại App tại vị trí mới
Để Prisma và Next.js nhận diện đúng môi trường mới:
```bash
cd [ĐƯỜNG_DẪN_MỚI]
npx prisma generate
npm run build
./start.sh
```

---
*Lưu ý: Nếu di chuyển sang ổ cứng ngoài, hãy đảm bảo ổ cứng luôn được kết nối trước khi đăng nhập vào Mac.*
