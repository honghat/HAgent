# React Async Message Rendering — Pitfalls

## The Problem

Trong chat UI (hoặc bất kỳ UI nào append message vào list trước khi fetch async), user message có thể **không hiển thị kịp** nếu `setMessages` (append user message) đặt **sau** một `await` gọi async (tạo session, gửi request, etc.).

```
❌ BAD: setMessages() nằm sau await fetch/async
  -> user thấy loading indicator nhưng không thấy tin nhắn của mình
  -> đặc biệt tệ khi createSession() mất >100ms

✅ GOOD: setMessages() user message ngay từ đầu hàm send()
  -> user thấy tin nhắn của mình ngay khi nhấn Send
  -> loading indicator hiển thị song song
```

## Root Cause

React `useState` setter là async trong cùng một sự kiện. Khi `setLoading(true)` được gọi trước `setMessages`, component re-render với `loading=true` nhưng `messages` chưa được cập nhật. Nếu UI hiển thị loading bubble dựa trên `loading && !streamingText`, user message bị thiếu.

## Fix Pattern

```javascript
// ✅ Luôn gắn user message TRƯỚC mọi await
const userMsgId = Date.now().toString()
setMessages((prev) => [...prev, { role: 'user', content, id: userMsgId }])

// Sau đó mới tạo session / gọi API
let sessionId = activeId
if (!sessionId) {
  setLoading(true)
  const session = await createSession()
  sessionId = session.id
}

setLoading(true)
// ... phần còn lại
```

## Edge Cases

- **Không có activeId**: gọi `createSession()` mất thời gian — setMessages trước await là critical.
- **Loading queue** (pendingFollowUps): tin nhắn vào queue không hiển thị ngay — cần cho user thấy trạng thái "đang chờ gửi" ở composer.
- **Stream bị ngắt + fallback**: nếu stream error, refreshSessionState sẽ load lại messages từ server. Nếu server chưa kịp lưu user message, nó sẽ mất — cần gửi `POST /messages` retry.
