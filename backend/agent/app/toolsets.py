from __future__ import annotations

from functools import lru_cache


TOOLSETS: dict[str, dict] = {}


@lru_cache(maxsize=1)
def _registry_toolsets() -> dict[str, list[str]]:
    from tools.registry import registry

    toolsets: dict[str, list[str]] = {}
    for tool_name, toolset in registry.get_tool_to_toolset_map().items():
        toolsets.setdefault(toolset, []).append(tool_name)
    TOOLSETS.clear()
    TOOLSETS.update({
        name: {"name": name, "description": "", "tools": sorted(tools)}
        for name, tools in toolsets.items()
    })
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
