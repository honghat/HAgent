import { speakText, stopTTS } from '@/lib/tts';

export const AI_OFFLINE = '__AI_OFFLINE__';

export async function askAI(prompt: string, model = 'default', timeoutMs = 300000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `AI HTTP ${res.status}`);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content === AI_OFFLINE || content.startsWith('⚠️ AI LỖI')) {
      throw new Error(content || 'AI không trả về nội dung');
    }
    return content;
  } catch (e) {
    clearTimeout(to);
    const msg = e instanceof Error ? e.message : String(e);
    if (ctrl.signal.aborted) throw new Error(`Timeout: AI không phản hồi sau ${timeoutMs / 1000}s`);
    throw new Error(msg);
  }
}

export function extractJsonObject(raw: string): string | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export function extractJsonArray(raw: string): string | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function cleanTopic(raw: string): string {
  let t = raw.trim();
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  t = lines.find(l => l.includes('?')) || lines[0];
  t = t.replace(/^[*#>\-•\d.]+\s*/, '');
  t = t.replace(/^(topic|question|prompt|here(?:'s| is))[:\s]+/i, '');
  t = t.replace(/^["'"'「『](.*)["'"'」』]$/, '$1');
  t = t.replace(/^["'](.*)["']$/, '$1');
  return t.trim();
}

export async function saveToDb(type: string, content: string, metadata = {}, mode = 'coder') {
  try {
    const res = await fetch('/api/english', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, metadata: { ...metadata, mode } }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function speak(text: string, speed = 1.0, voice = 'en-US-AvaNeural', server = 'edge') {
  await speakText(text, speed, voice, server);
}

export function speakBrowser(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

export function parseMarkdown(text: string) {
  if (!text) return '';
  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let inTable = false;

  for (let line of lines) {
    if (/^[ \t]*\|.*\|[ \t]*$/.test(line)) {
      if (/^[ \t]*\|[\-\|\s:]+\|[ \t]*$/.test(line)) continue;
      if (!inTable) {
        inTable = true;
        htmlLines.push('<div style="overflow-x:auto; margin:12px 0; border-radius:8px; border:1px solid var(--border);"><table style="width:100%; border-collapse:collapse; background:rgba(0,0,0,0.1);"><tbody>');
      }

      const content = line.replace(/^[ \t]*\|/, '').replace(/\|[ \t]*$/, '');
      const cells = content.split('|').map(c => c.trim());
      const isHeader = htmlLines[htmlLines.length - 1].endsWith('<tbody>');

      const rowHtml = '<tr>' + cells.map(c => {
        const cellText = c.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>');
        if (isHeader) {
          return `<th style="padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 15px; font-weight: 800; color: var(--text-main); text-align: left; background: rgba(0,0,0,0.25)">${cellText}</th>`;
        }
        return `<td style="padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 15px; color: var(--text);">${cellText}</td>`;
      }).join('') + '</tr>';

      htmlLines.push(rowHtml);
      continue;
    } else if (inTable) {
      inTable = false;
      htmlLines.push('</tbody></table></div>');
    }

    let parsed = line
      .replace(/^# (.*$)/g, '<h1 style="font-size:20px; margin:12px 0 6px; font-weight:800; color:var(--text-main)">$1</h1>')
      .replace(/^## (.*$)/g, '<h2 style="font-size:18px; margin:10px 0 4px; font-weight:700; color:var(--text-main)">$1</h2>')
      .replace(/^### (.*$)/g, '<h3 style="font-size:16.5px; margin:8px 0 4px; font-weight:600; color:var(--text-main)">$1</h3>')
      .replace(/^#### (.*$)/g, '<h4 style="font-size:15px; margin:8px 0 4px; font-weight:600; color:var(--text-main)">$1</h4>')
      .replace(/^##### (.*$)/g, '<h5 style="font-size:14px; margin:6px 0 2px; font-weight:600; color:var(--text-main)">$1</h5>')
      .replace(/^(\d+\.)(?!\d*\/)\s*(.*)/g, '<strong style="color:var(--accent)">$1</strong> $2')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em style="color:var(--purple)">$1</em>')
      .replace(/\s*([^:\n]+)\s*:\s*\*?/g, '$1: ')
      .replace(/^> (.*$)/g, '<blockquote style="border-left:3px solid var(--muted); padding-left:12px; margin:10px 0; font-style:italic; color:var(--muted); font-size:14.5px">$1</blockquote>')
      .replace(/^---$/g, '<hr style="border:none; border-top:1px solid var(--surface); margin:16px 0" />');

    htmlLines.push(parsed);
  }

  if (inTable) htmlLines.push('</tbody></table></div>');

  return htmlLines.map(l => {
    if (l.startsWith('<div style="overflow-x') || l.startsWith('</tbody>') || l.startsWith('<tr>')) return l;
    return l + '<div style="height:4px"></div>';
  }).join('');
}

export async function genTopicTask(
  type: string,
  prompt: string,
  onTick: (elapsed: number) => void,
  model = 'default'
): Promise<{ content: string, id: number } | null> {
  const startRes = await fetch('/api/ai/task', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, prompt, model }),
  });
  if (!startRes.ok) throw new Error('Không khởi động được task');
  const { taskId } = await startRes.json();
  const start = Date.now();
  while (Date.now() - start < 600000) { // Tăng lên 10 phút cho các bài giảng cực kỳ chi tiết
    await new Promise(r => setTimeout(r, 2000));
    onTick(Math.floor((Date.now() - start) / 1000));
    const res = await fetch(`/api/ai/task?taskId=${taskId}&type=${encodeURIComponent(type)}`);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'done') return { content: data.content, id: data.id } as any;
    if (data.status === 'error') throw new Error(data.error || 'AI lỗi');
    if (data.status === 'unknown') return null;
  }
  throw new Error('Quá 5 phút: AI không phản hồi kịp');
}

export async function updateLessonMetadata(id: number, metadata: any) {
  try {
    await fetch('/api/english', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, metadata }),
    });
  } catch (e) { console.error('Failed to update metadata', e); }
}

export function cefrHint(level: string, curriculum: any): string {
  const c = curriculum[level] || curriculum.A2;
  return `\n\n📚 CHUẨN CEFR ${level} (BẮT BUỘC bám sát bản chất cấp độ này):
- Ngữ pháp được phép dùng: ${c.grammar}
- Từ vựng cấp độ: ${c.vocab}
- Kỹ năng mục tiêu: ${c.skill}
- Độ dài/độ phức tạp câu: ${c.sentence}
TUYỆT ĐỐI không dùng grammar/vocab vượt cấp độ ${level}.`;
}
