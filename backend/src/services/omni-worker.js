import db from '../db.js';
import { decideAndExecuteTools } from './tools/index.js';
import { chatStream } from './llm.js';
import { sendGatewayMessage } from './gateway/index.js';
import { syncFacebookMessagesForUser, syncZaloMessagesForUser } from '../routes/omni.js';
import { randomUUID } from 'node:crypto';

let isRunning = false;
let timer = null;

async function processReceivedMessages() {
  // 1. Sync Zalo for all users who have it active
  const zaloChannels = db.prepare("SELECT user_id FROM omni_channels WHERE platform = 'zalo' AND is_active = 1").all();
  for (const channel of zaloChannels) {
    try {
      await syncZaloMessagesForUser(channel.user_id, { maxThreads: 5, maxMessages: 10 });
    } catch (err) {
      console.error(`[OmniWorker] Zalo sync failed for user ${channel.user_id}:`, err.message);
    }
  }

  const facebookChannels = db.prepare("SELECT user_id FROM omni_channels WHERE platform = 'facebook' AND is_active = 1").all();
  for (const channel of facebookChannels) {
    try {
      await syncFacebookMessagesForUser(channel.user_id, { maxThreads: 4, maxMessages: 12 });
    } catch (err) {
      console.error(`[OmniWorker] Facebook sync failed for user ${channel.user_id}:`, err.message);
    }
  }

  // 2. Find messages that need auto-reply. Auto-reply is scoped to each
  // conversation so one enabled contact does not turn on replies for everyone.
  
  const conversationsToReply = db.prepare(`
    SELECT c.*, ch.platform, u.default_provider
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    JOIN users u ON u.id = c.user_id
    WHERE c.auto_reply = 1
    AND ch.is_active = 1
    AND (
      SELECT sender_type FROM omni_messages 
      WHERE conversation_id = c.id 
      ORDER BY datetime(created_at) DESC LIMIT 1
    ) = 'customer'
  `).all();

  for (const conv of conversationsToReply) {
    console.log(`[OmniWorker] Auto-replying to ${conv.sender_name} (${conv.platform})`);
    
    try {
      const lastMessages = db.prepare(`
        SELECT sender_type, content, created_at 
        FROM omni_messages 
        WHERE conversation_id = ? 
        ORDER BY datetime(created_at) DESC LIMIT 10
      `).all(conv.id);

      const history = lastMessages.reverse().map(m => ({
        role: m.sender_type === 'agent' ? 'assistant' : 'user',
        content: m.content
      }));

      // Use the orchestrator to decide how to reply
      const provider = { name: conv.auto_provider || conv.default_provider || 'lmstudio' };
      const progressSend = () => {}; // Silent progress
      
      const { extraContext, state } = await decideAndExecuteTools(history, provider, conv.user_id, progressSend);
      
      let collected = '';
      for await (const chunk of chatStream(history, provider, extraContext)) {
        if (chunk.type === 'content') collected += chunk.content;
      }

      if (collected.trim()) {
        // Send the message
        await sendGatewayMessage({ 
          platform: conv.platform, 
          target: conv.external_sender_id, 
          text: collected,
          options: { thread_type: conv.thread_type || 'user' },
        }, conv.user_id);

        // Save to DB
        const msgId = randomUUID();
        db.prepare(`
          INSERT INTO omni_messages (id, user_id, conversation_id, sender_type, content, status)
          VALUES (?, ?, ?, 'agent', ?, 'sent')
        `).run(msgId, conv.user_id, conv.id, collected);
        
        db.prepare("UPDATE omni_conversations SET last_message = ?, updated_at = datetime('now'), unread_count = 0 WHERE id = ?").run(collected, conv.id);
        
        console.log(`[OmniWorker] Replied to ${conv.sender_name} successfully.`);
      }
    } catch (err) {
      console.error(`[OmniWorker] Failed to auto-reply to ${conv.sender_name}:`, err.message);
    }
  }
}

export async function startOmniWorker() {
  if (isRunning) return;
  isRunning = true;
  console.log('[OmniWorker] Service started.');
  
  const cycle = async () => {
    try {
      await processReceivedMessages();
    } catch (err) {
      console.error('[OmniWorker] Cycle error:', err.message);
    }
    if (isRunning) timer = setTimeout(cycle, 15000);
  };

  cycle();
}

export function stopOmniWorker() {
  isRunning = false;
  if (timer) clearTimeout(timer);
  console.log('[OmniWorker] Service stopped.');
}
