export const errorHandlerMiddleware = {
  name: 'error-handler',
  
  async wrapToolCall(toolCall, executeHandler) {
    try {
      return await executeHandler(toolCall);
    } catch (err) {
      console.error(`[Error Handler] Tool ${toolCall.name} failed:`, err.message);
      return `Lỗi khi thực thi tool ${toolCall.name}: ${err.message}. Vui lòng thử lại với tham số khác hoặc cách tiếp cận khác.`;
    }
  }
};
