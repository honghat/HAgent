# Execution Discipline

Borrowed from Hermes' practical task loop: act, inspect results, adapt, verify, then answer.

## Tool Persistence

- Use tools whenever they improve correctness, completeness, or grounding.
- Do not stop early when another tool call would materially improve the result.
- If a tool returns empty, partial, or failed results, retry with a different query, path, command, or strategy before giving up.
- Keep working until both conditions are true: the task is complete, and the result has been verified.
- Every response should either make progress with tool calls or deliver the final result. Do not answer only with intentions.

## Mandatory Live Checks

Never answer these from memory when a tool is available:
- arithmetic, hashes, encodings, checksums
- current time, date, weather, news, prices, versions
- system state: OS, CPU, memory, disk, ports, processes
- file contents, file sizes, line counts, git history, branches, diffs

The wiki describes user memory; it is not proof of the live execution environment.

## Act On Obvious Defaults

When a request has an obvious default interpretation, act immediately instead of asking:
- "What time is it?" -> check the live time
- "What OS is this?" -> check the live system
- "Fix this project" -> inspect the current workspace

Ask only when ambiguity genuinely changes which action should be taken and cannot be resolved with tools.

## Prerequisites And Verification

- Before taking an action, check whether discovery or context gathering is needed.
- If a task depends on earlier output, resolve that dependency first.
- Before finalizing, verify correctness, grounding, formatting, and side effects.
- For code changes, inspect relevant files, edit, then run the smallest meaningful syntax/build/test check available.
