import db from '../db.js';
import { callLLM } from './llm.js';
import { v4 as uuidv4 } from 'uuid';

const workers = new Map(); // agentId -> { timer, agent, userId }

const TODO_PROMPT = `You are an autonomous agent executing a task from your todo list.

Complete the assigned task thoroughly using the available tools if needed.

Available tools: web_search, search_wiki, read_page, list_wiki_topics, update_wiki, get_weather, get_gold_price, currency_convert, translate, calculate, get_time, get_vnexpress_news, get_dantri_news

Respond with your work result. Be concise and focused on the task.`;

function formatAgent(row) {
  return {
    id: row.id, user_id: row.user_id, name: row.name,
    description: row.description, model: row.model,
    soul: row.soul_content || '',
    is_active: !!row.is_active, auto_start: !!row.auto_start,
    last_run_at: row.last_run_at, interval_seconds: row.interval_seconds || 300,
  };
}

async function agentCycle(agent) {
  // Fetch next pending todo
  const todo = db.prepare(
    "SELECT * FROM agent_todos WHERE agent_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1"
  ).get(agent.id);

  if (!todo) {
    // No pending todos — nothing to do this cycle
    db.prepare("UPDATE agents SET last_run_at = datetime('now') WHERE id = ?").run(agent.id);
    return;
  }

  // Mark as in_progress
  db.prepare("UPDATE agent_todos SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?").run(todo.id);

  const system = agent.soul
    ? `[IDENTITY]\n${agent.soul}\n\n${TODO_PROMPT}`
    : TODO_PROMPT;

  const messages = [
    { role: 'user', content: `Task: ${todo.content}\n\nCurrent time: ${new Date().toLocaleString('vi-VN')}\n\nExecute this task now.` },
  ];

  try {
    const provider = { name: agent.model || 'local' };
    const { content: result } = await callLLM(system, messages, { provider, maxTokens: 1000 });

    // Mark as completed
    db.prepare("UPDATE agent_todos SET status = 'completed', result = ?, updated_at = datetime('now') WHERE id = ?").run(
      result ? result.slice(0, 2000) : 'completed', todo.id
    );

    console.log(`[Agent Worker] ${agent.name} completed todo: ${todo.content.slice(0, 60)}`);

    // Log to run_journals
    const journalId = uuidv4();
    db.prepare(`INSERT INTO run_journals (id, message_id, session_id, type, event_name, content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      journalId, `agent-${agent.id}`, `agent-${agent.id}`,
      'agent_todo', agent.name,
      JSON.stringify({ todo: todo.content, result: result?.slice(0, 200) }),
      'completed'
    );
  } catch (err) {
    console.error(`[Agent Worker] ${agent.name} todo failed:`, err.message);
    db.prepare("UPDATE agent_todos SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(todo.id);
  }

  db.prepare("UPDATE agents SET last_run_at = datetime('now') WHERE id = ?").run(agent.id);
}

// ── Public API ──

export async function startAgentWorker(userId, agentId) {
  if (workers.has(agentId)) return { ok: true, message: 'Already running' };

  const row = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(agentId, userId);
  if (!row) return { ok: false, message: 'Agent not found' };

  const agent = formatAgent(row);
  const intervalMs = (agent.interval_seconds || 300) * 1000;

  const timer = setInterval(() => agentCycle(agent), intervalMs);
  workers.set(agentId, { timer, agent, userId });

  db.prepare('UPDATE agents SET is_active = 1 WHERE id = ?').run(agentId);
  console.log(`[Agent Worker] Started: ${agent.name} (every ${agent.interval_seconds}s)`);

  // Fire first cycle immediately
  agentCycle(agent).catch(() => {});

  return { ok: true, message: `Started ${agent.name}` };
}

export async function stopAgentWorker(agentId) {
  const worker = workers.get(agentId);
  if (worker) {
    clearInterval(worker.timer);
    workers.delete(agentId);
    db.prepare('UPDATE agents SET is_active = 0 WHERE id = ?').run(agentId);
    console.log(`[Agent Worker] Stopped: ${worker.agent.name}`);
    return { ok: true, message: 'Stopped' };
  }
  return { ok: false, message: 'Not running' };
}

export function getWorkerStatus(agentId) {
  const worker = workers.get(agentId);
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!row) return null;
  return {
    ...formatAgent(row),
    running: !!worker,
  };
}

export function listAllWorkers() {
  const rows = db.prepare('SELECT * FROM agents WHERE is_active = 1 OR auto_start = 1').all();
  return rows.map(row => ({
    ...formatAgent(row),
    running: workers.has(row.id),
    pending_todos: db.prepare("SELECT COUNT(*) as c FROM agent_todos WHERE agent_id = ? AND status = 'pending'").get(row.id).c,
  }));
}

export async function autoStartAgents() {
  console.log('[Agent Worker] Auto-starting active agents...');
  const rows = db.prepare('SELECT * FROM agents WHERE auto_start = 1').all();
  let started = 0;
  for (const row of rows) {
    await startAgentWorker(row.user_id, row.id);
    started++;
  }
  console.log(`[Agent Worker] Auto-started ${started} agent(s)`);
  return started;
}
