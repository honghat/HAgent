import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../middleware/auth.js';
import {
  autoSearchJobsForProfile,
  createProfileFromFile,
  deleteProfile,
  getProfile,
  listApplications,
  listProfiles,
  listSearches,
  runFullWorkflow,
  searchJobsForProfile,
  updateApplicationStatus,
} from '../services/cv-jobs.js';

export const cvRouter = Router();
cvRouter.use(requireAuth);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, '..', '..', '..', 'data', 'cv');
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadRoot, req.userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.docx', '.doc', '.pdf', '.txt'].includes(ext));
  },
});

cvRouter.get('/profiles', (req, res) => {
  res.json({ profiles: listProfiles(req.userId) });
});

cvRouter.get('/profiles/:id', (req, res) => {
  const profile = getProfile(req.userId, req.params.id, true);
  if (!profile) return res.status(404).json({ error: 'CV không tồn tại' });
  res.json(profile);
});

cvRouter.post('/profiles/upload', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa có file CV' });
    const profile = await createProfileFromFile({
      userId: req.userId,
      filePath: req.file.path,
      fileName: req.file.originalname,
    });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cvRouter.post('/profiles/import-local', async (req, res) => {
  try {
    const sourcePath = String(req.body.path || '').trim();
    if (!sourcePath) return res.status(400).json({ error: 'Thiếu đường dẫn CV' });
    if (!fs.existsSync(sourcePath)) return res.status(404).json({ error: 'Không tìm thấy file CV' });

    const dir = path.join(uploadRoot, req.userId);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(dir, `${Date.now()}-${fileName.replace(/[^\w.\-() ]+/g, '_')}`);
    fs.copyFileSync(sourcePath, targetPath);

    const profile = await createProfileFromFile({
      userId: req.userId,
      filePath: targetPath,
      fileName,
    });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cvRouter.delete('/profiles/:id', (req, res) => {
  res.json({ deleted: deleteProfile(req.userId, req.params.id) });
});

cvRouter.get('/profiles/:id/searches', (req, res) => {
  const profile = getProfile(req.userId, req.params.id);
  if (!profile) return res.status(404).json({ error: 'CV không tồn tại' });
  res.json({ searches: listSearches(req.userId, req.params.id) });
});

cvRouter.post('/profiles/:id/search', async (req, res) => {
  try {
    const result = await searchJobsForProfile({
      userId: req.userId,
      profileId: req.params.id,
      query: req.body.query,
      location: req.body.location,
      remote: !!req.body.remote,
      limit: req.body.limit,
      provider: req.body.provider,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cvRouter.post('/profiles/:id/auto-search', async (req, res) => {
  try {
    const result = await autoSearchJobsForProfile({
      userId: req.userId,
      profileId: req.params.id,
      query: req.body.query,
      location: req.body.location,
      remote: req.body.remote !== false,
      limit: req.body.limit,
      provider: req.body.provider || 'local',
      minScore: req.body.minScore,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

cvRouter.get('/profiles/:id/applications', (req, res) => {
  const profile = getProfile(req.userId, req.params.id);
  if (!profile) return res.status(404).json({ error: 'CV không tồn tại' });
  res.json({ applications: listApplications(req.userId, req.params.id, req.query.status || '') });
});

cvRouter.patch('/applications/:id', (req, res) => {
  try {
    res.json({ application: updateApplicationStatus({
      userId: req.userId,
      id: req.params.id,
      status: req.body.status,
      notes: req.body.notes,
    }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

cvRouter.post('/profiles/:id/full-workflow', async (req, res) => {
  try {
    const result = await runFullWorkflow({
      userId: req.userId,
      profileId: req.params.id,
      query: req.body.query,
      location: req.body.location,
      remote: req.body.remote !== false,
      limit: req.body.limit || 24,
      provider: req.body.provider || 'local',
      minScore: req.body.minScore || 60,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
