/**
 * Auto-title Generation Middleware
 * Generates a concise title for the session after the first exchange.
 */
import { callLLM } from '../../llm.js';
import db from '../../../db.js';

export const autoTitleMiddleware = {
  name: 'auto-title',

  async afterModel(state, response) {
    // Only run for the first round of the first message
    if (state.round === 1) {
      const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get(state.threadId).c;
      
      // If this is the first exchange (1 user msg + this assistant response in progress)
      if (msgCount <= 2) {
        const userMsg = state.msgs.find(m => m.role === 'user')?.content || '';
        if (userMsg.length > 10) {
          // Fire and forget title generation in background
          this.generateTitle(state.threadId, userMsg);
        }
      }
    }
    return null;
  },

  async generateTitle(sessionId, userMsg) {
    try {
      const prompt = `Bạn là một trợ lý biên tập. Hãy tóm tắt nội dung câu hỏi dưới đây thành một tiêu đề cực ngắn (tối đa 5-6 từ). 
Chỉ trả về tiêu đề, không thêm lời dẫn.
Câu hỏi: "${userMsg}"`;
      
      const { content: title } = await callLLM(prompt, [], { maxTokens: 50 });
      const cleanTitle = title.replace(/["']/g, '').trim();
      
      if (cleanTitle && cleanTitle.length > 2) {
        db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(cleanTitle, sessionId);
        console.log(`[Middleware] Auto-title generated: ${cleanTitle}`);
      }
    } catch (e) {
      console.error('[Middleware] Auto-title failed:', e.message);
    }
  }
};
