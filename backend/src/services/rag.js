import { pipeline } from '@xenova/transformers';
import db from '../db.js';

let _model = null;

async function getModel() {
  if (!_model) {
    _model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return _model;
}

export async function getEmbedding(text) {
  const model = await getModel();
  const result = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

function cosineSimilarity(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

export async function indexEntry(entry) {
  if (!entry || !entry.content) return;
  const text = `${entry.title}\n${entry.summary || ''}\n${entry.content}`;
  const vector = await getEmbedding(text);
  db.prepare(
    `INSERT INTO wiki_embeddings (entry_id, embedding, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(entry_id) DO UPDATE SET embedding = excluded.embedding, updated_at = datetime('now')`
  ).run(entry.id || entry.id, JSON.stringify(vector));
}

export async function deleteEntry(id) {
  db.prepare('DELETE FROM wiki_embeddings WHERE entry_id = ?').run(id);
}

export async function searchRag(query, topK = 5) {
  const queryVec = await getEmbedding(query);
  const rows = db.prepare(`
    SELECT e.id, e.user_id, e.title, e.summary, e.content, e.topics, emb.embedding
    FROM wiki_embeddings emb
    JOIN wiki_entries e ON e.id = emb.entry_id
    ORDER BY e.updated_at DESC
  `).all();

  const scored = rows.map(row => {
    const vec = JSON.parse(row.embedding);
    const score = cosineSimilarity(queryVec, vec);
    return { ...row, score, topics: JSON.parse(row.topics || '[]') };
  });

  return scored
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function reindexAll(userId) {
  const entries = db.prepare(
    'SELECT id, title, summary, content FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);

  db.prepare('DELETE FROM wiki_embeddings WHERE entry_id IN (SELECT id FROM wiki_entries WHERE user_id = ?)').run(userId);

  for (const entry of entries) {
    await indexEntry(entry);
  }

  return { total: entries.length };
}
