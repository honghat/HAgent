import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../middleware/auth.js';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
} from '../services/job-hunter/profile-service.js';
import {
  listJobResults,
  processJobUrls,
  updateJobStatus,
} from '../services/job-hunter/job-service.js';
import { autoSearchJobs } from '../services/job-hunter/auto-search.js';

export const jobHunterRouter = Router();
jobHunterRouter.use(requireAuth);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, '..', '..', '..', 'data', 'cv-v2');

// Multer setup
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

import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

// Helper to read file content
async function readFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf-8');
    }

    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    }
  } catch (err) {
    console.error('Error reading file:', err);
  }

  return fs.readFileSync(filePath, 'utf-8');
}

// Routes

// List all profiles
jobHunterRouter.get('/profiles', (req, res) => {
  const profiles = listProfiles(req.userId);
  res.json({ profiles });
});

// Get single profile
jobHunterRouter.get('/profiles/:id', (req, res) => {
  const profile = getProfile(req.userId, req.params.id);
  if (!profile) return res.status(404).json({ error: 'CV không tồn tại' });
  res.json(profile);
});

// Upload CV file
jobHunterRouter.post('/profiles/upload', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa có file CV' });

    console.log(`[Upload] Processing file: ${req.file.path}`);
    const rawText = await readFileContent(req.file.path);
    console.log(`[Upload] Content parsed: ${rawText.substring(0, 100)}...`);

    const profile = await createProfile(
      req.userId,
      req.file.originalname,
      rawText,
      req.body.provider
    );

    res.json({ profile });
  } catch (err) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Import from local path
jobHunterRouter.post('/profiles/import', async (req, res) => {
  try {
    const sourcePath = String(req.body.path || '').trim();
    if (!sourcePath) return res.status(400).json({ error: 'Thiếu đường dẫn CV' });
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Không tìm thấy file CV' });
    }

    const rawText = await readFileContent(sourcePath);
    const fileName = path.basename(sourcePath);
    const profile = await createProfile(req.userId, fileName, rawText, req.body.provider);

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete profile
jobHunterRouter.delete('/profiles/:id', (req, res) => {
  const deleted = deleteProfile(req.userId, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'CV không tồn tại' });
  res.json({ success: true });
});

// Process job URLs
jobHunterRouter.post('/profiles/:id/jobs', async (req, res) => {
  try {
    const urls = req.body.urls || [];
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Thiếu danh sách URLs' });
    }

    const result = await processJobUrls(req.userId, req.params.id, urls, 'manual', req.body.provider);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List job results
jobHunterRouter.get('/profiles/:id/jobs', (req, res) => {
  const status = req.query.status || null;
  const jobs = listJobResults(req.userId, req.params.id, status);
  res.json({ jobs });
});

// Update job status
jobHunterRouter.patch('/jobs/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    updateJobStatus(req.userId, req.params.id, status, notes);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Auto search jobs from popular sites
jobHunterRouter.post('/profiles/:id/auto-search', async (req, res) => {
  try {
    const profile = getProfile(req.userId, req.params.id);
    if (!profile) return res.status(404).json({ error: 'CV không tồn tại' });

    // Auto search from popular sites
    const searchResult = await autoSearchJobs(profile.parsed, {
      maxUrlsPerSite: 10,
      maxTotalUrls: 30,
    }, req.body.provider);

    // Process found URLs
    const processResult = await processJobUrls(
      req.userId,
      req.params.id,
      searchResult.urls,
      'auto',
      req.body.provider
    );

    res.json({
      search: searchResult,
      jobs: processResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
