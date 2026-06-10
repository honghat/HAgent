"""macOS Calendar event management tool using AppleScript.

Supports creating, editing, deleting, and listing calendar events.
Requires macOS with Calendar.app installed.
"""

import json
import logging
import subprocess
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from tools.registry import registry

logger = logging.getLogger(__name__)


def check_calendar_requirements() -> bool:
    """Check if AppleScript is available (macOS only)."""
    try:
        result = subprocess.run(
            ["osascript", "-e", "return 1"],
            capture_output=True,
            timeout=2,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def run_applescript(script: str) -> str:
    """Run an AppleScript and return the output."""
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            error = result.stderr.strip() or result.stdout.strip()
            raise RuntimeError(f"AppleScript error: {error}")
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        raise RuntimeError("AppleScript command timed out")
    except FileNotFoundError:
        raise RuntimeError("AppleScript not available (macOS required)")


def calendar_event(
    action: str,
    title: Optional[str] = None,
    calendar: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    description: Optional[str] = None,
    location: Optional[str] = None,
    event_id: Optional[str] = None,
    search_term: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Manage macOS Calendar events.

    Args:
        action: "create", "edit", "delete", "list", "search"
        title: Event title (required for create/edit)
        calendar: Calendar name to create/search in (default: "Calendar")
        start_date: ISO format datetime string (e.g., "2024-12-25T14:30:00")
        end_date: ISO format datetime string
        duration_minutes: If end_date not provided, use duration from start
        description: Event description
        location: Event location
        event_id: Event unique identifier (for edit/delete)
        search_term: Search query (for search/list)

    Returns:
        Dict with status, message, and event data
    """
    calendar = calendar or "Calendar"

    try:
        if action == "create":
            if not title:
                return {
                    "success": False,
                    "error": "title is required for create action",
                }
            if not start_date:
                return {
                    "success": False,
                    "error": "start_date is required (ISO format: YYYY-MM-DDTHH:MM:SS)",
                }

            # Parse dates
            start_dt = datetime.fromisoformat(start_date)
            if end_date:
                end_dt = datetime.fromisoformat(end_date)
            elif duration_minutes:
                end_dt = start_dt + timedelta(minutes=duration_minutes)
            else:
                end_dt = start_dt + timedelta(hours=1)  # Default 1 hour

            # AppleScript to create event
            def _esc(s):
                return str(s).replace('"', '\\"')
            title_esc = _esc(title)
            start_str = start_dt.strftime("%A, %B %d, %Y %H:%M:%S")
            end_str = end_dt.strftime("%A, %B %d, %Y %H:%M:%S")
            desc_line = f'set description of newEvent to "{_esc(description)}"' if description else ""
            loc_line = f'set location of newEvent to "{_esc(location)}"' if location else ""
            script = f'''
tell application "Calendar"
    activate
    tell calendar "{calendar}"
        set newEvent to make new event at end of events
        set summary of newEvent to "{title_esc}"
        set start date of newEvent to date "{start_str}"
        set end date of newEvent to date "{end_str}"
        {desc_line}
        {loc_line}
    end tell
end tell
return "Event created successfully"
'''
            result = run_applescript(script)
            return {
                "success": True,
                "message": result,
                "event": {
                    "title": title,
                    "start": start_date,
                    "end": end_date or end_dt.isoformat(),
                    "calendar": calendar,
                    "description": description,
                    "location": location,
                },
            }

        elif action == "list":
            # List events in calendar
            script = f'''
tell application "Calendar"
    set eventList to {{}}
    tell calendar "{calendar}"
        repeat with evt in events
            set eventTitle to summary of evt
            set eventStart to start date of evt
            set eventEnd to end date of evt
            set eventData to eventTitle & "|" & eventStart & "|" & eventEnd
            copy eventData to end of eventList
        end repeat
    end tell
end tell
return eventList as text
'''
            result = run_applescript(script)
            events = []
            if result:
                for line in result.split("\n"):
                    if line.strip():
                        parts = line.split("|", 2)
                        if len(parts) == 3:
                            events.append(
                                {
                                    "title": parts[0],
                                    "start": parts[1],
                                    "end": parts[2],
                                }
                            )
            return {
                "success": True,
                "calendar": calendar,
                "event_count": len(events),
                "events": events,
            }

        elif action == "search":
            if not search_term:
                return {
                    "success": False,
                    "error": "search_term is required for search action",
                }

            search_esc = str(search_term).replace('"', '\\"')
            script = f'''
tell application "Calendar"
    set eventList to {{}}
    tell calendar "{calendar}"
        repeat with evt in events
            set eventTitle to summary of evt
            if eventTitle contains "{search_esc}" then
                set eventStart to start date of evt
                set eventEnd to end date of evt
                set eventData to eventTitle & "|" & eventStart & "|" & eventEnd
                copy eventData to end of eventList
            end if
        end repeat
    end tell
end tell
return eventList as text
'''
            result = run_applescript(script)
            events = []
            if result:
                for line in result.split("\n"):
                    if line.strip():
                        parts = line.split("|", 2)
                        if len(parts) == 3:
                            events.append(
                                {
                                    "title": parts[0],
                                    "start": parts[1],
                                    "end": parts[2],
                                }
                            )
            return {
                "success": True,
                "search_term": search_term,
                "calendar": calendar,
                "result_count": len(events),
                "events": events,
            }

        elif action == "delete":
            if not title and not event_id:
                return {
                    "success": False,
                    "error": "title or event_id is required for delete action",
                }

            # Delete by title (simple approach)
            title_esc = str(title).replace('"', '\\"')
            script = f'''
tell application "Calendar"
    tell calendar "{calendar}"
        set targetEvent to null
        repeat with evt in events
            if summary of evt = "{title_esc}" then
                set targetEvent to evt
                exit repeat
            end if
        end repeat
        if targetEvent is not null then
            delete targetEvent
            return "Event deleted successfully"
        else
            return "Event not found"
        end if
    end tell
end tell
'''
            result = run_applescript(script)
            return {
                "success": True,
                "message": result,
                "deleted_event": title,
                "calendar": calendar,
            }

        elif action == "edit":
            if not title:
                return {
                    "success": False,
                    "error": "title is required for edit action",
                }

            title_esc = str(title).replace('"', '\\"')
            start_line = (
                f'set start date of targetEvent to date "{datetime.fromisoformat(start_date).strftime("%A, %B %d, %Y %H:%M:%S")}"'
                if start_date else ""
            )
            end_line = (
                f'set end date of targetEvent to date "{datetime.fromisoformat(end_date).strftime("%A, %B %d, %Y %H:%M:%S")}"'
                if end_date else ""
            )
            desc_line = f'set description of targetEvent to "{str(description).replace(chr(34), chr(92) + chr(34))}"' if description else ""
            loc_line = f'set location of targetEvent to "{str(location).replace(chr(34), chr(92) + chr(34))}"' if location else ""
            script = f'''
tell application "Calendar"
    tell calendar "{calendar}"
        set targetEvent to null
        repeat with evt in events
            if summary of evt = "{title_esc}" then
                set targetEvent to evt
                exit repeat
            end if
        end repeat
        if targetEvent is not null then
            {start_line}
            {end_line}
            {desc_line}
            {loc_line}
            return "Event updated successfully"
        else
            return "Event not found"
        end if
    end tell
end tell
'''
            result = run_applescript(script)
            return {
                "success": True,
                "message": result,
                "updated_event": title,
                "calendar": calendar,
            }

        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}. Use 'create', 'edit', 'delete', 'list', or 'search'",
            }

    except Exception as e:
        logger.error(f"Calendar error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


# Register the tool
registry.register(
    name="calendar_event",
    toolset="calendar",
    schema={
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "edit", "delete", "list", "search"],
                "description": "Action to perform: create new event, edit existing, delete, list all, or search",
            },
            "title": {
                "type": "string",
                "description": "Event title (required for create/edit/delete, optional for list/search)",
            },
            "calendar": {
                "type": "string",
                "description": "Calendar name (default: 'Calendar')",
            },
            "start_date": {
                "type": "string",
                "description": "Start datetime in ISO format (e.g., '2024-12-25T14:30:00'). Required for create, optional for edit.",
            },
            "end_date": {
                "type": "string",
                "description": "End datetime in ISO format. If omitted, duration_minutes or 1 hour default is used.",
            },
            "duration_minutes": {
                "type": "integer",
                "description": "Event duration in minutes. Used if end_date not provided (default: 60)",
            },
            "description": {
                "type": "string",
                "description": "Event description/notes",
            },
            "location": {
                "type": "string",
                "description": "Event location",
            },
            "event_id": {
                "type": "string",
                "description": "Unique event identifier (for advanced use)",
            },
            "search_term": {
                "type": "string",
                "description": "Search query for finding events",
            },
        },
        "required": ["action"],
    },
    handler=calendar_event,
    check_fn=check_calendar_requirements,
    description="Create, edit, delete, list, and search calendar events on macOS",
    emoji="📅",
)
