# Chính sách Bảo mật — HAgent

## Báo cáo lỗ hổng

Nếu phát hiện lỗ hổng bảo mật, vui lòng:

1. **Không** mở issue công khai.
2. Liên hệ qua email maintainer hoặc Telegram bot kênh `@hagent`.
3. Cung cấp: bước tái hiện, tác động, môi trường.

Maintainer phản hồi trong **≤ 7 ngày**.

## Các loại secrets cần bảo vệ

HAgent sử dụng các secrets sau — **không** commit bất kỳ giá trị thật nào:

| Loại | File chứa | Cách xử lý |
|---|---|---|
| LLM API keys (DeepSeek, OpenAI, Anthropic, Groq, Gemini) | `.env` | gitignore |
| Telegram Bot Token + API ID/Hash | `.env` | gitignore |
| Google OAuth (YouTube, Drive, Gmail) | `backend/tokens/google_client_secret.json`, `backend/tokens/google_token.json` | gitignore |
| Auth state | `backend/tokens/auth.json` | gitignore |
| JWT secret | `.env` (`VITE_JWT_SECRET`) | gitignore |
| SSH password | `.env` (`SSH_PASSWORD`) | gitignore |
| Telegram MTProto sessions | `backend/sessions/` | gitignore |

## Pre-commit guardrail (khuyên dùng)

Cài `gitleaks` để chặn secret leak:

```bash
brew install gitleaks
gitleaks protect --staged --redact
```

Hoặc thêm vào `.husky/pre-commit`:
```bash
gitleaks protect --staged --redact --no-banner
```

Whitelist legitimate strings tại `.gitleaksignore`.

## Khi secret bị lộ

1. **Rotate ngay** (tạo key mới, vô hiệu key cũ).
2. Nếu đã push, dùng `git filter-repo` xóa khỏi history (không chỉ revert).
3. Force push (cảnh báo collaborator).
4. Audit log truy cập của key cũ (Google Cloud Console, Telegram BotFather…).

## Phạm vi quyền truy cập

- Production: chỉ maintainer chính có quyền `pm2 restart`.
- API keys: prefer scoped tokens (read-only khi đủ).
- Telegram: dùng bot mode thay vì user session khi có thể.
