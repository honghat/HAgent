# HAgent 🧠 — Trợ lý AI Tự hành & Bộ não Thứ hai

HAgent là một **autonomous AI agent** hiệu suất cao, được thiết kế để trở thành bộ não thứ hai toàn diện của bạn. Không chỉ là chatbot — HAgent có khả năng tự học từ hội thoại, quản lý kho tri thức cá nhân (Wiki), và thực hiện các quy trình công việc phức tạp thông qua hệ sinh thái hơn **50 công cụ** và **21 kỹ năng chuyên biệt**.

---

## 🚀 Khả năng Cốt lõi

### 🤖 Điều phối Thông minh (Orchestrator)
- **Suy luận đa bước**: Vòng lặp Phân tích → Truy xuất → Thực thi, không ảo giác.
- **Chọn công cụ tự động**: Tự quyết định dùng công cụ nào trong 50+ tool có sẵn.
- **Bộ nhớ tự tiến hóa**: Trích xuất, lọc trùng, tổ chức kiến thức vào Wiki cá nhân sau mỗi cuộc hội thoại.

### 🎭 Kỹ năng Chuyên biệt (21+ Skills)
| Nhóm | Kỹ năng |
|---|---|
| **Nghiên cứu** | `deep-research`, `github-deep-research`, `arxiv` |
| **Sáng tạo** | `ppt-generation`, `image-generation`, `video-generation`, `newsletter-generation` |
| **Phân tích** | `data-analysis`, `chart-visualization`, `consulting-analysis` |
| **Phát triển** | `frontend-design`, `code-documentation`, `bootstrap`, `systematic-debugging` |
| **Tích hợp** | `platforms-integration`, `google-workspace`, `github-pr-workflow`, `kanban-orchestrator` |

### 🛠️ Bộ Công cụ Tự hành
- **Internet**: Tìm kiếm web, đọc URL, tin tức thời gian thực (VnExpress, Dân Trí), thời tiết.
- **Tài chính**: Giá vàng (SJC/DOJI), tỷ giá Vietcombank, quy đổi ngoại tệ.
- **Hệ thống**: Chạy lệnh Bash, quản lý tệp (CRUD), Grep, chỉnh sửa file, Docker sandbox.
- **Tích hợp**: Telegram Bot, Zalo, Facebook, Google Drive, Gmail, Google Docs.
- **Năng suất**: Quản lý Todo, lập lịch Cron, giám sát website/dịch vụ.

### 💬 OmniChat Đa kênh
- **Inbox chung**: Gom hội thoại từ Zalo, Telegram, Facebook vào một giao diện.
- **Auto-reply linh hoạt**: Bật/tắt tự động trả lời theo từng hội thoại, chọn AI provider riêng.
- **Messaging Gateway**: Lớp adapter dùng chung (`gateway_status`, `gateway_send_message`) — dễ mở rộng Discord/Slack/WhatsApp.

---

## 📂 Cấu trúc Dự án

```text
HAgent/
├── backend/                 # Node.js Express API & Agent core
│   ├── agent/               # Agent runtime, skills, plugins
│   │   ├── app/             # Mã nguồn agent (skills, plugins, tools)
│   │   └── runtime/         # Dữ liệu runtime (profiles, skills đang dùng)
│   └── src/                 # API routes, services, prompts
├── frontend/                # Vite + React — Giao diện người dùng
├── learn/                   # Next.js — Module học tiếng Anh
├── tts/                     # Dịch vụ Text-to-Speech (Edge, Piper, LuxTTS)
├── stt/                     # Dịch vụ Speech-to-Text (Whisper)
├── 9router/                 # Reverse proxy nội bộ
├── data/                    # Dữ liệu tập trung
│   ├── hagent.db            # SQLite database chính
│   ├── wiki/                # Kho tri thức Markdown
│   ├── uploads/             # File người dùng tải lên
│   └── outputs/             # File do Agent tạo ra (PPT, ảnh, báo cáo)
├── logs/                    # Nhật ký tập trung (backend, error, app)
├── scripts/                 # Tiện ích & bảo trì
├── ecosystem.config.cjs     # Cấu hình PM2 (tất cả services)
└── start.sh                 # Script khởi chạy nhanh
```

---

## ⚙️ Cài đặt & Chạy

### 1. Yêu cầu
- **Node.js** ≥ 18
- **Python** ≥ 3.11 (cho agent & TTS/STT)
- **PM2** (`npm install -g pm2`)
- API Keys: DeepSeek (khuyên dùng), OpenAI, Anthropic, hoặc Gemini

### 2. Clone & Cài đặt
```bash
git clone https://github.com/honghat/HAgent.git
cd HAgent
npm install
```

### 3. Cấu hình
```bash
# Tạo file môi trường
cp backend/.env.example backend/.env
```

Chỉnh sửa `backend/.env`:
```env
PORT=8004
JWT_SECRET=your_secret_key
DEEPSEEK_API_KEY=your_key_here
# Tùy chọn: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
```

### 4. Khởi chạy

```bash
# Chế độ phát triển
npm run dev

# Chế độ production (PM2)
pm2 start ecosystem.config.cjs
pm2 save
```

### 5. Services PM2

| Tên Service | Mô tả | Cổng |
|---|---|---|
| `hagent-backend` | API & Agent core | 8004 |
| `hagent-frontend` | Giao diện React | 5173 |
| `hagent-learn` | Module học tiếng Anh | 3000 |
| `hagent-tts-edge` | TTS Edge (online) | — |
| `hagent-tts-piper` | TTS Piper (offline) | — |
| `hagent-tts-lux` | TTS LuxTTS (offline) | — |
| `hagent-stt` | STT Whisper (offline) | — |
| `9router` | Reverse proxy | 20128 |

---

## 🧠 Công nghệ

| Layer | Stack |
|---|---|
| **Backend** | Node.js, Express, SQLite (better-sqlite3) |
| **Frontend** | React 18, Vite, Vanilla CSS |
| **Agent** | Python 3.11+, FastAPI, custom middleware pipeline |
| **TTS/STT** | Edge TTS, Piper, LuxTTS, Whisper |
| **AI Providers** | DeepSeek, OpenAI, Anthropic, Gemini, LM Studio (local) |
| **Automation** | Telegram Bot API, Zalo/Facebook adapters, Node-Cron |
| **Deployment** | PM2, Docker (sandbox), systemd |

---

## ✅ Tính năng Đã hoàn thiện

- [x] Stateful Orchestration với middleware pipeline (loop detection, token tracking, auto-summarization)
- [x] Skill System: 21+ kỹ năng chuyên biệt, tương thích 100%
- [x] Multi-Agent System: Nhiều Bot với SOUL riêng biệt
- [x] OmniChat: Inbox đa kênh Zalo/Telegram/Facebook
- [x] Smart File Conversion: PDF, Excel, Docx → Markdown
- [x] MCP (Model Context Protocol): Nạp tool từ server ngoài qua `.mcp.json`
- [x] Advanced Sandbox: Thực thi code trong Docker cách ly
- [x] Observability: Tích hợp Langfuse theo dõi luồng agent
- [x] Self-Evolution: Agent tự cập nhật "DNA" qua `self_evolve`
- [x] Vision Support: Multimodal với `view_image`
- [x] TTS/STT nội bộ: Edge, Piper, LuxTTS, Whisper — không phụ thuộc cloud

---

## 📄 Giấy phép

MIT License — © 2026 HAgent
