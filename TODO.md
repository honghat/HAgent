1. Dịch & Lồng tiếng Video (AI Dubbing)
Mô tả: Cho phép người dùng dán link YouTube hoặc tải lên file video để AI tự động dịch và lồng tiếng (dubbing) sang Tiếng Việt, hỗ trợ tạo phụ đề cứng hoặc xuất file .srt.
Mã nguồn ở HatAI:
Frontend: 

VideoTranslator.jsx
 (UI đẹp mắt tích hợp thanh giả lập log terminal tiến trình xử lý thời gian thực).
Backend: Route api/routes/video.py và tích hợp máy chủ GPU API ngoài https://api-video.hat404.io.vn.

2. Hệ thống MCP (Model Context Protocol) & Các công cụ cục bộ (Local Tools)
Mô tả: HatAI có một thư mục 

mcp/
 riêng biệt để chạy stdio-server đăng ký và điều khiển rất nhiều tool đặc thù:
Giá vàng & Tỷ giá hối đoái: get_gold_price (lấy thời gian thực từ DOJI), get_exchange_rate (tỷ giá ngoại tệ Vietcombank).
Đọc truyện chữ: Các công cụ cào và đọc truyện từ Tàng Thư Viện (tangthuvien_tool.py) và Truyện Full (truyenfull_tool.py).
Điều khiển thiết bị thông minh Tuya (IoT): control_fan (bật/tắt quạt), control_computer (bật/tắt nguồn máy tính qua ổ cắm thông minh Tuya), list_smart_devices.
Tìm kiếm & Lấy nội dung: search_youtube / get_youtube_info / get_youtube_audio_url, cào nội dung bài viết từ VnExpress (vnexpress_scraper.py), đọc/ghi file văn bản phân trang (txt_reader_tool.py).

