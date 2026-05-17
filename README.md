# HAgent 🧠 — Trợ lý AI Tự hành & Bộ não Thứ hai

HAgent là một **autonomous AI agent** hiệu suất cao, được thiết kế để trở thành bộ não thứ hai toàn diện. Không chỉ là chatbot — HAgent tự học từ hội thoại, quản lý kho tri thức cá nhân (Wiki), và thực thi quy trình công việc phức tạp qua hệ sinh thái **50+ công cụ** và **21+ kỹ năng chuyên biệt**.

---

## 🚀 Khả năng Cốt lõi

### 🤖 Điều phối Thông minh (Orchestrator)
- **Suy luận đa bước**: Vòng lặp Phân tích → Truy xuất → Thực thi, không ảo giác.
- **Chọn công cụ tự động**: Tự quyết định dùng công cụ nào trong 50+ tool có sẵn.
- **Bộ nhớ tự tiến hóa**: Trích xuất, lọc trùng, tổ chức kiến thức vào Wiki sau mỗi cuộc hội thoại.

### 🎭 Kỹ năng Chuyên biệt (21+ Skills)
| Nhóm | Kỹ năng |
|---|---|
| **Nghiên cứu** | `deep-research`, `github-deep-research`, `arxiv` |
| **Sáng tạo** | `ppt-generation`, `image-generation`, `video-generation`, `newsletter-generation` |
| **Phân tích** | `data-analysis`, `chart-visualization`, `consulting-analysis` |
| **Phát triển** | `frontend-design`, `code-documentation`, `bootstrap`, `systematic-debugging` |
| **Tích hợp** | `platforms-integration`, `google-workspace`, `github-pr-workflow`, `kanban-orchestrator` |

### 🛠️ Bộ Công cụ Tự hành
- **Internet**: Tìm kiếm web, đọc URL, tin tức thời gian thực, thời tiết.
- **Tài chính**: Giá vàng (DOJI), tỷ giá Vietcombank, quy đổi ngoại tệ.
- **Hệ thống**: Chạy lệnh Bash, quản lý tệp (CRUD), Grep, chỉnh sửa file, Docker sandbox.
- **Tích hợp**: Telegram Bot, Zalo, Facebook, Google Drive, Gmail, Google Docs, Discord, Slack, WhatsApp.
- **Năng suất**: Quản lý Todo, lập lịch Cron, giám sát website/dịch vụ.

### 💬 OmniChat Đa kênh
- **Inbox chung**: Gom hội thoại từ Zalo, Telegram, Facebook vào một giao diện.
- **Auto-reply linh hoạt**: Bật/tắt tự động trả lời theo từng hội thoại, chọn AI provider riêng.
- **Messaging Gateway**: Lớp adapter dùng chung hỗ trợ 20+ nền tảng (Telegram, Zalo, Discord, Slack, WhatsApp, Signal, Matrix, DingTalk, Feishu, WeChat, QQ...).

---

## 📂 Cấu trúc Dự án

```text
HAgent/
├── backend/
│   ├── api/                       # FastAPI — TRUNG TÂM hệ thống
│   │   ├── routers/               # auth, sessions, messages, files, wiki, skills, web, workspace, video, config, agents, job_hunter, services, drive, evolution, goals...
│   │   └── services/              # user_store, wiki_store, session_store, wiki_memory, agent_reply, db, context_compaction...
│   ├── agent/                     # LLM orchestration, prompt, memory, context, tools (50+), skills (21+)
│   ├── plugins/                   # model-providers (9router...), memory, google_meet...
│   ├── .env
│   └── requirements.txt
├── frontend/                      # React + Vite — Lớp hiển thị
│   ├── src/
│   │   ├── components/            # Chat, FileManager, PortManager, Wiki, VideoPage, JobHunter...
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
├── data/                          # Dữ liệu tập trung
│   └── hagent.db                  # SQLite database
├── logs/                          # Nhật ký tất cả services (PM2)
├── scripts/                       # Script tiện ích (start, rustdesk, mount, telegram...)
├── tts/                           # Text-to-Speech (Edge TTS, Piper)
├── stt/                           # Speech-to-Text (Whisper)
├── learn/                         # Module học (Next.js)
├── rustdesk/                      # RustDesk remote desktop server
├── config/                        # Cấu hình
├── ecosystem.config.cjs           # PM2 config
├── README.md
└── .gitignore
```

---

## 🏗️ Kiến trúc Hướng Agent (Agent-Centric)

### Mục tiêu

Python agent là **trung tâm duy nhất** của toàn bộ hệ thống. Node.js backend trở thành API gateway mỏng (auth + static files). Frontend React chỉ thuần hiển thị kết quả từ agent.

### Trạng thái Hiện tại

```
Frontend (React) → hiển thị + một số business logic
         ↓  tất cả /api/* đến Node
Node.js Express (port 8004) → auth, static files, proxy
         ↓  phần lớn business logic proxy sang Python
Python FastAPI (port 8010) → ĐANG là TRUNG TÂM xử lý chính
    ├── Sessions, Messages, Agent loop     ✓ Đã xong
    ├── Tools, Registry                     ✓ Đã xong
    ├── Auth + Users                        ✓ Đã có (auth.py, user_store.py)
    ├── Wiki + RAG                          ✓ Đã có (wiki.py, wiki_store.py, wiki_memory.py)
    ├── Gateway đa nền tảng (20+)           ✓ Đã có (gateway/platforms/)
    ├── Skills management                   ✓ Đã có (skills_tool.py)
    ├── Web search, File ops                ✓ Đã có (web_tools.py, file_tools.py)
    ├── Workspace, Services                 ✓ Đã có (workspace.py, services.py)
    ├── Video management                    ✓ Đã có (video.py)
    ├── Job Hunter                          ✓ Đã có
    └── Cron scheduler                      ✓ Đã có (cron/)
```

### Kiến trúc Mục tiêu

```
Frontend (React) — Lớp hiển thị THUẦN. Không business logic.
    ↓  tất cả /api/* đến Node (single origin)
Node.js Express — Gateway MỎNG: xác thực JWT + static files
    ↓  tất cả business /api/* proxy sang Python
Python FastAPI (port 8010) — TRUNG TÂM của MỌI THỨ
    ├── Auth, Users, Sessions, Messages
    ├── Agent loop, Tools, Registry
    ├── Wiki + RAG + Synthesis
    ├── Gateway đa nền tảng (20+ platforms)
    ├── Skills, Web, Workspace, Services, Video
    ├── Cron, Job Hunter, MCP
    └── Tất cả business logic khác
```

### Backend Node.js Mục tiêu

```js
// THIN GATEWAY
app.use(express.static('public'));
app.use('/api/v1', v1Router);          // OpenAI/Anthropic compat (giữ)
app.use('/api', authMiddleware);       // Xác thực JWT
app.use('/api', pythonProxy());        // TẤT CẢ còn lại → Python
app.use('/health', (req, res) => ...);
```

**Node chỉ giữ lại:** `routes/v1.js` (OpenAI compat), auth middleware, static files, spawn Python process.

---

## ⚙️ Cài đặt & Chạy

### 1. Yêu cầu
- **Node.js** ≥ 18
- **Python** ≥ 3.11
- **PM2** (`npm install -g pm2`)
- API Keys: DeepSeek (khuyên dùng), OpenAI, Anthropic, Gemini

### 2. Clone & Cài đặt
```bash
git clone https://github.com/honghat/HAgent.git
cd HAgent

# Node.js dependencies
npm install

# Python dependencies
cd backend/agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Cấu hình
```bash
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
| `hagent-backend` | Node.js gateway + spawn Python agent | 8004 |
| `hagent-fastapi` | Python FastAPI agent core | 8010 |
| `hagent-frontend` | Giao diện React | 3004 |
| `hagent-telegram` | Telegram bot service | — |
| `hagent-learn` | Module học tiếng Anh | 8006 |
| `hagent-tts-edge` | TTS Edge (online) | — |
| `hagent-cron` | Cron scheduler | — |
| `9router` | AI provider proxy/load balancer | 20128 |

---

## 🧠 Công nghệ

| Layer | Stack |
|---|---|
| **Agent Core** | Python 3.11+, FastAPI, custom middleware pipeline |
| **Gateway** | Node.js, Express |
| **Frontend** | React 18, Vite, Vanilla CSS |
| **Database** | SQLite (hagent.db) |
| **TTS/STT** | Edge TTS, Piper, LuxTTS (ZipVoice), Whisper |
| **AI Providers** | DeepSeek, OpenAI, Anthropic, Gemini, Bedrock, Copilot, OpenRouter, Ollama + 15+ providers qua plugin |
| **Messaging** | Telegram, Discord, Slack, WhatsApp, Zalo, Messenger, Signal, Matrix, DingTalk, Feishu, WeChat, QQ, Google Chat, LINE, IRC, SMS, Email... |
| **Deployment** | PM2, Docker (sandbox), systemd |

---

## ✅ Tính năng Chính

- [x] **Stateful Orchestration** — middleware pipeline: loop detection, token tracking, auto-summarization
- [x] **Skill System** — 21+ kỹ năng chuyên biệt, tương thích 100%
- [x] **Multi-Agent System** — nhiều Bot với SOUL riêng biệt
- [x] **OmniChat** — inbox đa kênh Zalo/Telegram/Facebook + 20 nền tảng
- [x] **Smart File Conversion** — PDF, Excel, Docx → Markdown
- [x] **MCP (Model Context Protocol)** — nạp tool từ server ngoài qua `.mcp.json`
- [x] **Advanced Sandbox** — thực thi code trong Docker, Modal, Vercel, Daytona, SSH
- [x] **Observability** — tích hợp Langfuse theo dõi luồng agent
- [x] **Self-Evolution** — agent tự cập nhật qua git-based safe evolution
- [x] **Vision Support** — multimodal với `view_image`
- [x] **TTS/STT nội bộ** — Edge, Piper, LuxTTS, Whisper (không phụ thuộc cloud)
- [x] **Cron Scheduler** — lập lịch công việc định kỳ
- [x] **Memory Plugins** — Mem0, Supermemory, Honcho, Holographic, Byterover, OpenViking, RetainDB, Hindsight

---

## 📄 Giấy phép

MIT License — © 2026 HAgent
