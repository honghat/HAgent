import { callLLM, callLLMStream } from '../llm.js';
import { searchIdentity, getUserWikiDir } from './helpers.js';
import { search_wiki, read_page, listWikiTopics } from './wiki.js';
import { searchRag } from '../rag.js';
import { webSearch, fetchUrl } from './web.js';
import { fetchVnExpress, fetchDanTri } from './news.js';
import { getWeather } from './weather.js';
import { fetchGoldPrice, currencyConvert } from './finance.js';
import { get_silver_price } from './silver.js';
import { fetchVietcombankRate } from './vietcombank.js';
import {
  calculate, getTime, translateText, getDefinition, getIpInfo,
  generateUuid, hashText, formatJson, unitConvert,
  randomNumber, encodeDecode, passwordGenerate,
} from './utils.js';
import { todoManage } from './todo.js';
import { agentTool } from './agent.js';
import { readFile, writeFile } from './filesystem.js';
import { bash } from './bash.js';
import { askUser, pushNotification } from './interact.js';
import { editFile, notebookEdit } from './edit.js';
import { taskStart, taskOutput, taskStop, taskList } from './tasks.js';
import { cronCreate, cronDelete, cronList } from './cron.js';
import { monitorStart, monitorStop, monitorResult } from './monitor.js';
import { wikiUpdate, wikiDelete, wikiList } from './wiki-manage.js';
import { searchEntries } from '../wiki-store.js';
import { grep } from './grep.js';
import { openClaudeTelegram } from './claude.js';
import { controlService } from '../service-manager.js';
import { getGatewayStatus, sendGatewayMessage } from '../gateway/index.js';
import { TOOL_DEFS, TOOL_DECISION_PROMPT, buildToolDecisionPrompt, parseToolCalls, parseThinking, extendTools } from './definitions.js';
import { loadRegistry, getHandler, getAllLabels, getAllToolDefs } from './registry.js';
import { throwIfAborted, isAbortError } from '../run-registry.js';

// ── Lead Agent Middlewares
import { middlewareManager } from '../lead-agent/middlewares/manager.js';
import { clarificationMiddleware } from '../lead-agent/middlewares/clarification.js';
import { loopDetectionMiddleware } from '../lead-agent/middlewares/loop-detection.js';
import { autoTitleMiddleware } from '../lead-agent/middlewares/auto-title.js';
import { tokenUsageMiddleware } from '../lead-agent/middlewares/token-usage.js';
import { summarizationMiddleware } from '../lead-agent/middlewares/summarization.js';
import { errorHandlerMiddleware } from '../lead-agent/middlewares/error-handler.js';
import { observabilityMiddleware } from '../lead-agent/middlewares/observability.js';

// ── Skills System
import { skillManager } from '../skills/manager.js';
await skillManager.loadSkills();

// ── File System
import { processFile } from '../files/processor.js';

// Register Middlewares (HAgent style)
middlewareManager.use(clarificationMiddleware);
middlewareManager.use(loopDetectionMiddleware);
middlewareManager.use(autoTitleMiddleware);
middlewareManager.use(tokenUsageMiddleware);
middlewareManager.use(summarizationMiddleware);
middlewareManager.use(errorHandlerMiddleware);
middlewareManager.use(observabilityMiddleware);

// Load auto-registered tools
await loadRegistry();
extendTools(getAllToolDefs()); // Include auto-registered tools in system prompt

import { getEvolvedInstructions } from '../self-evolution/manager.js';
import './self-evolve.js';

const evolvedInstructions = getEvolvedInstructions();

const BASE_SYSTEM_PROMPT = `Bạn là một trợ lý AI thông minh, chuyên nghiệp và có khả năng sử dụng công cụ mạnh mẽ.
KHI SỬ DỤNG THÔNG TIN TỪ WIKI HOẶC RAG:
- Bạn BẮT BUỘC phải trích dẫn nguồn bằng số trong ngoặc vuông, ví dụ: [1], [2].
- Nếu thông tin đến từ kết quả số [1], hãy thêm [1] vào cuối câu hoặc đoạn văn tương ứng.
- Tuyệt đối không tự bịa ra thông tin nếu không có trong ngữ cảnh được cung cấp.
${evolvedInstructions ? `## Hướng dẫn tự tiến hóa (DNA):
${evolvedInstructions}` : ''}`;

const ACTION_NARRATION_PATTERNS = [
  /(?:tôi|mình|em)\s+sẽ\s+(?:kiểm tra|đọc|tìm|chạy|sửa|tạo|cập nhật|thêm|phân tích)/i,
  /(?:để|hãy để)\s+(?:tôi|mình|em)\s+(?:kiểm tra|đọc|tìm|chạy|sửa|tạo|cập nhật|thêm|phân tích)/i,
  /(?:tiếp theo|việc tiếp theo).{0,80}(?:sẽ|cần)\s+(?:kiểm tra|đọc|chạy|sửa|tạo|cập nhật|thêm|verify|test)/i,
  /(?:i will|i'll|let me)\s+(?:check|read|search|run|fix|create|update|add|analyze|verify|test)/i,
];

function isActionNarration(text = '') {
  return ACTION_NARRATION_PATTERNS.some(pattern => pattern.test(text));
}

function isExecutionTask(text = '') {
  return /(viết|tạo|code|script|function|lập\s*trình|fix\s*bug|debug|sửa\s*lỗi|thêm\s*tính\s*năng|chức\s*năng|module|component|route|api\s*endpoint|middleware|migration|schema|model|controller|service|tool\s*mới|command\s*mới|docker|dockerfile|test|unit\s*test|e2e|jest|mocha|chai|express|react|vue|next|nuxt|prisma|typeorm|sequelize|socket|websocket|graphql|rest\s*api|npm|yarn|pip|python|node\s|git\s|deploy|build|compile|chạy\s*thử|run|kiểm\s*tra|verify|self-evolve|tự\s*tiến\s*hóa|tự\s*sửa|tự\s*code|sửa\s*file|ghi\s*file)/i.test(text);
}

function buildPostToolInstruction({ hasErrors, forceFinal }) {
  if (hasErrors) {
    return '\n\n⚠️ Có lỗi xảy ra trong quá trình thực thi tool. Hãy phân tích lỗi và thử lại với cách tiếp cận khác hoặc thông báo cho người dùng nếu thật sự không thể tiếp tục.';
  }

  if (forceFinal) {
    return `\n\n✅ DỮ LIỆU ĐÃ CÓ ĐỦ. Bây giờ bạn PHẢI tổng hợp và đưa ra CÂU TRẢ LỜI CUỐI CÙNG hoàn chỉnh cho người dùng.

⚠️ QUY TẮC BẮT BUỘC:
- Sử dụng thẻ DONE ở đầu câu trả lời.
- Trình bày câu trả lời CHI TIẾT, ĐẦY ĐỦ, trình bày đẹp bằng Markdown.
- Trả lời bằng TIẾNG VIỆT.
- KHÔNG ĐƯỢC gọi thêm tool nếu dữ liệu trên đã đủ để trả lời.

BẮT ĐẦU VỚI:
DONE
[Nội dung câu trả lời của bạn]`;
  }

  return `\n\n🔁 TIẾP TỤC VÒNG LẶP THỰC THI KIỂU HAGENT:
- Hãy đọc kết quả tool ở trên và quyết định hành động tiếp theo.
- Nếu nhiệm vụ còn hành động rõ ràng (đọc file khác, sửa file, chạy lệnh, verify/test, kiểm tra diff), PHẢI gọi tool tiếp bằng TOOL_CALLS.
- Chỉ DONE khi nhiệm vụ đã hoàn tất và đã kiểm chứng bằng kết quả tool phù hợp.
- Không trả lời kiểu "tôi sẽ..." nếu chưa gọi tool tương ứng.`;
}

const VERIFY_TOOL_NAMES = new Set(['bash', 'terminal', 'execute_code', 'hagent_python', 'task_output', 'grep', 'search_files', 'read_file', 'get_system_info']);
const SIDE_EFFECT_TOOL_NAMES = new Set([
  'write_file', 'edit_file', 'patch', 'notebook_edit', 'bash', 'terminal',
  'task_start', 'task_stop', 'cron_create', 'cron_delete',
  'monitor_start', 'monitor_stop', 'update_wiki', 'delete_wiki',
  'wiki_list', 'gmail', 'gdrive', 'gdocs', 'gateway_send_message',
  'telegram_connect', 'telegram_disconnect', 'push_notification',
  'remote_power', 'self_evolve', 'skill_manage',
  'image_generate', 'text_to_speech', 'process', 'execute_code', 'hagent_python',
]);

function hasVerificationTool(calls = []) {
  return calls.some(call => VERIFY_TOOL_NAMES.has(call.name));
}

function needsSequentialExecution(calls = []) {
  return calls.some(call => SIDE_EFFECT_TOOL_NAMES.has(call.name));
}

// ── Orchestrator

export async function decideAndExecuteTools(msgs, provider, userId, send, options = {}) {
  const startTime = Date.now();
  const signal = options.signal;
  const lastMsg = msgs[msgs.length - 1]?.content || '';
  if (lastMsg.length < 10 && /^(chào|hello|hi|bye|tạm biệt|cảm ơn|thanks|ok|okee|vâng|dạ|ừ|uh|uk|hmm|:\)|\?$|^[.!]$)/i.test(lastMsg.trim())) {
    return '';
  }

  try {
    const userWikiDir = getUserWikiDir(userId);

    // ── Auto-detected skill hint ──
    let skillHint = '';
    const relevantSkills = skillManager.findRelevantSkills(lastMsg);
    if (relevantSkills.length > 0) {
      skillHint = `\n\n💡 **Gợi ý**: Yêu cầu này có thể sử dụng skill chuyên biệt: ${relevantSkills.map(s => `\`${s.name}\``).join(', ')}. Hãy dùng \`use_skill\` để nhận hướng dẫn chi tiết.`;
      send('think', { content: `🧠 Đã nhận diện skill phù hợp: ${relevantSkills.map(s => s.name).join(', ')}` });
    }

    const toolMsgs = [
      ...msgs
    ];
    const isGoldQuery = /(^|\s)(giá\s+vàng|gia\s*vang|vàng|vang|doji|sjc|pnj|vàng\s*nhẫn|vang\s*nhan|gold\s*price)/i.test(lastMsg) && !/(xăng|dầu|xang|dau)/i.test(lastMsg);
    const isSilverQuery = /(^|\s)(giá\s+bạc|gia\s*bac|bạc|bac|silver\s*price)/i.test(lastMsg);
    const isExchangeRateQuery = /(tỷ\s*giá|ty\s*gia|ngoại\s*tệ|ngoai\s*te|usd|eur|jpy|cnh|cny|krw|vcb|vietcombank|đô\s*(la|la)|do\s*la|bảng\s*anh|bang\s*anh|yên\s*nhật|yen\s*nhat|nhân\s*dân\s*tệ|nhan\s*dan\s*te|won|won\s*hàn|won\s*han|tiền\s*(tệ|ngoại)|tien\s*(te|ngoai)|quy\s*đổi.*(tiền|usd|eur|vnd|jpy)|quy\s*doi.*(tien|usd|eur|vnd|jpy)|1\s*(usd|eur|jpy)\s*(bằng|bang|sang|bao))/i.test(lastMsg);
    const isNewsQuery = /(tin\s*(tức|tuc|nóng|nong|mới|moi)|thời\s*sự|thoi\s*su|news|hôm\s*nay|hom\s*nay|hiện\s*tại|hien\s*tai|mới\s*(nhất|nhat|cập\s*nhật|cap\s*nhat)|chứng\s*khoán|chung\s*khoan|bầu\s*cử|bau\s*cu|thị\s*trường|thi\s*truong|current|today|stock|election|update|động\s*đất|dong\s*dat|bão|bao|lũ|lu|lụt|lut|sạt\s*lở|sat\s*lo|nắng\s*nóng|nang\s*nong|giá\s*(xăng|dầu|cả)|gia\s*(xang|dau|ca)|tổng\s*hợp|tong\s*hope|nổi\s*bật|noi\s*bat|sự\s*kiện|su\s*kien|chỉ\s*số|chi\s*so|VN-Index|xăng|xang|dầu|dau)/i.test(lastMsg) && !isExchangeRateQuery;
    const isWeatherQuery = /(thời\s*tiết|thoi\s*tiet|weather|nhiệt\s*độ|nhiet\s*do|độ\s*ẩm|do\s*am|mưa|mua|nắng|nang|gió|gio|bão|bao)/i.test(lastMsg);

    // Check if this is a wiki modification request (skip identity shortcut)
    const isModifyRequest = /(viết|lại|sửa|đổi|cập\s+nhật|thay|thêm|xóa|chỉnh|chuyển|merge|gộp|tạo\s+mới|thay\s+đổi|bổ\s+sung|chỉnh\s+sửa)\s+(.*\s)?(wiki|entry|thông\s+tin|nội\s+dung|bài|trang|mục)/i.test(lastMsg)
      || /(wiki|entry|thông\s+tin\s+cá\s+nhân)\s+(.*\s)?(tích\s+cực|tốt\s+hơn|hay\s+hơn|khác|mới)/i.test(lastMsg);

    // Force wiki search for identity questions (but not modification requests)
    const isIdentityQuery = !isModifyRequest && (
      /(tôi|em|mình|tao|tớ)\s*(là|ai|tên|tên gì|ai vậy|ai thế)/i.test(lastMsg)
      || /who\s+am\s+i/i.test(lastMsg)
      || /bạn\s+(có\s+)?(biết|nhớ)\s+(tôi|em|mình|tao|tớ)/i.test(lastMsg)
      || /(điểm\s+yếu|điểm\s+mạnh|sở\s+thích|tính\s+cách|thông\s+tin\s+cá\s+nhân|mục\s+tiêu|kế\s+hoạch)\s+(của\s+)?(tôi|em|mình|tao|tớ)/i.test(lastMsg)
      || /(tôi|em|mình|tao|tớ)\s+(là\s+)?(ai|như\s+thế\s+nào|có\s+điểm\s+gì|học\s+gì|làm\s+gì)/i.test(lastMsg)
    );

    const isGmailQuery = /(gmail|inbox|email|mail|send\s+email|gửi\s+mail|gửi\s+email|đọc\s+email|hộp\s+thư)/i.test(lastMsg) && !isIdentityQuery;
    const isDriveQuery = /(google\s*drive|drive|file\s*Drive)/i.test(lastMsg) && !isGmailQuery && !isIdentityQuery;
    const isDocsQuery = /(google\s*docs|docs|gdoc|google\s*document)/i.test(lastMsg) && !isGmailQuery && !isDriveQuery && !isIdentityQuery;
    const isWikiQuery = /wiki|knowledge|kiến\s*thức/i.test(lastMsg) && !isGmailQuery && !isDriveQuery && !isDocsQuery && !isGoldQuery && !isExchangeRateQuery && !isNewsQuery && !isWeatherQuery;
    const isWebSearchQuery = /(tìm\s*kiếm|search|trên\s*web|tra\s*cứu.*web|google\s*(tìm|search)|tìm.*mạng|tìm.*internet)/i.test(lastMsg) && !isGoldQuery && !isExchangeRateQuery && !isNewsQuery && !isWeatherQuery && !isGmailQuery && !isDriveQuery && !isDocsQuery && !isWikiQuery;
    const isCodeQuery = /(viết|tạo|code|script|function|lập\s*trình|fix\s*bug|npm|yarn|pip|python|node\s|git\s|deploy|build|compile|chạy\s*thử|run|debug|sửa\s*lỗi|thêm\s*tính\s*năng|chức\s*năng|module|component|route|api\s*endpoint|middleware|migration|schema|model|controller|service|tool\s*mới|command\s*mới|docker|dockerfile|test|unit\s*test|e2e|jest|mocha|chai|express|react|vue|next|nuxt|prisma|typeorm|sequelize|socket|websocket|graphql|rest\s*api)/i.test(lastMsg) && !isIdentityQuery;
    const isRemotePowerQuery = /(bật|tắt|khởi\s*động|lại|shutdown|reboot|wake|wol|máy\s*tính\s*từ\s*xa|remote|sleep|status.*máy\s*tính|trạng\s*thái.*máy\s*tính|power|on|off)/i.test(lastMsg) && !isIdentityQuery;
    const isTaskExecutionQuery = isCodeQuery || isExecutionTask(lastMsg);

    // ── Multi-round tool execution loop ──
    const allParts = [];
    let round = 0;
    let hasCalledWikiTool = false; // Track if wiki tool was already called
    let hasVerifiedExecution = !isTaskExecutionQuery;

    const state = { threadId: userId, userId, round, msgs: toolMsgs };

    while (true) {
      throwIfAborted(signal, 'Đã dừng xử lý');
      if (++round > 200) { send('think', { content: 'Đã đạt giới hạn vòng lặp, đang tổng hợp...' }); break; }

      // Run 'beforeModel' middlewares
      state.round = round;
      const beforeUpdate = await middlewareManager.runBeforeModel(state);
      if (beforeUpdate) Object.assign(state, beforeUpdate);

      send('think', { content: `**Đang thực thi (${round})**\n`, append: false, detail: true });
      let decision = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const skillCatalog = skillManager.getSkillCatalog();
      const stream = callLLMStream(buildToolDecisionPrompt(skillCatalog), toolMsgs, { provider, userId, maxTokens: 2000, signal });
      for await (const chunk of stream) {
        throwIfAborted(signal, 'Đã dừng xử lý');
        if (chunk.type === 'content') {
          decision += chunk.content;
          send('think', { content: chunk.content, append: true, detail: true });
        } else if (chunk.type === 'usage') {
          usage = chunk.usage;
        }
      }
      console.log(`[LLM Decision] Round ${round}:`, decision);

      // Run 'afterModel' middlewares
      const afterResult = await middlewareManager.runAfterModel(state, { content: decision, usage });
      if (afterResult?.interrupt) {
        if (afterResult.content) {
          allParts.push(afterResult.content);
        }
        // If it's a special interruption (like clarification), we handle it
        if (afterResult.name === 'clarification') {
          const clar = { ...afterResult, _isClarification: true, state };
          return { extraContext: clar, state };
        }
        break;
      }

      const finalDecision = afterResult?.decision || decision;

      // 1. Phân tích Tool Call từ phản hồi của AI
      let calls = parseToolCalls(finalDecision);
      
      // 2. Auto-inject các công cụ quan trọng ở hiệp đầu tiên nếu phát hiện từ khóa mà AI chưa gọi
      if (round === 1) {
        calls = calls || [];
        if (isSilverQuery && !calls.some(c => c.name === 'get_silver_price')) {
          calls.push({ name: 'get_silver_price', args: {} });
        }
        if (isGoldQuery && !calls.some(c => c.name === 'get_gold_price')) {
          calls.push({ name: 'get_gold_price', args: {} });
        }
        if (isExchangeRateQuery && !calls.some(c => c.name === 'vietcombank_rate')) {
          calls.push({ name: 'vietcombank_rate', args: {} });
        }
        if (isNewsQuery && !calls.some(c => c.name === 'get_vnexpress_news' || c.name === 'get_dantri_news')) {
          calls.push({ name: 'get_vnexpress_news', args: {} });
          calls.push({ name: 'get_dantri_news', args: {} });
        }
        if (isWeatherQuery && !calls.some(c => c.name === 'get_weather')) {
          calls.push({ name: 'get_weather', args: { location: 'Hồ Chí Minh' } });
        }
        if (isIdentityQuery && !calls.some(c => c.name === 'search_wiki')) {
          calls.push({ name: 'search_wiki', args: { query: 'thông tin người dùng' } });
        }
      }

      // 3. LOGIC DỪNG: Nếu không có Tool Call nào (kể cả sau khi auto-inject)
      if (!calls || calls.length === 0) {
        // Kiểm tra nếu có DONE với câu trả lời
        const doneMatch = finalDecision.match(/DONE\s*([\s\S]*)/);
        if (doneMatch) {
          const doneAnswer = doneMatch[1].trim();
          if (isTaskExecutionQuery && !hasVerifiedExecution && round < 20) {
            toolMsgs.push({ role: 'assistant', content: finalDecision || '(empty)' });
            toolMsgs.push({
              role: 'user',
              content: 'Bạn đang muốn DONE nhưng task thực thi/code/file chưa có verify rõ ràng. Hãy gọi tool kiểm chứng phù hợp trước: bash/terminal để chạy test hoặc lệnh kiểm tra, grep/search_files/read_file để xác nhận file/diff. Chỉ DONE sau khi verify.',
            });
            continue;
          }
          if (doneAnswer.length > 5) {
            allParts.push(doneAnswer);
          }
        } else {
          // Không có DONE, không có tool calls → lấy nội dung sạch bất kỳ
          const cleanContent = finalDecision
            .replace(/THINKING[\s\S]*?THINKING_END/g, '')
            .replace(/TOOL_CALLS[\s\S]*?TOOL_CALLS_END/g, '')
            .replace(/^DONE\s*/m, '')
            .trim();
          if (isTaskExecutionQuery && isActionNarration(cleanContent) && round < 10) {
            toolMsgs.push({ role: 'assistant', content: finalDecision || '(empty)' });
            toolMsgs.push({
              role: 'user',
              content: 'Bạn vừa mô tả việc sẽ làm nhưng chưa gọi tool. Hãy tiếp tục theo kỷ luật Hagent: gọi TOOL_CALLS cho hành động thực thi/kiểm tra tiếp theo, hoặc chỉ DONE nếu nhiệm vụ đã hoàn tất và đã verify.',
            });
            continue;
          }
          if (cleanContent.length > 10) {
            allParts.push(cleanContent);
          }
        }
        break; // DỪNG vòng lặp
      }

      // 4. Nếu có Tool Call: Tiếp tục thực thi (bỏ qua thẻ DONE nếu có trong cùng hiệp này)

      // Auto-inject search_wiki when web_search is called
      const hasWebSearch = calls.some(c => c.name === 'web_search');
      const hasWikiSearch = calls.some(c => c.name === 'search_wiki');
      if (hasWebSearch && !hasWikiSearch) {
        const webCall = calls.find(c => c.name === 'web_search');
        calls.push({ name: 'search_wiki', args: { query: webCall.args.query } });
      }

      // Anti-grep-hallucination: nếu LLM gọi grep thay vì dùng google tools → force
      if (calls.some(c => c.name === 'grep') && (isGmailQuery || isDriveQuery || isDocsQuery)) {
        const inject = isGmailQuery ? { name: 'gmail', args: { action: 'list' } }
          : isDriveQuery ? { name: 'gdrive', args: {} }
          : { name: 'gdocs', args: { action: 'read' } };
        calls = [inject];
      }

      // Tool step is shown via send('tool') below, no need for duplicate think step

      throwIfAborted(signal, 'Đã dừng xử lý');
      const results = await executeToolCalls(calls, userWikiDir, provider, userId, send, options);
      if (isTaskExecutionQuery && hasVerificationTool(calls)) {
        hasVerifiedExecution = true;
      }
      console.log(`[Tool Results] Round ${round}:`, results.map(r => ({ name: r.name, len: r.result?.length })));
      
      // Check for middleware interruptions during tool execution (e.g. Clarification)
      const clarification = results.find(r => r.result?._isClarification);
      if (clarification) {
        // Stop execution and return the clarification as the final answer
        // This will be handled by the frontend to show a special UI
        return { _isClarification: true, ...clarification.result };
      }
      // Include ALL results (including errors) so LLM sees what happened
      const visionResults = results.filter(r => r.result?._isVisionResult);
      const safeStr = (r) => {
        if (!r.result) return '';
        if (typeof r.result === 'string') return r.result;
        if (typeof r.result === 'object') return JSON.stringify(r.result);
        return String(r.result);
      };
      const successParts = results
        .filter(r => r.result && !r.result?._isVisionResult && !safeStr(r).startsWith('Không') && !safeStr(r).includes('Lỗi'))
        .map(r => `## ${r.name}\n${safeStr(r)}`);
      const errorParts = results
        .filter(r => r.result && !r.result?._isVisionResult && (safeStr(r).startsWith('Không') || safeStr(r).includes('Lỗi')))
        .map(r => `## ${r.name} (THẤT BẠI)\n${safeStr(r)}`);

        // Sau khi tool thành công: thêm hint buộc LLM xuất DONE với câu trả lời đầy đủ
        if (successParts.length) {
          allParts.push(...successParts);
        }

        const allParts_round = [...successParts, ...errorParts];
        if (allParts_round.length || visionResults.length) {
          toolMsgs.push({ role: 'assistant', content: finalDecision });

          let userMessageContent = `[Tool results]\n${allParts_round.join('\n\n')}`;

          // Handle vision results by creating a multimodal content array
          if (visionResults.length > 0) {
            const contentArray = [{ type: 'text', text: userMessageContent || 'Đã đọc hình ảnh.' }];
            for (const vr of visionResults) {
              contentArray.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: vr.result.mimeType,
                  data: vr.result.data
                },
                // OpenAI format compatibility
                image_url: {
                  url: `data:${vr.result.mimeType};base64,${vr.result.data}`
                }
              });
            }
            toolMsgs.push({ role: 'user', content: contentArray });
          } else {
            const forceFinal = !isTaskExecutionQuery && !errorParts.length;
            const suffix = buildPostToolInstruction({ hasErrors: Boolean(errorParts.length), forceFinal });
            toolMsgs.push({ role: 'user', content: userMessageContent + suffix });
          }
        } else {
          // All tools failed
          const failedSummary = results.map(r => `- ${r.name}: ${(r.result || 'không output').slice(0, 200)}`).join('\n');
          toolMsgs.push({ role: 'assistant', content: finalDecision });
          toolMsgs.push({ role: 'user', content: `[Tool results] TẤT CẢ tool đều thất bại trong lượt ${round}:\n${failedSummary}\n\nBẮT BUỘC thử hành động tiếp theo với CÁCH KHÁC (đổi từ khóa, dùng tool khác). KHÔNG gọi lại tool vừa thất bại với cùng tham số. KHÔNG ĐƯỢC DỪNG.` });
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const modelName = typeof provider === 'object' ? provider.name : provider;
    
    // Nếu có final answer từ DONE trong tool loop → đưa thẳng vào extraContext như final_answer
    // chatStream sẽ chỉ dùng để synthesize / render thêm nếu cần
    const dataContext = allParts.join('\n\n---\n\n');
    const finalContext = dataContext + `\n\n---\n⏱️ **Thời gian xử lý**: ${totalTime}s | **Rounds**: ${round} | **Model**: ${modelName}`;
    return { extraContext: finalContext, state };
  } catch (error) {
    if (isAbortError(error)) {
      return { extraContext: '', state: { aborted: true, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } } };
    }
    return { extraContext: '', state: { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } } };
  }
}

async function executeToolCalls(calls, userWikiDir, provider, userId, send, options = {}) {
  const executeOne = async (call) => {
    throwIfAborted(options.signal, 'Đã dừng xử lý');
    send('tool', { name: call.name, status: 'start', label: getLabel(call.name) });

    let result;
    
    // Wrap tool execution with middleware
    result = await middlewareManager.wrapToolCall(call, async (tc) => {
      throwIfAborted(options.signal, 'Đã dừng xử lý');
      switch (tc.name) {
      case 'search_wiki':
        result = search_wiki(call.args, userWikiDir, userId);
        if (result.startsWith('Không')) {
          const ragResults = await searchRag(call.args.query);
          if (ragResults && ragResults.length > 0) {
            const ragText = ragResults.map((r, i) =>
              `📄 **[${i + 1}] ${r.title}** (RAG: ${(r.score * 100).toFixed(1)}%)\n${r.summary || r.content.slice(0, 300)}`
            ).join('\n\n---\n\n');
            result = `**🔍 Wiki Knowledge (Citations [1], [2], ...)**\n${ragText}`;
          }
        }
        break;
      case 'search_rag': {
        const ragResults = await searchRag(call.args.query);
        result = ragResults?.length
          ? ragResults.map((r, i) => `📄 **[${i + 1}] ${r.title}** (RAG: ${(r.score * 100).toFixed(1)}%)\n${r.summary || r.content.slice(0, 300)}`).join('\n\n---\n\n')
          : 'Không tìm thấy kết quả nào.';
        break;
      }
      case 'read_page': result = read_page(call.args, userWikiDir, userId); break;
      case 'list_wiki_topics': result = listWikiTopics(userWikiDir, userId); break;
      case 'web_search': result = await webSearch(call.args.query); break;
      case 'fetch_url': result = await fetchUrl(call.args.url); break;
      case 'get_weather': result = await getWeather(call.args); break;
      case 'get_gold_price': result = await fetchGoldPrice(); break;
      case 'get_silver_price': result = await get_silver_price(); break;
      case 'vietcombank_rate': result = await fetchVietcombankRate(); break;
      case 'currency_convert': result = await currencyConvert(call.args); break;
      case 'translate': result = await translateText(call.args); break;
      case 'get_definition': result = await getDefinition(call.args); break;
      case 'calculate': result = calculate(call.args); break;
      case 'get_time': result = getTime(); break;
      case 'get_ip_info': result = await getIpInfo(call.args); break;
      case 'get_vnexpress_news': result = await fetchVnExpress(); break;
      case 'get_dantri_news': result = await fetchDanTri(); break;
      case 'generate_uuid': result = generateUuid(call.args); break;
      case 'hash_text': result = await hashText(call.args); break;
      case 'format_json': result = formatJson(call.args); break;
      case 'unit_convert': result = unitConvert(call.args); break;
      case 'random_number': result = randomNumber(call.args); break;
      case 'encode_decode': result = encodeDecode(call.args); break;
      case 'password_generate': result = passwordGenerate(call.args); break;
      case 'todo': result = todoManage(call.args, { ...options, provider, userId, userWikiDir, send }); break;
      case 'agent': result = await agentTool(call.args, provider, userId, userWikiDir); break;
      case 'grep': result = grep({ pattern: call.args.pattern, path: call.args.path, include: call.args.include, maxResults: call.args.maxResults }); break;
      case 'read_file': result = await processFile(call.args.path); break;
      case 'write_file': result = writeFile(call.args); break;
      case 'bash': result = bash(call.args); break;
      case 'ask_user': result = askUser(call.args); break;
      case 'edit_file': result = editFile(call.args); break;
      case 'notebook_edit': result = notebookEdit(call.args); break;
      case 'task_start': result = taskStart(call.args); break;
      case 'task_output': result = taskOutput(call.args); break;
      case 'task_stop': result = taskStop(call.args); break;
      case 'task_list': result = taskList(); break;
      case 'cron_create': result = cronCreate(call.args); break;
      case 'cron_delete': result = cronDelete(call.args); break;
      case 'cron_list': result = cronList(); break;
      case 'monitor_start': result = monitorStart(call.args); break;
      case 'monitor_stop': result = monitorStop(call.args); break;
      case 'monitor_result': result = monitorResult(call.args); break;
      case 'push_notification': result = await pushNotification(call.args); break;
      case 'gateway_status': result = await getGatewayStatus(); break;
      case 'gateway_send_message': result = await sendGatewayMessage(call.args, userId); break;
      case 'update_wiki': result = await wikiUpdate({ ...call.args, userId }); break;
      case 'delete_wiki': result = await wikiDelete({ ...call.args, userId }); break;
      case 'wiki_list': result = await wikiList({ userId }); break;
      case 'telegram_connect': {
        const { startTelegramBot: startTg } = await import('../telegram.js');
        result = await startTg(call.args.token, userId);
        break;
      }
      case 'telegram_disconnect': {
        const { stopTelegramBot: stopTg } = await import('../telegram.js');
        result = await stopTg(userId);
        break;
      }
      case 'telegram_status': {
        const { getBotStatus: tgStatus } = await import('../telegram.js');
        const s = tgStatus(userId);
        result = s.connected ? `Bot @${s.config.bot_username} đang chạy.` : 'Chưa kết nối Telegram bot.';
        break;
      }
      case 'ask_clarification': result = { _isClarification: true, ...tc.args }; break;
      case 'present_artifact':
        send('artifact', tc.args);
        result = `Artifact "${tc.args.title}" đã được hiển thị lên bảng điều khiển bên cạnh.`;
        break;
      case 'use_skill': {
        const skillData = skillManager.getSkillInstructions(tc.args.skill);
        if (skillData) {
          result = `## Skill "${skillData.name}" đã được kích hoạt\n\n**Task**: ${tc.args.task || 'Thực hiện theo workflow'}\n\n### Workflow Instructions:\n${skillData.instructions}\n\n---\nHãy thực hiện theo workflow trên như Hagent: dùng tool liên tục, tự kiểm tra kết quả, và chỉ DONE khi hoàn tất.`;
        } else {
          const catalog = skillManager.getSkillCatalog();
          result = `Không tìm thấy skill "${tc.args.skill}". Skills có sẵn:\n${catalog.map(s => `- **${s.name}**: ${s.description}`).join('\n')}`;
        }
        break;
      }
      case 'list_skills': {
        const catalog = skillManager.getSkillCatalog();
        result = catalog.length > 0
          ? `## 📚 Skills có sẵn (${catalog.length})\n\n${catalog.map(s => `- **${s.name}**: ${s.description}`).join('\n')}\n\nDùng \`use_skill\` với tên skill để kích hoạt.`
          : 'Chưa có skill nào được cài đặt.';
        break;
      }
      case 'open_claude_telegram': result = await openClaudeTelegram(); break;
      case 'control_service': {
        const res = await controlService(call.args.service, userId);
        result = res.message;
        break;
      }
      default:
        const regHandler = getHandler(tc.name);
        result = regHandler ? await regHandler(tc.args, { ...options, provider, userId, userWikiDir, send }) : '';
    }
    return result;
    });

    throwIfAborted(options.signal, 'Đã dừng xử lý');
    const resultStr = typeof result === 'string' ? result : (result?._isVisionResult ? '[image]' : JSON.stringify(result) || '');
    send('tool', { name: call.name, status: 'done', count: resultStr.includes('Không') ? 0 : 1 });
    return { name: call.name, result };
  };

  if (needsSequentialExecution(calls)) {
    const results = [];
    for (const call of calls) {
      throwIfAborted(options.signal, 'Đã dừng xử lý');
      results.push(await executeOne(call));
    }
    return results;
  }

  return Promise.all(calls.map(executeOne));
}

function getLabel(name) {
  const labels = {
    grep: 'Đang tìm kiếm code...',
    search_wiki: 'Đang tra kiến thức wiki...',
    search_rag: 'Đang tìm kiếm ngữ nghĩa trong wiki...',
    read_page: 'Đang đọc nội dung wiki...',
    list_wiki_topics: 'Đang duyệt wiki...',
    update_wiki: 'Đang cập nhật wiki...',
    delete_wiki: 'Đang xóa wiki entry...',
    wiki_list: 'Đang liệt kê wiki...',
    web_search: 'Đang tìm kiếm thông tin trên web...',
    fetch_url: 'Đang đọc nội dung trang web...',
    get_weather: 'Đang lấy thông tin thời tiết...',
    get_gold_price: 'Đang lấy giá vàng...',
    get_silver_price: 'Đang lấy giá bạc...',
    vietcombank_rate: 'Đang lấy tỷ giá Vietcombank...',
    currency_convert: 'Đang quy đổi tiền tệ...',
    translate: 'Đang dịch văn bản...',
    get_definition: 'Đang tra từ điển...',
    calculate: 'Đang tính toán...',
    get_time: 'Đang lấy thời gian...',
    get_ip_info: 'Đang tra cứu IP...',
    get_vnexpress_news: 'Đang lấy tin tức từ VnExpress...',
    get_dantri_news: 'Đang lấy tin tức từ Dân trí...',
    generate_uuid: 'Đang tạo UUID...',
    hash_text: 'Đang băm văn bản...',
    format_json: 'Đang xử lý JSON...',
    unit_convert: 'Đang quy đổi đơn vị...',
    random_number: 'Đang sinh số ngẫu nhiên...',
    encode_decode: 'Đang mã hóa/giải mã...',
    password_generate: 'Đang tạo mật khẩu...',
    todo: 'Đang xử lý việc cần làm...',
    agent: 'Đang chạy sub-agent...',
    read_file: 'Đang đọc file...',
    write_file: 'Đang ghi file...',
    bash: 'Đang chạy lệnh shell...',
    ask_user: 'Đang hỏi người dùng...',
    push_notification: 'Đang gửi thông báo...',
    gateway_status: 'Đang kiểm tra gateway...',
    gateway_send_message: 'Đang gửi tin qua gateway...',
    edit_file: 'Đang sửa file...',
    notebook_edit: 'Đang sửa notebook...',
    task_start: 'Đang chạy task nền...',
    task_output: 'Đang lấy kết quả task...',
    task_stop: 'Đang dừng task...',
    task_list: 'Đang liệt kê tasks...',
    cron_create: 'Đang tạo cron job...',
    cron_delete: 'Đang xóa cron job...',
    cron_list: 'Đang liệt kê cron jobs...',
    monitor_start: 'Đang bắt đầu theo dõi...',
    monitor_stop: 'Đang dừng theo dõi...',
    monitor_result: 'Đang lấy kết quả theo dõi...',
    telegram_connect: 'Đang kết nối Telegram bot...',
    telegram_disconnect: 'Đang ngắt Telegram bot...',
    telegram_status: 'Đang kiểm tra Telegram bot...',
    ask_clarification: 'Đang chuẩn bị câu hỏi làm rõ...',
    use_skill: 'Đang kích hoạt skill...',
    list_skills: 'Đang liệt kê skills...',
    open_claude_telegram: 'Đang mở Terminal và chạy Claude Code...',
    control_service: 'Đang điều khiển dịch vụ AI...',
    ...getAllLabels(),
  };
  return labels[name] || `Đang xử lý ${name}...`;
}
