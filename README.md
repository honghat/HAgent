# HAgent 🧠 — Trợ lý AI tự trị & Bộ não thứ hai toàn diện

HAgent là trợ lý AI tự trị (Autonomous AI Agent) hiệu suất cao, được thiết kế để hoạt động như một bộ não thứ hai toàn diện cho bạn. Hệ thống có khả năng tự học hỏi từ mọi cuộc hội thoại, tự động quản lý và tích lũy kho tri thức cá nhân (Wiki), đồng thời thực thi các quy trình công việc phức tạp thông qua hơn **100+ công cụ** và **34 nhóm kỹ năng** tích hợp sẵn.

---

## 🚀 Khả năng Cốt lõi

### Điều phối công việc (Orchestration)
- Vòng lặp suy luận đa bước thông minh: Phân tích &rarr; Truy xuất &rarr; Thực thi.
- Tự động phát hiện và lựa chọn công cụ phù hợp từ thư viện 100+ công cụ.
- Bộ nhớ tự tiến hóa: Tự động trích xuất tri thức quan trọng, lọc trùng lặp và lưu trữ khoa học vào hệ thống Wiki sau mỗi cuộc hội thoại.

### 34 Nhóm kỹ năng đa dạng
| Nhóm kỹ năng | Chi tiết kỹ năng |
|---|---|
| **Nghiên cứu (Research)** | arxiv, github-research-wiki, llm-wiki, blogwatcher, polymarket, research-paper-writing |
| **Sáng tạo (Creative)** | excalidraw, manim-video, p5js, pixel-art, ascii-art, comfyui, design-md, popular-web-designs, songwriting-and-ai-music |
| **Phát triển (Development)** | systematic-debugging, test-driven-development, subagent-driven-development, plan, writing-plans, python-debugpy, node-inspect-debugger |
| **Dữ liệu & MLOps** | jupyter-live-kernel, mlops, data-science |
| **Tích hợp hệ thống** | platforms-integration, email, social-media, gmail-summarizer, mcp, github |
| **Khác (Other)** | productivity, note-taking, smart-home, gaming, domain, media, gifs, red-teaming, autonomous-ai-agents, hagent (nội bộ), apple, diagramming, dogfood, inference-sh, social-media-scraping, yuanbao |

### Hệ sinh thái công cụ phong phú
- **Internet**: Tìm kiếm web, tải nội dung URL, cập nhật tin tức và thời tiết theo thời gian thực.
- **Tài chính**: Tra cứu giá vàng (DOJI), tỷ giá ngoại tệ Vietcombank, bộ chuyển đổi tiền tệ.
- **Hệ thống**: Thực thi lệnh Bash, thao tác file (CRUD), tìm kiếm ripgrep, Docker sandbox an toàn.
- **Tích hợp mạng xã hội**: Telegram, Zalo, Facebook, Google Drive, Gmail, Google Docs, Discord, Slack, WhatsApp, Feishu.
- **Hiệu suất**: Quản lý công việc (Todo), Lập lịch định kỳ (Cron), Giám sát dịch vụ, Bảng Kanban.
- **Đa phương tiện**: Tạo ảnh (ComfyUI, OpenAI, xAI), Tạo video (AnimateDiff, Wan), TTS (Chuyển văn bản thành giọng nói) và STT (Nhận dạng giọng nói).
- **Phát triển**: Thực thi code, tích hợp công cụ MCP, tự động hóa trình duyệt (CDP, Camofox).

### OmniChat Đa Kênh
- Hộp thư đến hợp nhất: Quản lý tin nhắn Zalo, Telegram, Facebook tập trung trên cùng một giao diện duy nhất.
- Tự động phản hồi tin nhắn bằng AI với khả năng cấu hình nhà cung cấp AI riêng biệt cho từng cuộc hội thoại.
- Hỗ trợ hơn 20+ nền tảng gửi tin nhắn khác nhau.

### Giao diện UI Hub hiện đại
- **Chat**: Cửa sổ chat chính, tích hợp Wiki, Agent space và bảng ghi nhật ký tiến trình xử lý.
- **Hệ thống**: Quản lý File, soạn thảo Code, quản lý Cổng mạng trong một khu vực admin tập trung.
- **Thu nhập (Earning)**: Săn việc làm tự động, công cụ biên tập video kiếm tiền/tạo nội dung.
- **Học tập (Learning)**: Thẻ ghi nhớ (Recall), Luyện tiếng Anh, Bản đồ tư duy với tính năng ghi nhớ tab lựa chọn cuối cùng.
- **Tự động hóa**: Omni (tin nhắn đa kênh) và các Quy trình công việc (Workflows).
- **Giải trí**: Âm nhạc, Ảnh, Truyện (TTS nghe đọc truyện), Camera.
- **Cài đặt**: Quản lý tài khoản, cấu hình Agent, kết nối API, công cụ và kỹ năng hệ thống.

---

## 📂 Cấu trúc Dự án

```
HAgent/
├── backend/                          # Backend FastAPI (port 8010) — TRUNG TÂM ĐIỀU KHIỂN
│   ├── api/routers/                  # Endpoints API (auth, wiki, blog, story...)
│   ├── agent/                        # Logic điều phối LLM, prompts và memory
│   └── tools/                        # 105+ công cụ thực thi (file, terminal, browser...)
├── frontend/                         # React + Vite (port 3004) — Giao diện người dùng
│   └── src/components/               # Các component UI (Chat, OmniChat, BlogHub...)
└── data/                             # Dữ liệu runtime (Database SQLite/PostgreSQL, file uploads...)
```

---

## 🏗️ Kiến trúc Hệ thống

FastAPI đóng vai trò là trung tâm duy nhất xử lý mọi logic nghiệp vụ. Frontend React giao tiếp trực tiếp với FastAPI thông qua proxy của Vite. Các tiến trình bổ trợ như SearXNG, các máy chủ TTS/STT, và OmniChat gateway được quản lý tập trung thông qua **PM2**.

---

## ⚙️ Hướng dẫn Cài đặt & Chạy nhanh

### 1. Yêu cầu hệ thống
- **Node.js** &ge; 18 + **pnpm** &ge; 10
- **Python** &ge; 3.11
- **PM2** (`npm install -g pm2`)
- API Keys: DeepSeek (khuyên dùng), OpenAI, Anthropic, Gemini, Groq

### 2. Tải và cài đặt
```bash
git clone https://github.com/honghat/HAgent.git
cd HAgent

# Cài đặt thư viện frontend/workspace
pnpm install

# Khởi tạo Python backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3. Cấu hình
```bash
cp .env.example .env
```
Điền các API key của bạn vào file `.env`.

### 4. Khởi chạy
```bash
# Chạy nhanh các dịch vụ mặc định bằng PM2
./start.sh
```

---

## 📄 Bản quyền

Giấy phép MIT — © 2026 HAgent
