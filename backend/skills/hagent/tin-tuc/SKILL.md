---
name: "tin-tuc"
description: "Lấy tin tức hàng ngày từ VnExpress. So sánh với cache, chỉ báo tin mới."
---

# Tin Tức Định Kỳ

## Nhiệm vụ
1. Fetch tin tức từ `https://vnexpress.net/` bằng web tools
2. So sánh với file cache tại `~/.hagent/news_cache.json`
3. Chỉ trả về tin mới (không có trong cache)
4. Cập nhật cache với tin mới
5. Format tin mới thành danh sách để gửi qua Telegram

## Cache Format (`~/.hagent/news_cache.json`)
```json
{
  "last_check": "2026-05-15T08:00:00",
  "urls": ["url1", "url2", ...]
}
```

## Output Format
```
📰 Tin tức mới [ngày]:

1. [Tiêu đề](url)
2. [Tiêu đề](url)
...
```

## Lưu ý
- Chỉ báo tin mới, không lặp lại tin cũ
- Dùng web_extract hoặc web_search để lấy nội dung