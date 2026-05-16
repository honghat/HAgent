---
name: telegram-message-receiver
description: Backend skill for receiving and processing Telegram messages, routing incoming Telegram bot messages to the appropriate HAgent agents or processes.
---

# Telegram Message Receiver

Use this skill when working on Telegram bot ingestion, message routing, or backend processing for HAgent.

## Scope

- Receive incoming Telegram updates.
- Normalize messages for HAgent chat/agent processing.
- Route messages to the correct agent, worker, or process.
- Preserve useful message metadata for debugging and follow-up actions.

## Notes

This skill was migrated from the legacy JS skill metadata so Python HAgent skills tooling can discover it via `skills_list` and load it via `skill_view`.
