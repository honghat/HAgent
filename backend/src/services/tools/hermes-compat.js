import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { registerTool } from './registry.js';
import { PROJECT_ROOT } from '../../config.js';
import { bash } from './bash.js';
import { readFile, writeFile } from './filesystem.js';
import { editFile } from './edit.js';
import { grep } from './grep.js';
import { webSearch, fetchUrl } from './web.js';
import { agentTool } from './agent.js';
import { search_wiki } from './wiki.js';
import { wikiUpdate, wikiList } from './wiki-manage.js';
import { viewImage } from './vision.js';
import { cronCreate, cronDelete, cronList } from './cron.js';
import { askUser } from './interact.js';
import { sendGatewayMessage } from '../gateway/index.js';
import { formatHermesPythonResult, hermesPythonCallTool } from '../hermes/python-bridge.js';
import { executeNativePythonCode, hermesExecuteCodeSandboxDenied } from '../hermes/native-python.js';
import { skillManager } from '../skills/manager.js';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function resolveProjectPath(input = '.') {
  const raw = String(input || '.');
  return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

function truncate(text, max = 12000) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}\n...(truncated ${s.length - max} chars)` : s;
}

function registerCompatTool(def) {
  registerTool({
    label: `Hermes compat: ${def.name}`,
    ...def,
  });
}

async function terminalHandler(args = {}) {
  const command = args.command || args.cmd || args.input;
  const workdir = args.workdir || args.cwd;
  const timeout = args.timeout || args.timeout_ms;
  return bash({ command, workdir, timeout });
}

function searchFilesHandler(args = {}) {
  const pattern = args.pattern || args.query || args.regex || '';
  const target = args.path || args.directory || args.cwd || '.';
  const include = args.include || args.glob;
  if (!pattern) return 'Thiếu pattern/query để search_files.';
  return grep({ pattern, path: target, include, maxResults: args.maxResults || args.limit || 200 });
}

function patchHandler(args = {}) {
  if (args.path && ('oldString' in args || 'old_string' in args) && ('newString' in args || 'new_string' in args)) {
    return editFile({
      path: args.path,
      oldString: args.oldString ?? args.old_string,
      newString: args.newString ?? args.new_string,
    });
  }

  if (args.path && typeof args.content === 'string') {
    return writeFile({ path: args.path, content: args.content });
  }

  if (typeof args.patch === 'string' || typeof args.diff === 'string') {
    const patchText = args.patch || args.diff;
    const tmp = path.join(PROJECT_ROOT, 'data', `hermes-compat-${Date.now()}.patch`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, patchText, 'utf8');
    try {
      const out = execSync(`git apply --whitespace=nowarn ${JSON.stringify(tmp)}`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return out.trim() || '✅ Đã áp dụng patch bằng git apply.';
    } catch (err) {
      return truncate(`❌ Không áp dụng được patch.\n${err.stdout || ''}\n${err.stderr || err.message}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  return 'patch cần {path, oldString, newString} hoặc {patch/diff}.';
}

async function delegateTaskHandler(args = {}, context = {}) {
  const tasks = args.tasks || args.task || args.goal || args.prompt;
  const type = args.type || args.subagent_type || args.agent_type || 'default';
  return agentTool(
    { tasks: asArray(tasks), type, context: args.context },
    context.provider,
    context.userId,
    context.userWikiDir,
    context.send
  );
}

function memoryHandler(args = {}, context = {}) {
  const action = args.action || (args.content || args.text ? 'save' : 'search');
  if (action === 'save' || action === 'write' || action === 'set') {
    const content = args.content || args.text || args.value;
    const title = args.title || `Memory ${new Date().toISOString()}`;
    if (!content) return 'Thiếu content/text để lưu memory.';
    return wikiUpdate({ title, content, topics: args.topics || ['memory'], userId: context.userId });
  }
  const query = args.query || args.text || args.content || '';
  if (!query) return wikiList({ userId: context.userId });
  return search_wiki({ query }, context.userWikiDir, context.userId);
}

function sessionSearchHandler(args = {}, context = {}) {
  const query = args.query || args.text || '';
  if (!query) return 'Thiếu query cho session_search.';
  return search_wiki({ query }, context.userWikiDir, context.userId);
}

function skillsListHandler() {
  const catalog = skillManager.getSkillCatalog();
  return catalog.map(s => `- ${s.name}: ${s.description}`).join('\n') || 'Chưa có skill nào.';
}

function skillViewHandler(args = {}) {
  const name = args.name || args.skill || args.skill_name;
  if (!name) return skillsListHandler();
  const data = skillManager.getSkillInstructions(name);
  return data
    ? `## Skill "${data.name}"\n\n${data.instructions}`
    : `Không tìm thấy skill "${name}".\n\n${skillsListHandler()}`;
}

function skillManageHandler(args = {}, context = {}) {
  const action = args.action || 'list';
  if (action === 'list') return skillsListHandler();
  if (action === 'view' || action === 'read') return skillViewHandler(args);
  if (action === 'create' || action === 'save' || action === 'patch' || action === 'update') {
    const name = args.name || args.skill || args.skill_name;
    const content = args.content || args.instructions || args.body;
    if (!name || !content) return 'skill_manage cần name và content/instructions để create/update.';
    return wikiUpdate({
      title: `Skill note: ${name}`,
      content,
      topics: ['skills', 'hermes-compat'],
      userId: context.userId,
    });
  }
  return `skill_manage action chưa hỗ trợ trực tiếp: ${action}. Hỗ trợ: list, view, create/save/patch/update.`;
}

async function webExtractHandler(args = {}) {
  const url = args.url || args.link;
  if (url) return fetchUrl(url);
  const query = args.query || args.text;
  if (query) return webSearch(query);
  return 'web_extract cần url hoặc query.';
}

function unavailable(name, replacement = '') {
  return () => [
    `Tool Hermes "${name}" đã được nhận diện trong HAgent nhưng chưa được port lõi native.`,
    replacement ? `Dùng tool thay thế hiện có: ${replacement}.` : '',
  ].filter(Boolean).join('\n');
}

function hermesPythonFallback(name, replacement = '') {
  return async (args = {}, context = {}) => {
    try {
      const payload = await hermesPythonCallTool({
        tool: name,
        args,
        taskId: `hagent-${context.userId || 'user'}`,
        sessionId: context.userId || '',
        userTask: args.userTask || args.user_task || '',
      });
      return formatHermesPythonResult(payload);
    } catch (err) {
      return [
        `Hermes Python runtime không chạy được tool "${name}": ${err.message}`,
        replacement ? `Fallback HAgent hiện có: ${replacement}.` : '',
      ].filter(Boolean).join('\n');
    }
  };
}

registerCompatTool({
  name: 'terminal',
  description: 'Hermes-compatible shell execution. Alias của bash.',
  parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] },
  handler: terminalHandler,
});

registerCompatTool({
  name: 'search_files',
  description: 'Hermes-compatible file search. Alias của grep.',
  parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' }, include: { type: 'string' } }, required: ['pattern'] },
  handler: searchFilesHandler,
});

registerCompatTool({
  name: 'patch',
  description: 'Hermes-compatible patch tool. Hỗ trợ oldString/newString hoặc unified diff qua git apply.',
  parameters: { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, patch: { type: 'string' }, diff: { type: 'string' } } },
  handler: patchHandler,
});

registerCompatTool({
  name: 'delegate_task',
  description: 'Hermes-compatible delegation. Alias của HAgent agent tool.',
  parameters: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'string' } }, task: { type: 'string' }, goal: { type: 'string' }, type: { type: 'string' } } },
  handler: delegateTaskHandler,
});

registerCompatTool({
  name: 'memory',
  description: 'Hermes-compatible memory backed by HAgent wiki.',
  parameters: { type: 'object', properties: { action: { type: 'string' }, query: { type: 'string' }, content: { type: 'string' }, title: { type: 'string' } } },
  handler: memoryHandler,
});

registerCompatTool({
  name: 'session_search',
  description: 'Hermes-compatible session recall backed by HAgent wiki/RAG.',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  handler: sessionSearchHandler,
});

registerCompatTool({ name: 'skills_list', description: 'Hermes-compatible skills list.', parameters: { type: 'object', properties: {} }, handler: skillsListHandler });
registerCompatTool({ name: 'skill_view', description: 'Hermes-compatible skill view.', parameters: { type: 'object', properties: { name: { type: 'string' }, skill: { type: 'string' } } }, handler: skillViewHandler });
registerCompatTool({ name: 'skill_manage', description: 'Hermes-compatible skill management backed by wiki notes.', parameters: { type: 'object', properties: { action: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } } }, handler: skillManageHandler });
registerCompatTool({ name: 'web_extract', description: 'Hermes-compatible web extraction. Alias của fetch_url/web_search.', parameters: { type: 'object', properties: { url: { type: 'string' }, query: { type: 'string' } } }, handler: webExtractHandler });

registerCompatTool({
  name: 'execute_code',
  description: 'Hermes-compatible code execution. Uses Hermes execute_code first, then HAgent native Python if the Hermes RPC sandbox is blocked.',
  parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' }, command: { type: 'string' } } },
  handler: async (args = {}, context = {}) => {
    try {
      const payload = await hermesPythonCallTool({
        tool: 'execute_code',
        args,
        taskId: `hagent-${context.userId || 'user'}`,
        sessionId: context.userId || '',
        userTask: args.userTask || args.user_task || '',
      });
      if (hermesExecuteCodeSandboxDenied(payload)) {
        return executeNativePythonCode(args);
      }
      return formatHermesPythonResult(payload);
    } catch (err) {
      if (args.code || args.script) return executeNativePythonCode(args);
      return terminalHandler({ command: args.command });
    }
  },
});
registerCompatTool({ name: 'process', description: 'Hermes process registry compatibility. Python fallback to Hermes process_registry.', parameters: { type: 'object', properties: { action: { type: 'string' } } }, handler: hermesPythonFallback('process', 'task_start, task_output, task_stop, task_list') });
registerCompatTool({ name: 'image_generate', description: 'Hermes image generation compatibility. Python fallback to Hermes image_generation_tool.', parameters: { type: 'object', properties: { prompt: { type: 'string' } } }, handler: hermesPythonFallback('image_generate', 'skill image-generation hoặc backend image-generation skill') });
registerCompatTool({
  name: 'vision_analyze',
  description: 'Hermes vision compatibility. Alias của view_image cho ảnh local.',
  parameters: { type: 'object', properties: { path: { type: 'string' }, image: { type: 'string' }, image_url: { type: 'string' } } },
  handler: (args) => {
    const imagePath = args.path || args.image || args.image_url;
    return imagePath ? viewImage({ path: imagePath }) : 'vision_analyze cần path/image/image_url trỏ tới file ảnh local.';
  },
});
registerCompatTool({ name: 'video_analyze', description: 'Hermes video analysis compatibility. Python fallback to Hermes vision_tools.', parameters: { type: 'object', properties: { path: { type: 'string' } } }, handler: hermesPythonFallback('video_analyze', 'dub_video hoặc video-generation/video-dubbing skills') });
registerCompatTool({ name: 'text_to_speech', description: 'Hermes TTS compatibility. Python fallback to Hermes tts_tool.', parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' } } }, handler: hermesPythonFallback('text_to_speech', 'backend video/tts service hoặc podcast-generation skill') });
registerCompatTool({
  name: 'cronjob',
  description: 'Hermes-compatible cron job management. Maps to HAgent cron_create/cron_delete/cron_list.',
  parameters: { type: 'object', properties: { action: { type: 'string' }, cron: { type: 'string' }, prompt: { type: 'string' }, id: { type: 'number' } } },
  handler: (args = {}) => {
    const action = args.action || (args.cron && args.prompt ? 'create' : 'list');
    if (action === 'create' || action === 'add') return cronCreate(args);
    if (action === 'delete' || action === 'remove' || action === 'stop') return cronDelete(args);
    return cronList();
  },
});
registerCompatTool({
  name: 'clarify',
  description: 'Hermes-compatible clarification request. Alias của ask_user.',
  parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, choices: { type: 'array', items: { type: 'string' } } }, required: ['question'] },
  handler: (args) => askUser({ question: args.question, options: args.options || args.choices }),
});
registerCompatTool({
  name: 'send_message',
  description: 'Hermes-compatible outbound message gateway. Supports telegram/zalo/facebook through HAgent gateway.',
  parameters: { type: 'object', properties: { platform: { type: 'string' }, target: { type: 'string' }, chat_id: { type: 'string' }, user_id: { type: 'string' }, text: { type: 'string' }, message: { type: 'string' }, content: { type: 'string' } }, required: ['platform'] },
  handler: (args, context) => sendGatewayMessage(args, context.userId),
});

for (const name of [
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press', 'browser_scroll',
  'browser_snapshot', 'browser_back', 'browser_console', 'browser_get_images',
  'browser_vision', 'browser_cdp', 'browser_dialog', 'computer_use',
  'kanban_show', 'kanban_list', 'kanban_create', 'kanban_comment', 'kanban_heartbeat',
  'kanban_block', 'kanban_unblock', 'kanban_complete', 'kanban_link',
  'discord', 'discord_admin',
  'ha_list_entities', 'ha_get_state', 'ha_call_service', 'ha_list_services',
  'feishu_doc_read', 'feishu_drive_add_comment', 'feishu_drive_list_comments',
  'feishu_drive_reply_comment', 'feishu_drive_list_comment_replies',
  'mixture_of_agents',
  'rl_list_environments', 'rl_select_environment', 'rl_get_current_config',
  'rl_edit_config', 'rl_start_training', 'rl_check_status', 'rl_stop_training',
  'rl_get_results', 'rl_list_runs', 'rl_test_inference',
  'spotify_search', 'spotify_devices', 'spotify_playback', 'spotify_queue',
  'spotify_library', 'spotify_playlists', 'spotify_albums',
  'yb_query_group_info', 'yb_query_group_members', 'yb_send_dm',
  'yb_send_sticker', 'yb_search_sticker',
]) {
  registerCompatTool({
    name,
    description: `Hermes Python compatibility bridge for ${name}.`,
    parameters: { type: 'object', properties: {} },
    handler: hermesPythonFallback(name),
  });
}
