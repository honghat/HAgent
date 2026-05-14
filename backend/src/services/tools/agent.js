import { callLLM } from '../llm.js';
import { TOOL_DECISION_PROMPT, parseToolCalls } from './definitions.js';
import { search_wiki, read_page, listWikiTopics } from './wiki.js';
import { webSearch, fetchUrl } from './web.js';
import { fetchVnExpress, fetchDanTri } from './news.js';
import { getWeather } from './weather.js';
import { fetchGoldPrice, currencyConvert } from './finance.js';
import { fetchVietcombankRate } from './vietcombank.js';
import {
  calculate, getTime, translateText,
} from './utils.js';
import { readFile, writeFile } from './filesystem.js';
import { bash } from './bash.js';
import { editFile, notebookEdit } from './edit.js';
import { wikiUpdate, wikiDelete, wikiList } from './wiki-manage.js';
import { searchRag } from '../rag.js';
import db from '../../db.js';

async function getAgentDef(typeOrId, userId) {
  // Built-in defaults
  const defaults = {
    researcher: {
      name: 'Researcher',
      instructions: 'Bạn là chuyên gia tìm kiếm và tổng hợp thông tin. Hãy dùng web_search, fetch_url và search_wiki để thu thập dữ liệu sâu rộng. Luôn trích dẫn nguồn.',
    },
    coder: {
      name: 'Coder',
      instructions: `Bạn là chuyên gia lập trình HAgent. Cách bạn làm việc:
1. Dùng write_file để tạo/tạo lại file code
2. Dùng bash để chạy thử (node script.js, python script.py, npm test...)
3. Nếu lỗi (bash trả về lỗi), đọc output lỗi, dùng edit_file để sửa
4. Chạy lại bash để kiểm tra
5. Tiếp tục sửa và chạy lại cho đến khi chạy thành công
6. Chỉ DONE khi code chạy được hoặc hoàn thành mục tiêu

Tools có: read_file, write_file, edit_file, bash, web_search
Luôn KIỂM TRA code bằng bash sau khi viết/sửa.`,
    },
    analyst: {
      name: 'Analyst',
      instructions: 'Bạn là chuyên gia phân tích dữ liệu. Hãy dùng các công cụ tính toán và xử lý file để đưa ra nhận xét chuyên sâu.',
    },
  };

  if (defaults[typeOrId]) return defaults[typeOrId];

  // Fetch from DB
  try {
    const agent = db.prepare('SELECT name, soul_content FROM agents WHERE (id = ? OR name = ?) AND (user_id = ? OR is_public = 1)').get(typeOrId, typeOrId, userId);
    if (agent) {
      return { name: agent.name, instructions: agent.soul_content };
    }
  } catch (e) {
    console.error('[Agent Registry] DB error:', e.message);
  }

  return { name: 'Assistant', instructions: 'Bạn là trợ lý đa năng của HAgent.' };
}

const SUBAGENT_SYSTEM_TEMPLATE = (instructions) => `You are a sub-agent of HAgent. 
Your specific soul/instructions: ${instructions}

## Rules
1. Work continuously like Hermes — act, inspect results, adapt, verify.
2. When creating files, ALWAYS use write_file.
3. When editing, ALWAYS read_file first, then edit_file.
4. After writing code, ALWAYS run it with bash to verify.
5. If bash returns an error, READ the error carefully, then edit_file to fix, then rerun.
6. Return final result in Vietnamese, concise.

## Output Format
While working, use this format whenever another tool is needed:

THINKING
<tiếng Việt: phân tích ngắn hành động cần làm ngay>
THINKING_END
TOOL_CALLS
[{"name": "tool_name", "args": { ... }}]
TOOL_CALLS_END

When the task is COMPLETE, you MUST output:

DONE
<câu trả lời hoàn chỉnh bằng tiếng Việt>`;

async function executeTool(name, args, context) {
  switch (name) {
    case 'read_file': return readFile(args);
    case 'write_file': return writeFile({ ...args, userId: context.userId });
    case 'edit_file': return editFile(args);
    case 'bash': return bash(args);
    case 'web_search': return webSearch(args.query);
    case 'fetch_url': return fetchUrl(args.url);
    case 'search_wiki': return search_wiki(args, context.wikiDir);
    case 'read_page': return read_page(args, context.wikiDir);
    case 'list_wiki_topics': return listWikiTopics(context.wikiDir);
    case 'update_wiki': return wikiUpdate({ ...args, userId: context.userId });
    case 'delete_wiki': return wikiDelete({ ...args, userId: context.userId });
    case 'wiki_list': return wikiList({ userId: context.userId });
    case 'get_weather': return getWeather(args);
    case 'get_gold_price': return fetchGoldPrice();
    case 'vietcombank_rate': return fetchVietcombankRate();
    case 'currency_convert': return currencyConvert(args);
    case 'translate': return translateText(args);
    case 'calculate': return calculate(args);
    case 'get_time': return getTime();
    case 'get_vnexpress_news': return fetchVnExpress();
    case 'get_dantri_news': return fetchDanTri();
    case 'search_rag': {
      const { searchRag } = await import('../rag.js');
      const ragResults = await searchRag(args.query);
      return ragResults?.length
        ? ragResults.map(r => `📄 **${r.title}** (${(r.score * 100).toFixed(1)}%)\n${r.summary || r.content.slice(0, 200)}`).join('\n\n')
        : 'Không tìm thấy.';
    }
    default: return `Unknown tool: ${name}`;
  }
}

/**
 * Runs a single sub-agent loop
 */
async function runSubAgent(type, task, context, provider, send) {
  const agentDef = await getAgentDef(type, context.userId);
  const system = SUBAGENT_SYSTEM_TEMPLATE(agentDef.instructions);
  const messages = [
    { role: 'user', content: `TASK: ${task}${context.extraContext ? `\n\nCONTEXT: ${context.extraContext}` : ''}\n\nExecute this task.` },
  ];

  const journal = [];
  let steps = 0;
  const maxSteps = 15;

  while (steps++ < maxSteps) {
    const { content: res } = await callLLM(system, messages, { provider, maxTokens: 2000 });
    
    if (res.includes('DONE')) {
      const summary = res.split('DONE')[1]?.trim() || 'Task completed.';
      return { success: true, summary, journal };
    }

    const calls = parseToolCalls(res);
    if (!calls || calls.length === 0) {
      if (res.includes('THINKING')) {
        messages.push({ role: 'assistant', content: res });
        continue;
      }
      return { success: false, error: 'No tool calls / DONE found', partial: res, journal };
    }

    messages.push({ role: 'assistant', content: res });

    for (const call of calls) {
      if (send) send('think', { content: `[${agentDef.name}] ${call.name}...`, detail: false });
      const result = await executeTool(call.name, call.args, context);
      const resultText = typeof result === 'string' ? result.slice(0, 2500) : JSON.stringify(result).slice(0, 2500);
      messages.push({ role: 'user', content: `[Tool result: ${call.name}]\n${resultText}` });
      journal.push({ tool: call.name, args: call.args, result: resultText.slice(0, 200) });
    }
  }

  return { success: false, error: 'Max steps reached', journal };
}

export async function agentTool({ tasks, type = 'default', context: extraContext } = {}, parentProvider, callerUserId, callerWikiDir, send) {
  const provider = parentProvider || 'deepseek';
  const context = { wikiDir: callerWikiDir || null, userId: callerUserId || null, extraContext };

  // Handle both single task (string) and multiple tasks (array)
  const taskList = Array.isArray(tasks) ? tasks : (typeof tasks === 'string' ? [tasks] : []);
  if (taskList.length === 0) return 'Lỗi: Không có task nào được cung cấp.';

  if (send) send('think', { content: `🤖 Đang điều phối ${taskList.length} sub-agent (${type})...`, detail: false });

  // Parallel Execution with Concurrency Limit (e.g., 3)
  const results = [];
  const concurrencyLimit = 3;
  for (let i = 0; i < taskList.length; i += concurrencyLimit) {
    const batch = taskList.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(batch.map(task => runSubAgent(type, task, context, provider, send)));
    results.push(...batchResults);
  }

  const summary = results.map((r, i) => {
    if (r.success) return `✅ **Task ${i + 1}**: ${r.summary}`;
    return `❌ **Task ${i + 1} Thất bại**: ${r.error}\n${r.partial || ''}`;
  }).join('\n\n');

  return `### Kết quả từ Sub-agents (${type})\n\n${summary}`;
}
