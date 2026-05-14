import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { PROJECT_ROOT } from '../../config.js';

const execFileAsync = promisify(execFile);

function getPythonBin() {
  const candidates = [
    process.env.HERMES_PYTHON,
    '/Users/nguyenhat/miniconda3/bin/python3',
    process.env.HATAI_PYTHON,
    '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python',
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || 'python3';
}

function safeWorkdir(input) {
  const raw = input || process.env.TERMINAL_CWD || PROJECT_ROOT;
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
  return existsSync(resolved) ? resolved : PROJECT_ROOT;
}

function parseResultJson(raw) {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return null;
  }
}

export function hermesExecuteCodeSandboxDenied(payload) {
  const result = parseResultJson(payload?.result);
  const text = [
    payload?.error,
    payload?.result,
    result?.error,
    result?.output,
  ].filter(Boolean).join('\n');
  return /Operation not permitted/i.test(text) && /execute_code|sandbox|Errno 1|\[Errno 1\]/i.test(text);
}

function buildHermesToolsStub() {
  return String.raw`
import fnmatch
import json
import os
import re
import shlex
import subprocess
import time
import urllib.request

_SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}

def _resolve(path="."):
    return os.path.abspath(os.path.expanduser(path or "."))

def _iter_files(root):
    root = _resolve(root)
    if os.path.isfile(root):
        yield root
        return
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".cache")]
        for name in files:
            yield os.path.join(current, name)

def terminal(command, timeout=None, workdir=None):
    proc = subprocess.run(
        command,
        shell=True,
        cwd=_resolve(workdir or os.getcwd()),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    output = proc.stdout
    if proc.stderr:
        output += ("\n--- stderr ---\n" + proc.stderr)
    return {"output": output, "stdout": proc.stdout, "stderr": proc.stderr, "exit_code": proc.returncode}

def read_file(path, offset=1, limit=500):
    file_path = _resolve(path)
    with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
        lines = handle.readlines()
    start = max(int(offset or 1) - 1, 0)
    end = start + int(limit or 500)
    return {"content": "".join(lines[start:end]), "total_lines": len(lines), "path": file_path}

def write_file(path, content):
    file_path = _resolve(path)
    os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return {"status": "ok", "path": file_path, "bytes": len(content.encode("utf-8"))}

def search_files(pattern, target="content", path=".", file_glob=None, limit=50, offset=0, output_mode="content", context=0):
    root = _resolve(path)
    limit = int(limit or 50)
    offset = int(offset or 0)
    matches = []
    if target == "files":
        for file_path in _iter_files(root):
            rel = os.path.relpath(file_path, root if os.path.isdir(root) else os.path.dirname(root))
            if fnmatch.fnmatch(os.path.basename(file_path), pattern) or fnmatch.fnmatch(rel, pattern):
                matches.append({"path": file_path})
        return {"matches": matches[offset:offset + limit], "count": len(matches)}

    regex = re.compile(pattern)
    for file_path in _iter_files(root):
        if file_glob and not fnmatch.fnmatch(os.path.basename(file_path), file_glob):
            continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
                lines = handle.readlines()
        except OSError:
            continue
        for idx, line in enumerate(lines, 1):
            if regex.search(line):
                matches.append({"path": file_path, "line": idx, "text": line.rstrip("\n")})
                if len(matches) >= offset + limit:
                    return {"matches": matches[offset:offset + limit], "count": len(matches)}
    return {"matches": matches[offset:offset + limit], "count": len(matches)}

def patch(path, old_string=None, new_string=None, replace_all=False, **kwargs):
    old = old_string if old_string is not None else kwargs.get("oldString")
    new = new_string if new_string is not None else kwargs.get("newString", "")
    if old is None:
        return {"status": "error", "error": "patch requires old_string/new_string"}
    file_path = _resolve(path)
    with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read()
    if old not in content:
        return {"status": "error", "error": "old_string not found", "path": file_path}
    updated = content.replace(old, new) if replace_all else content.replace(old, new, 1)
    with open(file_path, "w", encoding="utf-8") as handle:
        handle.write(updated)
    return {"status": "ok", "path": file_path, "replacements": content.count(old) if replace_all else 1}

def web_extract(urls):
    if isinstance(urls, str):
        urls = [urls]
    results = []
    for url in urls[:5]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HAgent-HermesPython/1.0"})
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read(2_000_000).decode("utf-8", errors="replace")
            results.append({"url": url, "content": body})
        except Exception as exc:
            results.append({"url": url, "error": str(exc)})
    return {"results": results}

def web_search(query, limit=5):
    return {"error": "web_search is not available inside native fallback execute_code; call the normal HAgent web tool instead.", "query": query, "limit": limit}

def json_parse(text):
    return json.loads(text, strict=False)

def shell_quote(value):
    return shlex.quote(str(value))

def retry(fn, max_attempts=3, delay=2):
    last = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:
            last = exc
            if attempt + 1 < max_attempts:
                time.sleep(delay * (2 ** attempt))
    raise last
`;
}

export async function executeNativePythonCode(args = {}) {
  const code = args.code || args.script || '';
  if (!String(code).trim()) {
    return JSON.stringify({ status: 'error', error: 'No code provided.' }, null, 2);
  }

  const baseTmp = path.join(PROJECT_ROOT, 'data', 'tmp');
  mkdirSync(baseTmp, { recursive: true });
  const tmpdir = path.join(baseTmp, `hagent-python-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tmpdir, { recursive: true });

  const scriptPath = path.join(tmpdir, 'script.py');
  const toolsPath = path.join(tmpdir, 'hermes_tools.py');
  writeFileSync(scriptPath, code, 'utf8');
  writeFileSync(toolsPath, buildHermesToolsStub(), 'utf8');

  const started = Date.now();
  const timeoutMs = Math.min(Number(args.timeoutMs || args.timeout_ms || args.timeout || 300000), 600000);
  const cwd = safeWorkdir(args.workdir || args.cwd);
  const env = {
    ...process.env,
    PYTHONPATH: [tmpdir, process.env.PYTHONPATH || ''].filter(Boolean).join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
    TMPDIR: baseTmp,
    TMP: baseTmp,
    TEMP: baseTmp,
  };

  try {
    const { stdout, stderr } = await execFileAsync(getPythonBin(), [scriptPath], {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.stringify({
      status: 'success',
      output: stdout,
      stderr,
      tool_calls_made: 0,
      duration_seconds: Math.round((Date.now() - started) / 10) / 100,
      backend: 'hagent-native-python',
    }, null, 2);
  } catch (err) {
    return JSON.stringify({
      status: err.killed || err.signal === 'SIGTERM' ? 'timeout' : 'error',
      output: err.stdout || '',
      error: err.stderr || err.message,
      exit_code: err.code ?? null,
      tool_calls_made: 0,
      duration_seconds: Math.round((Date.now() - started) / 10) / 100,
      backend: 'hagent-native-python',
    }, null, 2);
  } finally {
    if (!args.keepTemp) {
      try { rmSync(tmpdir, { recursive: true, force: true }); } catch {}
    }
  }
}
