---
name: apple-calendar
category: apple
description: Create, read, and manage macOS Calendar events via Swift + EventKit. Handles recurring events, alarms, and delegation-based AppleScript.
tags: [macos, calendar, eventkit, swift, applescript]
---

# Apple Calendar

Create, manage, and query macOS Calendar events using **Swift + EventKit** (preferred) or AppleScript (fallback).

## When to use

- User asks to create/delete/modify a calendar event
- User wants a recurring alarm or reminder sync'd to Calendar
- User needs a daily/weekly event with alarms

## Script: create daily event

Use `scripts/create_event.swift` — creates an event with:
- Custom title
- Daily recurrence
- 5-minute-before alarm
- Works in the "Nhà" (Home) calendar

### Usage

```bash
swift scripts/create_event.swift
```

### Prerequisites

Calendar permission for **Terminal** must be granted:
**System Settings > Privacy & Security > Calendar** → toggle Terminal on.

## Script: list calendars

Use `scripts/list_calendars.swift` to discover available calendar names.

## Pitfalls

- **AppleScript with `calendar "..."` fails if the calendar name contains non-ASCII characters or doesn't exist.** Always discover calendars first.
- **`daily` is NOT a valid AppleScript variable.** Don't use `{frequency:daily}` — this caused `The variable daily is not defined` error.
- **Swift `requestAccess(to: .event)` is deprecated on macOS 14+.** Use `requestFullAccessToEventsWithCompletion:` for newer targets, but the deprecated API still works if permission is granted.
- **Calendar permission must be granted BEFORE running the script** — there's no runtime prompt handling in a simple CLI script.
- **Semaphore-based waiting** is needed because EventKit callbacks are async; 10 seconds is sufficient.
