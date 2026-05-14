import db from '../../db.js';
import { enqueue } from '../../../video/services/core/queue.js';

export const tool = {
  name: 'dub_video',
  desc: 'Lồng tiếng cho video từ URL (YouTube, Bilibili, Douyin). Công cụ này sẽ tự động tải video, dịch sub và lồng tiếng Việt.',
  args: {
    url: 'URL của video cần lồng tiếng.',
    title: 'Tiêu đề cho video (không bắt buộc).',
    voice: 'Giọng đọc: namminh (nam) hoặc hoaimy (nữ). Mặc định là hoaimy.'
  },
  label: '🎬 Dubbing Video',
  handler: async ({ url, title, voice = 'hoaimy' }) => {
    try {
      const now = Date.now();
      let sourceType = 'youtube';
      if (/bilibili|b23\.tv/i.test(url)) sourceType = 'bilibili';
      else if (/douyin/i.test(url)) sourceType = 'douyin';

      // Use a default user or a system user for tool-initiated tasks
      // Here we'll try to find the first user or just use a placeholder
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (!user) return 'Lỗi: Không tìm thấy người dùng trong hệ thống để gán tác vụ.';

      const info = db.prepare(`INSERT INTO video_tasks (user_id, title, source_type, source_ref, voice, status, created_at, updated_at)
        VALUES (?,?,?,?,?, 'queued', ?, ?)`)
        .run(user.id, (title || url).slice(0, 200), sourceType, url, voice, now, now);
      
      enqueue(info.lastInsertRowid);

      return `Đã bắt đầu tác vụ lồng tiếng cho video. Task ID: ${info.lastInsertRowid}. 
Bạn có thể theo dõi tiến trình tại tab Video trong ứng dụng.
Link video: ${url}`;
    } catch (err) {
      console.error('[dub_video] Error:', err.message);
      return `Lỗi khi tạo tác vụ lồng tiếng: ${err.message}`;
    }
  }
};
