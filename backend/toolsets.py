from __future__ import annotations

from functools import lru_cache


TOOLSETS: dict[str, dict] = {}


_last_generation = -1
_cached_toolsets = {}


def _registry_toolsets() -> dict[str, list[str]]:
    from tools.registry import registry
    global _last_generation, _cached_toolsets

    with registry._lock:
        current_gen = registry._generation
        if current_gen == _last_generation:
            return _cached_toolsets

        toolsets: dict[str, list[str]] = {}
        for tool_name, toolset in registry.get_tool_to_toolset_map().items():
            toolsets.setdefault(toolset, []).append(tool_name)
        TOOLSETS.clear()
        TOOLSETS.update({
            name: {"name": name, "description": "", "tools": sorted(tools)}
            for name, tools in toolsets.items()
        })
        _cached_toolsets = toolsets
        _last_generation = current_gen
        return toolsets


def get_all_toolsets() -> dict[str, list[str]]:
    return dict(_registry_toolsets())


def validate_toolset(name: str) -> bool:
    return name in _registry_toolsets()


def resolve_toolset(name: str) -> list[str]:
    return list(_registry_toolsets().get(name, []))


def get_toolset_info(name: str) -> dict:
    tools = resolve_toolset(name)
    return {
        "name": name,
        "description": "",
        "tools": tools,
        "tool_count": len(tools),
    }


def get_toolset_names() -> list[str]:
    return sorted(_registry_toolsets())
