---
name: hermes-gateway
description: "Áp dụng mẫu Hermes messaging gateway cho HAgent: thêm platform mới, kiểm tra trạng thái kênh, gửi thông báo qua Telegram/Zalo, và giữ adapter tách khỏi lõi agent."
---

# Hermes Gateway for HAgent

Use this skill when the task involves messaging platforms, bot channels, cross-platform delivery, slash commands, or adding a new chat adapter.

## Core Pattern

HAgent follows the Hermes gateway idea:

1. Keep platform details inside an adapter.
2. Expose a small common contract: `status()` and `send({ userId, target, text, options })`.
3. Register the adapter in `backend/src/services/gateway/index.js`.
4. Let the agent use `gateway_status` and `gateway_send_message` instead of platform-specific logic.
5. Redact tokens and split long messages before delivery.

## Existing Platforms

- `telegram`: sends text through the active bot in `telegram_config`.
- `zalo`: sends text through the active OA config in `zalo_config`.

## Add A Platform

1. Create or update a service module for the platform under `backend/src/services/`.
2. Export a send function and a status function.
3. Register an adapter in `backend/src/services/gateway/index.js`.
4. Add any platform-specific command handling only inside the platform service.
5. Add tool descriptions only if the platform needs first-class agent actions beyond generic gateway delivery.

## Tool Usage

Check channels:

```json
{"name":"gateway_status","args":{}}
```

Send a Telegram message:

```json
{"name":"gateway_send_message","args":{"platform":"telegram","target":"123456789","text":"Nội dung cần gửi"}}
```

Send a Zalo message:

```json
{"name":"gateway_send_message","args":{"platform":"zalo","target":"zalo_user_id","text":"Nội dung cần gửi"}}
```
