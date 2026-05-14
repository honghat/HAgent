import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
let groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const SYSTEM_PROMPT = `Dịch các câu tiếng Trung sau sang tiếng Việt tự nhiên, sinh động, ngắn gọn. Mỗi câu một dòng.`;

function parseNumbered(text, n) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = new Array(n).fill('');
  for (const line of lines) {
    const m = line.match(/^(\d+)[.)\]:\-\s]+(.+)$/);
    if (m) { const idx = parseInt(m[1], 10) - 1; if (idx >= 0 && idx < n) out[idx] = m[2].trim(); }
  }
  if (out.every(s => !s)) lines.slice(0, n).forEach((l, i) => out[i] = l);
  return out;
}

async function translateGroq(texts) {
  if (!groq) throw new Error('GROQ_API_KEY chưa được cấu hình');
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const r = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: numbered }
    ]
  });
  return parseNumbered(r.choices[0].message.content, texts.length);
}

const FUNNY_PROMPT = `Viết lại các câu sau hài hước, thật ngắn gọn. Mỗi câu ngắn hơn câu gốc. Mỗi câu một dòng.`;

export async function rewriteFunny(texts) {
  if (!groq) throw new Error('GROQ_API_KEY chưa được cấu hình');
  const prompt = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const r = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.9,
    messages: [
      { role: 'system', content: FUNNY_PROMPT },
      { role: 'user', content: prompt }
    ]
  });
  const result = parseNumbered(r.choices[0].message.content, texts.length);
  // Debug log
  console.log('=== REWRITE RESULT ===');
  console.log('Input:', texts.slice(0, 3));
  console.log('Output:', result.slice(0, 3));
  return result;
}

const META_PROMPT = `Từ nội dung video dưới đây, viết title hấp dẫn dưới 70 ký tự, description ngắn 2-3 câu, và 5-10 tags.
Trả về:
TITLE: ...
DESC: ...
TAGS: tag1, tag2, ...`;

export async function generateVideoMeta(viTexts) {
  if (!groq) return { title: 'Video hoang dã', desc: '', tags: '' };
  const sample = viTexts.slice(0, 15).join(' ');
  const r = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    messages: [
      { role: 'system', content: META_PROMPT },
      { role: 'user', content: sample }
    ]
  });
  const text = r.choices[0].message.content;
  const title = text.match(/TITLE:\s*(.+)/)?.[1]?.trim() || 'Video hoang dã';
  const desc = text.match(/DESC:\s*(.+)/)?.[1]?.trim() || '';
  const tags = text.match(/TAGS:\s*(.+)/)?.[1]?.trim() || '';
  return { title, desc, tags };
}

export async function translateBatch(texts) {
  const BATCH = 20;
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const results = await translateGroq(slice);
      out.push(...results);
    } catch {
      for (const t of slice) {
        try { const r = await translateGroq([t]); out.push(r[0] || ''); }
        catch { out.push(''); }
      }
    }
  }
  return out;
}
