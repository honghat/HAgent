import { getProviderClient } from './provider-config.js';
import { CHAT_SYSTEM } from './prompts/index.js';

function getClient(provider) {
  if (typeof provider === 'object' && provider?.name) provider = provider.name;
  const config = getProviderClient(provider || 'lmstudio');

  return { client: config.client, type: config.type, model: config.model, name: config.name, apiKey: config.apiKey };
}

export async function callLLM(system, messages, { provider, maxTokens = 2000, signal } = {}) {
  const cfg = getClient(provider);
  if (!cfg.model) throw new Error(`No API key configured for provider: ${provider}`);

  let content = '';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  if (cfg.type === 'anthropic') {
    const formattedMessages = Array.isArray(messages)
      ? messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      : [{ role: 'user', content: messages }];

    const res = await cfg.client.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: formattedMessages,
    });
    content = res.content[0].text;
    usage = {
      prompt_tokens: res.usage.input_tokens,
      completion_tokens: res.usage.output_tokens,
      total_tokens: res.usage.input_tokens + res.usage.output_tokens,
    };

  } else if (cfg.type === 'openai') {
    const formattedMessages = [
      { role: 'system', content: system },
      ...(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]),
    ];
    console.log(`[LLM] Calling OpenAI-compatible: ${cfg.name} (Model: ${cfg.model})`);
    const res = await cfg.client.chat.completions.create({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: formattedMessages,
      temperature: 0.1, // Lower temperature for more stable JSON
    });
    content = res.choices[0].message.content;
    usage = {
      prompt_tokens: res.usage?.prompt_tokens || 0,
      completion_tokens: res.usage?.completion_tokens || 0,
      total_tokens: res.usage?.total_tokens || 0,
    };

  } else if (cfg.type === 'gemini') {
    const modelName = cfg.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cfg.apiKey}`;
    
    // Build proper conversation format
    const contents = Array.isArray(messages)
      ? messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: Array.isArray(m.content) 
            ? m.content.map(c => c.text || '').join('') 
            : (m.content || '') }],
        }))
      : [{ role: 'user', parts: [{ text: String(messages) }] }];
    
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(`Gemini error: ${data.error?.message || res.statusText || 'Unknown error'}`);
    content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (data.usageMetadata) {
      usage = {
        prompt_tokens: data.usageMetadata.promptTokenCount || 0,
        completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata.totalTokenCount || 0,
      };
    }
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return { content, usage };
}

// ─── CORE STREAM (tái dùng bởi chatStream) ───────────────────────────────────

export async function* callLLMStream(system, messages, { provider, maxTokens = 2000, signal } = {}) {
  const cfg = getClient(provider);
  if (!cfg.model) throw new Error(`No API key configured for provider: ${provider}`);

  if (cfg.type === 'anthropic') {
    const formattedMessages = Array.isArray(messages)
      ? messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      : [{ role: 'user', content: messages }];

    const stream = await cfg.client.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: formattedMessages,
      stream: true,
    });

    // FIX: usage đến từ message_start (input) và message_delta (output)
    let inputTokens = 0;
    for await (const chunk of stream) {
      if (chunk.type === 'message_start') {
        inputTokens = chunk.message?.usage?.input_tokens || 0;
      }
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        yield { type: 'content', content: chunk.delta.text };
      }
      if (chunk.type === 'message_delta' && chunk.usage) {
        const outputTokens = chunk.usage.output_tokens || 0;
        yield {
          type: 'usage',
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
          },
        };
      }
    }

  } else if (cfg.type === 'openai') {
    const formattedMessages = [
      { role: 'system', content: system },
      ...(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]),
    ];
    const stream = await cfg.client.chat.completions.create({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: formattedMessages,
      stream: true,
      ...( (cfg.name === 'openai' || cfg.name === 'deepseek') ? { stream_options: { include_usage: true } } : {}),
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta || {};
      const reasoning = delta.reasoning_content || '';
      const content = delta.content || '';
      if (reasoning) yield { type: 'think', content: reasoning, append: true };
      if (content) yield { type: 'content', content };
      if (chunk.usage) yield { type: 'usage', usage: chunk.usage };
    }

  } else if (cfg.type === 'gemini') {
    const modelName = cfg.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`;
    console.log(`[Gemini] URL: https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${cfg.apiKey?.slice(0, 5)}...`);
    
    const contents = Array.isArray(messages)
      ? messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: Array.isArray(m.content) 
            ? m.content.map(c => c.text || '').join('') 
            : (m.content || '') }],
        }))
      : [{ role: 'user', parts: [{ text: String(messages) }] }];
    
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(`Gemini error: ${data.error?.message || res.statusText || 'Unknown error'}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const d = JSON.parse(line.slice(6));
            const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield { type: 'content', content: text };
            if (d.usageMetadata) {
              yield {
                type: 'usage',
                usage: {
                  prompt_tokens: d.usageMetadata.promptTokenCount || 0,
                  completion_tokens: d.usageMetadata.candidatesTokenCount || 0,
                  total_tokens: d.usageMetadata.totalTokenCount || 0,
                },
              };
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    }
  } else {
    throw new Error(`Streaming not supported for provider: ${provider}`);
  }
}

// ─── CHAT ────────────────────────────────────────────────────────────────────

// Các pattern nhận diện model đang "diễn" thay vì trả lời thật
const FAKE_SEARCH_PATTERNS = [
  /tôi sẽ (tìm kiếm|tra cứu|kiểm tra|sử dụng công cụ|lấy tin tức)/i,
  /để (cung cấp|tìm|tra|kiểm tra).{0,30}(mới nhất|chính xác|cập nhật)/i,
  /\bsử dụng công cụ tìm kiếm\b/i,
  /<tool_?call>/i,
  /\[searching\]/i,
  /hãy để tôi tìm/i,
];

export function isFakeSearchText(text) {
  if (!text || text.length < 10) return false;
  return FAKE_SEARCH_PATTERNS.some(p => p.test(text));
}

const ANTI_HALLUCINATION = `\n\n⚠️ QUY TẮC TUYỆT ĐỐI:
- KHÔNG bao giờ nói "Tôi sẽ tìm kiếm...", "Để cung cấp thông tin mới nhất...", "Hãy để tôi tra cứu..." hay bất kỳ câu mô tả hành động tìm kiếm nào.
- KHÔNG giả lập gọi công cụ, KHÔNG in thẻ <tool_call>.
- Nếu cần dùng công cụ, GỌI THẲNG tool — không thông báo trước.
- Trả lời trực tiếp ngay lập tức.`;

function buildSystemMessage(extraContext) {
  const base = CHAT_SYSTEM + ANTI_HALLUCINATION + `\n\n[THÔNG TIN HỆ THỐNG]\nThời gian hiện tại: ${new Date().toLocaleString('vi-VN')}`;
  if (!extraContext) return base;
  
  // Nếu extraContext có nội dung (dữ liệu từ tool hoặc final answer từ agent loop)
  return (
    base +
    '\n\n[KẾT QUẢ TỪ CÔNG CỤ - NGỮ CẢNH]\n' +
    extraContext +
    '\n\n————————————————————————' +
    '\n❗ QUY TẮC TỔNG HỢP CUỐI CÙNG (BẮT BUỘC):' +
    '\n- Bạn đang ở bước cuối cùng để trả lời người dùng.' +
    '\n- Dựa trên ngữ cảnh và kết quả công cụ ở trên, hãy viết một câu trả lời HOÀN CHỈNH, CHI TIẾT và CHUYÊN NGHIỆP.' +
    '\n- Tuyệt đối KHÔNG được im lặng. KHÔNG được chỉ lặp lại dữ liệu thô.' +
    '\n- Hãy sử dụng Markdown (bold, list, table) để trình bày thông tin đẹp mắt.' +
    '\n- Trả lời trực tiếp vào vấn đề, không vòng vo.'
  );
}

export async function chat(messages, provider, extraContext = '') {
  return callLLM(buildSystemMessage(extraContext), messages, { provider, maxTokens: 2000 });
}

// FIX: không duplicate logic — tái dùng callLLMStream
// Guard: nếu model bắt đầu "diễn" (fake search text) thì suppress stream
export async function* chatStream(messages, provider, extraContext = '', options = {}) {
  let accumulated = '';
  let decided = false;

  // Nếu có extraContext, tăng ngưỡng suppress để tránh false positive
  const suppressThreshold = extraContext ? 200 : 80;

  for await (const chunk of callLLMStream(buildSystemMessage(extraContext), messages, { provider, maxTokens: 3000, signal: options.signal })) {
    if (chunk.type === 'usage' || chunk.type === 'think') { yield chunk; continue; }
    if (decided) {
      yield chunk;
      continue;
    }

    accumulated += chunk.content;

    // Phán quyết sau khi gom đủ threshold hoặc gặp xuống dòng đầu tiên
    if (accumulated.length >= suppressThreshold || chunk.content.includes('\n')) {
      decided = true;
      if (!extraContext && isFakeSearchText(accumulated)) {
        console.warn('[chatStream] Fake search text detected — stream suppressed.');
        return; // caller cần retry sau khi có extraContext thật
      }
      yield { type: 'content', content: accumulated };
    }
  }

  // Stream ngắn chưa kịp quyết định
  if (!decided && accumulated) {
    // Chỉ suppress nếu không có extraContext
    if (extraContext || !isFakeSearchText(accumulated)) {
      yield { type: 'content', content: accumulated };
    }
  }
}

// ─── EXTRACT / DEDUP / RESTRUCTURE / MERGE / SYNTHESIZE ──────────────────────

const EXTRACT_PROMPT = `Trích xuất kiến thức hữu ích từ lượt hội thoại giữa Người dùng và Trợ lý.
Kiến thức cần trích xuất phải là các sự kiện khách quan, thông tin thực tế, hoặc kiến thức chuyên môn (ví dụ: giá vàng, định nghĩa, hướng dẫn, sự kiện lịch sử).

Trả về duy nhất JSON hợp lệ — không bọc markdown, không \`\`\`:

{
  "title": "tiêu đề ngắn gọn",
  "summary": "tóm tắt 1-2 câu",
  "topics": ["danh-muc-slug"],
  "content": "nội dung markdown sạch sẽ"
}

## Quy tắc
- **Title**: Ngắn gọn, súc tích. Tiếng Việt.
- **Topics**: 1-3 danh mục (ví dụ: "tai-chinh", "cong-nghe", "suc-khoe").
- **Content**: Nội dung thực tế, trình bày đẹp bằng markdown. Giữ lại các số liệu, ngày tháng, liên kết quan trọng.
- **Skip**: Nếu hội thoại chỉ là chào hỏi, câu hỏi chưa có lời giải, hoặc tán gẫu không có kiến thức thực tế → trả về {"skip": true}
- **Khách quan**: Không bao gồm ý kiến cá nhân của trợ lý, chỉ lấy các sự thật (facts).`;

const DOC_EXTRACT_PROMPT = `Bạn là chuyên gia trích xuất kiến thức từ tài liệu. Hãy đọc nội dung sau và chuyển thành entry Wiki.

Trả về duy nhất JSON hợp lệ — không bọc markdown, không \`\`\`:

{
  "title": "tiêu đề ngắn gọn",
  "summary": "tóm tắt 1-2 câu",
  "topics": ["danh-muc-slug"],
  "content": "nội dung markdown sạch sẽ"
}

## Quy tắc
- **Title**: Ngắn gọn, súc tích, phản ánh đúng chủ đề tài liệu.
- **Topics**: 1-3 danh mục (ví dụ: "tai-chinh", "cong-nghe", "suc-khoe", "khoa-hoc", "giao-duc", "phap-luat").
- **Content**: Giữ nguyên cấu trúc, số liệu, bảng biểu, ngày tháng. Format bằng markdown sạch sẽ. Sửa lỗi font nếu có.
- **Khách quan**: Chỉ lấy các facts, không thêm ý kiến cá nhân.
- Luôn trả về JSON hợp lệ, KHÔNG bao giờ bỏ qua nội dung.`;

function parseJSON(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
  return null;
}

export async function extractDoc(content, provider) {
  const { content: raw } = await callLLM(DOC_EXTRACT_PROMPT, content, { provider, maxTokens: 3000 });
  const parsed = parseJSON(raw);
  if (parsed) return parsed.skip ? null : parsed;
  // fallback: plain text
  if (raw.length > 50) {
    const lines = raw.split('\n').filter(l => l.trim());
    const title = lines[0]?.replace(/^#+\s*/, '').trim().slice(0, 80) || 'Nội dung tài liệu';
    return { title, summary: lines[1]?.slice(0, 120) || '', topics: ['general'], content: raw };
  }
  return null;
}

export async function extract(userContent, assistantContent, provider) {
  const input = assistantContent
    ? `USER: ${userContent}\n\nASSISTANT: ${assistantContent}`
    : userContent;
  const { content: raw } = await callLLM(EXTRACT_PROMPT, input, { provider });
  const parsed = parseJSON(raw);
  return parsed?.skip ? null : (parsed ?? null);
}

const DEDUP_PROMPT = `Given a NEW wiki entry and EXISTING entries, determine if the new one duplicates any existing entry.

Return valid JSON only:
{
  "isDuplicate": boolean,
  "mergeInto": null | "id of existing entry",
  "reason": "brief explanation"
}

Consider duplicate when they cover the same topic with substantially overlapping information. Slight wording differences are NOT enough — core knowledge must differ.`;

export async function checkDuplicate(newEntry, existingEntries, provider) {
  if (!existingEntries?.length) return { isDuplicate: false, mergeInto: null, reason: 'no existing entries' };
  const recent = existingEntries.slice(0, 20);
  const existingSummary = recent
    .map(e => `ID: ${e.id}\nTITLE: ${e.title}\nTOPICS: ${e.topics?.join(', ') || ''}\nSUMMARY: ${e.summary}`)
    .join('\n---\n');
  try {
    const { content: raw } = await callLLM(
      DEDUP_PROMPT,
      `NEW ENTRY:\nTITLE: ${newEntry.title}\nTOPICS: ${newEntry.topics.join(', ')}\nSUMMARY: ${newEntry.summary}\n\nEXISTING ENTRIES:\n${existingSummary}`,
      { provider }
    );
    return JSON.parse(raw);
  } catch {
    return { isDuplicate: false, mergeInto: null, reason: 'parse error' };
  }
}

const RESTRUCTURE_PROMPT = `Given the full wiki index, recommend reorganization for better structure.

Return valid JSON:
{
  "merges": [{ "sourceIds": ["id1", "id2"], "targetTitle": "merged title", "targetTopic": "topic" }],
  "moves": [{ "entryId": "id", "fromTopic": "old", "toTopic": "new" }],
  "deletions": [{ "entryId": "id" }],
  "reasoning": "explanation of changes"
}

## Rules
- Topics with 1-2 overlapping entries → merge
- Topics with 8+ entries → split into subtopics
- Remove entries that are too vague or outdated
- Suggest better topic names if current ones are unclear`;

export async function restructureIndex(index, provider) {
  const { content: raw } = await callLLM(RESTRUCTURE_PROMPT, JSON.stringify(index, null, 2), { provider, maxTokens: 4000 });
  return JSON.parse(raw);
}

const MERGE_PROMPT = `Merge OLD and NEW wiki content about the same topic into one coherent entry.

Return ONLY merged content as plain text — no JSON, no markdown wrappers, no explanations.
Organize with headings. Remove duplicates. Keep all unique facts from both old and new.`;

export async function mergeContent(oldContent, newContent, provider) {
  const { content: merged } = await callLLM(
    MERGE_PROMPT,
    `--- OLD CONTENT ---\n${oldContent}\n\n--- NEW CONTENT ---\n${newContent}`,
    { provider, maxTokens: 2000 }
  );
  return merged.trim();
}

const SYNTHESIZE_PROMPT = `Given multiple wiki entries on the same topic, synthesize into one comprehensive entry.

Return valid JSON:
{
  "title": "synthesized title",
  "summary": "concise summary",
  "topics": ["topic"],
  "content": "synthesized markdown content"
}

## Rules
- Remove duplicates across entries
- Preserve all unique information
- Organize with clear headings
- Keep code examples intact`;

export async function synthesizeEntries(entries, provider) {
  const input = entries.map(e => `---\nid: ${e.id}\ntitle: ${e.title}\n\n${e.content}`).join('\n');
  const { content: raw } = await callLLM(SYNTHESIZE_PROMPT, input, { provider, maxTokens: 4000 });
  return JSON.parse(raw);
}

const COMPACT_PROMPT = `Tóm tắt lịch sử chat dưới đây thành một đoạn ngắn (dưới 300 từ).
Giữ lại mọi thông tin quan trọng: sự kiện, quyết định, kiến thức đã đề cập.
Chỉ trả về phần tóm tắt — không mở đầu, không kết luận, không markdown.`;

export async function compactHistory(messages, provider) {
  const text = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n').slice(-10000);
  try {
    const { content: summary } = await callLLM(COMPACT_PROMPT, text, { provider, maxTokens: 1000 });
    return summary?.trim() || '';
  } catch (e) {
    console.error('[Summarization] compactHistory error:', e.message);
    return '';
  }
}

const SUGGESTIONS_PROMPT = `Dựa trên hội thoại trên, hãy gợi ý 3 câu hỏi tiếp theo mà người dùng có thể muốn hỏi.
Câu hỏi phải ngắn gọn, tự nhiên và liên quan trực tiếp đến nội dung vừa thảo luận.
Chỉ trả về danh sách 3 câu hỏi, mỗi câu một dòng, không đánh số, không thêm văn bản khác.`;

export async function generateFollowUpSuggestions(messages, lastResponse, provider) {
  const historyText = messages.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
  const input = `${historyText}\n\nAssistant (Final Response): ${lastResponse}`;
  try {
    const { content: raw } = await callLLM(SUGGESTIONS_PROMPT, input, { provider, maxTokens: 200 });
    return raw
      .split('\n')
      .map(s => s.trim().replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, ''))
      .filter(s => s.length > 5)
      .slice(0, 3);
  } catch (e) {
    console.error('[Suggestions] Error:', e.message);
    return [];
  }
}
