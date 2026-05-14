import { registerTool } from './registry.js';
import {
  formatHagentPythonResult,
  hagentPythonCallTool,
  hagentPythonListTools,
  hagentPythonStatus,
} from '../hagent/python-bridge.js';
import { executeNativePythonCode, hagentExecuteCodeSandboxDenied } from '../hagent/native-python.js';

async function hagentPythonHandler(args = {}, context = {}) {
  const action = args.action || (args.tool ? 'call' : 'status');
  if (action === 'status') {
    const status = await hagentPythonStatus();
    return JSON.stringify(status, null, 2);
  }
  if (action === 'list' || action === 'tools') {
    const list = await hagentPythonListTools({
      enabledToolsets: args.enabledToolsets || args.enabled_toolsets,
      disabledToolsets: args.disabledToolsets || args.disabled_toolsets,
    });
    return JSON.stringify(list, null, 2);
  }
  if (action === 'call') {
    const payload = await hagentPythonCallTool({
      tool: args.tool,
      args: args.args || args.arguments || {},
      taskId: args.taskId || args.task_id || `hagent-${context.userId || 'user'}`,
      sessionId: args.sessionId || args.session_id || context.userId || '',
      userTask: args.userTask || args.user_task || '',
      enabledTools: args.enabledTools || args.enabled_tools,
    });
    if (args.tool === 'execute_code' && hagentExecuteCodeSandboxDenied(payload)) {
      return executeNativePythonCode(args.args || args.arguments || {});
    }
    return formatHagentPythonResult(payload);
  }
  return `Hagent Python action không hỗ trợ: ${action}. Dùng status, list, call.`;
}

registerTool({
  name: 'hagent_python',
  description: 'Gọi trực tiếp Hagent Python runtime trong /Users/nguyenhat/hagent-agent: status, list tools, hoặc dispatch tool qua model_tools.handle_function_call.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'status | list | call' },
      tool: { type: 'string', description: 'Tên Hagent tool khi action=call' },
      args: { type: 'object', description: 'Arguments truyền vào Hagent tool' },
      enabledToolsets: { type: 'array', items: { type: 'string' } },
      disabledToolsets: { type: 'array', items: { type: 'string' } },
      userTask: { type: 'string' },
    },
  },
  handler: hagentPythonHandler,
  label: 'Đang gọi Hagent Python runtime...',
});

export const tool = null;
