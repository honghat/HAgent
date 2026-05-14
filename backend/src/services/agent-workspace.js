import { getAllToolDefs } from './tools/registry.js';
import { getSessionTodos } from './tools/todo.js';

export function getAgentWorkspace(sessionId) {
  const todos = getSessionTodos(sessionId);
  return {
    tools: getAllToolDefs(),
    todos,
    summary: {
      toolCount: getAllToolDefs().length,
      todoCount: todos.length,
      inProgressCount: todos.filter((item) => item.status === 'in_progress').length,
    },
  };
}
