# HAgent 🧠 — Autonomous AI Agent & Second Brain

HAgent là autonomous AI agent hiệu suất cao, thiết kế làm bộ não thứ hai toàn diện. Tự học từ hội thoại, quản lý kho tri thức cá nhân (Wiki), thực thi quy trình phức tạp qua **100+ công cụ** và **34 nhóm kỹ năng**.

---

## 🚀 Core Capabilities

### Orchestration
- Multi-step reasoning loop: Analyze → Retrieve → Execute
- Automatic tool selection from 100+ tools
- Self-evolving memory: extract, deduplicate, organize into Wiki after every conversation

### 34 Skill Groups
| Group | Skills |
|---|---|
| **Research** | arxiv, github-research-wiki, llm-wiki, blogwatcher, polymarket, research-paper-writing |
| **Creative** | excalidraw, manim-video, p5js, pixel-art, ascii-art, comfyui, design-md, popular-web-designs, songwriting-and-ai-music |
| **Development** | systematic-debugging, test-driven-development, subagent-driven-development, plan, writing-plans, python-debugpy, node-inspect-debugger |
| **Data/MLOps** | jupyter-live-kernel, mlops, data-science |
| **Integration** | platforms-integration, email, social-media, gmail-summarizer, mcp, github |
| **Other** | productivity, note-taking, smart-home, gaming, domain, media, gifs, red-teaming, autonomous-ai-agents, hagent (nội bộ), apple, diagramming, dogfood, inference-sh, social-media-scraping, yuanbao |

### Tool Ecosystem
- **Internet**: Web search, URL fetch, real-time news, weather
- **Finance**: Gold price (DOJI), Vietcombank rates, currency converter
- **System**: Bash execution, file CRUD, grep, edit, Docker sandbox
- **Integration**: Telegram, Zalo, Facebook, Google Drive, Gmail, Google Docs, Discord, Slack, WhatsApp, Feishu
- **Productivity**: Todo, Cron scheduler, website/service monitoring, Kanban
- **Media**: Image generation (ComfyUI, OpenAI, XAI), video generation (AnimateDiff, Wan), TTS/STT
- **Development**: Code execution, MCP tools, browser automation (CDP, Camofox)

### OmniChat Multi-channel
- Unified inbox: Zalo, Telegram, Facebook in one interface
- Per-conversation auto-reply toggle with individual AI provider selection
- Messaging gateway supporting 20+ platforms (Telegram, Zalo, Discord, Slack, WhatsApp, Signal, Matrix, DingTalk, Feishu, WeChat, QQ...)

### UI Hub Layout
- **Chat**: main conversation, embedded Wiki, Agent space, processing log as floating panel
- **System**: Files, Code, Ports in one admin area
- **Earning**: Job Hunter, Video for income/content creation
- **Learning**: Learn, English, Mindmap with sub-tabs and last-selection memory
- **Automation**: Omni (multi-channel messaging) and Workflows
- **Entertainment**: Music, Photo, Story, Camera
- **Settings**: account, Agent, connections, tools, skills, context; mobile tab icon-only

### Additional Features
- **Multi-Agent System**: multiple Bots with individual SOUL definitions
- **Smart File Conversion**: PDF, Excel, Docx → Markdown
- **MCP (Model Context Protocol)**: load external tool servers via `.mcp.json`
- **Advanced Sandbox**: code execution in Docker, Modal, Vercel, Daytona, SSH
- **Observability**: Langfuse integration for agent tracing
- **Self-Evolution**: git-based safe evolution agent
- **Vision Support**: multimodal with `view_image`
- **TTS/STT**: Edge, Piper, Kokoro, LuxTTS, Whisper (local + Groq)
- **Cron Scheduler**: periodic job scheduling
- **Memory Plugins**: Mem0, Supermemory, Honcho, Holographic, Byterover, OpenViking, RetainDB, Hindsight
- **Video Editor**: built-in video editing pipeline
- **TruyệnCV**: CV generation and job hunting automation
- **Coach**: career coaching with AI

---

## 📂 Project Structure

```
HAgent/
├── backend/                          # FastAPI (port 8010) — SYSTEM CENTER
│   ├── api/
│   │   ├── routers/                  # 52 routers: auth, sessions, messages, files, wiki,
│   │   │                             #   skills, web, workspace, video, config, agents,
│   │   │                             #   job_hunter, services, drive, evolution, goals,
│   │   │                             #   quick_commands, workflows, omni, mindmap, cv,
│   │   │                             #   lessons, learn_*, english, coach, music, photo,
│   │   │                             #   story, camera, comfyui_workflows, truyencv...
│   │   └── services/                 # 32 services: user_store, wiki_store, session_store,
│   │                                 #   wiki_memory, agent_reply, db, context_compaction,
│   │                                 #   workflow_scheduler, video_pipeline, truyencv,
│   │                                 #   goal_planner, media_queue, self_evolution...
│   ├── agent/                        # LLM orchestration (63+ modules)
│   │   ├── transports/               # anthropic, bedrock, chat_completions, codex
│   │   ├── prompt_builder.py         # Prompt construction
│   │   ├── context_engine.py         # Context management
│   │   ├── memory_manager.py         # Memory orchestration
│   │   ├── curator.py                # Skill curation
│   │   └── ...                       # adapters, caching, rate limiting, i18n, etc.
│   ├── tools/                        # 105+ tools
│   │   ├── browser_providers/        # browser_use, browserbase, firecrawl
│   │   ├── web_providers/            # brave, ddgs, searxng
│   │   ├── environments/             # docker, modal, vercel, daytona, ssh, singularity
│   │   ├── computer_use/             # computer use tooling
│   │   ├── file_operations.py        # File CRUD
│   │   ├── terminal_tool.py          # Bash execution
│   │   ├── mcp_tool.py               # MCP integration
│   │   └── ...                       # vision, tts, stt, finance, news, weather,
│   │                                  #   discord, telegram, send_message, calendar,
│   │                                  #   todo, cronjob, kanban, memory, wiki, web,
│   │                                  #   image_gen, video_gen, pdf, code_execution...
│   ├── skills/                       # 34 skill groups
│   ├── plugins/                      # Plugin system
│   │   ├── model-providers/          # 30+ providers (deepseek, openai, anthropic,
│   │   │                             #   gemini, bedrock, copilot, openrouter, ollama,
│   │   │                             #   alibaba, minimax, xai, nvidia, huggingface...)
│   │   ├── memory/                   # mem0, supermemory, honcho, holographic...
│   │   ├── platforms/omnichannel/    # Multi-channel messaging gateway
│   │   ├── image_gen/                # openai, comfyui, xai, chatgpt2api, codex
│   │   ├── context_engine/           # Context engine plugin
│   │   ├── observability/            # Langfuse integration
│   │   ├── kanban/                   # Kanban board
│   │   ├── spotify/                  # Spotify integration
│   │   └── ...                       # google_meet, teams_pipeline, disk-cleanup
│   ├── cron/                         # Cron scheduler (scheduler, loop, jobs)
│   ├── mcp/                          # MCP server integration
│   ├── hagent_cli/                   # CLI application (77 modules)
│   ├── providers/                    # Base provider classes
│   ├── services/                     # workflow_template service
│   ├── utils/                        # image_processor, omni_media_parser
│   ├── searxng-lite/                 # Local meta-search engine
│   ├── .venv/                        # Python virtualenv
│   └── requirements.txt
├── frontend/                         # React + Vite (port 3004) — UI layer
│   ├── src/
│   │   ├── components/               # 58 components: Chat, ChatHub, Wiki, SystemHub,
│   │   │                             #   LearningHub, EarningHub, AutomationHub,
│   │   │                             #   EntertainmentHub, UserSettings, CodeEditor,
│   │   │                             #   FileManager, PtyTerminal, OmniChat, JobHunter,
│   │   │                             #   Mindmap, English, Workflows, MusicLibrary,
│   │   │                             #   PhotoTab, PdfEditor, VideoEditor, StoryBrowser,
│   │   │                             #   CameraPanel, AIVideoScript, Coach, Timer...
│   │   │   └── video/                # Video editor sub-components
│   │   ├── hooks/                    # useAgentStream, useHandsFreeVoice,
│   │   │                             #   useOmnichannel, useSpeechToText
│   │   ├── lib/                      # AgentStore state management
│   │   ├── api/                      # API client modules
│   │   └── routes/                   # StoryReader, omnichannel_routes
│   ├── vite.config.js                # Proxy /api → 127.0.0.1:8010 (FastAPI)
│   └── package.json
├── projects/chatgpt2api/             # ChatGPT-to-API bridge (port 3011)
├── stt/                              # STT: Whisper, SenseVoice servers
├── tts/                              # TTS: Edge, Piper, Kokoro servers
├── rustdesk/                         # RustDesk remote desktop server
├── scripts/                          # 77 utility scripts (deploy, backup, tunnel...)
├── data/                             # Runtime data (DBs, uploads, caches)
├── docs/                             # Documentation
├── logs/                             # PM2 logs
├── ecosystem.config.cjs              # PM2 configuration
├── start.sh                          # Quick start via PM2
└── README.md
```

---

## 🏗️ Agent-Centric Architecture

FastAPI là trung tâm duy nhất. Frontend React gọi thẳng vào FastAPI qua Vite proxy.

```
Frontend (React + Vite, port 3004)
    │   /api/* proxy → Python FastAPI
    ▼
Python FastAPI (port 8010) — CENTER OF EVERYTHING
    ├── Auth, Users, Sessions, Messages
    ├── Agent loop (backend/agent/): adapters, prompt, memory, context, curator
    ├── Tools registry (backend/tools/) — 105+ tools
    ├── Skills (backend/skills/) — 34 skill groups
    ├── Wiki + RAG + Synthesis
    ├── Omnichannel gateway (backend/plugins/platforms/omnichannel)
    ├── Workspace, Files, Code editor, Cron scheduler
    ├── Job Hunter, CV, Workflows, Mindmap, Music, Photo, Story
    ├── Video editor pipeline, Coach
    └── MCP, Skills sync, Self-Evolution
```

**Auxiliary processes (PM2):** SearXNG, TTS (Edge/Piper/Kokoro/Lux), STT (Whisper/SenseVoice), Telegram bot, Omnichannel gateway, Cron, ChatGPT2API bridge, Frontend dev server.

---

## ⚙️ Setup & Run

### 1. Prerequisites
- **Node.js** ≥ 18 + **pnpm** ≥ 10 (`npm install -g pnpm`)
- **Python** ≥ 3.11
- **PM2** (`npm install -g pm2`)
- API Keys: DeepSeek (recommended), OpenAI, Anthropic, Gemini, Groq

### 2. Clone & Install
```bash
git clone https://github.com/honghat/HAgent.git
cd HAgent

# Workspace dependencies
pnpm install

# Python backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3. Configure
```bash
cp .env.example .env
```

Edit `.env`:
```env
DEEPSEEK_API_KEY=your_key_here
# Optional: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY
# Telegram (if used): TELEGRAM_BOT_TOKEN, TELEGRAM_API_ID
```

### 4. Start
```bash
# Quick start with default services via PM2
./start.sh

# Or manually
pm2 start ecosystem.config.cjs
pm2 save
```

### 5. PM2 Services

| Service | Description | Port | Default |
|---|---|---|---|
| `hagent-fastapi` | Python FastAPI agent core | 8010 | ✓ |
| `hagent-frontend` | React + Vite UI | 3004 | ✓ |
| `hagent-chatgpt2api` | ChatGPT-to-API bridge | 3011 | ✓ |
| `hagent-searxng` | Local meta-search engine | 8888 | ✓ |
| `hagent-cron` | Cron scheduler | — | ✓ |
| `hagent-tts-edge` | Edge TTS (online) | — | ✓ |
| `hagent-stt-whisper-tunnel` | Whisper STT tunnel | — | on-demand |
| `hagent-stt-sensevoice-tunnel` | SenseVoice STT tunnel | — | on-demand |
| `hagent-tts-kokoro-tunnel` | Kokoro TTS tunnel | — | on-demand |
| `hagent-tts-lux-tunnel` | LuxTTS tunnel | — | on-demand |
| `hagent-tts-piper` | Piper TTS (offline) | — | on-demand |

---

## 🧠 Tech Stack

| Layer | Stack |
|---|---|
| **Agent Core** | Python 3.11+, FastAPI, custom middleware pipeline |
| **Frontend** | React 18, Vite, Tailwind v4, MUI, CodeMirror, xterm.js |
| **Database** | SQLite (`data/hagent.db`) |
| **Search** | SearXNG-lite (local meta-search) |
| **TTS/STT** | Edge TTS, Piper, Kokoro, LuxTTS, Whisper, SenseVoice, Groq Whisper |
| **AI Providers** | DeepSeek, OpenAI, Anthropic, Gemini, Bedrock, Copilot, OpenRouter, Ollama, LM Studio, Alibaba, Minimax, XAI, NVIDIA, HuggingFace + 20+ more via plugin |
| **Messaging** | Telegram, Discord, Slack, WhatsApp, Zalo, Messenger, Signal, Matrix, DingTalk, Feishu, WeChat, QQ, Google Chat, LINE, IRC, SMS, Email... |
| **Process Mgmt** | PM2 (ecosystem.config.cjs) |
| **Package Mgmt** | pnpm workspace |
| **Deployment** | PM2, Docker (sandbox), systemd |

---

## ✅ Feature Checklist

- [x] **Stateful Orchestration** — middleware pipeline: loop detection, token tracking, auto-summarization
- [x] **Skill System** — 34 groups, 100% Claude Skills compatible
- [x] **Multi-Agent System** — multiple Bots with individual SOUL
- [x] **OmniChat** — unified inbox Zalo/Telegram/Facebook + 20 platforms
- [x] **Smart File Conversion** — PDF, Excel, Docx → Markdown
- [x] **MCP (Model Context Protocol)** — external tool servers via `.mcp.json`
- [x] **Advanced Sandbox** — Docker, Modal, Vercel, Daytona, SSH
- [x] **Observability** — Langfuse agent tracing
- [x] **Self-Evolution** — git-based safe agent evolution
- [x] **Vision Support** — multimodal with `view_image`
- [x] **TTS/STT** — Edge, Piper, Kokoro, LuxTTS, Whisper, SenseVoice (local + cloud)
- [x] **Cron Scheduler** — periodic job scheduling
- [x] **Memory Plugins** — Mem0, Supermemory, Honcho, Holographic, Byterover, OpenViking, RetainDB, Hindsight
- [x] **Video Editor** — built-in video editing pipeline with AI
- [x] **CV Generation** — TruyệnCV integration
- [x] **Job Hunter** — automated job search and application
- [x] **Music Library** — music management and playback
- [x] **Photo Management** — photo gallery and editing
- [x] **Story Platform** — story browsing, reading, and AI generation
- [x] **Coach** — AI-powered career coaching
- [x] **CLI Application** — full-featured command-line interface (`hagent`)

---

## 👥 Contributors

- [honghat](https://github.com/honghat)

## 📄 License

MIT License — © 2026 HAgent
