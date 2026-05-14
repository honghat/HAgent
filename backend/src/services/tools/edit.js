import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, normalize, relative, dirname } from 'node:path';
import { PROJECT_ROOT } from '../../config.js';

const ALLOWED = [resolve(PROJECT_ROOT, 'backend'), resolve(PROJECT_ROOT, 'frontend'), resolve(PROJECT_ROOT, 'data')];

function isPathSafe(p) {
  const r = normalize(resolve(p));
  return ALLOWED.some(prefix => r.startsWith(prefix));
}

export function editFile({ path, oldString, newString, replaceAll, action, lineStart, lineEnd, content, insertAfter, insertBefore } = {}) {
  try {
    const resolved = resolve(PROJECT_ROOT, path);

    // ── insert mode: create file if it doesn't exist
    if (action === 'insert' || action === 'append' || action === 'prepend') {
      if (!isPathSafe(resolved)) return 'Không được phép ghi file ngoài thư mục dự án.';
      mkdirSync(dirname(resolved), { recursive: true });
      const existing = existsSync(resolved) ? readFileSync(resolved, 'utf8') : '';
      let newContent;
      if (action === 'append') newContent = existing + (existing && !existing.endsWith('\n') ? '\n' : '') + (content || '');
      else if (action === 'prepend') newContent = (content || '') + (existing ? '\n' + existing : '');
      else newContent = content || ''; // insert = overwrite/create
      writeFileSync(resolved, newContent, 'utf8');
      const relPath = relative(PROJECT_ROOT, resolved);
      const lines = newContent.split('\n').length;
      return `✅ Đã ${action === 'append' ? 'thêm vào cuối' : action === 'prepend' ? 'thêm vào đầu' : 'tạo/ghi'} file: ${relPath} (${lines} dòng)`;
    }

    // ── Line-based editing ──
    if (lineStart !== undefined || lineEnd !== undefined) {
      if (!existsSync(resolved)) return `File không tồn tại: ${path}`;
      if (!isPathSafe(resolved)) return 'Không được phép sửa file ngoài thư mục dự án.';
      const lines = readFileSync(resolved, 'utf8').split('\n');
      const start = Math.max(0, (lineStart || 1) - 1);
      const end = Math.min(lines.length, lineEnd || start + 1);
      if (action === 'delete') {
        lines.splice(start, end - start);
        writeFileSync(resolved, lines.join('\n'), 'utf8');
        return `✅ Đã xóa ${end - start} dòng (${lineStart || start + 1}-${end}) trong ${relative(PROJECT_ROOT, resolved)}`;
      }
      if (content !== undefined) {
        lines.splice(start, end - start, content);
        writeFileSync(resolved, lines.join('\n'), 'utf8');
        return `✅ Đã thay thế dòng ${lineStart || start + 1}-${end} trong ${relative(PROJECT_ROOT, resolved)}`;
      }
      // Read-only line range
      const excerpt = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
      return `📄 ${relative(PROJECT_ROOT, resolved)} dòng ${start + 1}-${end}:\n${excerpt}`;
    }

    // ── insertAfter/insertBefore: search for a line and insert ──
    if (insertAfter || insertBefore) {
      if (!existsSync(resolved)) return `File không tồn tại: ${path}`;
      if (!isPathSafe(resolved)) return 'Không được phép sửa file ngoài thư mục dự án.';
      const lines = readFileSync(resolved, 'utf8').split('\n');
      const marker = insertAfter || insertBefore;
      const idx = lines.findIndex(l => l.includes(marker));
      if (idx === -1) return `Không tìm thấy dòng chứa "${marker}" trong file.`;
      const insertIdx = insertAfter ? idx + 1 : idx;
      lines.splice(insertIdx, 0, content || '');
      writeFileSync(resolved, lines.join('\n'), 'utf8');
      return `✅ Đã chèn ${insertAfter ? 'sau' : 'trước'} dòng ${idx + 1} (chứa "${marker}") trong ${relative(PROJECT_ROOT, resolved)}`;
    }

    // ── String replacement (original behavior + improvements) ──
    if (!oldString && oldString !== '') return 'Thiếu oldString hoặc lineStart/lineEnd hoặc action.';
    if (!existsSync(resolved)) return `File không tồn tại: ${path}`;
    if (!isPathSafe(resolved)) return 'Không được phép sửa file ngoài thư mục dự án.';

    const original = readFileSync(resolved, 'utf8');

    // Try exact match first, then trimmed match
    let count = original.split(oldString).length - 1;
    let useExact = count > 0;

    if (!useExact) {
      // Try trimmed lines: match ignoring leading/trailing whitespace on each line
      const trimmed = original.split('\n').map(l => l.trimEnd());
      const oldTrimmed = oldString.split('\n').map(l => l.trimEnd());
      const oldPattern = oldTrimmed.join('\n');
      const trimmedContent = trimmed.join('\n');
      const trimmedIdx = trimmedContent.indexOf(oldPattern);
      if (trimmedIdx !== -1) {
        // Map back to original
        const before = trimmedContent.slice(0, trimmedIdx);
        const lineOffset = before.split('\n').length - 1;
        const charOffset = before.split('\n').pop().length;
        // Use the actual original content
        newString = newString || '';
        const lines = original.split('\n');
        const oldLines = oldString.split('\n');
        // Find matching lines by trimmed content
        let found = false;
        for (let i = 0; i <= lines.length - oldLines.length; i++) {
          const chunk = lines.slice(i, i + oldLines.length).map(l => l.trimEnd());
          if (chunk.join('\n') === oldPattern) {
            const indent = lines[i].match(/^(\s*)/)[1];
            const indented = newString.split('\n').map((l, j) => j === 0 ? l : (indent + l)).join('\n');
            lines.splice(i, oldLines.length, indented);
            writeFileSync(resolved, lines.join('\n'), 'utf8');
            return `✅ Đã sửa ${relative(PROJECT_ROOT, resolved)} (dòng ${i + 1}-${i + oldLines.length}, matched by trimmed whitespace)`;
          }
        }
        if (!found) return `Không tìm thấy "${oldString.slice(0, 60)}..." trong file (kể cả sau khi trim).`;
      }
      return `Không tìm thấy "${oldString.slice(0, 60)}..." trong file (cả exact lẫn trimmed).`;
    }

    if (count > 1 && !replaceAll) {
      // Show context for each match
      const lines = original.split('\n');
      const matches = [];
      let pos = 0;
      for (let i = 0; i < count; i++) {
        const idx = original.indexOf(oldString, pos);
        const before = original.slice(0, idx);
        const lineNum = before.split('\n').length;
        matches.push(`dòng ${lineNum}: ...${original.slice(Math.max(0, idx - 20), idx + oldString.length + 20).replace(/\n/g, '\\n')}...`);
        pos = idx + oldString.length;
      }
      return `Tìm thấy ${count} occurrences:\n${matches.join('\n')}\n\nDùng replaceAll: true để thay tất cả, hoặc thêm context vào oldString để chọn đúng.`;
    }

    const newContent = replaceAll ? original.replaceAll(oldString, newString || '') : original.replace(oldString, newString || '');
    writeFileSync(resolved, newContent, 'utf8');
    return `✅ Đã sửa file: ${relative(PROJECT_ROOT, resolved)} (${count} occurrence${count > 1 ? 's' : ''})`;
  } catch (e) {
    return `Lỗi sửa file: ${e.message}`;
  }
}

export function notebookEdit({ path, cellIndex, source, action = 'replace', cellType } = {}) {
  try {
    const resolved = resolve(PROJECT_ROOT, path);
    if (!existsSync(resolved)) return `File không tồn tại: ${path}`;

    const raw = readFileSync(resolved, 'utf8');
    const nb = JSON.parse(raw);
    if (!nb.cells || !Array.isArray(nb.cells)) return 'File không phải là Jupyter notebook hợp lệ.';

    if (action === 'delete') {
      if (cellIndex < 0 || cellIndex >= nb.cells.length) return `Cell index ${cellIndex} không hợp lệ (có ${nb.cells.length} cells).`;
      nb.cells.splice(cellIndex, 1);
    } else if (action === 'insert') {
      const newCell = { cell_type: cellType || 'code', source: [source || ''], metadata: {} };
      const idx = cellIndex >= 0 ? cellIndex : nb.cells.length;
      nb.cells.splice(idx, 0, newCell);
    } else {
      if (cellIndex < 0 || cellIndex >= nb.cells.length) return `Cell index ${cellIndex} không hợp lệ (có ${nb.cells.length} cells).`;
      if (action === 'replace' || !action) {
        nb.cells[cellIndex].source = [source || ''];
        if (cellType) nb.cells[cellIndex].cell_type = cellType;
      }
    }

    writeFileSync(resolved, JSON.stringify(nb, null, 2), 'utf8');
    return `✅ Đã ${action} cell ${cellIndex} trong ${relative(PROJECT_ROOT, resolved)}`;
  } catch (e) {
    return `Lỗi notebook: ${e.message}`;
  }
}
