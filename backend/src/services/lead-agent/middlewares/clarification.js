/**
 * Clarification Middleware
 * Intercepts 'ask_clarification' tool calls and interrupts execution.
 */

export const clarificationMiddleware = {
  name: 'clarification',

  async wrapToolCall(toolCall, next) {
    if (toolCall.name === 'ask_clarification') {
      console.log(`[Middleware] Intercepted clarification request: ${toolCall.args.question}`);
      
      // Instead of executing a real tool, we return a special signal
      // to the orchestrator to stop and present this to the user.
      return {
        _isClarification: true,
        _interrupt: true,
        question: toolCall.args.question,
        clarification_type: toolCall.args.clarification_type || 'missing_info',
        options: toolCall.args.options || [],
        context: toolCall.args.context
      };
    }
    return next(toolCall);
  }
};
