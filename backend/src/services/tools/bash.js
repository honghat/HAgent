import { execSync, spawnSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';

function toTrashCommand(command) {
  // Convert rm to mv to Trash
  // Patterns: rm [flags] path1 path2 ...
  const rmMatch = command.match(/^rm\s+(-[rfRdi]+)?\s+(.+)/);
  if (!rmMatch) return null;

  const flags = rmMatch[1] || '';
  const paths = rmMatch[2].split(/\s+/).filter(Boolean);
  if (paths.length === 0) return null;

  const trashDir = resolve(import.meta.dirname, '../../../../data/thung-rac');
  const ts = Date.now();
  const mvCmds = paths.map(p => {
    const name = basename(p) || 'file';
    // Escape paths with spaces
    const src = p.includes(' ') ? `"${p}"` : p;
    const dst = `${trashDir}/${name}.${ts}`;
    return `mv ${flags.includes('f') ? '-f' : ''} ${src} ${dst} 2>&1 && echo "Đã chuyển ${p} → Thùng rác"`;
  });

  return `mkdir -p ${trashDir}; ` + mvCmds.join('; ');
}

/**
 * Execute shell command with safety guards.
 * @param {object} args
 * @param {string} args.command - Shell command to run
 * @param {number} [args.timeout] - Timeout in ms (default: 60000)
 * @param {string} [args.workdir] - Working directory (default: project root)
 */
export function bash({ command, timeout, workdir } = {}) {
  if (!command || typeof command !== 'string') return 'Thiếu lệnh.';

  // Block rm completely — instruct to use mv to trash instead
  if (/^rm\b/.test(command.trim())) {
    return '❌ Không dùng rm. Dùng: mv <đường dẫn> data/thung-rac/ (chuyển vào thùng rác thay vì xóa)';
  }

  // Auto-convert rm → mv to Trash (backup safety)
  const trashCmd = toTrashCommand(command);
  const finalCmd = trashCmd || command;

  const projectRoot = resolve(import.meta.dirname, '../../../..');
  let cwd = projectRoot;

  if (workdir) {
    // Support relative (to project root) or absolute workdir
    const resolvedWorkdir = workdir.startsWith('/') ? workdir : resolve(projectRoot, workdir);
    if (existsSync(resolvedWorkdir)) {
      cwd = resolvedWorkdir;
    }
  }

  const timeoutMs = Math.min(Math.max(timeout || 60000, 5000), 300000); // 5s–5min

  try {
    const result = execSync(finalCmd, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024, // 2MB
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = (result || '').trim();
    if (!output) return trashCmd ? '✅ Đã chuyển vào thùng rác.' : '✅ Lệnh đã chạy (không có output).';
    const truncated = output.length > 6000;
    return output.slice(0, 6000) + (truncated ? '\n...(output bị cắt ngắn, dùng bash với lệnh khác để xem thêm)' : '');
  } catch (e) {
    // execSync throws with stdout/stderr on non-zero exit
    const stdout = (e.stdout || '').trim();
    const stderr = (e.stderr || '').trim();
    const combined = [stdout, stderr].filter(Boolean).join('\n---stderr---\n');
    if (combined) return combined.slice(0, 4000);
    if (e.signal === 'SIGTERM') return `⏱️ Timeout sau ${timeoutMs / 1000}s. Dùng task_start cho lệnh chạy dài.`;
    return `Lỗi: ${e.message.slice(0, 1000)}`;
  }
}

