import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
const BRIDGE_SCRIPT = path.join(BACKEND_ROOT, 'scripts', 'hagent_bridge.py');
const DEFAULT_HAGENT_ROOT = '/Users/nguyenhat/hagent-agent';

function getPythonBin() {
  const candidates = [
    process.env.HAGENT_PYTHON,
    '/Users/nguyenhat/miniconda3/bin/python3',
    process.env.HATAI_PYTHON,
    '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python',
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || 'python3';
}

function parseBridgeJson(stdout, stderr = '') {
  const text = String(stdout || '').trim();
  if (!text) throw new Error(`Hagent bridge returned empty stdout. stderr: ${stderr.slice(0, 1000)}`);
  const lastLine = text.split('\n').filter(Boolean).at(-1);
  try {
    return JSON.parse(lastLine);
  } catch (err) {
    throw new Error(`Hagent bridge returned non-JSON output: ${text.slice(0, 1000)}\nstderr: ${stderr.slice(0, 1000)}`);
  }
}

async function runHagentBridge(args, { timeout = 120000 } = {}) {
  const env = {
    ...process.env,
    HAGENT_AGENT_ROOT: process.env.HAGENT_AGENT_ROOT || DEFAULT_HAGENT_ROOT,
    PYTHONPATH: [
      process.env.HAGENT_AGENT_ROOT || DEFAULT_HAGENT_ROOT,
      process.env.PYTHONPATH || '',
    ].filter(Boolean).join(':'),
  };
  const { stdout, stderr } = await execFileAsync(getPythonBin(), [BRIDGE_SCRIPT, ...args], {
    cwd: process.env.HAGENT_AGENT_ROOT || DEFAULT_HAGENT_ROOT,
    env,
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseBridgeJson(stdout, stderr);
}

export async function hagentPythonStatus() {
  return runHagentBridge(['status'], { timeout: 60000 });
}

export async function hagentPythonListTools({ enabledToolsets, disabledToolsets } = {}) {
  const args = ['list'];
  if (enabledToolsets) args.push('--enabled-toolsets', JSON.stringify(enabledToolsets));
  if (disabledToolsets) args.push('--disabled-toolsets', JSON.stringify(disabledToolsets));
  return runHagentBridge(args, { timeout: 60000 });
}

export async function hagentPythonCallTool({ tool, args = {}, taskId = 'hagent', sessionId = '', userTask = '', enabledTools } = {}) {
  if (!tool) throw new Error('Hagent Python bridge requires tool');
  const callArgs = [
    'call',
    '--tool', tool,
    '--args', JSON.stringify(args || {}),
    '--task-id', taskId || 'hagent',
    '--session-id', sessionId || '',
    '--user-task', userTask || '',
  ];
  if (enabledTools) callArgs.push('--enabled-tools', JSON.stringify(enabledTools));
  return runHagentBridge(callArgs, { timeout: 300000 });
}

export function formatHagentPythonResult(payload) {
  if (!payload?.ok) return `Hagent Python lỗi: ${payload?.error || 'unknown error'}`;
  const parts = [];
  if (payload.stdout) parts.push(`STDOUT:\n${payload.stdout.trim()}`);
  if (payload.result != null) parts.push(String(payload.result));
  return parts.filter(Boolean).join('\n\n') || 'Hagent Python chạy xong không có output.';
}
