# Incremental Port Rollout Pattern

Use this note when a user wants a long-running product upgrade or a reference-agent port without a risky big-bang switch.

## Core pattern

1. Create and maintain a roadmap `.md` file in the target repo.
2. Split the migration into phases with checkboxes.
3. Build the new backend surface in parallel with the old one.
4. Expose stable endpoints to the frontend one by one behind a flag or base-URL switch.
5. Keep legacy routes as fallback until the new path is proven.

## Recommended rollout order

- `sessions`
- `workspace`
- `stop`
- `status`
- `messages`

This order lets the user see progress in the UI early while the hardest compatibility piece (`messages`/streaming/tool events) is still under construction.

## Why this order works

- `sessions` and `workspace` are read-heavy and easy to verify.
- `stop` gives immediate UX value and reduces frustration during long runs.
- `status` makes polling or busy-state compatibility easier.
- `messages` is usually the hardest because of streaming, tool events, and response-shape compatibility.

## Naming rule during porting

If the user does not want the source product name inside their repo:
- keep source paths only in audit notes and roadmap reference tables,
- use neutral destination names such as `source_port`, `agent_core`, `session_state`, `tool_registry`,
- rename/remove accidental branded artifacts immediately.

## User workflow preference

If the user says variants of:
- "làm đi"
- "cứ làm"
- "không cần hỏi"
- "hoàn thiện liên tục"

then treat the migration as continuous execution work:
- move to the next obvious step without asking,
- keep updates short,
- use the roadmap file as the durable progress ledger.
