import db from '../db.js';
import { chatStream } from './llm.js';
import { decideAndExecuteTools } from './tools/index.js';
import { buildHermesContinuationTurn } from './hermes/context.js';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Ensure zalo_config table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS zalo_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    oa_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Send message via Zalo OA API
 */
async function callZaloAPI(accessToken, endpoint, body) {
  const url = `https://openapi.zalo.me/v3.0/oa/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': accessToken
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function parseZaloToken(rawToken = '') {
  if (!rawToken) return { cookie: '', imei: '' };
  try {
    const parsed = JSON.parse(rawToken);
    return {
      cookie: parsed.cookie || rawToken,
      imei: parsed.imei || '',
    };
  } catch {
    return { cookie: rawToken, imei: '' };
  }
}

function sendZaloPersonal({ cookie, imei, target, text, threadType = 'user' }) {
  const hataiPython = process.env.HATAI_PYTHON || '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python';
  const python = process.env.ZALO_SYNC_PYTHON || (existsSync(hataiPython) ? hataiPython : 'python3');
  const script = new URL('../scripts/zalo_send_bridge.py', import.meta.url);

  return new Promise((resolve, reject) => {
    const child = execFile(python, [fileURLToPath(script)], {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }, (error, stdout, stderr) => {
      let data = null;
      try { data = JSON.parse(stdout || '{}'); } catch {}
      if (error) {
        reject(new Error(data?.error || stderr || error.message));
        return;
      }
      if (data?.ok === false) {
        reject(new Error(data.error || 'Zalo personal send failed'));
        return;
      }
      resolve(data || { ok: true });
    });
    child.stdin.end(JSON.stringify({ cookie, imei, target, text, thread_type: threadType }));
  });
}

export async function sendZaloMessage(userId, targetUserId, text, options = {}) {
  const omniChannel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'zalo' AND is_active = 1").get(userId);
  if (omniChannel?.access_token) {
    const { cookie, imei } = parseZaloToken(omniChannel.access_token);
    if (cookie) {
      return sendZaloPersonal({
        cookie,
        imei,
        target: targetUserId,
        text,
        threadType: options.thread_type || options.threadType || 'user',
      });
    }
  }

  const config = db.prepare('SELECT * FROM zalo_config WHERE user_id = ? AND active = 1').get(userId);
  const accessToken = options.access_token || config?.access_token;
  if (!accessToken) throw new Error('Chưa cấu hình Zalo OA access token.');

  return callZaloAPI(accessToken, 'message/transaction', {
    recipient: { user_id: targetUserId },
    message: { text: String(text || '') },
  });
}

export function getZaloStatus(userId = null) {
  const rows = userId
    ? db.prepare('SELECT user_id, oa_id, active, updated_at FROM zalo_config WHERE user_id = ?').all(userId)
    : db.prepare('SELECT user_id, oa_id, active, updated_at FROM zalo_config').all();
  return {
    connected: rows.some(row => row.active),
    accounts: rows.map(row => ({
      userId: row.user_id,
      oaId: row.oa_id,
      active: Boolean(row.active),
      updatedAt: row.updated_at,
    })),
  };
}

/**
 * Handle incoming message from Zalo Webhook
 */
export async function handleZaloWebhook(payload) {
  console.log('[Zalo] Received webhook payload:', JSON.stringify(payload));
  
  const { event_name, message, sender, oa_id } = payload;
  
  if (event_name !== 'user_send_text') return;
  
  const userId = sender.id;
  const text = message.text;
  
  // Find internal user associated with this OA
  const config = db.prepare('SELECT * FROM zalo_config WHERE oa_id = ? AND active = 1').get(oa_id);
  if (!config) return;

  const internalUserId = config.user_id;
  const token = config.access_token;

  // Similar logic to telegram.js: handle message, decide tools, chatStream, etc.
  // For brevity, we'll just implement a simple reply for now
  
  try {
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC'
    ).all(`zalo-${userId}`, internalUserId);

    let msgs = history.map(m => ({ role: m.role, content: m.content }));
    msgs.push({
      role: 'user',
      content: buildHermesContinuationTurn({ text, history, platform: 'zalo' }),
    });

    // Simplified tool execution and chat
    const { extraContext } = await decideAndExecuteTools(msgs, { name: 'deepseek' }, internalUserId, () => {});
    
    let collected = '';
    for await (const chunk of chatStream(msgs, { name: 'deepseek' }, extraContext)) {
      if (chunk.type === 'content') {
        collected += chunk.content;
      }
    }

    await callZaloAPI(token, 'message/transaction', {
      recipient: { user_id: userId },
      message: { text: collected }
    });

  } catch (err) {
    console.error('[Zalo] Error handling message:', err.message);
  }
}

export async function startZaloIntegration(userId, oaId, accessToken) {
  db.prepare(`
    INSERT INTO zalo_config (user_id, oa_id, access_token) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET oa_id = excluded.oa_id, access_token = excluded.access_token, active = 1, updated_at = datetime('now')
  `).run(userId, oaId, accessToken);
  
  return { ok: true, message: 'Zalo integration configured.' };
}
