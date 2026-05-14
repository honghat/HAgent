import { Router } from 'express';
import { requireAuth } from '../../src/middleware/auth.js';
import {
  buildAnimationHtml,
  buildEducationAnimationPlan,
  deleteEducationAnimationRun,
  freeAnimationTools,
  listEducationAnimationRuns,
  renderEducationAnimation,
} from '../services/education-animation.js';
import { publishToTikTok, publishToYouTube } from '../services/core/publisher.js';

export const educationAnimationRouter = Router();

educationAnimationRouter.get('/tools', requireAuth, (_req, res) => {
  res.json({
    tools: freeAnimationTools,
    recommendation: {
      renderer: 'HTML/CSS motion + Playwright + ffmpeg',
      editor: 'Dùng file MP4/SRT để chỉnh phụ đề, nhịp cắt và xuất bản',
      reason: 'Miễn phí ở bước tạo nháp, dễ chỉnh layout/chữ, không phụ thuộc API video trả phí.',
    },
  });
});

educationAnimationRouter.post('/plan', requireAuth, async (req, res) => {
  try {
    const plan = await buildEducationAnimationPlan(req.body || {});
    res.json({
      plan,
      html: buildAnimationHtml(plan, { format: plan.format }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Không tạo được storyboard' });
  }
});

educationAnimationRouter.post('/render', requireAuth, async (req, res) => {
  try {
    const result = await renderEducationAnimation(req.body?.plan || req.body || {}, {
      format: req.body?.format,
      voice: req.body?.voice,
      includeTts: req.body?.includeTts,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Không render được video' });
  }
});

educationAnimationRouter.get('/history', requireAuth, (req, res) => {
  try {
    res.json({
      items: listEducationAnimationRuns({ limit: req.query.limit }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Không đọc được lịch sử video' });
  }
});

educationAnimationRouter.delete('/history/:id', requireAuth, (req, res) => {
  try {
    const deleted = deleteEducationAnimationRun(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Không tìm thấy video' });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Không xóa được video' });
  }
});

educationAnimationRouter.post('/publish/:platform', requireAuth, async (req, res) => {
  const platform = String(req.params.platform || '').toLowerCase();
  const file = String(req.body?.file || '');
  if (!file || file.includes('..') || !file.endsWith('.mp4')) {
    return res.status(400).json({ error: 'File MP4 không hợp lệ' });
  }

  const task = {
    video_file: file,
    title: req.body?.title || 'Video giáo dục',
    yt_desc: req.body?.description || '',
    yt_tags: req.body?.tags || '',
    tiktok_caption: req.body?.caption || req.body?.description || '',
  };

  try {
    let result;
    if (platform === 'youtube') result = await publishToYouTube(task);
    else if (platform === 'tiktok') result = await publishToTikTok(task);
    else return res.status(400).json({ error: 'Nền tảng không hỗ trợ' });

    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Không đăng được video' });
  }
});
