# Backend Agent

Chạy local bằng môi trường riêng:

```bash
cd /Users/nguyenhat/HAgent
python3 -m venv backend/agent/.venv
./backend/agent/.venv/bin/python -m pip install -r backend/agent/requirements.txt
cd backend
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8004/api/sessions
```

Data dùng chung với backend chính ở:

```bash
/Users/nguyenhat/HAgent/data
```

Agent API lưu state riêng trong `data/agent_state.db`, còn backend Node vẫn dùng `data/hagent.db`.

Biến môi trường frontend để trỏ sang backend mới:

```bash
VITE_USE_NEW_BACKEND=true
# Không cần đặt VITE_NEW_BACKEND_BASE_URL khi chạy qua backend JS.
```

Frontend local đã được cấu hình sẵn tại `frontend/.env.local`.

Chạy giao diện để test:

```bash
cd /Users/nguyenhat/HAgent/frontend
npm run dev
```

Mặc định Vite chạy ở:

```bash
http://127.0.0.1:3004
```
