import { registerTool } from './registry.js';
import {
  formatHermesPythonResult,
  hermesPythonCallTool,
  hermesPythonListTools,
  hermesPythonStatus,
} from '../hermes/python-bridge.js';
import { executeNativePythonCode, hermesExecuteCodeSandboxDenied } from '../hermes/native-python.js';

async function hermesPythonHandler(args = {}, context = {}) {
  const action = args.action || (args.tool ? 'call' : 'status');
  if (action === 'status') {
    const status = await hermesPythonStatus();
    return JSON.stringify(status, null, 2);
  }
  if (action === 'list' || action === 'tools') {
    const list = await hermesPythonListTools({
      enabledToolsets: args.enabledToolsets || args.enabled_toolsets,
      disabledToolsets: args.disabledToolsets || args.disabled_toolsets,
    });
    return JSON.stringify(list, null, 2);
  }
  if (action === 'call') {
    const payload = await hermesPythonCallTool({
      tool: args.tool,
      args: args.args || args.arguments || {},
      taskId: args.taskId || args.task_id || `hagent-${context.userId || 'user'}`,
      sessionId: args.sessionId || args.session_id || context.userId || '',
      userTask: args.userTask || args.user_task || '',
      enabledTools: args.enabledTools || args.enabled_tools,
    });
    if (args.tool === 'execute_code' && hermesExecuteCodeSandboxDenied(payload)) {
      return executeNativePythonCode(args.args || args.arguments || {});
    }
    return formatHermesPythonResult(payload);
  }
  return `Hermes Python action không hỗ trợ: ${action}. Dùng status, list, call.`;
}

registerTool({
  name: 'hermes_python',
  description: 'Gọi trực tiếp Hermes Python runtime trong /Users/nguyenhat/hermes-agent: status, list tools, hoặc dispatch tool qua model_tools.handle_function_call.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'status | list | call' },
      tool: { type: 'string', description: 'Tên Hermes tool khi action=call' },
      args: { type: 'object', description: 'Arguments truyền vào Hermes tool' },
      enabledToolsets: { type: 'array', items: { type: 'string' } },
      disabledToolsets: { type: 'array', items: { type: 'string' } },
      userTask: { type: 'string' },
    },
  },
  handler: hermesPythonHandler,
  label: 'Đang gọi Hermes Python runtime...',
});

export const tool = null;
