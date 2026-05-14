import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from '../../config.js';

const _watchers = new Map();
let _watcherIdCounter = 0;

export function monitorStart({ path, events } = {}) {
  try {
    const target = resolve(PROJECT_ROOT, path || '.');
    const id = ++_watcherIdCounter;
    const results = [];

    const watcher = watch(target, { recursive: true }, (eventType, filename) => {
      results.push({ event: eventType, file: filename, time: new Date().toISOString() });
    });

    _watchers.set(id, { id, target, watcher, results });
    return `Monitor #${id} started on ${path || '.'}`;
  } catch (e) {
    return `Lỗi: ${e.message}`;
  }
}

export function monitorStop({ id } = {}) {
  if (!id) {
    for (const [mid, m] of _watchers) { m.watcher.close(); }
    _watchers.clear();
    return 'Đã dừng tất cả monitors.';
  }
  const m = _watchers.get(Number(id));
  if (!m) return `Không tìm thấy monitor #${id}`;
  m.watcher.close();
  _watchers.delete(Number(id));
  return `Đã dừng monitor #${id}. Changes: ${m.results.length}`;
}

export function monitorResult({ id } = {}) {
  if (!id) {
    if (!_watchers.size) return 'Không có monitor nào đang chạy.';
    return [..._watchers.values()].map(m =>
      `Monitor #${m.id}: ${m.target} [changes: ${m.results.length}]`
    ).join('\n');
  }
  const m = _watchers.get(Number(id));
  if (!m) return `Không tìm thấy monitor #${id}`;
  const changes = m.results.slice(-20).map(r => `${r.event}: ${r.file} (${r.time})`).join('\n') || 'Chưa có thay đổi nào.';
  return `Monitor #${id} — ${m.target}:\n${changes}`;
}
