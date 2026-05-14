import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listEntries, listTopics, getEntry, deleteEntry, searchEntries, exportToMarkdown } from '../services/wiki-store.js';
import { reindexAll } from '../services/rag.js';
import { synthesizeTopic, autoRestructure } from '../services/synthesizer.js';

export const wikiRouter = Router();
wikiRouter.use(requireAuth);

wikiRouter.get('/', async (req, res) => {
  try {
    const entries = await listEntries(req.userId);
    const topics = await listTopics(req.userId);
    res.json({ entries, topics, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await searchEntries(req.userId, q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.get('/topics', async (req, res) => {
  try {
    const topics = await listTopics(req.userId);
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.get('/export', async (req, res) => {
  try {
    const result = await exportToMarkdown(req.userId);
    // Return as downloadable zip
    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="hagent-wiki-${req.userId.slice(0, 8)}.zip"`);
    archive.pipe(res);
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const [topic, files] of Object.entries(result.topics || {})) {
      for (const file of files) {
        const filePath = path.resolve(result.path, topic, file);
        if (fs.existsSync(filePath)) archive.file(filePath, { name: `${topic}/${file}` });
      }
    }
    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.get('/:id', async (req, res) => {
  try {
    const entry = await getEntry(req.params.id);
    if (!entry || entry.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.put('/:id', async (req, res) => {
  try {
    const { title, summary, content, topics } = req.body;
    const entry = await getEntry(req.params.id);
    if (!entry || entry.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

    const { updateEntry } = await import('../services/wiki-store.js');
    const updated = await updateEntry(req.params.id, { title, summary, content, topics });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteEntry(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.post('/synthesize/:topic', async (req, res) => {
  try {
    const result = await synthesizeTopic(req.params.topic, req.userId, req.body.provider);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.post('/restructure', async (req, res) => {
  try {
    const result = await autoRestructure(req.userId, req.body.provider);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wikiRouter.post('/reindex', async (req, res) => {
  try {
    const result = await reindexAll(req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
