from tools.registry import registry, tool_result, tool_error

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
        user_id = session.user_id if session else "hat"
        
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
        
        session = get_session(session_id)
        user_id = session.user_id if session else "hat"
        
        entry = {
            "title": title,
            "content": content,
            "summary": summary or "",
            "topics": topics
        }
        result = save_wiki_entry(user_id, entry, source="tool")
        if not result:
            return tool_error("Failed to save wiki entry")
            
        status = "merged into existing" if result.get("existing") else "created new"
        return tool_result(f"Successfully {status} wiki entry: {result['title']}")
    except Exception as e:
        return tool_error(f"Wiki save failed: {e}")

registry.register(
    name="search_wiki",
    toolset="knowledge",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query for the wiki"}
        },
        "required": ["query"]
    },
    handler=search_user_wiki,
    description="Search your private HAgent Wiki memory for facts, snippets, and learned knowledge.",
    emoji="📚"
)

registry.register(
    name="save_wiki",
    toolset="knowledge",
    schema={
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short, descriptive title for the entry"},
            "content": {"type": "string", "description": "Full factual content to remember"},
            "summary": {"type": "string", "description": "A brief 1-2 sentence overview"},
            "topics": {"type": "array", "items": {"type": "string"}, "description": "Category tags/slugs"}
        },
        "required": ["title", "content"]
    },
    handler=save_user_wiki,
    description="Explicitly save a new piece of information or fact to your private Wiki memory.",
    emoji="📝"
)
