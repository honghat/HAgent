import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getProviderOptions, isValidProvider } from '../services/provider-config.js';

export const authRouter = Router();

// Register
authRouter.post('/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(id, username, hash, displayName || username);

    const token = uuidv4();
    db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(token, id);

    res.json({ token, user: { id, username, displayName: displayName || username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = uuidv4();
    db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(token, user.id);

    res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
authRouter.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionToken);
  res.json({ ok: true });
});

// Get current user
authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, created_at, default_provider FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

// Update current user
authRouter.put('/me', requireAuth, async (req, res) => {
  const { displayName, username, password } = req.body;
  
  try {
    if (username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.userId);
      if (existing) return res.status(409).json({ error: 'Username already exists' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.userId);
    }

    if (displayName) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, req.userId);
    }

    if (password) {
      if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      const hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get provider preference
authRouter.get('/provider', requireAuth, (req, res) => {
  const user = db.prepare('SELECT default_provider FROM users WHERE id = ?').get(req.userId);
  res.json({ provider: user?.default_provider || 'deepseek' });
});

// Get available providers from the central LLM configuration
authRouter.get('/providers', requireAuth, (_req, res) => {
  res.json(getProviderOptions());
});

// Set provider preference
authRouter.put('/provider', requireAuth, async (req, res) => {
  const { provider } = req.body;
  if (!provider || !isValidProvider(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  
  // Update web interface default provider
  db.prepare('UPDATE users SET default_provider = ? WHERE id = ?').run(provider, req.userId);
  
  // Synchronize with Claude Terminal
  db.prepare('UPDATE users SET claude_mode = ? WHERE id = ?').run(provider, req.userId);
  const { applyClaudeMode } = await import('../services/claude-settings.js');
  applyClaudeMode(provider);
  
  res.json({ provider });
});

// Get claude proxy mode
authRouter.get('/claude-mode', requireAuth, (req, res) => {
  const user = db.prepare('SELECT claude_mode FROM users WHERE id = ?').get(req.userId);
  res.json({ mode: user?.claude_mode || 'qwen' });
});

// Set claude proxy mode (also updates settings.json)
authRouter.put('/claude-mode', requireAuth, async (req, res) => {
  const { mode } = req.body;
  if (!mode || !['qwen', 'deepseek'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Use "qwen" or "deepseek"' });
  }
  // Apply to claude settings.json
  const { applyClaudeMode } = await import('../services/claude-settings.js');
  const result = applyClaudeMode(mode);

  if (!result.ok) {
    return res.status(500).json({ error: result.error || 'Failed to update settings.json' });
  }

  // Save to DB
  db.prepare('UPDATE users SET claude_mode = ? WHERE id = ?').run(mode, req.userId);

  res.json({ mode, label: result.label });
});
