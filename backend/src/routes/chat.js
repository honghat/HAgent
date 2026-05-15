import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { chatStream, extract, extractDoc, compactHistory, generateFollowUpSuggestions } from '../services/llm.js';
import { dedupAndSave } from '../services/wiki-store.js';
import { decideAndExecuteTools } from '../services/tools/index.js';
import { buildHagentContinuationTurn } from '../services/hagent/context.js';
import { processFile } from '../services/files/processor.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

export const chatRouter = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), '..', 'data', 'uploads', req.userId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Fix encoding: multer may mangle UTF-8 filenames as latin-1
    const normalized = iconv.decode(Buffer.from(file.originalname, 'binary'), 'utf8');
    cb(null, `${Date.now()}-${normalized}`);
  }
});
const upload = multer({ storage });

chatRouter.use(requireAuth);

// List sessions
chatRouter.get('/sessions', (req, res) => {
  const sessions = db.prepare(
    'SELECT id, title, created_at, updated_at, processing FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.userId);

  const sessionsWithStatus = sessions.map(s => ({
    ...s,
    status: s.processing ? 'busy' : 'idle'
  }));

  res.json(sessionsWithStatus);
});

// Get session processing status (for F5 recovery polling)
chatRouter.get('/sessions/:sessionId/status', (req, res) => {
  const session = db.prepare('SELECT id, processing FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.sessionId, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ id: session.id, status: session.processing ? 'busy' : 'idle' });
});

// Create session
chatRouter.post('/sessions', (req, res) => {
  const id = uuidv4();
  const { title, agentId } = req.body;
  db.prepare('INSERT INTO chat_sessions (id, user_id, title, agent_id) VALUES (?, ?, ?, ?)').run(id, req.userId, title || 'New Chat', agentId || null);
  res.json({ id, title: title || 'New Chat', agentId });
});

// Delete session
chatRouter.delete('/sessions/:sessionId', (req, res) => {
  db.prepare('DELETE FROM messages WHERE session_id = ? AND user_id = ?').run(req.params.sessionId, req.userId);
  const result = db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(req.params.sessionId, req.userId);
  res.json({ deleted: result.changes > 0 });
});

// Stop session
chatRouter.post('/sessions/:sessionId/stop', (req, res) => {
  const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.sessionId, req.userId);
  if (!session) return res.status(403).json({ error: 'Forbidden' });
  
  // Set processing to 0 so the frontend stops polling
  db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(req.params.sessionId);
  res.json({ stopped: true });
});

// Delete a specific message
chatRouter.delete('/sessions/:sessionId/messages/:messageId', (req, res) => {
  const { sessionId, messageId } = req.params;
  
  // Verify session belongs to user
  const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.userId);
  if (!session) return res.status(403).json({ error: 'Forbidden' });

  // Delete associated journals first to prevent orphans
  db.prepare('DELETE FROM run_journals WHERE message_id = ? AND session_id = ?').run(messageId, sessionId);
  
  // Delete the message
  const result = db.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?').run(messageId, sessionId);
  
  res.json({ deleted: result.changes > 0 });
});

// Get messages for a session
chatRouter.get('/sessions/:sessionId/messages', (req, res) => {
  const msgs = db.prepare(
    'SELECT id, role, content, provider, usage_json, created_at FROM messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC'
  ).all(req.params.sessionId, req.userId);
  
  const parsed = msgs.map(m => ({
    ...m,
    usage: m.usage_json ? JSON.parse(m.usage_json) : null
  }));
  
  res.json(parsed);
});

// Get journal for a message or session
chatRouter.get('/sessions/:sessionId/journal', (req, res) => {
  const { messageId } = req.query;
  let journal;
  if (messageId) {
    journal = db.prepare('SELECT * FROM run_journals WHERE message_id = ? ORDER BY created_at ASC').all(messageId);
  } else {
    journal = db.prepare('SELECT * FROM run_journals WHERE session_id = ? ORDER BY created_at ASC').all(req.params.sessionId);
  }
  
  const formatted = journal.map(j => {
    // Append 'Z' to treat SQLite local time as UTC, or just format the string
    // Better yet, just return the string time part
    const timeStr = j.created_at.split(' ')[1] || j.created_at;
    return {
      type: j.type,
      name: j.event_name,
      content: j.content,
      status: j.status,
      count: j.count,
      time: timeStr
    };
  });
  
  res.json(formatted);
});

// Clear journal (thoughts) for a session
chatRouter.delete('/sessions/:sessionId/journal', (req, res) => {
  const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.sessionId, req.userId);
  if (!session) return res.status(403).json({ error: 'Forbidden' });
  
  const result = db.prepare('DELETE FROM run_journals WHERE session_id = ?').run(req.params.sessionId);
  res.json({ deleted: result.changes > 0 });
});

// Upload file to session
chatRouter.post('/sessions/:sessionId/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const fileInfo = {
    name: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    type: req.file.mimetype
  };

  res.json(fileInfo);
});

// Process uploaded file: read → chunk → extract wiki entries → save to wiki + RAG
chatRouter.post('/sessions/:sessionId/process-file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const provider = req.body.provider || 'lmstudio';
  const filePath = req.file.path;
  // Fix encoding: multer may mangle UTF-8 filenames as latin-1
  const fileName = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf8');

  try {
    const content = await processFile(filePath);

    if (!content || content.length < 20) {
      return res.json({ entries: [], skipped: true, fileName, error: 'File rỗng hoặc không đọc được nội dung' });
    }

    // Chunk content by paragraphs, max ~3000 chars per chunk
    const paragraphs = content.split(/\n\n+/);
    const chunks = [];
    let current = '';
    for (const p of paragraphs) {
      if ((current + '\n\n' + p).length > 3000 && current) {
        chunks.push(current.trim());
        current = p;
      } else {
        current = current ? current + '\n\n' + p : p;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    const results = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const extracted = await extractDoc(chunk, { name: provider });

      const title = extracted?.title || chunk.split('\n')[0]?.replace(/^#+\s*/,'').trim().slice(0, 80) || `Nội dung từ ${fileName} (phần ${i + 1})`;
      const summary = extracted?.summary || chunk.slice(0, 120);
      const topics = extracted?.topics || ['general'];
      const content = extracted?.content || chunk.trim();

      const result = await dedupAndSave({
        userId: req.userId,
        title,
        summary,
        topics,
        content,
        source: 'upload',
        provider: { name: provider },
      });
      results.push({
        entry: result.entry,
        existing: !!result.existing,
        skipped: !!result.skipped,
        merged: !!result.merged,
        chunkIndex: i,
      });
    }

    // Clean up uploaded file after processing
    fs.unlink(filePath, () => {});

    res.json({
      entries: results,
      fileName,
      totalEntries: results.length,
    });
  } catch (e) {
    console.error('[FileProcess] Error:', e);
    // Clean up on error too
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: e.message });
  }
});


// Send message (SSE streaming)
chatRouter.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { content, provider: reqProvider } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });

    const provider = { name: reqProvider };

    const msgId = uuidv4();
    db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider) VALUES (?, ?, ?, ?, ?, ?)').run(msgId, sessionId, req.userId, 'user', content, reqProvider || 'lmstudio');

    // Update session title from first message
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get(sessionId).c;
    if (msgCount === 1) {
      const title = content.slice(0, 60) + (content.length > 60 ? '...' : '');
      db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(title, req.params.sessionId);
    }
    db.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(req.params.sessionId);

    // Setup SSE early so send() is available for all paths
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Final reply ID (pre-generated to link journal entries)
    const replyId = uuidv4();

    // Pre-insert assistant message to satisfy foreign key constraints for journal entries
    db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider) VALUES (?, ?, ?, ?, ?, ?)').run(
      replyId, sessionId, req.userId, 'assistant', '', reqProvider || 'lmstudio'
    );

    // Mark session as processing (survives F5)
    db.prepare('UPDATE chat_sessions SET processing = 1 WHERE id = ?').run(sessionId);

    let clientConnected = true;
    res.on('close', () => {
      if (!res.writableEnded) clientConnected = false;
    });

    const send = (type, data) => {
      // Save journal entries to DB (only for non-appended think or tool events)
      try {
        if (type === 'think' && !data.append) {
          db.prepare('INSERT INTO run_journals (message_id, session_id, type, content) VALUES (?, ?, ?, ?)').run(replyId, sessionId, 'think', data.content);
        } else if (type === 'tool') {
          db.prepare('INSERT INTO run_journals (message_id, session_id, type, event_name, status, count) VALUES (?, ?, ?, ?, ?, ?)').run(replyId, sessionId, 'tool', data.name, data.status, data.count || 0);
        }
      } catch (err) {
        console.error('[Journal Logging Error]', err.message);
      }
      if (clientConnected && !res.destroyed && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
        } catch {
          clientConnected = false;
        }
      }
    };

    // Auto-detect Telegram token in message
    const tokenMatch = content.match(/\b(\d{8,12}:[\w-]{30,50})\b/);
    if (tokenMatch && /(kết nối|connect|telegram|bot|token|dùng|add|thêm)/i.test(content)) {
      try {
        const { startTelegramBot } = await import('../services/telegram.js');
        const tgResult = await startTelegramBot(tokenMatch[1], req.userId);
        send('tool', { name: 'telegram_connect', status: 'done', count: 1 });
        send('content', { content: `✅ Bot @${tgResult.username} đã kết nối! Gửi tin nhắn tới @${tgResult.username} trên Telegram để chat.` });
        // Update the pre-inserted assistant message with the result
        db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(`✅ Bot @${tgResult.username} đã kết nối! Gửi tin nhắn tới @${tgResult.username} trên Telegram để chat.`, replyId);
        db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId);
        send('done', { messageId: replyId });
        return res.end();
      } catch (e) {
        send('content', { content: `❌ Không kết nối được Telegram: ${e.message}` });
        db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(`❌ Không kết nối được Telegram: ${e.message}`, replyId);
        db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId);
        send('done', { messageId: replyId });
        return res.end();
      }
    }

    // Get chat history
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE session_id = ? AND id != ? ORDER BY created_at ASC'
    ).all(req.params.sessionId, msgId);

    let msgs = history.map(m => ({ role: m.role, content: m.content }));

    // Get session and agent info
    const session = db.prepare('SELECT agent_id FROM chat_sessions WHERE id = ?').get(sessionId);
    if (session?.agent_id) {
      const agent = db.prepare('SELECT soul_content FROM agents WHERE id = ?').get(session.agent_id);
      if (agent?.soul_content) {
        msgs.unshift({ role: 'system', content: `[AGENT SOUL]\n${agent.soul_content}` });
      }
    }

    const effectiveContent = buildHagentContinuationTurn({
      text: content,
      history,
      platform: 'chat',
    });

    msgs.push({ role: 'user', content: effectiveContent });

    let collectedText = '';
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let chunkCount = 0; // for periodic save

    // Let LLM decide and execute tools
    const { extraContext, state } = await decideAndExecuteTools(msgs, provider, req.userId, send, { sessionId });
    
    if (state?.usage) {
      totalUsage.prompt_tokens += state.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += state.usage.completion_tokens || 0;
      totalUsage.total_tokens += state.usage.total_tokens || 0;
    }

    // If it's a clarification request, stop and send it
    if (extraContext && extraContext._isClarification) {
      db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId);
      send('clarification', extraContext);
        send('done', { usage: totalUsage });
        if (clientConnected && !res.destroyed && !res.writableEnded) res.end();
        return;
      }

    // Generate final LLM response
    for await (const chunk of chatStream(msgs, provider, req.userId, extraContext)) {
      if (chunk.type === 'content') {
        collectedText += chunk.content;
        send('content', { content: chunk.content });
      } else if (chunk.type === 'think') {
        send('think', { content: chunk.content, append: chunk.append });
      } else if (chunk.type === 'usage') {
        totalUsage.prompt_tokens += chunk.usage.prompt_tokens || 0;
        totalUsage.completion_tokens += chunk.usage.completion_tokens || 0;
        totalUsage.total_tokens += chunk.usage.total_tokens || 0;
      }
    }

    // Update assistant message with final content and usage
    db.prepare('UPDATE messages SET content = ?, usage_json = ? WHERE id = ?').run(
      collectedText,
      totalUsage ? JSON.stringify(totalUsage) : null,
      replyId
    );

    // Clear processing flag so F5-recovered clients know it's done
    db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId);

    // Extract wiki knowledge from the conversation turn (fire and forget)
    extract(content, collectedText, provider, req.userId).then(async extracted => {
      if (extracted) {
        console.log(`[Wiki Extraction] Extracted knowledge: ${extracted.title}`);
        const result = await dedupAndSave({ userId: req.userId, ...extracted, source: 'chat', provider });
        if (result && !result.skipped) {
          send('wiki', { title: result.entry.title, isNew: !result.existing });
        }
      } else {
        console.log('[Wiki Extraction] Skip: No knowledge found or skip=true');
      }
    }).catch(err => {
      console.error('[Wiki Extraction Error]', err);
    });

    send('done', { messageId: replyId, usage: totalUsage });

    // Generate follow-up suggestions (fire and forget)
    generateFollowUpSuggestions(msgs, collectedText, provider, req.userId).then(suggestions => {
      if (suggestions && suggestions.length > 0) {
        send('suggestions', { suggestions });
      }
    }).catch(() => {});

    if (clientConnected && !res.destroyed && !res.writableEnded) res.end();
  } catch (err) {
    console.error('Chat error:', err);
    // Clear processing flag on error
    try { db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId); } catch {}
    // Try to send error via SSE if headers already sent
    try {
      if (res.headersSent && !res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: err.message });
      }
    } catch { res.end(); }
  }
});

// ── Async chat: fire-and-forget, returns immediately ──
chatRouter.post('/sessions/:sessionId/async', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { content, provider: reqProvider } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });

    const provider = { name: reqProvider };

    const userId = req.userId;
    const taskId = uuidv4();
    const msgId = uuidv4();

    // Save user message
    db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider) VALUES (?, ?, ?, ?, ?, ?)').run(msgId, sessionId, userId, 'user', content, reqProvider || 'lmstudio');
    db.prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);

    // Return immediately
    res.json({ taskId, messageId: msgId, status: 'processing' });

    // Process async in background
    (async () => {
      try {
        // Mark as processing for F5 recovery
        db.prepare('UPDATE chat_sessions SET processing = 1 WHERE id = ?').run(sessionId);

        const history = db.prepare('SELECT role, content FROM messages WHERE session_id = ? AND id != ? ORDER BY created_at ASC').all(sessionId, msgId);
        let msgs = history.map(m => ({ role: m.role, content: m.content }));
        // Get session and agent info
    const session = db.prepare('SELECT agent_id FROM chat_sessions WHERE id = ?').get(sessionId);
    if (session?.agent_id) {
      const agent = db.prepare('SELECT soul_content FROM agents WHERE id = ?').get(session.agent_id);
      if (agent?.soul_content) {
        msgs.unshift({ role: 'system', content: `[AGENT SOUL]\n${agent.soul_content}` });
      }
    }

    const effectiveContent = buildHagentContinuationTurn({
      text: content,
      history,
      platform: 'chat',
    });

    msgs.push({ role: 'user', content: effectiveContent });

        const send = () => {}; // No SSE in async mode
        const { extraContext, state } = await decideAndExecuteTools(msgs, provider, userId, send, { sessionId });

        let collectedText = '';
        for await (const chunk of chatStream(msgs, provider, userId, extraContext)) {
          if (chunk.type === 'content') collectedText += chunk.content;
        }

        const replyId = uuidv4();
        db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          replyId,
          sessionId,
          userId,
          'assistant',
          collectedText,
          reqProvider || 'lmstudio',
          state?.usage ? JSON.stringify(state.usage) : null
        );

        // Clear processing flag
        db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId);

        extract(content, collectedText, provider, userId).then(extracted => {
          if (extracted) dedupAndSave({ userId, ...extracted, source: 'chat', provider });
        }).catch(() => {});
      } catch (e) {
        console.error('Async chat error:', e);
      } finally {
        try { db.prepare('UPDATE chat_sessions SET processing = 0 WHERE id = ?').run(sessionId); } catch {}
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paste content to wiki
chatRouter.post('/paste', async (req, res) => {
  try {
    const { content, provider } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const extracted = await extract(content, provider);
    if (!extracted) return res.json({ type: 'skipped', response: 'No wiki-worthy content found.' });

    const result = await dedupAndSave({ userId: req.userId, ...extracted, source: 'paste', provider });
    res.json({
      type: result.existing ? 'wiki_updated' : 'wiki_created',
      response: `Wiki ${result.existing ? 'updated' : 'created'}: "${extracted.title}"`,
      entry: extracted,
      wikiUpdate: result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anthropic-to-OpenAI Proxy for Claude Code (Enhanced Path-based version)
chatRouter.post('/anthropic/:provider/v1/messages', async (req, res) => {
  const providerName = req.params.provider || 'lmstudio';
  const { messages, system, stream, model: reqModel, max_tokens, temperature } = req.body;

  try {
    const { getProviderClient } = await import('../services/provider-config.js');
    const config = getProviderClient(providerName, req.userId);
    const client = config.client;

    // Convert Anthropic messages to OpenAI format
    const openaiMessages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
    }));
    if (system) {
      openaiMessages.unshift({ role: 'system', content: system });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const response = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        max_tokens: max_tokens || 4000,
        temperature: temperature || 0.7,
        stream: true,
      });

      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          const anthropicChunk = {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text }
          };
          res.write(`event: content_block_delta\ndata: ${JSON.stringify(anthropicChunk)}\n\n`);
        }
      }
      res.write(`event: message_stop\ndata: {"type": "message_stop"}\n\n`);
      res.end();
    } else {
      const response = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        max_tokens: max_tokens || 4000,
        temperature: temperature || 0.7,
      });

      const text = response.choices[0]?.message?.content || '';
      const anthropicResponse = {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model: config.model,
        usage: { input_tokens: 0, output_tokens: 0 }
      };
      res.json(anthropicResponse);
    }
  } catch (err) {
    console.error('[Anthropic Proxy Error]', err.message);
    res.status(500).json({ error: { type: 'api_error', message: err.message } });
  }
});
