# TTV iPad API Capture Helper

Ứng dụng macOS SwiftUI mở bằng Xcode để hỗ trợ lấy API TTV từ iPad/iPhone.

## Cách mở

1. Mở Xcode.
2. `File > Open...`
3. Chọn thư mục `scripts/TTVApiCaptureHelper`.
4. Chọn scheme `TTVApiCaptureHelper`.
5. Run trên Mac.

Nếu app báo thiếu `xctrace`, chọn full Xcode thay vì Command Line Tools:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Cách dùng

1. Cắm iPad qua USB, mở khóa iPad, bấm `Trust This Computer`.
2. Trong app, bấm `Refresh Tools` và `Refresh iPad`.
3. Chọn iPad hoặc nhập UDID thủ công.
4. Bấm `Start RVI`.
5. Bấm `Start tcpdump`; macOS sẽ hỏi mật khẩu admin vì `tcpdump` cần quyền root.
6. Trên iPad mở app TTV, thao tác:
   - tìm truyện
   - mở chi tiết truyện
   - mở danh sách chương
   - mở một chương
7. Bấm `Stop tcpdump`, dùng `Show PCAP` để mở file capture.

## Lấy URL/API đầy đủ bằng HAgent Proxy

RVI/tcpdump thường chỉ lấy được packet metadata/domain/SNI. Với HTTPS, nội dung URL JSON bị mã hóa. Muốn lấy API đầy đủ:

1. Trong HAgent mở `Giải trí > API App`.
2. Bấm `Start HAgent Proxy`.
3. Trên iPad cấu hình Wi-Fi proxy về Server/Port HAgent hiển thị.
4. Mở Safari trên iPad tới `http://mitm.it`, cài CA và bật trust certificate.
5. Mở app TTV, tìm truyện, mở chi tiết, mục lục và một chương.
6. Trong HAgent bấm `Phân tích capture`.

Ứng dụng không lưu header/cookie/token. HAgent proxy/analyzer chỉ giữ host, path, query key không nhạy cảm và schema key. Nếu đã có HAR/cURL từ công cụ khác, vẫn có thể paste vào phần `Gửi HAR/cURL vào HAgent`.

## Giới hạn

Không có ứng dụng Xcode/macOS thông thường nào đọc trực tiếp request HTTPS của app khác trên iOS. Nếu TTV dùng certificate pinning, proxy có thể chỉ thấy domain hoặc không thấy JSON.
