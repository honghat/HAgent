import db from '../db.js';
import { synthesizeEntries } from './llm.js';
import { createEntry, deleteEntry, getEntry, listEntries } from './wiki-store.js';

export async function synthesizeTopic(topic, userId, provider) {
  const rows = db.prepare(
    'SELECT * FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);

  const entries = rows
    .filter(r => {
      const topics = JSON.parse(r.topics || '[]');
      return topics.includes(topic);
    })
    .map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      summary: r.summary,
    }));

  if (entries.length < 3) {
    return { synthesized: false, reason: 'need at least 3 entries in this topic' };
  }

  const result = await synthesizeEntries(entries, provider);
  const saved = await createEntry({ userId, title: result.title, summary: result.summary, topics: result.topics, content: result.content, source: 'synthesis' });

  for (const entry of entries) {
    await deleteEntry(entry.id, userId);
  }

  return { synthesized: true, entry: saved };
}

export async function autoRestructure(userId, provider) {
  const { restructureIndex } = await import('./llm.js');
  const entries = await listEntries(userId);

  if (entries.length < 5) {
    return { restructured: false, reason: 'need at least 5 entries' };
  }

  const index = {
    entries: Object.fromEntries(entries.map(e => [e.id, e])),
    topics: {},
  };
  for (const e of entries) {
    for (const t of e.topics) {
      if (!index.topics[t]) index.topics[t] = [];
      if (!index.topics[t].includes(e.id)) index.topics[t].push(e.id);
    }
  }

  const plan = await restructureIndex(index, provider);

  for (const merge of (plan.merges || [])) {
    const mergeEntries = merge.sourceIds.map(id => entries.find(e => e.id === id)).filter(Boolean);
    if (mergeEntries.length >= 2) {
      const result = await synthesizeEntries(mergeEntries, provider);
      await createEntry({ userId, title: result.title, summary: result.summary, topics: result.topics, content: result.content, source: 'synthesis' });
      for (const e of mergeEntries) await deleteEntry(e.id, userId);
    }
  }

  for (const del of (plan.deletions || [])) {
    await deleteEntry(del.entryId, userId);
  }

  return { restructured: true, plan };
}
