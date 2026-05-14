/**
 * Loop Detection Middleware
 * Prevents the agent from calling the same tool with same args repeatedly.
 */

const HISTORY_LIMIT = 20;
const REPEAT_THRESHOLD = 3;

export const loopDetectionMiddleware = {
  name: 'loop-detection',
  history: new Map(), // threadId -> Array of hashes

  async beforeModel(state) {
    const threadId = state.threadId || 'default';
    if (!this.history.has(threadId)) {
      this.history.set(threadId, []);
    }
    return null;
  },

  async afterModel(state, response) {
    if (!response.tool_calls || response.tool_calls.length === 0) return null;

    const threadId = state.threadId || 'default';
    const history = this.history.get(threadId);

    for (const tc of response.tool_calls) {
      const hash = `${tc.name}:${JSON.stringify(tc.args)}`;
      history.push(hash);
      
      // Keep only recent history
      if (history.length > HISTORY_LIMIT) history.shift();

      const count = history.filter(h => h === hash).length;
      if (count >= REPEAT_THRESHOLD) {
        console.warn(`[Middleware] Loop detected for tool: ${tc.name}`);
        return {
          interrupt: true,
          content: `[LOOP DETECTED] Bạn đang lặp lại công cụ '${tc.name}' quá nhiều lần. Hãy dừng lại và tóm tắt những gì bạn đã làm được hoặc yêu cầu trợ giúp nếu bị kẹt.`
        };
      }
    }
    return null;
  }
};
