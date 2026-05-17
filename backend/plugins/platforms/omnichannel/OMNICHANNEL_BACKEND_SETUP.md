# 🚀 OMNICHANNEL HUB BACKEND - SETUP GUIDE

## Tóm tắt

Backend **Omnichannel Hub** cung cấp unified inbox cho Zalo, Facebook Messenger với các tính năng:
- ✅ QR Code login (Zalo)
- ✅ REST API endpoints
- ✅ Chat history retrieval
- ✅ Message sending
- ✅ Cross-platform routing

---

## 📦 Cài đặt & Cấu hình

### 1. Tạo environment variables

File cấu hình đã được tạo tại:
```bash
/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/env/config.env
```

### 2. Chạy backend server

```bash
cd /Users/nguyenhat/.hagent/plugins/platforms/omnichannel/backend
chmod +x start.sh
./start.sh
```

Server sẽ chạy tại: `http://localhost:8080`

---

## 🌐 API Endpoints

### Core Chat Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/omni/conversations` | List all conversations |
| POST | `/api/v1/omni/conversations/{chat_id}/messages` | Send message |
| GET | `/api/v1/omni/conversations/{chat_id}/messages?limit=50` | Get chat history |
| POST | `/api/v1/omni/conversations/read-all` | Mark all as read |

### Zalo Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/zalo/qrcode/init` | Init QR code login |
| GET | `/api/v1/auth/zalo/qrcode/poll/{chat_id}` | Poll QR scan status |

### Status Endpoint
- `GET /api/v1/status` - Get platform connection status
- `GET /` - API info & documentation

---

## 📱 Zalo QR Code Login Setup

### Cách dùng:

1. **Initialize QR code:**
```bash
curl -X POST http://localhost:8080/api/v1/auth/zalo/qrcode/init
# or use API directly from frontend
POST /api/omni/auth/zalo/init
```

2. **Scan QR với Zalo app** → Authorization complete!

3. **Check login status:**
```bash
curl http://localhost:8080/api/v1/status
```

---

## 🔄 Tích hợp Frontend

Frontend OmniChat.jsx đang gọi `/api/omni*` endpoints. Để tích hợp backend mới:

### Option 1: Proxy qua gateway chính (Recommended)

Thêm routes vào `gateway.py`:
```python
@app.get("/api/omni/auth/zalo/init")
async def omni_zalo_init():
    """Init Zalo QR login"""
    return await call_backend_api("/api/v1/auth/zalo/qrcode/init")

@app.get("/api/omni/status")
async def omni_status():
    """Get platform status"""
    return await call_backend_api("/api/v1/status")
```

### Option 2: Direct connection (Development)

Cấu hình frontend để gọi trực tiếp port 8080.

---

## 📝 Next Steps

1. ✅ Backend đã tạo: `/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/backend/api_server.py`
2. ✅ Startup script: `start.sh`
3. ⏳ **Tạo proxy routes** trong gateway chính
4. ⏳ **Cập nhật frontend** OmniChat.jsx để gọi QR init endpoint

---

## 🛠️ Troubleshooting

### Error: "Omnichannel hub is disabled"
- Kiểm tra `OMNICHANNEL_ENABLED=true` trong `.env`
- Restart backend server

### Error: "QR code login is disabled"  
- Set `ZALO_QR_ENABLED=true` trong `.env`
- Ensure Zalo API credentials configured

---

## 📖 Tài liệu tham khảo

- [Omnichannel Hub Pattern](/Users/nguyenhat/HAgent/backend/skills/platforms-integration/references/omnichannel-hub-pattern.md)
- [Platforms Integration Skill](SKILL.md)
- SimpleAI API compatibility guide
