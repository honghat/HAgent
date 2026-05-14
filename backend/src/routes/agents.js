import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { startAgentWorker, stopAgentWorker, getWorkerStatus, listAllWorkers } from '../services/agent-worker.js';

export const agentsRouter = Router();
agentsRouter.use(requireAuth);

const NAME_PATTERN = /^[A-Za-z0-9-]+$/;

function parseJson(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return null; }
}

function formatAgent(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    model: row.model || 'lmstudio',
    soul: row.soul_content || '',
    tool_groups: parseJson(row.tool_groups),
    skills: parseJson(row.skills),
    is_public: !!row.is_public,
    is_active: !!row.is_active,
    auto_start: !!row.auto_start,
    last_run_at: row.last_run_at,
    interval_seconds: row.interval_seconds || 300,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// List all agents for the user
agentsRouter.get('/agents', (req, res) => {
  const agents = db.prepare(
    'SELECT * FROM agents WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC'
  ).all(req.userId);
  const todoCounts = db.prepare("SELECT agent_id, COUNT(*) as c FROM agent_todos WHERE status = 'pending' GROUP BY agent_id").all();
  const countMap = Object.fromEntries(todoCounts.map(r => [r.agent_id, r.c]));
  res.json(agents.map(a => ({ ...formatAgent(a), pending_todos: countMap[a.id] || 0 })));
});

// Check agent name availability
agentsRouter.get('/agents/check', (req, res) => {
  const { name } = req.query;
  if (!name || !NAME_PATTERN.test(name)) {
    return res.status(422).json({ error: 'Invalid name. Use letters, digits, and hyphens only.' });
  }
  const normalized = name.toLowerCase();
  const existing = db.prepare('SELECT id FROM agents WHERE LOWER(name) = ? AND user_id = ?').get(normalized, req.userId);
  res.json({ available: !existing, name: normalized });
});

// Get single agent
agentsRouter.get('/agents/:agentId', (req, res) => {
  const row = db.prepare('SELECT * FROM agents WHERE id = ? AND (user_id = ? OR is_public = 1)').get(req.params.agentId, req.userId);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  res.json(formatAgent(row));
});

// Create a new agent
agentsRouter.post('/agents', (req, res) => {
  const { name, description, model, soul, auto_start, interval_seconds } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!NAME_PATTERN.test(name)) {
    return res.status(422).json({ error: 'Invalid name. Use letters, digits, and hyphens only.' });
  }

  const normalized = name.trim();
  const existing = db.prepare('SELECT id FROM agents WHERE LOWER(name) = ? AND user_id = ?').get(normalized.toLowerCase(), req.userId);
  if (existing) return res.status(409).json({ error: 'Agent name already exists' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO agents (id, user_id, name, description, model, soul_content, tool_groups, skills, auto_start, interval_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.userId, normalized,
    description || '', model || 'lmstudio',
    soul || '',
    req.body.tool_groups ? JSON.stringify(req.body.tool_groups) : '[]',
    req.body.skills ? JSON.stringify(req.body.skills) : '[]',
    auto_start ? 1 : 0,
    interval_seconds || 300,
  );

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  res.status(201).json(formatAgent(row));
});

// Update an agent
agentsRouter.put('/agents/:agentId', (req, res) => {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, req.userId);
  if (!existing) return res.status(404).json({ error: 'Agent not found or unauthorized' });

  const updates = [];
  const params = [];
  const fields = ['name', 'description', 'model', 'tool_groups', 'skills', 'interval_seconds'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(f === 'tool_groups' || f === 'skills' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (req.body.soul !== undefined) {
    updates.push('soul_content = ?');
    params.push(req.body.soul);
  }
  if (req.body.auto_start !== undefined) {
    updates.push('auto_start = ?');
    params.push(req.body.auto_start ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.agentId, req.userId);
    db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  }

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.agentId);
  res.json(formatAgent(row));
});

// Delete an agent
agentsRouter.delete('/agents/:agentId', (req, res) => {
  stopAgentWorker(req.params.agentId);
  const result = db.prepare('DELETE FROM agents WHERE id = ? AND user_id = ?').run(req.params.agentId, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Agent not found or unauthorized' });
  res.json({ success: true });
});

// Toggle agent active state (start/stop worker)
agentsRouter.post('/agents/:agentId/toggle-active', async (req, res) => {
  const row = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(req.params.agentId, req.userId);
  if (!row) return res.status(404).json({ error: 'Agent not found' });

  const worker = getWorkerStatus(req.params.agentId);
  let result;
  if (worker?.running) {
    result = await stopAgentWorker(req.params.agentId);
  } else {
    result = await startAgentWorker(req.userId, req.params.agentId);
  }
  res.json(result);
});

// List all agent workers (admin)
agentsRouter.get('/agents/workers/status', (req, res) => {
  res.json(listAllWorkers());
});

// ── Agent Todos ──

// List todos for an agent
agentsRouter.get('/agents/:agentId/todos', (req, res) => {
  const todos = db.prepare(
    'SELECT * FROM agent_todos WHERE agent_id = ? ORDER BY created_at ASC'
  ).all(req.params.agentId);
  res.json(todos);
});

// Create a todo
agentsRouter.post('/agents/:agentId/todos', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Todo content required' });

  const id = uuidv4();
  db.prepare('INSERT INTO agent_todos (id, agent_id, content) VALUES (?, ?, ?)').run(id, req.params.agentId, content.trim());
  const todo = db.prepare('SELECT * FROM agent_todos WHERE id = ?').get(id);
  res.status(201).json(todo);
});

// Update a todo (status, content)
agentsRouter.put('/agents/:agentId/todos/:todoId', (req, res) => {
  const existing = db.prepare('SELECT * FROM agent_todos WHERE id = ? AND agent_id = ?').get(req.params.todoId, req.params.agentId);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const { content, status } = req.body;
  if (content !== undefined) db.prepare("UPDATE agent_todos SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, req.params.todoId);
  if (status !== undefined) db.prepare("UPDATE agent_todos SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.todoId);

  const todo = db.prepare('SELECT * FROM agent_todos WHERE id = ?').get(req.params.todoId);
  res.json(todo);
});

// Delete a todo
agentsRouter.delete('/agents/:agentId/todos/:todoId', (req, res) => {
  const result = db.prepare('DELETE FROM agent_todos WHERE id = ? AND agent_id = ?').run(req.params.todoId, req.params.agentId);
  res.json({ deleted: result.changes > 0 });
});
