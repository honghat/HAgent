# Vite Static Build + Reverse Proxy Pattern

## Kiến trúc liên kết Frontend-Backend sau khi build

### Nguyên tắc cốt lõi
**Frontend KHÔNG bao giờ hardcode URL backend tuyệt đối.** Tất cả API call trong `Chat.jsx` và component khác đều dùng đường dẫn tương đối (relative path):

```jsx
// ✅ CORRECT — relative path, hoạt động sau build
fetch('/api/sessions', { ... })

// ❌ WRONG — absolute URL, sẽ bị khóa vào lúc build
fetch('http://localhost:8010/api/sessions', { ... })
```

Trong `Chat.jsx`, helper `withBackendBase()` đơn giản trả về chính path đó (không tiền tố host):

```js
const newBackendBase = ''
const withBackendBase = (path, preferNew = false) => {
  if (preferNew && useNewBackend) return `${newBackendBase}${path}`
  return path // chỉ trả về '/api/...' tương đối
}
```

### Môi trường nào cũng vậy

| Môi trường | Cách chuyển tiếp `/api/*` sang backend |
|------------|----------------------------------------|
| Development (`npm dev` / `pnpm dev`) | Vite dev server proxy trong `vite.config.js`: `'/api': { target: 'http://127.0.0.1:8010' }` |
| Preview (`pnpm preview`) | Vite preview proxy cùng config trên |
| Production (sau `pnpm build`) | **PM2 hoặc Nginx reverse proxy** — không qua Vite nữa |

### Production: PM2/Nginx là cầu nối duy nhất

Sau `pnpm build`, thư mục `dist/` chứa file tĩnh. Browser load trang từ domain → gửi API request đến `https://domain/api/...`.

**Cầu nối phải được cấu hình ở tầng reverse proxy:**

#### PM2 example (`ecosystem.config.js`):
```js
{
  apps: [{
    name: 'hagent-frontend',
    script: 'serve',
    args: 'dist -p 3004',
    // Hoặc dùng nginx upstream proxy cho /api
  }]
}
```

#### Nginx pattern:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
location / {
    root /path/to/dist;
    try_files $uri $uri/ /index.html;
}
```

## Debugging: Frontend build rồi không gọi được backend?

1. Kiểm tra browser DevTools Network tab: request đi đến đâu? (domain hay localhost?)
2. Nếu đang truy cập qua domain, mọi request `/api/...` phải được PM2/nginx转发
3. Log PM2/nginx xem có route nào nhận `/api` không
4. Backend FastAPI chạy port 8010 và accessible không?

## Static asset proxy

Một số resource không đi qua `/api` mà cần rule riêng:
- `/uploads` → `http://127.0.0.1:8010`
- `/audio_cache` → `http://127.0.0.1:8010`
- `/cache-images` → `http://127.0.0.1:8010`

Thiếu rule này → API 200 OK nhưng images/audio 404.
