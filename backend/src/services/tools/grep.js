import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from '../../config.js';

export function grep({ pattern, path: searchPath, include, maxResults = 30 }) {
  if (!pattern) return 'Thiếu pattern cần tìm.';

  try {
    const dir = searchPath ? resolve(PROJECT_ROOT, searchPath) : PROJECT_ROOT;
    const args = ['-rn', '--color=never'];

    if (include) {
      args.push(`--include=${include}`);
    }

    const dirExcludes = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv', '.cache'];
    const fileExcludes = ['package-lock.json', '*.min.js', '*.map'];
    dirExcludes.forEach(e => { args.push(`--exclude-dir=${e}`); args.push(`--exclude=${e}`); });
    fileExcludes.forEach(e => args.push(`--exclude=${e}`));

    args.push(pattern, dir);

    const result = spawnSync('grep', args, {
      timeout: 10000,
      maxBuffer: 500 * 1024,
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });

    const output = result.stdout.trim();
    const lines = output.split('\n').filter(Boolean);
    if (lines.length === 0) return `Không tìm thấy "${pattern}".`;

    const truncated = lines.slice(0, maxResults);
    const suffix = lines.length > maxResults ? `\n\n... (${lines.length - maxResults} kết quả nữa, thu hẹp phạm vi tìm kiếm)` : '';

    return `🔍 **${pattern}** (${lines.length} kết quả${lines.length > maxResults ? `, hiển thị ${maxResults}` : ''})\n\n${truncated.join('\n')}${suffix}`;
  } catch (e) {
    return `Lỗi grep: ${e.message.slice(0, 300)}`;
  }
}
