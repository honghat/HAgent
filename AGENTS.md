# AGENTS.md — Hướng dẫn cho AI Coding Agents làm việc với HAgent

> Tài liệu này dành cho các AI coding agent (Claude Code, OpenCode, Cursor, Codex…) khi đóng góp vào codebase HAgent. Tham khảo thêm `CLAUDE.md`, `README.md` và `backend/SOUL.md`.

## Quy tắc bắt buộc

1. **File ≤ 2000 dòng** (rule từ `CLAUDE.md`). Vi phạm hiện tại: `backend/run_agent.py`, `backend/hagent_cli/main.py`, `frontend/src/components/OmniChat.jsx`, `frontend/src/components/FileManager.jsx`. Khi sửa các file này, ưu tiên tách module.
2. **Không commit secrets**. Mọi key/token đi qua `.env` (đã gitignore). Có template tại `.env.example`.
3. **Không sửa file ngoài phạm vi task được giao**. Dự án đang chạy production trên PM2; thay đổi lan rộng dễ gây downtime.
4. **Chạy lint/test trước khi báo xong** đối với frontend: `cd frontend && npm run lint`.
5. **Tiếng Việt cho commit message + PR title** (theo phong cách commit hiện tại của repo).

## Cấu trúc đề xuất khi đọc/sửa code

- `backend/api/` — FastAPI (port 8010) là trung tâm. Mọi business logic mới đặt ở đây, không thêm vào Node gateway.
- `backend/agent/` — orchestration LLM, prompt, memory, tools registry.
- `backend/tools/` — tool implementations (browser, terminal, web, skills…).
- `backend/plugins/` — model providers (9router), memory plugins, platforms.
- `frontend/src/components/` — React UI. Hub pattern: `*Hub.jsx` là composite, các tab/sub-page bên dưới.

## File placement policy

Agent không được tạo file mới tùy tiện. Mọi file mới phải đi qua policy runtime trong `backend/tools/file_placement_policy.py`:

- FastAPI router/service: `backend/api/routers/`, `backend/api/services/`
- Agent orchestration/prompt/memory: `backend/agent/`
- Tool implementation: `backend/tools/`
- Plugin/provider/platform integration: `backend/plugins/`
- CLI code: `backend/hagent_cli/`
- React frontend: `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/lib/`, `frontend/src/routes/`, `frontend/src/api/`
- Learn app: `learn/src/`, `learn/public/`, `learn/prisma/`
- Scripts: `scripts/`
- Docs: `docs/` hoặc các tài liệu root đã có (`README.md`, `CLAUDE.md`, `AGENTS.md`)

Khi gọi `write_file` để tạo file mới, truyền `placement_type` nếu intent không rõ. Runtime chặn file code/config mới nằm ngoài workspace hoặc sai thư mục. Sửa file đã tồn tại vẫn được phép nếu không vi phạm deny-list secrets/system paths.

## Hai chế độ agent (Plan vs Build) — *đang chuẩn hóa*

Lấy cảm hứng từ OpenCode:

- **Plan mode**: read-only, không sửa file, không chạy bash phá huỷ. Dùng cho exploration, code review, gợi ý kiến trúc.
- **Build mode**: full quyền sửa file + chạy tool, vẫn xin phép trước các action rủi ro (xóa file, gọi API rẽ tiền, gửi tin nhắn ra ngoài).

Khi viết tool mới trong `backend/tools/`, khai báo flag `plan_safe: bool` trong metadata để runtime gate ở Plan mode.

## Backlog nâng cấp nền tảng

Các điểm dưới đây là gap ưu tiên để HAgent tiến gần hơn một agent platform production-grade:

1. **Plan/Build runtime gate**: chuẩn hóa metadata `plan_safe` cho toàn bộ tool registry, chặn tool không an toàn khi agent chạy Plan mode.
2. **Audit log thống nhất**: ghi nhận tool call, workflow run, file edit, outbound message, permission change và lỗi runtime vào một audit trail có thể truy vấn.
3. **RBAC/action permissions**: phân quyền theo user/agent/channel/tool/action; đặc biệt cho file system, terminal, messaging và workflow trigger.
4. **Release automation**: CI lint/test, build artifact, SHA256 checksum, Docker/image tag, health gate PM2 trước merge/release, rollback và remote upgrade an toàn.
5. **Secrets hygiene**: mọi API key/token phải đi qua `.env` hoặc secret store; thêm scanner trước commit/release để phát hiện secret trong YAML/JSON/log.
6. **Package/runtime doctor**: kiểm tra và tự sửa môi trường `pip`/`pnpm`/binary path/native deps; có fallback registry/tarball khi install/update lỗi.
7. **Webhook trigger first-class**: endpoint nhận event có verify signature, map event vào workflow/agent, retry, dead-letter queue và audit.
8. **Vertex AI enterprise path**: nếu tích hợp Google Cloud chính thức, cần project/location/service account/IAM/quota routing/model registry thay vì chỉ Gemini API key.
9. **Security hardening xuyên suốt**: tenant isolation, scoped joins/query safety, null/invalid JSON config guard, BOM cleanup, npm alias/runtime stability, Windows/CI compatibility.

## Workflow Pull Request

1. Branch từ `main`, đặt tên `feat/...`, `fix/...`, `chore/...`.
2. Commit nhỏ, message ngắn gọn bằng tiếng Việt.
3. PR phải nêu: thay đổi gì, vì sao, đã test ra sao.
4. Không merge khi PM2 services chính (`hagent-fastapi`, `hagent-backend`) đang lỗi log mới.

## Ưu tiên khi xung đột

`CLAUDE.md` (project) > `AGENTS.md` (chung) > convention suy luận từ code.
