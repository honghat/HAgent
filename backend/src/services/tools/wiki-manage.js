import { updateEntry, deleteEntry, getEntry, listEntries } from '../wiki-store.js';

export async function wikiUpdate({ entryId, title, summary, content, topics, userId }) {
  if (!entryId) return 'Thiếu entryId.';
  const existing = await getEntry(entryId);
  if (!existing) return 'Không tìm thấy entry.';

  const fields = {};
  if (title !== undefined) fields.title = title;
  if (summary !== undefined) fields.summary = summary;
  if (content !== undefined) fields.content = content;
  if (topics !== undefined) fields.topics = topics;

  if (Object.keys(fields).length === 0) return 'Không có gì để cập nhật.';

  const updated = await updateEntry(entryId, fields);
  return `✅ Đã cập nhật: **${updated.title}**`;
}

export async function wikiDelete({ entryId, userId }) {
  if (!entryId) return 'Thiếu entryId.';
  const ok = await deleteEntry(entryId, userId);
  if (!ok) return 'Không tìm thấy entry hoặc không có quyền xóa.';
  return `✅ Đã xóa entry.`;
}

export async function wikiList({ userId }) {
  if (!userId) return 'Thiếu userId.';
  const rows = await listEntries(userId);
  if (!rows || rows.length === 0) return 'Wiki chưa có dữ liệu.';
  return rows.map((r, i) => `${i + 1}. **${r.title}** (id: ${r.id.slice(0, 8)}...) — ${r.topics.join(', ')}`).join('\n');
}
