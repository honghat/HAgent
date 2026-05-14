import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import db from '../db.js';
import { indexEntry, deleteEntry as deleteRagEntry } from './rag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI_ROOT = path.resolve(__dirname, '..', '..', '..', 'data', 'wiki');

// --- Helpers ---

function parseTopics(topics) {
  if (!topics) return [];
  if (Array.isArray(topics)) return topics;
  try { return JSON.parse(topics); } catch { return []; }
}

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    topics: parseTopics(row.topics),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSlug(title, id) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || id.slice(0, 8);
}

function getRelPath(entry) {
  const topic = (parseTopics(entry.topics)[0] || 'uncategorized');
  const slug = getSlug(entry.title, entry.id);
  return `${topic}/${slug}.md`;
}

function getAbsPath(entry) {
  return path.resolve(WIKI_ROOT, entry.userId || 'unknown', getRelPath(entry));
}

// --- CRUD ---

export async function createEntry({ userId, title, summary, topics, content, source }) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO wiki_entries (id, user_id, title, summary, content, topics, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, title, summary || '', content, JSON.stringify(topics || []), source || 'chat');
  const entry = rowToEntry(db.prepare('SELECT * FROM wiki_entries WHERE id = ?').get(id));
  indexEntry(entry).catch(() => {});
  return entry;
}

export async function getEntry(id) {
  return rowToEntry(db.prepare('SELECT * FROM wiki_entries WHERE id = ?').get(id));
}

export async function listEntries(userId) {
  const rows = db.prepare(
    'SELECT * FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);
  return rows.map(rowToEntry);
}

export async function updateEntry(id, fields) {
  const sets = [];
  const params = [];
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.summary !== undefined) { sets.push('summary = ?'); params.push(fields.summary); }
  if (fields.content !== undefined) { sets.push('content = ?'); params.push(fields.content); }
  if (fields.topics !== undefined) { sets.push('topics = ?'); params.push(JSON.stringify(fields.topics)); }

  if (sets.length === 0) return getEntry(id);

  sets.push('updated_at = datetime(\'now\')');
  params.push(id);
  db.prepare(`UPDATE wiki_entries SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const entry = await getEntry(id);
  indexEntry(entry).catch(() => {});
  return entry;
}

export async function deleteEntry(id, userId) {
  const entry = await getEntry(id);
  const result = db.prepare('DELETE FROM wiki_entries WHERE id = ? AND user_id = ?').run(id, userId);

  if (entry) {
    try {
      const filePath = getAbsPath(entry);
      if (existsSync(filePath)) await unlink(filePath);
    } catch {}
    deleteRagEntry(id).catch(() => {});
  }

  return result.changes > 0;
}

// --- Topics ---

export async function listTopics(userId) {
  const rows = db.prepare('SELECT * FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  const topicMap = {};
  for (const row of rows) {
    const topics = parseTopics(row.topics);
    for (const topic of topics) {
      if (!topicMap[topic]) topicMap[topic] = [];
      topicMap[topic].push(rowToEntry(row));
    }
  }
  return topicMap;
}

// --- Search ---

export async function searchEntries(userId, query) {
  const q = `%${query}%`;
  const rows = db.prepare(
    'SELECT * FROM wiki_entries WHERE user_id = ? AND (title LIKE ? OR summary LIKE ? OR content LIKE ?) ORDER BY updated_at DESC'
  ).all(userId, q, q, q);
  return rows.map(rowToEntry);
}

// --- Dedup ---

export async function dedupAndSave({ userId, title, summary, topics, content, source, provider }) {
  const existing = db.prepare('SELECT * FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  if (existing.length > 0) {
    const { checkDuplicate } = await import('./llm.js');
    const existingEntries = existing.map(rowToEntry);
    const dedup = await checkDuplicate({ title, summary, topics }, existingEntries, provider);

    if (dedup.isDuplicate && dedup.mergeInto) {
      const existingRow = existing.find(e => e.id === dedup.mergeInto);
      if (existingRow) {
        const { mergeContent } = await import('./llm.js');
        const mergedContent = await mergeContent(existingRow.content, content, provider).catch(() => existingRow.content + '\n\n---\n\n' + content);
        const updated = await updateEntry(dedup.mergeInto, { content: mergedContent });
        try { await exportEntry(userId, updated); } catch {}
        console.log(`[Wiki] Merged knowledge into existing entry: ${updated.title}`);
        return { entry: updated, existing: true, merged: true, dedup };
      }
    }
    if (dedup.isDuplicate) {
      console.log(`[Wiki] Skipped duplicate knowledge for: ${existingRow?.title || dedup.mergeInto}`);
      const entry = await getEntry(dedup.mergeInto || existing[0].id);
      return { entry, existing: true, skipped: true, dedup };
    }
  }

  const entry = await createEntry({ userId, title, summary, topics, content, source });
  console.log(`[Wiki] Created new entry: ${entry.title}`);

  try { await exportEntry(userId, entry); } catch {}

  return { entry, existing: false, dedup: null };
}

// --- Single Entry Export ---

async function writeEntryFile(entry) {
  const filePath = getAbsPath(entry);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const topics = parseTopics(entry.topics);
  const frontmatter = [
    '---',
    `id: ${entry.id}`,
    `title: "${entry.title.replace(/"/g, '\\"')}"`,
    `created: ${entry.createdAt}`,
    `updated: ${entry.updatedAt}`,
    `topics: [${topics.map(t => `"${t}"`).join(', ')}]`,
    `summary: "${(entry.summary || '').replace(/"/g, '\\"')}"`,
    '---',
    '',
  ].join('\n');
  await writeFile(filePath, frontmatter + entry.content, 'utf-8');
}

export async function exportEntry(userId, entry) {
  if (!entry) return;
  try { await writeEntryFile(entry); } catch {}
}

// --- Full Export (for download/backup) ---

export async function exportToMarkdown(userId) {
  if (!existsSync(WIKI_ROOT)) await mkdir(WIKI_ROOT, { recursive: true });

  const userDir = path.resolve(WIKI_ROOT, userId);
  const rows = db.prepare('SELECT * FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  const topicMap = {};

  for (const row of rows) {
    const entry = rowToEntry(row);
    const topic = (entry.topics[0] || 'uncategorized');
    if (!topicMap[topic]) topicMap[topic] = [];
    topicMap[topic].push(entry);
  }

  for (const [topic, entries] of Object.entries(topicMap)) {
    for (const entry of entries) {
      await writeEntryFile(entry);
    }
  }

  // Write per-user index
  await writeFile(path.resolve(userDir, '_index.json'), JSON.stringify({
    exportedAt: new Date().toISOString(),
    topics: Object.keys(topicMap),
    totalEntries: rows.length,
  }, null, 2), 'utf-8');

  return { path: userDir, total: rows.length, topics: Object.fromEntries(
    Object.entries(topicMap).map(([t, entries]) => [t, entries.map(e => getRelPath(e).split('/')[1])])
  ) };
}
