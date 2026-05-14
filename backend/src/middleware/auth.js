import db, { DEFAULT_SESSION_TOKEN, DEFAULT_USERNAME } from '../db.js';

function defaultSession() {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(DEFAULT_USERNAME);
  if (!user) return null;
  db.prepare(`
    INSERT INTO sessions (id, user_id)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id
  `).run(DEFAULT_SESSION_TOKEN, user.id);
  return { id: DEFAULT_SESSION_TOKEN, user_id: user.id };
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.t || DEFAULT_SESSION_TOKEN;

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(token) || defaultSession();
  if (!session) return res.status(500).json({ error: 'Default user is not available' });

  req.userId = session.user_id;
  req.sessionToken = session.id;
  next();
}

export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || DEFAULT_SESSION_TOKEN;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(token) || defaultSession();
  if (session) req.userId = session.user_id;
  next();
}
