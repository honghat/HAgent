# Reading Raw GitHub Content via Browser

## Problem
`web_extract` (SearXNG) không thể lấy nội dung từ `raw.githubusercontent.com` vì backend chỉ hỗ trợ search.

## Solution: Browser navigate + console

Thay vì dùng `web_extract`, navigate browser đến URL raw, rồi đọc qua browser_console:

```javascript
// Đọc text content từ raw page
document.body.innerText

// Hoặc nếu page có HTML styling
document.querySelector('body').textContent

// Nếu page trả về JSON
JSON.parse(document.body.innerText)

// Nếu page trả về nội dung có cấu trúc (pre, code blocks)
document.querySelector('pre').textContent
```

## Common Raw URLs

| Platform | Pattern |
|---|---|
| GitHub raw | `https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>` |
| HuggingFace raw | `https://huggingface.co/<org>/<model>/raw/main/<file>` |

## Edge Cases

- **Empty page**: Nếu `document.body.innerText` trả về rỗng, thử kiểm tra response headers với curl
- **Redirects**: Một số URLs raw có thể redirect — dùng `curl -sL` để verify trước
- **Binary files**: Hình ảnh, PDFs sẽ không đọc được — skip
- **Rate limiting**: GitHub raw có rate limit 60 req/h (không cần token)
