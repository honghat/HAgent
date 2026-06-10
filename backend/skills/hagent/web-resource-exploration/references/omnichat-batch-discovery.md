# OmniChat Batch Discovery từ Zalo "My Documents"

## Tổng quan
Khi user có conversation Zalo tên "My Documents" (hoặc tương tự) dùng để lưu link/tool/resource, workflow này dùng để:
1. Đọc toàn bộ messages từ conversation đó
2. Extract các unique resources
3. Cross-check với wiki
4. Research & lưu các mục mới

## Kiến trúc Database

**File**: `/Users/nguyenhat/HAgent/data/hagent.db` (LƯU Ý: không phải `/backend/data/`)

**Tables:**
- `omni_conversations` — Danh sách hội thoại
- `omni_messages` — Tin nhắn
- `omni_contacts` — Danh bạ

## Query mẫu

```sql
-- Tìm conversation "My Documents"
SELECT id, platform, external_id, title, custom_name, thread_type
FROM omni_conversations 
WHERE platform = 'zalo' AND (title LIKE '%My Document%' OR custom_name LIKE '%My Document%');

-- Lấy messages gần đây nhất (50 messages)
SELECT id, created_at, role, 
       substr(content, 1, 300) as preview,
       external_msg_type
FROM omni_messages 
WHERE conversation_id = '<uuid>' 
ORDER BY created_at DESC LIMIT 50;
```

## Xử lý các loại tin nhắn

| external_msg_type | Nội dung | Cách xử lý |
|-------------------|----------|-------------|
| `webchat` | Text message | Parse URL/tool name từ content |
| `chat.recommended` | JSON: title, description, href | Lấy `href` và `title` |
| `chat.photo` | Ảnh gửi | Bỏ qua |
| `chat.link` | Link | Lấy URL từ content |

## Ví dụ extract pattern từ `chat.recommended` JSON

```
{
  "title": "github.com/themanojdesai/genai-llm-ml-case-studies", 
  "description": "A collection of 500+ real-world ML & LLM system design case studies...",
  "href": "https://github.com/themanojdesai/genai-llm-ml-case-studies"
}
```

## Cross-check với Wiki

Dùng `list_wiki()` để lấy danh sách entries hiện tại. Các items đã có thì bỏ qua.

## Lưu ý

- Một số URL trong Zalo có thể đã chết (404) — cần verify bằng browser trước khi lưu wiki
- Zalo recommended links (`chat.recommended`) thường chứa URL ngắn hoặc link đã cũ
- `firefox-stealth` và `free-llm-api-keys` là examples của repo đã bị xóa/404
- Pretext (`chenglou/pretext`) có **47.6k ⭐** — SearXNG không index được nhưng browser tool tìm thấy
