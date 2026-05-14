import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..');

const _tasks = new Map();
let _taskIdCounter = 0;

export function taskStart({ command, args, timeout = 30000 } = {}) {
  try {
    const id = ++_taskIdCounter;
    const argsArr = args ? (Array.isArray(args) ? args : args.split(' ').filter(Boolean)) : [];
    const child = spawn(command, argsArr, {
      cwd: PROJECT_ROOT,
      shell: true,
      timeout,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      const task = _tasks.get(id);
      if (task) { task.done = true; task.exitCode = code; }
    });

    _tasks.set(id, { id, pid: child.pid, command, args, stdout, stderr, done: false, exitCode: null, startTime: new Date().toISOString() });
    return `Task #${id} started: ${command} ${argsArr.join(' ')}`;
  } catch (e) {
    return `Lỗi khởi chạy task: ${e.message}`;
  }
}

export function taskOutput({ id } = {}) {
  const task = _tasks.get(Number(id));
  if (!task) return `Không tìm thấy task #${id}. Tasks hiện có: ${[..._tasks.keys()].join(', ') || 'không có'}`;
  const lines = [
    `Task #${task.id}: ${task.command} ${task.args || ''}`,
    `Status: ${task.done ? 'done (exit: ' + task.exitCode + ')' : 'running'}`,
    task.done ? '' : '',
    task.stdout ? `STDOUT:\n${task.stdout.slice(0, 2000)}` : '',
    task.stderr ? `STDERR:\n${task.stderr.slice(0, 1000)}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export function taskStop({ id } = {}) {
  if (!id) {
    // Kill all running
    for (const [tid, task] of _tasks) {
      if (!task.done) {
        try { if (task.pid) process.kill(task.pid); } catch {}
      }
    }
    return 'Đã dừng tất cả tasks.';
  }
  const task = _tasks.get(Number(id));
  if (!task) return `Không tìm thấy task #${id}`;
  if (task.done) return `Task #${id} đã kết thúc.`;
  try { if (task.pid) process.kill(task.pid); } catch {}
  task.done = true;
  return `Đã dừng task #${id}`;
}

export function taskList() {
  if (!_tasks.size) return 'Chưa có task nào.';
  return [..._tasks.values()].map(t =>
    `#${t.id}: ${t.command} pid=${t.pid || 'n/a'} [${t.done ? 'done' : 'running'}] ${t.startTime}`
  ).join('\n');
}
