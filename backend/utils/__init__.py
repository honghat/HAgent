"""Utility modules for HAgent backend."""

# Import all functions from utils.py to maintain backward compatibility
import sys
from pathlib import Path

# Add parent directory to path to import utils.py
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

# Import from utils.py (the file, not the package)
try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("_utils_module", parent_dir / "utils.py")
    if spec and spec.loader:
        _utils_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_utils_module)
        
        # Export all public functions from utils.py
        atomic_replace = _utils_module.atomic_replace
        atomic_write_text = _utils_module.atomic_write_text
        atomic_json_write = _utils_module.atomic_json_write
        atomic_yaml_write = _utils_module.atomic_yaml_write
        is_truthy_value = _utils_module.is_truthy_value
        env_var_enabled = _utils_module.env_var_enabled
        base_url_hostname = _utils_module.base_url_hostname
        base_url_host_matches = _utils_module.base_url_host_matches
        normalize_proxy_url = _utils_module.normalize_proxy_url
        normalize_proxy_env_vars = _utils_module.normalize_proxy_env_vars
        safe_json_loads = _utils_module.safe_json_loads
        setup_unixodbc_anonymity = _utils_module.setup_unixodbc_anonymity
        
        __all__ = [
            'atomic_replace',
            'atomic_write_text',
            'atomic_json_write',
            'atomic_yaml_write',
            'is_truthy_value',
            'env_var_enabled',
            'base_url_hostname',
            'base_url_host_matches',
            'normalize_proxy_url',
            'normalize_proxy_env_vars',
            'safe_json_loads',
            'setup_unixodbc_anonymity',
        ]
except Exception as e:
    # Fallback: if import fails, just pass
    import warnings
    warnings.warn(f"Failed to import utils.py functions: {e}")



