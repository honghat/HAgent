import db from '../../db.js';
import { removeDiacritics, tokenize } from './helpers.js';

export function search_wiki({ query }, wikiDir, userId) {
  if (!userId) return 'Không thể xác định người dùng.';
  const q = `%${query}%`;
  const rows = db.prepare(
    'SELECT title, summary, content, topics FROM wiki_entries WHERE user_id = ? AND (title LIKE ? OR summary LIKE ? OR content LIKE ?) LIMIT 5'
  ).all(userId, q, q, q);

  if (rows.length === 0) return 'Không tìm thấy kết quả nào trong Wiki.';

  return rows.map(row => {
    const topics = JSON.parse(row.topics || '[]');
    return `📄 **${row.title}** (${topics.join(', ')})\n${row.summary}\n\n${row.content.slice(0, 500)}...`;
  }).join('\n\n---\n\n');
}

export function read_page({ title }, wikiDir, userId) {
  if (!userId) return 'Không thể xác định người dùng.';
  const entry = db.prepare('SELECT * FROM wiki_entries WHERE user_id = ? AND title = ?').get(userId, title);
  if (!entry) return `Không tìm thấy trang Wiki có tiêu đề: ${title}`;
  return `📄 **${entry.title}**\n\n${entry.content}`;
}

export function listWikiTopics(wikiDir, userId) {
  if (!userId) return 'Không thể xác định người dùng.';
  const rows = db.prepare('SELECT title, topics FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').all(userId);
  if (rows.length === 0) return 'Wiki chưa có dữ liệu.';

  const titles = rows.map(r => {
    const topics = JSON.parse(r.topics || '[]');
    return `  📄 ${r.title} [${topics.join(', ')}]`;
  });

  return ['**📚 Các trang Wiki gần đây:**', ...titles].join('\n');
}
