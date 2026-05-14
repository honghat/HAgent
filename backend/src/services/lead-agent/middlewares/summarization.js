import { compactHistory } from '../../llm.js';

export const summarizationMiddleware = {
  name: 'summarization',
  
  async beforeModel(state) {
    const { msgs, provider } = state;
    
    // Only summarize if history is long (> 15 messages excluding system)
    const chatMsgs = msgs.filter(m => m.role !== 'system');
    
    if (chatMsgs.length > 15) {
      console.log(`[Summarization] History too long (${chatMsgs.length} msgs), compacting...`);
      
      const summary = await compactHistory(chatMsgs, provider);
      console.log(`[Summarization] Compaction done. Summary length: ${summary?.length || 0} chars.`);
      
      const finalSummary = (summary && summary.length > 10) 
        ? summary 
        : "Lịch sử hội thoại trước đó (nén thất bại).";
      
      // Keep system prompt, inject summary, and keep only last 3 messages for immediate context
      const systemPrompt = msgs.find(m => m.role === 'system');
      const lastMessages = chatMsgs.slice(-3);
      
      const newMsgs = [];
      if (systemPrompt) newMsgs.push(systemPrompt);
      newMsgs.push({ 
        role: 'system', 
        content: `[LỊCH SỬ CHAT ĐÃ ĐƯỢC TÓM TẮT]: ${finalSummary}\n\nDưới đây là các tin nhắn mới nhất để bạn tiếp tục hội thoại.` 
      });
      newMsgs.push(...lastMessages);
      
      return { msgs: newMsgs };
    }
    
    return state;
  }
};
