import { Router } from 'express';
import { requireAuth } from '../../../src/middleware/auth.js';
import db from '../../../src/db.js';
import { publishToTikTok, publishToYouTube } from '../../services/core/publisher.js';

export const publishRouter = Router();

publishRouter.post('/:taskId', requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const { platform } = req.body || {};
  const task = db.prepare('SELECT * FROM video_tasks WHERE id=? AND user_id=?').get(taskId, req.userId);
  if (!task) return res.status(404).json({ error: 'Task không tồn tại' });
  if (task.status !== 'done') return res.status(400).json({ error: 'Task chưa hoàn thành' });
  if (!task.video_file) return res.status(400).json({ error: 'Không có video để đăng' });

  const now = Date.now();
  db.prepare('INSERT INTO video_publish_log (task_id, platform, status, created_at) VALUES (?,?,?,?)')
    .run(taskId, platform, 'publishing', now);

  try {
    let result;
    if (platform === 'youtube') {
      result = await publishToYouTube(task);
    } else if (platform === 'tiktok') {
      result = await publishToTikTok(task);
    } else if (platform === 'facebook') {
      result = { error: 'Facebook API chưa được tích hợp' };
    } else {
      return res.status(400).json({ error: 'Nền tảng không hỗ trợ' });
    }

    if (result.error) {
      db.prepare('UPDATE video_publish_log SET status=?, error=? WHERE task_id=? AND platform=?')
        .run('error', result.error, taskId, platform);
      return res.status(400).json({ error: result.error });
    }

    db.prepare('UPDATE video_publish_log SET status=?, url=? WHERE task_id=? AND platform=?')
      .run('done', result.url, taskId, platform);
    res.json({ ok: true, url: result.url });

  } catch (e) {
    db.prepare('UPDATE video_publish_log SET status=?, error=? WHERE task_id=? AND platform=?')
      .run('error', e.message, taskId, platform);
    res.status(500).json({ error: e.message });
  }
});

publishRouter.get('/:taskId', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM video_publish_log WHERE task_id=? ORDER BY created_at DESC')
    .all(req.params.taskId);
  res.json({ logs: rows });
});
