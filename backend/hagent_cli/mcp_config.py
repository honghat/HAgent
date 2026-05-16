from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_path = Path(__file__).resolve().parents[1] / "mcp" / "config.py"
_spec = importlib.util.spec_from_file_location("_hagent_mcp_config", _path)
_module = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
sys.modules[_spec.name] = _module
_spec.loader.exec_module(_module)

globals().update({k: v for k, v in vars(_module).items() if not (k.startswith("__") and k.endswith("__"))})
