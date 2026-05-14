import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const PYTHON_AGENT_ROOT = path.join(BACKEND_ROOT, 'agent', 'app');
const PYTHON_AGENT_RUNTIME = path.join(BACKEND_ROOT, 'agent', 'runtime');
const DEFAULT_PORT = Number(process.env.HAGENT_PYTHON_AGENT_PORT || 8010);
const DEFAULT_HOST = process.env.HAGENT_PYTHON_AGENT_HOST || '127.0.0.1';

let child = null;
let childStartedByNode = false;

function resolvePython() {
  const configured = process.env.HAGENT_PYTHON_AGENT_PYTHON;
  if (configured) return configured;

  const candidates = [
    path.join(BACKEND_ROOT, 'agent', '.venv', 'bin', 'python'),
    '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python',
    '/Users/nguyenhat/miniconda3/bin/python3',
  ];
  return candidates.find(candidate => existsSync(candidate)) || 'python3';
}

export function getPythonAgentBaseUrl() {
  return process.env.HAGENT_PYTHON_AGENT_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
}

export async function isPythonAgentHealthy() {
  try {
    const response = await fetch(`${getPythonAgentBaseUrl()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function startPythonAgent() {
  if (process.env.HAGENT_PYTHON_AGENT_AUTOSTART === 'false') {
    console.log('[Python Agent] Autostart disabled');
    return null;
  }
  if (child) return child;
  if (!existsSync(PYTHON_AGENT_ROOT)) {
    console.warn(`[Python Agent] Missing directory: ${PYTHON_AGENT_ROOT}`);
    return null;
  }

  const python = resolvePython();
  child = spawn(
    python,
    ['-m', 'uvicorn', 'api.main:app', '--host', DEFAULT_HOST, '--port', String(DEFAULT_PORT)],
    {
      cwd: PYTHON_AGENT_ROOT,
      env: {
        ...process.env,
        HAGENT_HOME: PYTHON_AGENT_RUNTIME,
        PYTHONPATH: [PYTHON_AGENT_ROOT, process.env.PYTHONPATH].filter(Boolean).join(':'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  childStartedByNode = true;

  child.stdout.on('data', data => process.stdout.write(`[Python Agent] ${data}`));
  child.stderr.on('data', data => process.stderr.write(`[Python Agent] ${data}`));
  child.on('exit', (code, signal) => {
    console.log(`[Python Agent] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    child = null;
    childStartedByNode = false;
  });

  console.log(`[Python Agent] Starting on ${getPythonAgentBaseUrl()} via ${python}`);
  return child;
}

export function stopPythonAgent() {
  if (!child || !childStartedByNode) return;
  child.kill('SIGTERM');
}

export function pythonAgentProxy() {
  return async (req, res) => {
    const targetUrl = `${getPythonAgentBaseUrl()}${req.originalUrl}`;
    try {
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      delete headers['content-length'];

      const init = {
        method: req.method,
        headers,
        redirect: 'manual',
      };
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.body !== undefined && req.body !== null) {
          if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
            init.body = req.body;
          } else {
            init.body = JSON.stringify(req.body);
            init.headers['content-type'] = init.headers['content-type'] || 'application/json';
          }
        } else {
          init.body = req;
          init.duplex = 'half';
        }
      }

      const upstream = await fetch(targetUrl, init);
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      res.status(502).json({
        error: 'Python agent unavailable',
        detail: error?.message || String(error),
      });
    }
  };
}

process.once('SIGINT', stopPythonAgent);
process.once('SIGTERM', stopPythonAgent);
