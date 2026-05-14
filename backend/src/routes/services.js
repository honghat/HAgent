import { Router } from 'express';
import { controlService } from '../services/service-manager.js';
import { killPortProcess, listListeningPorts } from '../services/port-manager.js';
import { requireAuth } from '../middleware/auth.js';

export const servicesRouter = Router();

servicesRouter.use(requireAuth);

servicesRouter.post('/control', async (req, res) => {
  const { service } = req.body;
  const userId = req.userId;

  try {
    const result = await controlService(service, userId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

servicesRouter.get('/ports', async (_req, res) => {
  try {
    const result = await listListeningPorts();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

servicesRouter.post('/ports/kill', async (req, res) => {
  try {
    const result = await killPortProcess(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
