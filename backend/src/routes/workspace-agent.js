import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAgentWorkspace } from '../services/agent-workspace.js';
import db from '../db.js';

export const workspaceAgentRouter = Router();

workspaceAgentRouter.use(requireAuth);

workspaceAgentRouter.get('/sessions/:sessionId/workspace', (req, res) => {
  const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.sessionId, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(getAgentWorkspace(req.params.sessionId));
});
