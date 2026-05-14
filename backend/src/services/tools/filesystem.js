import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, appendFileSync, unlinkSync } from 'node:fs';
import { resolve, normalize, relative, isAbsolute, dirname } from 'node:path';
import { PROJECT_ROOT } from '../../config.js';

const ALLOWED = [resolve(PROJECT_ROOT, 'backend'), resolve(PROJECT_ROOT, 'frontend'), resolve(PROJECT_ROOT, 'data')];

function isPathSafe(p) {
  const r = normalize(resolve(p));
  return ALLOWED.some(prefix => r.startsWith(prefix));
}

export function readFile({ path }) {
  try {
    if (!path) return 'Thiếu đường dẫn file.';
    const resolved = isAbsolute(path) ? normalize(resolve(path)) : resolve(PROJECT_ROOT, path);
    if (!existsSync(resolved)) return `File không tồn tại: ${path}`;
    if (statSync(resolved).isDirectory()) return `Đây là thư mục, không phải file: ${path}`;
    const content = readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    const relPath = relative(PROJECT_ROOT, resolved);
    return `📄 **${relPath}** (${lines.length} dòng)\n\n${content.slice(0, 5000)}${content.length > 5000 ? '\n...(truncated)' : ''}`;
  } catch (e) {
    return `Lỗi đọc file: ${e.message}`;
  }
}

export function writeFile({ path, content, mode }) {
  try {
    if (!path) return 'Thiếu đường dẫn file.';
    const resolved = resolve(PROJECT_ROOT, path);
    if (!isPathSafe(resolved)) return 'Không được phép ghi file ngoài thư mục dự án (backend, frontend, data).';

    // Create parent directories if needed
    mkdirSync(dirname(resolved), { recursive: true });

    const exists = existsSync(resolved);

    if (mode === 'delete') {
      if (!exists) return `File không tồn tại: ${path}`;
      unlinkSync(resolved);
      return `🗑️ Đã xóa file: ${relative(PROJECT_ROOT, resolved)}`;
    }

    if (mode === 'append') {
      if (content === undefined && content !== '') return 'Thiếu nội dung.';
      appendFileSync(resolved, content, 'utf8');
      return `✅ Đã thêm vào cuối file: ${relative(PROJECT_ROOT, resolved)}`;
    }

    // Default: write (overwrite)
    if (content === undefined && content !== '') return 'Thiếu nội dung.';
    writeFileSync(resolved, content, 'utf8');
    const lines = content.split('\n').length;
    const prefix = exists ? '✅ Đã ghi đè' : '✅ Đã tạo';
    return `${prefix} file: ${relative(PROJECT_ROOT, resolved)} (${lines} dòng)`;
  } catch (e) {
    return `Lỗi ghi file: ${e.message}`;
  }
}
