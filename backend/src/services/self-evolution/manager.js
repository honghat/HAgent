import db from '../../db.js';

// Ensure self_evolution table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS self_evolution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

export function getEvolvedInstructions() {
  try {
    const row = db.prepare('SELECT content FROM self_evolution WHERE key = ?').get('system_instructions');
    return row ? row.content : '';
  } catch (err) {
    console.error('[Self-Evolve] Error getting instructions:', err.message);
    return '';
  }
}

export function updateEvolvedInstructions(content) {
  try {
    db.prepare(`
      INSERT INTO self_evolution (key, content) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
    `).run('system_instructions', content);
    return { success: true };
  } catch (err) {
    console.error('[Self-Evolve] Error updating instructions:', err.message);
    return { success: false, error: err.message };
  }
}
