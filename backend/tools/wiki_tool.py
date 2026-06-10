from tools.registry import registry, tool_result, tool_error
import json

_DEFAULT_USER = "398f6a8a-8954-4315-8240-df769e664b54"

def search_user_wiki(args, **kwargs):
    """Search the user's private HAgent Wiki for relevant information."""
    query = args.get("query")
    session_id = kwargs.get("session_id")
    if not query:
        return tool_error("Missing query")
    
    try:
        from api.services.session_store import get_session
        from api.services.wiki_memory import search_wiki
        
        session = get_session(session_id)
        user_id = session.user_id if session else _DEFAULT_USER
        
        results = search_wiki(user_id, query)
        if not results:
            return tool_result("No matching wiki entries found in your private memory.")
        
        formatted = []
        for r in results:
            formatted.append(f"### {r['title']}\n**Summary:** {r['summary']}\n\n{r['content']}")
        
        return tool_result("\n\n---\n\n".join(formatted))
    except Exception as e:
        return tool_error(f"Wiki search failed: {e}")

def save_user_wiki(args, **kwargs):
    """Explicitly save an entry to the user's private HAgent Wiki."""
    title = args.get("title")
    content = args.get("content")
    summary = args.get("summary")
    topics = args.get("topics", ["general"])
    session_id = kwargs.get("session_id")
    
    if not title or not content:
        return tool_error("Title and content are required")
    
    try:
        from api.services.session_store import get_session
        from api.services.wiki_memory import save_wiki_entry
        from api.services.wiki_policy import GIT_WIKI_BLOCK_REASON, contains_git_material
        
        session = get_session(session_id)
        user_id = session.user_id if session else _DEFAULT_USER
        
        entry = {
            "title": title,
            "content": content,
            "summary": summary or "",
            "topics": topics
        }
        if contains_git_material(entry):
            return tool_error(GIT_WIKI_BLOCK_REASON)
        result = save_wiki_entry(user_id, entry, source="tool")
        if not result:
            return tool_error("Failed to save wiki entry")
            
        status = "merged into existing" if result.get("existing") else "created new"
        return tool_result(f"Successfully {status} wiki entry: {result['title']}")
    except Exception as e:
        return tool_error(f"Wiki save failed: {e}")

def edit_user_wiki(args, **kwargs):
    """Edit an existing wiki entry (title, content, summary, or topics)."""
    entry_id = args.get("entry_id")
    title = args.get("title")
    content = args.get("content")
    summary = args.get("summary")
    topics = args.get("topics")
    session_id = kwargs.get("session_id")
    
    if not entry_id:
        return tool_error("entry_id is required")
    
    try:
        from api.services.session_store import get_session
        from api.services.wiki_store import update_entry, get_entry
        from api.services.wiki_policy import GIT_WIKI_BLOCK_REASON, contains_git_material
        
        session = get_session(session_id)
        user_id = session.user_id if session else _DEFAULT_USER
        
        existing = get_entry(entry_id, user_id)
        if not existing:
            return tool_error(f"Wiki entry '{entry_id}' not found")
        
        updates = {}
        if title is not None: updates["title"] = title
        if content is not None: updates["content"] = content
        if summary is not None: updates["summary"] = summary
        if topics is not None: updates["topics"] = json.dumps(topics)
        
        if not updates:
            return tool_error("Nothing to update — provide at least one field")
        if contains_git_material(updates):
            return tool_error(GIT_WIKI_BLOCK_REASON)
        
        result = update_entry(entry_id, user_id, updates)
        if not result:
            return tool_error("Failed to update wiki entry")
        
        return tool_result(f"Updated wiki entry: {result['title']}")
    except Exception as e:
        return tool_error(f"Wiki edit failed: {e}")

def delete_user_wiki(args, **kwargs):
    """Delete a wiki entry by its ID."""
    entry_id = args.get("entry_id")
    session_id = kwargs.get("session_id")
    
    if not entry_id:
        return tool_error("entry_id is required")
    
    try:
        from api.services.session_store import get_session
        from api.services.wiki_store import delete_entry, get_entry
        
        session = get_session(session_id)
        user_id = session.user_id if session else _DEFAULT_USER
        
        if not get_entry(entry_id, user_id):
            return tool_error(f"Wiki entry '{entry_id}' not found")
        
        if delete_entry(entry_id, user_id):
            return tool_result(f"Deleted wiki entry: {entry_id}")
        return tool_error("Failed to delete wiki entry")
    except Exception as e:
        return tool_error(f"Wiki delete failed: {e}")

def list_user_wiki(args, **kwargs):
    """List all wiki entries with their IDs and titles."""
    session_id = kwargs.get("session_id")
    
    try:
        from api.services.session_store import get_session
        from api.services.wiki_memory import list_wiki_entries
        
        session = get_session(session_id)
        user_id = session.user_id if session else _DEFAULT_USER
        
        entries = list_wiki_entries(user_id)
        if not entries:
            return tool_result("No wiki entries found.")
        
        lines = []
        for e in entries:
            lines.append(f"- **{e['title']}** (id: `{e['id']}`)")
        return tool_result("## Wiki Entries\n" + "\n".join(lines))
    except Exception as e:
        return tool_error(f"Wiki list failed: {e}")

registry.register(
    name="search_wiki",
    toolset="knowledge",
    schema={
        "name": "search_wiki",
        "description": "Search your private HAgent Wiki memory for facts, snippets, and learned knowledge. This queries the real SQLite database (data/hagent.db) — it will return empty only if nothing matches the query. Use list_wiki first to see all entries.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query for the wiki"}
            },
            "required": ["query"]
        },
    },
    handler=search_user_wiki,
    description="Search your private HAgent Wiki memory for facts, snippets, and learned knowledge. This queries the real SQLite database (data/hagent.db) — it will return empty only if nothing matches the query. Use list_wiki first to see all entries.",
    emoji="📚"
)

registry.register(
    name="save_wiki",
    toolset="knowledge",
    schema={
        "name": "save_wiki",
        "description": "Explicitly save a new piece of information or fact to your private Wiki memory.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short, descriptive title for the entry"},
                "content": {"type": "string", "description": "Full factual content to remember"},
                "summary": {"type": "string", "description": "A brief 1-2 sentence overview"},
                "topics": {"type": "array", "items": {"type": "string"}, "description": "Category tags/slugs"}
            },
            "required": ["title", "content"]
        },
    },
    handler=save_user_wiki,
    description="Explicitly save a new piece of information or fact to your private Wiki memory.",
    emoji="📝"
)

registry.register(
    name="edit_wiki",
    toolset="knowledge",
    schema={
        "name": "edit_wiki",
        "description": "Edit an existing wiki entry. Provide entry_id and the fields to update.",
        "parameters": {
            "type": "object",
            "properties": {
                "entry_id": {"type": "string", "description": "ID of the wiki entry to edit"},
                "title": {"type": "string", "description": "New title (optional)"},
                "content": {"type": "string", "description": "New content (optional)"},
                "summary": {"type": "string", "description": "New summary (optional)"},
                "topics": {"type": "array", "items": {"type": "string"}, "description": "New topics/tags (optional)"}
            },
            "required": ["entry_id"]
        },
    },
    handler=edit_user_wiki,
    description="Edit an existing wiki entry. Provide entry_id and the fields to update.",
    emoji="✏️"
)

registry.register(
    name="delete_wiki",
    toolset="knowledge",
    schema={
        "name": "delete_wiki",
        "description": "Delete a wiki entry by its ID. Use list_wiki first to find the entry ID — do NOT guess or assume IDs.",
        "parameters": {
            "type": "object",
            "properties": {
                "entry_id": {"type": "string", "description": "ID of the wiki entry to delete"}
            },
            "required": ["entry_id"]
        },
    },
    handler=delete_user_wiki,
    description="Delete a wiki entry by its ID. Use list_wiki first to find the entry ID — do NOT guess or assume IDs.",
    emoji="🗑️"
)

registry.register(
    name="list_wiki",
    toolset="knowledge",
    schema={
        "name": "list_wiki",
        "description": "List all wiki entries with their IDs and titles. ALWAYS call this first when asked about wiki — do NOT guess or assume what exists in the database. The wiki is stored in data/hagent.db and already contains real entries.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        },
    },
    handler=list_user_wiki,
    description="List all wiki entries with their IDs and titles. ALWAYS call this first when asked about wiki — do NOT guess or assume what exists in the database. The wiki is stored in data/hagent.db and already contains real entries.",
    emoji="📋"
)
