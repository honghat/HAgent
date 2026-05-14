import db from '../../db.js';

function normalizeStatus(status) {
  if (!status) return 'pending';
  return ['pending', 'in_progress', 'completed', 'cancelled'].includes(status) ? status : 'pending';
}

function listTodos(sessionId) {
  return db.prepare(
    `SELECT id, content, status, created_at, updated_at
     FROM session_todos
     WHERE session_id = ?
     ORDER BY
       CASE status
         WHEN 'in_progress' THEN 0
         WHEN 'pending' THEN 1
         WHEN 'completed' THEN 2
         WHEN 'cancelled' THEN 3
         ELSE 4
       END,
       created_at ASC`
  ).all(sessionId);
}

function formatTodos(items) {
  if (!items.length) return 'Todo list is empty.';
  return items
    .map((item) => `- [${item.status}] ${item.id}: ${item.content}`)
    .join('\n');
}

export function getSessionTodos(sessionId) {
  if (!sessionId) return [];
  return listTodos(sessionId);
}

export function todoManage({ action, text, id, status } = {}, context = {}) {
  const sessionId = context.sessionId;
  if (!sessionId) {
    return 'Todo tool requires a session context.';
  }

  if (action === 'add') {
    if (!text?.trim()) return 'Missing todo text.';
    const todoId = id?.trim() || `todo_${Date.now()}`;
    db.prepare(
      `INSERT INTO session_todos (id, session_id, content, status)
       VALUES (?, ?, ?, ?)`
    ).run(todoId, sessionId, text.trim(), normalizeStatus(status));
    return `Added todo ${todoId}.\n${formatTodos(listTodos(sessionId))}`;
  }

  if (action === 'update' || action === 'done') {
    const targetId = id?.trim();
    if (!targetId) return 'Missing todo id.';
    const nextStatus = action === 'done' ? 'completed' : normalizeStatus(status);
    const result = db.prepare(
      `UPDATE session_todos
       SET status = ?, content = COALESCE(?, content), updated_at = datetime('now')
       WHERE id = ? AND session_id = ?`
    ).run(nextStatus, text?.trim() || null, targetId, sessionId);
    if (!result.changes) return `Todo ${targetId} not found.`;
    return `Updated todo ${targetId}.\n${formatTodos(listTodos(sessionId))}`;
  }

  if (action === 'delete') {
    const targetId = id?.trim();
    if (!targetId) return 'Missing todo id.';
    const result = db.prepare('DELETE FROM session_todos WHERE id = ? AND session_id = ?').run(targetId, sessionId);
    if (!result.changes) return `Todo ${targetId} not found.`;
    return `Deleted todo ${targetId}.\n${formatTodos(listTodos(sessionId))}`;
  }

  if (action === 'clear') {
    db.prepare('DELETE FROM session_todos WHERE session_id = ?').run(sessionId);
    return 'Cleared all todos for this session.';
  }

  return formatTodos(listTodos(sessionId));
}

export const tool = {
  name: 'todo',
  description: 'Manage session todos with persistent state. actions: add, list, update, done, delete, clear',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'add|list|update|done|delete|clear' },
      text: { type: 'string', description: 'Todo content' },
      id: { type: 'string', description: 'Todo id' },
      status: { type: 'string', description: 'pending|in_progress|completed|cancelled' }
    }
  },
  handler: async (args, context) => todoManage(args, context)
};
