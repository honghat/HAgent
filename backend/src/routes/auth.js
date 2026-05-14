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

// Get available providers (built-in + user custom)
authRouter.get('/providers', requireAuth, (req, res) => {
  const builtins = getProviderOptions().map(p => ({ ...p, custom: false }))
  const customs = db.prepare(
    'SELECT name, label, type, base_url, api_key, model FROM custom_providers WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.userId).map(c => ({ name: c.name, label: c.label, type: c.type, baseURL: c.base_url, apiKey: c.api_key, model: c.model, custom: true }))
  res.json([...builtins, ...customs])
});

// Set provider preference
authRouter.put('/provider', requireAuth, async (req, res) => {
  const { provider } = req.body;
  if (!provider) return res.status(400).json({ error: 'Provider required' });

  const isBuiltin = isValidProvider(provider);
  const isCustom = !isBuiltin && db.prepare(
    'SELECT id FROM custom_providers WHERE user_id = ? AND name = ?'
  ).get(req.userId, provider);

  if (!isBuiltin && !isCustom) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  // Update web interface default provider
  db.prepare('UPDATE users SET default_provider = ? WHERE id = ?').run(provider, req.userId);

  // Sync claude mode only for built-in providers
  if (isBuiltin) {
    db.prepare('UPDATE users SET claude_mode = ? WHERE id = ?').run(provider, req.userId);
    const { applyClaudeMode } = await import('../services/claude-settings.js');
    applyClaudeMode(provider);
  }

  res.json({ provider });
});

// Create custom provider
authRouter.post('/providers', requireAuth, (req, res) => {
  const { name, label, type, base_url, api_key, model } = req.body;
  if (!name || !label) return res.status(400).json({ error: 'name và label là bắt buộc' });
  if (isValidProvider(name)) return res.status(409).json({ error: 'Tên trùng với provider có sẵn' });
  try {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO custom_providers (id, user_id, name, label, type, base_url, api_key, model) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, req.userId, name.trim(), label.trim(), type || 'openai', base_url || '', api_key || '', model || '');
    res.json({ ok: true, name: name.trim(), label: label.trim(), custom: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Provider đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

// Update custom provider
authRouter.put('/providers/:name', requireAuth, (req, res) => {
  const { name } = req.params;
  const { label, type, base_url, api_key, model } = req.body;
  if (!label) return res.status(400).json({ error: 'label là bắt buộc' });
  const existing = db.prepare('SELECT id FROM custom_providers WHERE user_id = ? AND name = ?').get(req.userId, name);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy custom provider' });
  db.prepare(
    'UPDATE custom_providers SET label=?, type=?, base_url=?, api_key=?, model=?, updated_at=datetime(\'now\') WHERE user_id=? AND name=?'
  ).run(label, type || 'openai', base_url || '', api_key || '', model || '', req.userId, name);
  res.json({ ok: true });
});

// Delete custom provider
authRouter.delete('/providers/:name', requireAuth, (req, res) => {
  const { name } = req.params;
  if (isValidProvider(name)) return res.status(400).json({ error: 'Không thể xóa provider mặc định' });
  db.prepare('DELETE FROM custom_providers WHERE user_id = ? AND name = ?').run(req.userId, name);
  res.json({ ok: true });
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
