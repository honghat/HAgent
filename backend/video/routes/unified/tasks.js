import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import db from '../../../src/db.js';
import { requireAuth } from '../../../src/middleware/auth.js';
import { enqueue, makeSender, clients } from '../../services/core/queue.js';
import axios from 'axios';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ytDlpBin = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');

async function callYtDlp(args) {
  if (!fs.existsSync(ytDlpBin)) {
    throw new Error('Thiếu yt-dlp binary. Hãy cài đặt yt-dlp-exec.');
  }
  const p = spawn(ytDlpBin, args);
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', c => c === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.slice(0, 200))));
    p.on('error', reject);
  });
}

async function fetchYouTubeMetadata(url) {
  try {
    const info = await callYtDlp(['--dump-json', '--skip-download', url]);
    return info?.stdout ? JSON.parse(info.stdout) : null;
  } catch (e) {
    console.log('[yt-dlp] Skip:', e.message);
    return null;
  }
}

async function fetchBilibiliMetadata(url) {
  const bvMatch = url.match(/BV1[\w\dA-Za-z0-9]+/);
  if (!bvMatch) return null;

  const bvId = bvMatch[0];
  try {
    const response = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      return {
        title: data.title || 'Video Bilibili',
        desc: data.description || '',
        tags: data.stat?.pageviews ? `Lượt xem: ${data.stat.pageviews}` : ''
      };
    }
  } catch (e) {
    console.log('[Bilibili API] Skip:', e.message);
  }
  return null;
}


const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

export const taskRouter = Router();

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// Upload video
taskRouter.post('/upload', requireAuth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
  const voice = req.body.voice || 'hoaimy';
  const now = Date.now();
  const info = db.prepare(`INSERT INTO video_tasks (user_id, title, source_type, source_ref, voice, status, created_at, updated_at)
    VALUES (?,?,?,?,?, 'queued', ?, ?)`)
    .run(req.userId, req.file.originalname, 'upload', req.file.filename, voice, now, now);
  enqueue(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

// URL video (YouTube / Bilibili / Douyin ...)
taskRouter.post('/url', requireAuth, async (req, res) => {
  const { url, title, voice } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Thiếu URL' });

  let sourceType = 'youtube';
  if (/bilibili|b23\.tv/i.test(url)) sourceType = 'bilibili';
  else if (/douyin/i.test(url)) sourceType = 'douyin';

  const now = Date.now();

  // Fetch Bilibili metadata before saving
  let fetchTitle = title || url.slice(0, 200);
  if (sourceType === 'bilibili') {
    try {
      const meta = await fetchBilibiliMetadata(url);
      if (meta?.title) {
        fetchTitle = meta.title.slice(0, 200);
      }
    } catch (e) {
      console.log('[fetchBilibiliMetadata] Error:', e.message);
    }
  }

  const info = db.prepare(`INSERT INTO video_tasks (user_id, title, source_type, source_ref, voice, status, created_at, updated_at)
    VALUES (?,?,?,?,?, 'queued', ?, ?)`)
    .run(req.userId, fetchTitle, sourceType, url, voice || 'hoaimy', now, now);
  enqueue(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

// List tasks
taskRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, title, source_type, status, segments_count, duration, error, created_at
    FROM video_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).all(req.userId);
  res.json({ tasks: rows });
});

// Task detail
taskRouter.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM video_tasks WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  let logs = [];
  try { logs = row.progress ? JSON.parse(row.progress) : []; if (!Array.isArray(logs)) logs = []; } catch { logs = []; }
  res.json({ ...row, logs });
});

// SSE progress
taskRouter.get('/:id/progress', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const token = req.query.t;
  if (!token) return res.status(401).end();
  const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(token);
  if (!session) return res.status(401).end();

  const row = db.prepare('SELECT user_id FROM video_tasks WHERE id=?').get(taskId);
  if (!row || row.user_id !== session.user_id) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const cid = Date.now() + Math.random();
  if (!clients.has(taskId)) clients.set(taskId, []);
  clients.get(taskId).push({ cid, res });
  res.write(`data: ${JSON.stringify({ message: 'connected' })}\n\n`);
  req.on('close', () => {
    const list = clients.get(taskId) || [];
    clients.set(taskId, list.filter(c => c.cid !== cid));
  });
});

// Delete task
taskRouter.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM video_tasks WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  [row.video_file, row.srt_file, row.source_type === 'upload' ? row.source_ref : null]
    .filter(Boolean).forEach(f => { try { fs.unlinkSync(path.join(uploadDir, f)); } catch {} });
  db.prepare('DELETE FROM video_tasks WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// Retry
taskRouter.post('/:id/retry', requireAuth, async (req, res) => {
  const row = db.prepare('SELECT * FROM video_tasks WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'not found' });
  
  // Clear checkpoint file if exists
  const ckptPath = path.join(uploadDir, `ckpt-${row.id}.json`);
  if (fs.existsSync(ckptPath)) {
    try { fs.unlinkSync(ckptPath); } catch {}
  }

  db.prepare(`UPDATE video_tasks SET status='queued', error=NULL, progress=NULL, updated_at=? WHERE id=?`).run(Date.now(), row.id);
  enqueue(row.id);
  res.json({ ok: true });
});

// YouTube info
taskRouter.get('/yt/info', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Thiếu url' });
  try {
    const info = await ytDlp(url, { dumpSingleJson: true, skipDownload: true, noWarnings: true });
    res.json({ title: info.title || '' });
  } catch (e) {
    res.status(400).json({ error: e.message?.slice(0, 200) || 'Lỗi' });
  }
});
