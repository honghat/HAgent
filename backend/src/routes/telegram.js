import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  cancelTelegramQrLogin,
  getBotStatus,
  getTelegramQrLoginStatus,
  listActiveBots,
  resolveTelegramQrUserId,
  startTelegramBot,
  startTelegramQrLogin,
  stopTelegramBot,
  syncTelegramWebMessagesForUser,
} from '../services/telegram.js';

export const telegramRouter = Router();
telegramRouter.use(requireAuth);

// Connect bot with token
telegramRouter.post('/connect', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const result = await startTelegramBot(token, req.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Disconnect bot
telegramRouter.post('/disconnect', async (req, res) => {
  try {
    const result = await stopTelegramBot(req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get bot status
telegramRouter.get('/status', (req, res) => {
  res.json(getBotStatus(req.userId));
});

telegramRouter.post('/qr/start', async (req, res) => {
  try {
    const result = await startTelegramQrLogin(resolveTelegramQrUserId(req.userId));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

telegramRouter.get('/qr/:sessionId/status', async (req, res) => {
  try {
    const result = await getTelegramQrLoginStatus(resolveTelegramQrUserId(req.userId), req.params.sessionId);
    if (!result) return res.status(404).json({ error: 'QR session not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

telegramRouter.delete('/qr/:sessionId', async (req, res) => {
  res.json(await cancelTelegramQrLogin(resolveTelegramQrUserId(req.userId), req.params.sessionId));
});

telegramRouter.post('/sync/messages', async (req, res) => {
  try {
    const result = await syncTelegramWebMessagesForUser(resolveTelegramQrUserId(req.userId), {
      maxThreads: Number(req.body?.maxThreads || 12),
      maxMessages: Number(req.body?.maxMessages || 30),
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List all active bots (admin)
telegramRouter.get('/bots', (_req, res) => {
  res.json(listActiveBots());
});
