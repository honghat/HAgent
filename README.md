# HAgent 🧠 - Trợ lý AI Tự hành & Bộ não Thứ hai Thông minh

HAgent là một trợ lý AI tự hành (autonomous AI agent) hiệu suất cao, được thiết kế để trở thành "Bộ não thứ hai" toàn diện của bạn. HAgent không chỉ đơn thuần là chatbot; nó có khả năng tự học hỏi từ các cuộc hội thoại, quản lý kho tri thức cá nhân (Wiki) và thực hiện các quy trình công việc phức tạp thông qua hệ sinh thái hơn **50 công cụ (tools)** và **20 kỹ năng chuyên biệt (skills)**.


## 🚀 Khả năng Cốt lõi

### 🤖 Trí tuệ Tự hành (Orchestrator)
- **Suy luận Đa bước**: Sử dụng vòng lặp Phân tích → Truy xuất → Thực thi để giải quyết các yêu cầu phức tạp mà không bị ảo giác (hallucination).
- **Lựa chọn Công cụ Thông minh**: Tự động quyết định sử dụng công cụ nào trong số hơn 50 công cụ có sẵn dựa trên nhu cầu thực tế.
- **Bộ nhớ Tự tiến hóa**: Tự động trích xuất, lọc trùng và tổ chức kiến thức từ các cuộc trò chuyện vào Wiki cá nhân của bạn.

### 🎭 Kỹ năng Chuyên biệt (HAgent Compatible)
HAgent hiện bao gồm hơn **21 kỹ năng cao cấp** để tự động hóa các tác vụ phức tạp:
- **Nghiên cứu**: `deep-research` (nghiên cứu web chuyên sâu), `github-deep-research`.
- **Sáng tạo nội dung**: `ppt-generation` (tạo slide PowerPoint), `image-generation`, `video-generation`, `newsletter-generation`.
- **Phân tích**: `data-analysis` (xử lý Excel/CSV), `chart-visualization`, `consulting-analysis`.
- **Phát triển**: `frontend-design` (tạo giao diện UI/UX), `code-documentation`, `bootstrap` (khởi tạo dự án).

### 🛠️ Bộ Công cụ Tự hành
- **Internet**: Tìm kiếm web, đọc nội dung URL, tin tức thời gian thực (VnExpress, Dân Trí), thời tiết.
- **Tài chính**: Giá vàng (SJC/DOJI), tỷ giá Vietcombank, quy đổi ngoại tệ.
- **Hệ thống**: Chạy lệnh Bash, quản lý tệp tin (CRUD), tìm kiếm Grep, chỉnh sửa file.
- **Tích hợp**: Telegram Bot, Zalo, Facebook, Google Drive, Gmail, Google Docs.
- **Năng suất**: Quản lý Todo, lập lịch tác vụ (Cron), giám sát website/dịch vụ.

### 💬 OmniChat
- **Inbox đa kênh**: Gom hội thoại từ Zalo, Telegram và Facebook vào một giao diện quản lý chung.
- **Phản hồi thủ công hoặc tự động**: Bật/tắt auto-reply theo từng hội thoại, chọn provider AI riêng khi cần.
- **Quản lý hội thoại**: Tìm kiếm, lọc theo kênh, ghim hội thoại/tin nhắn và xóa toàn bộ lịch sử OmniChat từ giao diện.

---

## 📂 Cấu trúc Dự án

```text
HAgent/
├── backend/                # Server Node.js Express (Mã nguồn & API)
├── frontend/               # Ứng dụng Vite + React (Giao diện người dùng)
├── data/                   # Dữ liệu ứng dụng tập trung (Database, Wiki, Uploads, Outputs)
│   ├── hagent.db           # Cơ sở dữ liệu SQLite chính
│   ├── wiki/               # Kho tri thức dựa trên Markdown
│   ├── uploads/            # Tệp người dùng tải lên
│   └── outputs/            # Các tệp do Agent tạo ra (PPT, ảnh, báo cáo)
├── logs/                   # Nhật ký hoạt động tập trung (Backend, Error, App)
├── rustdesk/               # Hạ tầng máy chủ điều khiển từ xa (hbbs, hbbr)
├── scripts/                # Các kịch bản tiện ích & Bảo trì bot Telegram
└── start.sh                # Kịch bản khởi chạy nhanh toàn bộ hệ thống
```

---

## ⚙️ Hướng dẫn Cài đặt

### 1. Yêu cầu Hệ thống
- Node.js (phiên bản 18 trở lên)
- API Keys: DeepSeek (Khuyên dùng), OpenAI, Anthropic, hoặc Gemini.

### 2. Cài đặt
```bash
# Clone dự án
git clone https://github.com/honghat/HAgent.git
cd HAgent

# Cài đặt phụ thuộc (Sử dụng Workspaces)
npm install
```

### 3. Cấu hình
Tạo tệp `backend/.env`:
```env
PORT=8004
JWT_SECRET=your_secret_key
DEEPSEEK_API_KEY=your_key_here
# Tùy chọn: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
```

### 4. Khởi chạy
```bash
# Chạy cả Backend và Frontend trong chế độ phát triển
npm run dev
```

---

## 🚀 Lộ trình Phát triển (Roadmap)

HAgent đang trong quá trình nâng cấp toàn diện để đạt được sự tương đồng về tính năng với hệ điều hành HAgent.

### ✅ Đã hoàn thiện
- **Stateful Orchestration**: Hệ thống điều phối trạng thái dựa trên luồng suy nghĩ.
- **Middleware Pipeline**: Clarification, Loop Detection, Token Tracking, Auto-summarization.
- **Skill System**: Kế thừa và tương thích 100% với 21+ kỹ năng chuyên sâu.
- **UI/UX ChatGPT-style**: Collapsible Thinking, Side Panel Artifacts, Mode Selector (Flash/Pro).
- **Multi-Agent System**: Khả năng tạo và quản lý nhiều Bot với SOUL riêng biệt.
- **Smart File Conversion**: Tự động chuyển đổi PDF, Excel, Docx sang Markdown để Agent xử lý.
- **MCP (Model Context Protocol)**: Hỗ trợ nạp công cụ từ các máy chủ MCP bên ngoài qua `.mcp.json`.
- **OmniChat đa kênh**: Inbox chung cho Zalo/Telegram/Facebook với tìm kiếm, lọc kênh, ghim tin, auto-reply theo hội thoại và xóa lịch sử.
- **Hermes-style Messaging Gateway**: Lớp adapter chung cho Telegram/Zalo/Facebook với `gateway_status`, `gateway_send_message`, tách platform khỏi lõi agent để dễ mở rộng Discord/Slack/WhatsApp.
- **Advanced Sandbox**: Thực thi code trong môi trường Docker cách ly (Sử dụng `docker_run`).
- **Observability**: Tích hợp Langfuse để theo dõi và tối ưu hóa luồng chạy của Agent qua middleware.
- **Self-Evolution**: Agent tự soi xét kết quả và cập nhật "DNA" hệ thống qua công cụ `self_evolve`.
- **Vision Support**: Thêm công cụ `view_image` và hỗ trợ đa phương thức (multimodal) cho LLM.
- **Claude Code Integration**: Kỹ năng `claude-to-hagent` để điều khiển HAgent từ Terminal.

---

## 🧠 Công nghệ Sử dụng

- **Lõi (Core)**: Node.js, Express, SQLite (better-sqlite3)
- **Giao diện (UI)**: React 18, Vite, Vanilla CSS (Thẩm mỹ cao cấp)
- **Điều phối AI**: Middleware tùy chỉnh (Phát hiện lặp, theo dõi Token, làm sạch Logic)
- **Tự động hóa**: Telegram Bot API, Zalo/Facebook messaging adapters, Node-Cron, Thực thi tiến trình con (Child Process)

---

## 📄 Giấy phép
Giấy phép MIT - Bản quyền (c) 2026 HAgent.
