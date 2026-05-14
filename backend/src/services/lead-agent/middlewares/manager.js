/**
 * Middleware Manager for HAgent
 * Inspired by HAgent Orchestration Pipeline
 */

class MiddlewareManager {
  constructor() {
    this.middlewares = [];
  }

  /**
   * Add a middleware to the pipeline
   * @param {Object} middleware { name, beforeModel, afterModel, wrapToolCall }
   */
  use(middleware) {
    this.middlewares.push(middleware);
    console.log(`[Middleware] Registered: ${middleware.name}`);
  }

  /**
   * Run 'beforeModel' hooks
   */
  async runBeforeModel(state) {
    let currentState = { ...state };
    for (const m of this.middlewares) {
      if (m.beforeModel) {
        const update = await m.beforeModel(currentState);
        if (update) currentState = { ...currentState, ...update };
      }
    }
    return currentState;
  }

  /**
   * Run 'afterModel' hooks
   */
  async runAfterModel(state, response) {
    let currentResponse = response;
    for (const m of this.middlewares) {
      if (m.afterModel) {
        const update = await m.afterModel(state, currentResponse);
        if (update) {
          // If middleware returns a specific command to interrupt or modify
          if (update.interrupt) return { interrupt: true, ...update };
          currentResponse = { ...currentResponse, ...update };
        }
      }
    }
    return currentResponse;
  }

  /**
   * Wrap a tool call execution
   */
  async wrapToolCall(toolCall, executeHandler) {
    let handler = executeHandler;
    for (const m of this.middlewares) {
      if (m.wrapToolCall) {
        const originalHandler = handler;
        handler = async (tc) => m.wrapToolCall(tc, originalHandler);
      }
    }
    return handler(toolCall);
  }
}

export const middlewareManager = new MiddlewareManager();
