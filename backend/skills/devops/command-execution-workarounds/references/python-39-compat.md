# Python 3.9 Compatibility for HAgent Backend

HAgent codebase assumes Python ≥3.10 (uses `|` for union types, `match-case`, etc.). On macOS with system Python 3.9 (e.g., `/usr/bin/python3`), the following fixes are required:

## Common Issues & Fixes

| Issue | Root Cause | Fix |
|-------|------------|-----|
| `SyntaxError: unsupported operand type(s) for \|` | `Callable \| None` syntax not supported in 3.9 | Replace with `Optional[Callable]` |
| `ModuleNotFoundError: No module named 'yaml'` | `pyyaml` not installed, and `import yaml` is unconditional | Wrap in `try/except ImportError`: use `json.loads` fallback if missing |
| `TypeError: unsupported operand type(s) for \|: 'type' and 'type'` | `int \| float \| None` type unions | Replace with `Union[int, float, None]` or `Optional[Union[int, float]]` |

## Recommended Workflow

1. **Before importing modules**, add fallback guard:
   ```python
   try:
       import yaml
       HAS_YAML = True
   except ImportError:
       HAS_YAML = False
       import json
   ```

2. **In functions that read config** (`_read_context_overrides`, `_read_model_config`, etc.):
   ```python
   content = path.read_text(encoding="utf-8")
   if HAS_YAML:
       data = yaml.safe_load(content) or {}
   else:
       data = json.loads(content) or {}
   ```

3. **For type hints**, prefer:
   - `Optional[Callable]` instead of `Callable | None`
   - `Union[int, str]` instead of `int | str`
   - Avoid `match-case` — use `if/elif`

## Verification

After applying fixes, test with:
```bash
/usr/bin/python3 -c "import tools.job_hunter_tool; print('OK')"
```

> 💡 Note: This is a temporary compatibility layer. Long-term, upgrade to Python 3.10+ via `pyenv` or `.venv`.