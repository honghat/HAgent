export const tokenUsageMiddleware = {
  name: 'token-usage',
  
  async beforeModel(state) {
    if (!state.usage) {
      state.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }
    return state;
  },

  async afterModel(state, result) {
    // result is what callLLM returned (now an object with content and usage)
    if (result.usage) {
      state.usage.prompt_tokens += result.usage.prompt_tokens || 0;
      state.usage.completion_tokens += result.usage.completion_tokens || 0;
      state.usage.total_tokens += result.usage.total_tokens || 0;
      
      console.log(`[Token Usage] Round ${state.round}: +${result.usage.total_tokens} (Total: ${state.usage.total_tokens})`);
    }
    return { decision: result.content }; // Return content for the loop to continue
  }
};
