import { getLangfuse } from '../../observability/langfuse.js';

export const observabilityMiddleware = {
  name: 'observability',

  async beforeModel(state) {
    const langfuse = getLangfuse();
    if (!langfuse) return;

    // Start or get trace
    const traceId = state.traceId || `trace-${state.threadId}-${Date.now()}`;
    state.traceId = traceId;

    state.span = langfuse.span({
      id: `span-${state.traceId}-${state.round}`,
      traceId: state.traceId,
      name: `Round ${state.round}`,
      input: state.msgs[state.msgs.length - 1]?.content
    });
  },

  async afterModel(state, response) {
    if (state.span) {
      state.span.update({
        output: response.content,
        metadata: { usage: response.usage }
      });
      state.span.end();
    }
  },

  async wrapToolCall(toolCall, next) {
    const langfuse = getLangfuse();
    if (!langfuse) return next(toolCall);

    const generation = langfuse.span({
      name: `Tool: ${toolCall.name}`,
      input: toolCall.args
    });

    try {
      const result = await next(toolCall);
      generation.update({ output: result });
      return result;
    } catch (err) {
      generation.update({ output: `Error: ${err.message}`, level: 'ERROR' });
      throw err;
    } finally {
      generation.end();
    }
  }
};
