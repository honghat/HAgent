"""Shared helpers for direct xAI HTTP integrations."""

from __future__ import annotations


def hagent_xai_user_agent() -> str:
    """Return a stable Hagent-specific User-Agent for xAI HTTP calls."""
    try:
        from hagent_cli import __version__
    except Exception:
        __version__ = "unknown"
    return f"Hagent-Agent/{__version__}"
