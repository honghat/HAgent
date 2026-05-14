import { callLLM } from '../llm.js';

// ─── FULL TOOL DEFINITIONS ────────────────────────────────────────────────────
// Đây là danh sách đầy đủ tất cả tools agent có thể dùng.
// Mô tả rõ ràng để LLM biết khi nào và dùng tool nào.

export const TOOL_DEFS = [
  // ── Thời gian & Tiện ích ──
  { name: 'get_time',           desc: 'Lấy thời gian và ngày hiện tại. Dùng khi hỏi giờ, ngày, múi giờ.' },
  { name: 'calculate',          desc: 'Tính toán biểu thức toán học. args: { expression: "2+2*3" }' },
  { name: 'translate',          desc: 'Dịch văn bản sang ngôn ngữ khác. args: { text, target_lang }' },
  { name: 'get_definition',     desc: 'Tra cứu định nghĩa từ/thuật ngữ. args: { term }' },
  { name: 'unit_convert',       desc: 'Đổi đơn vị đo lường (km↔mile, kg↔lb...). args: { value, from, to }' },
  { name: 'generate_uuid',      desc: 'Tạo UUID ngẫu nhiên. args: { version }' },
  { name: 'hash_text',          desc: 'Băm văn bản (md5, sha256...). args: { text, algorithm }' },
  { name: 'format_json',        desc: 'Format/validate JSON. args: { json }' },
  { name: 'random_number',      desc: 'Sinh số ngẫu nhiên. args: { min, max }' },
  { name: 'encode_decode',      desc: 'Mã hóa/giải mã base64, URL encode... args: { text, mode }' },
  { name: 'password_generate',  desc: 'Tạo mật khẩu ngẫu nhiên. args: { length, symbols }' },
  { name: 'get_ip_info',        desc: 'Tra cứu thông tin địa chỉ IP. args: { ip }' },

  // ── Tài chính & Thị trường ──
  { name: 'get_gold_price',     desc: 'BẮT BUỘC dùng khi hỏi giá vàng (SJC, DOJI, vàng nhẫn...). Lấy dữ liệu thời gian thực.' },
  { name: 'get_silver_price',   desc: 'BẮT BUỘC dùng khi hỏi giá bạc hôm nay.' },
  { name: 'vietcombank_rate',   desc: 'BẮT BUỘC dùng khi hỏi tỷ giá ngoại tệ (USD, EUR, JPY...).' },
  { name: 'currency_convert',   desc: 'Quy đổi tiền tệ giữa các nước. args: { amount, from, to }' },

  // ── Tìm kiếm & Web ──
  { name: 'web_search',         desc: 'Tìm kiếm thông tin tổng quát trên internet. args: { query }. KHÔNG DÙNG cho giá vàng, tỷ giá, thời tiết, tin tức vì đã có công cụ chuyên biệt.' },
  { name: 'fetch_url',          desc: 'Đọc nội dung trang web. args: { url }. Dùng khi có URL cụ thể.' },

  // ── Tin tức ──
  { name: 'get_vnexpress_news', desc: 'BẮT BUỘC dùng khi hỏi tin tức mới nhất, thời sự trong nước.' },
  { name: 'get_dantri_news',    desc: 'BẮT BUỘC dùng khi hỏi tin nóng, sự kiện nổi bật.' },

  // ── Thời tiết ──
  { name: 'get_weather',        desc: 'BẮT BUỘC dùng khi hỏi thời tiết. args: { location }' },

  // ── Wiki & Bộ nhớ ──
  { name: 'search_wiki',        desc: 'Tìm kiếm trong wiki/bộ nhớ cá nhân của người dùng. args: { query }. Dùng khi cần thông tin về người dùng, sở thích, lịch sử.' },
  { name: 'search_rag',         desc: 'Tìm kiếm ngữ nghĩa (semantic search) trong wiki. args: { query }. Dùng khi search_wiki không có kết quả.' },
  { name: 'read_page',          desc: 'Đọc nội dung đầy đủ một trang wiki. args: { title }' },
  { name: 'list_wiki_topics',   desc: 'Liệt kê tất cả chủ đề trong wiki.' },
  { name: 'update_wiki',        desc: 'Tạo hoặc cập nhật wiki entry. args: { title, content, topics }' },
  { name: 'delete_wiki',        desc: 'Xóa wiki entry. args: { id }' },
  { name: 'wiki_list',          desc: 'Liệt kê tất cả wiki entries.' },

  // ── File & Hệ thống ──
  { name: 'read_file',          desc: 'Đọc nội dung file. args: { path }' },
  { name: 'write_file',         desc: 'Tạo hoặc ghi nội dung vào file. args: { path, content }' },
  { name: 'edit_file',          desc: 'Sửa file (thay thế đoạn text cụ thể). args: { path, oldString, newString }. Hỗ trợ action: insert/append/prepend.' },
  { name: 'bash',               desc: 'Chạy lệnh shell/terminal. args: { command, timeout?, workdir? }. timeout tính bằng ms (mặc định 60000). workdir là thư mục làm việc tương đối với project root. Dùng để chạy code, cài packages, git, npm, python...' },
  { name: 'grep',               desc: 'Tìm kiếm pattern trong files. args: { pattern, path, include }' },

  // ── Tasks & Cron ──
  { name: 'task_start',         desc: 'Chạy task nền (long-running). args: { command, name }' },
  { name: 'task_output',        desc: 'Lấy output của task đang chạy. args: { taskId }' },
  { name: 'task_stop',          desc: 'Dừng task đang chạy. args: { taskId }' },
  { name: 'task_list',          desc: 'Liệt kê tất cả tasks đang chạy.' },
  { name: 'cron_create',        desc: 'Tạo cron job tự động. args: { schedule, command, name }' },
  { name: 'cron_delete',        desc: 'Xóa cron job. args: { id }' },
  { name: 'cron_list',          desc: 'Liệt kê cron jobs.' },

  // ── Monitor ──
  { name: 'monitor_start',      desc: 'Bắt đầu giám sát URL/dịch vụ. args: { url, interval }' },
  { name: 'monitor_stop',       desc: 'Dừng giám sát. args: { id }' },
  { name: 'monitor_result',     desc: 'Lấy kết quả giám sát. args: { id }' },

  // ── Giao tiếp & Thông báo ──
  { name: 'push_notification',  desc: 'Gửi push notification. args: { title, body }' },
  { name: 'todo',               desc: 'Quản lý danh sách việc cần làm. args: { action: "add|list|done|delete", text }' },
  { name: 'gateway_status',     desc: 'Xem trạng thái các kênh nhắn tin đã kết nối theo kiểu Hermes gateway (Telegram, Zalo...).' },
  { name: 'gateway_send_message', desc: 'Gửi tin nhắn qua gateway đa nền tảng. args: { platform: "telegram|zalo", target: "chat_id/user_id", text }. Dùng khi cần gửi thông báo ra kênh cụ thể.' },

  // ── Sub-agent ──
  { name: 'agent',              desc: 'Chạy sub-agent chuyên biệt để thực hiện nhiệm vụ phức tạp. args: { tasks: ["task1", "task2"], type: "researcher|coder|analyst|default" }. tasks là MẢNG string. Dùng khi: cần nghiên cứu nhiều nguồn song song, viết nhiều file code, phân tích dữ liệu phức tạp. Mỗi task là một nhiệm vụ độc lập.' },

  // ── Google Workspace ──
  { name: 'gmail',              desc: 'Đọc/gửi email qua Gmail. args: { action: "list|read|send", to?, subject?, body?, id? }' },
  { name: 'gdrive',             desc: 'Quản lý Google Drive. args: { action: "list|read|upload|search", query?, fileId?, content? }' },
  { name: 'gdocs',              desc: 'Đọc/tạo Google Docs. args: { action: "read|create|append", docId?, title?, content? }' },

  // ── Skills ──
  { name: 'use_skill',          desc: 'Kích hoạt skill chuyên biệt. args: { skill: "tên-skill", task: "mô tả nhiệm vụ" }. Dùng cho: deep-research, ppt-generation, data-analysis, consulting-analysis, frontend-design, chart-visualization, v.v.' },
  { name: 'list_skills',        desc: 'Liệt kê tất cả skills có sẵn.' },

  // ── Telegram ──
  { name: 'telegram_connect',   desc: 'Kết nối Telegram bot. args: { token }' },
  { name: 'telegram_disconnect',desc: 'Ngắt kết nối Telegram bot.' },
  { name: 'telegram_status',    desc: 'Kiểm tra trạng thái Telegram bot.' },

  // ── Dịch vụ ──
  { name: 'control_service',    desc: 'Bật/tắt dịch vụ AI nội bộ. args: { service, action }' },
];

export const TOOL_NAME_SET = new Set(TOOL_DEFS.map(t => t.name));

export function extendTools(newTools) {
  if (!Array.isArray(newTools)) return;
  for (const t of newTools) {
    if (!TOOL_NAME_SET.has(t.name)) {
      TOOL_DEFS.push(t);
      TOOL_NAME_SET.add(t.name);
    }
  }
}

// ─── BUILD PROMPT ─────────────────────────────────────────────────────────────

export const EXECUTION_DISCIPLINE_GUIDANCE = `# Tool-use enforcement
You MUST use your tools to take action — do not describe what you would do or plan to do without actually doing it. When you say you will perform an action (e.g. 'I will run the tests', 'Let me check the file', 'I will create the project'), you MUST immediately make the corresponding tool call in the same response. Never end your turn with a promise of future action — execute it now.
Keep working until the task is actually complete. Do not stop with a summary of what you plan to do next time. If you have tools available that can accomplish the task, use them instead of telling the user what you would do.
Every response should either (a) contain tool calls that make progress, or (b) deliver a final result to the user. Responses that only describe intentions without acting are not acceptable.

# Execution discipline
<tool_persistence>
- Use tools whenever they improve correctness, completeness, or grounding.
- Do not stop early when another tool call would materially improve the result.
- If a tool returns empty or partial results, retry with a different query or strategy before giving up.
- Keep calling tools until: (1) the task is complete, AND (2) you have verified the result.
</tool_persistence>

<mandatory_tool_use>
NEVER answer these from memory or mental computation — ALWAYS use a tool:
- Arithmetic, math, calculations → use terminal or execute_code
- Hashes, encodings, checksums → use terminal (e.g. sha256sum, base64)
- Current time, date, timezone → use terminal (e.g. date)
- System state: OS, CPU, memory, disk, ports, processes → use terminal
- File contents, sizes, line counts → use read_file, search_files, or terminal
- Git history, branches, diffs → use terminal
- Current facts (weather, news, versions) → use web_search
Your memory and user profile describe the USER, not the system you are running on. The execution environment may differ from what the user profile says about their personal setup.
</mandatory_tool_use>

<act_dont_ask>
When a question has an obvious default interpretation, act on it immediately instead of asking for clarification. Examples:
- 'Is port 443 open?' → check THIS machine (don't ask 'open where?')
- 'What OS am I running?' → check the live system (don't use user profile)
- 'What time is it?' → run \`date\` (don't guess)
Only ask for clarification when the ambiguity genuinely changes what tool you would call.
</act_dont_ask>

<prerequisite_checks>
- Before taking an action, check whether prerequisite discovery, lookup, or context-gathering steps are needed.
- Do not skip prerequisite steps just because the final action seems obvious.
- If a task depends on output from a prior step, resolve that dependency first.
</prerequisite_checks>

<verification>
Before finalizing your response:
- Correctness: does the output satisfy every stated requirement?
- Grounding: are factual claims backed by tool outputs or provided context?
- Formatting: does the output match the requested format or schema?
- Safety: if the next step has side effects (file writes, commands, API calls), confirm scope before executing.
</verification>

<missing_context>
- If required context is missing, do NOT guess or hallucinate an answer.
- Use the appropriate lookup tool when missing information is retrievable (search_files, web_search, read_file, etc.).
- Ask a clarifying question only when the information cannot be retrieved by tools.
- If you must proceed with incomplete information, label assumptions explicitly.
</missing_context>`;

/**
 * Build tool decision prompt, optionally injecting skill catalog.
 * @param {Array} skillCatalog - list of { name, description } from skillManager
 */
export function buildToolDecisionPrompt(skillCatalog = []) {
  const toolDefsText = TOOL_DEFS.map(t => `- **${t.name}**: ${t.desc}`).join('\n');

  const skillSection = skillCatalog.length > 0
    ? `\n\n## SKILLS CHUYÊN BIỆT (dùng use_skill để kích hoạt):\n${skillCatalog.map(s => `- **${s.name}**: ${s.description}`).join('\n')}`
    : '';

  return `Bạn là HAgent — AI agent SỐNG để phục vụ người dùng đạt mục tiêu kiếm tiền và thành công.
[THÔNG TIN HỆ THỐNG]
Thời gian hiện tại: ${new Date().toLocaleString('vi-VN')}

${EXECUTION_DISCIPLINE_GUIDANCE}

## QUY TẮC TỐI THƯỢNG:
1. BẮT ĐẦU bằng THINKING hoặc DONE — TUYỆT ĐỐI không chào hỏi, không dẫn dắt "Tôi sẽ...".
2. KHÔNG dùng thẻ XML (<tool_call>). CHỈ dùng format TOOL_CALLS...TOOL_CALLS_END.
3. LUÔN GỌI TOOL khi cần dữ liệu thực (giá, tin tức, thời tiết, file, web). KHÔNG bịa dữ liệu.
4. KHI ĐÃ CÓ ĐỦ DỮ LIỆU VÀ ĐÃ VERIFY: xuất thẻ DONE kèm câu trả lời chi tiết, đầy đủ bằng tiếng Việt. Nếu còn hành động thực thi/kiểm tra rõ ràng, KHÔNG DONE; gọi tool tiếp.
5. NHIỆM VỤ PHỨC TẠP: dùng \`agent\` (sub-agent) hoặc \`use_skill\` để xử lý chuyên sâu.
6. TỰ HỌC & TIẾN HÓA (HERMES MODE):
   - Luôn review kết quả. Nếu giải quyết xong bài toán khó/mới, GỌI NGAY \`self_evolve\` để lưu kinh nghiệm vào DNA.
   - Nếu thấy quy trình lặp lại: dùng \`use_skill\` với \`skill-creator\` để đóng gói thành skill mới.
   - Nếu thiếu tool: dùng \`bash\` viết file JS chứa tool logic vào thư mục \`src/services/tools/\` (hệ thống tự động đăng ký tool).

## CÔNG CỤ CÓ SẴN:
${toolDefsText}${skillSection}

## FORMAT GỌI TOOL:
THINKING
[Phân tích ngắn: cần gì, dùng tool nào, tại sao]
THINKING_END
TOOL_CALLS
[
  {"name": "tên_tool", "args": {"key": "value"}}
]
TOOL_CALLS_END

## FORMAT TRẢ LỜI CUỐI (LUÔN kết thúc bằng DONE sau khi có kết quả):
DONE
[Câu trả lời hoàn chỉnh, chi tiết bằng tiếng Việt dựa trên kết quả tool/skill. Chỉ dùng DONE khi checklist trước DONE đã đạt.]`;
}

export const TOOL_DECISION_PROMPT = buildToolDecisionPrompt();

export function parseThinking(llmResponse) {
  const match = llmResponse.match(/THINKING\s*([\s\S]*?)\s*THINKING_END/);
  return match ? match[1].trim() : null;
}

export function parseToolCalls(llmResponse) {
  // 1. Chuẩn JSON format: TOOL_CALLS ... TOOL_CALLS_END
  let match = llmResponse.match(/TOOL_CALLS\s*([\s\S]*?)\s*TOOL_CALLS_END/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      // Normalize: support both "args" and "arguments" keys
      return parsed.map(c => ({
        name: c.name,
        args: c.args || c.arguments || {},
      }));
    } catch { }
  }

  const calls = [];

  // 2. Fallback cho <tool_call> get_time() </tool_call> hoặc <toolcall> get_time()
  const funcMatches = [...llmResponse.matchAll(/<\|?tool_?call\|?>\s*([a-zA-Z0-9_]+)\s*\((.*?)\)\s*(?:<\/\|?tool_?call\|?>)?/g)];
  for (const m of funcMatches) {
    const name = m[1].trim();
    let argsStr = m[2].trim();
    let args = {};
    if (argsStr) {
      try {
        // Try to parse as JSON or a simplified object
        argsStr = argsStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        args = JSON.parse(argsStr.startsWith('{') ? argsStr : `{${argsStr}}`);
      } catch { 
        // If it's just a string argument in quotes, try to handle it
        if (argsStr.startsWith('"') && argsStr.endsWith('"')) {
          args = { query: argsStr.slice(1, -1) };
        }
      }
    }
    calls.push({ name, args });
  }

  // 3. Fallback cho <|tool_call>call:search_wiki{query:"user profile"}
  const callMatches = [...llmResponse.matchAll(/(?:<\|?tool_call\|?>)?\s*call:\s*([a-zA-Z0-9_]+)\s*(\{.*?\})/g)];
  for (const m of callMatches) {
    const name = m[1].trim();
    let argsStr = m[2].trim();
    let args = {};
    try {
      argsStr = argsStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      args = JSON.parse(argsStr);
    } catch { }
    calls.push({ name, args });
  }

  if (calls.length > 0) return calls;

  // 4. Fallback cho mảng JSON trong code block
  const jsonMatch = llmResponse.match(/```(?:json)?\s*(\[\s*\{\s*"name"[\s\S]*?\])\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return parsed.map(c => ({ name: c.name, args: c.args || c.arguments || {} }));
    } catch { }
  }

  return null;
}

export function isValidFormat(raw) {
  const t = (raw || '').trim();
  return (t.includes('TOOL_CALLS') && t.includes('TOOL_CALLS_END')) || t.startsWith('DONE');
}

export async function callWithFormatRetry(llmFn, messages, { maxRetries = 2 } = {}) {
  let response = await llmFn(messages);
  for (let i = 0; i < maxRetries; i++) {
    if (isValidFormat(response)) break;
    messages.push({ role: 'assistant', content: response }, { role: 'user', content: 'Sai format. Hãy dùng THINKING...THINKING_END + TOOL_CALLS...TOOL_CALLS_END hoặc DONE.' });
    response = await llmFn(messages);
  }
  return response;
}
