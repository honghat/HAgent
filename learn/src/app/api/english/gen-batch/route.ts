import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { CEFR_CURRICULUM, MODES, UNIT_CURRICULUM } from '@/app/english/constants';

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

function levelOffset(level: string) {
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx < 0) return 0;
  return LEVEL_ORDER.slice(0, idx).reduce((sum, lv) => sum + (UNIT_CURRICULUM[lv]?.length || 0), 0);
}

function displayUnitNumber(level: string, levelUnit: number) {
  return levelOffset(level) + levelUnit;
}

function localUnitNumber(level: string, unit: number, levelUnit?: number) {
  if (levelUnit) return levelUnit;
  const offset = levelOffset(level);
  const count = UNIT_CURRICULUM[level]?.length || 0;
  if (unit > offset && unit <= offset + count) return unit - offset;
  return unit;
}

function cefrHint(level: string) {
  const c = CEFR_CURRICULUM[level as keyof typeof CEFR_CURRICULUM];
  if (!c) return '';
  return `\nCEFR ${level}: grammar=${c.grammar}; vocab=${c.vocab}; skill=${c.skill}; sentence=${c.sentence}`;
}

async function getAISettings() {
  try {
    const rows: any = await prisma.$queryRawUnsafe('SELECT * FROM "Settings" WHERE id = 1 LIMIT 1');
    const s = rows[0];
    if (s) return {
      aiServer: s.aiServer || 'http://100.69.50.64:8080',
      aiKey: s.aiKey || '',
      aiModel: s.aiModel || 'default',
    };
  } catch (e) {
    console.error('[english gen-batch settings error]', e);
  }
  return {
    aiServer: process.env.AI_SERVER || 'http://100.69.50.64:8080',
    aiKey: '',
    aiModel: 'default',
  };
}

async function askAI(prompt: string, provider?: string, modelOverride?: string) {
  if (provider) {
    const res = await fetch('http://127.0.0.1:8010/api/hagent-ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model: modelOverride || '',
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(300000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `AI HTTP ${res.status}`);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI không trả về nội dung');
    return content;
  }

  const settings = await getAISettings();
  const baseUrl = settings.aiServer.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://hatai.io.vn',
    'X-OpenRouter-Title': 'HatAI',
  };
  if (settings.aiKey) headers.Authorization = `Bearer ${settings.aiKey}`;

  let model = settings.aiModel || 'deepseek/deepseek-chat';
  if (settings.aiServer.includes('openrouter.ai')) {
    if (model === 'default') model = 'deepseek/deepseek-chat';
    if (model === 'deepseek-chat' || model === 'deepseek-reasoner') model = `deepseek/${model}`;
    else if (model.startsWith('gpt-')) model = `openai/${model}`;
    else if (model.startsWith('claude-')) model = `anthropic/${model}`;
    else if (model.startsWith('gemini-')) model = `google/${model}`;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI không trả về nội dung');
  return content;
}

function parseObject(raw: string) {
  const m = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

function parseArray(raw: string) {
  const m = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').match(/\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : null;
}

async function saveLesson(userId: number, type: string, content: string, metadata: Record<string, unknown>) {
  return prisma.englishLesson.create({
    data: {
      userId,
      type,
      content,
      metadata: JSON.stringify(metadata),
      title: String(metadata.title || ''),
      order: Number(metadata.order || 0),
    },
  });
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const level = LEVEL_ORDER.includes(body.level) ? body.level : 'A2';
    const mode = MODES.some(m => m.id === body.mode && m.id !== 'all') ? body.mode : 'coder';
    const provider = typeof body.provider === 'string' ? body.provider : '';
    const model = typeof body.model === 'string' ? body.model : '';
    const units = UNIT_CURRICULUM[level] || [];
    if (!units.length) return Response.json({ error: `Chưa có giáo trình cho ${level}` }, { status: 400 });

    const history = await prisma.englishLesson.findMany({
      where: { userId: user.id },
      select: { metadata: true },
    });
    const doneUnits = new Set<number>();
    for (const item of history) {
      try {
        const meta = JSON.parse(item.metadata || '{}');
        if (meta.level === level && meta.mode === mode && typeof meta.unit === 'number') {
          doneUnits.add(localUnitNumber(level, Number(meta.unit), Number(meta.levelUnit) || undefined));
        }
      } catch { /**/ }
    }

    const nextIdx = units.findIndex((_, i) => !doneUnits.has(i + 1));
    if (nextIdx === -1) return Response.json({ error: `Đã hoàn thành toàn bộ ${units.length} bài cấp ${level}` }, { status: 409 });

    const levelUnit = nextIdx + 1;
    const unitNum = displayUnitNumber(level, levelUnit);
    const unit = units[nextIdx];
    const modeDesc = MODES.find(m => m.id === mode)?.desc || 'software developer, technology';
    const unitCtx = `\n\nĐây là BÀI ${unitNum} của toàn giáo trình, tương ứng ${level} - Bài ${levelUnit}.\nChủ đề: ${unit.title}\nGrammar focus: ${unit.grammar}\nVocab focus: ${unit.vocab}\nScenario: ${unit.scenario}`;
    const hint = cefrHint(level);
    const baseMeta = { level, mode, unit: unitNum, levelUnit, unitTitle: unit.title };

    const listen = parseObject(await askAI(`Generate an English listening exercise (4-6 sentences) for ${level} learner. Context: ${modeDesc}.${unitCtx}${hint}\nMUST use the grammar/vocab focus. Realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"...","vi":"...","vocab":[{"w":"word","m":"nghĩa"}]}`, provider, model));
    if (!listen?.en) throw new Error('Không tạo được bài nghe');

    const speak = await askAI(`Give ONE English speaking question for ${level} learner. Context: ${modeDesc}.${unitCtx}${hint}\nQuestion phải khớp scenario & grammar focus.\nReply with the question ONLY.`, provider, model);
    const writing = await askAI(`Give ONE English writing prompt for ${level} learner. Context: ${modeDesc}.${unitCtx}${hint}\nPrompt phải khớp scenario.\nReply with the prompt ONLY.`, provider, model);
    const wordRange = level === 'A1' ? '50-80' : level === 'A2' ? '80-120' : level === 'B1' ? '150-200' : level === 'B2' ? '200-280' : '280-380';
    const reading = parseObject(await askAI(`Create an English reading passage for ${level} learner. Context: ${modeDesc}.${unitCtx}${hint}\nMUST use the grammar/vocab focus.\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0}]}`, provider, model));
    if (!reading?.body) throw new Error('Không tạo được bài đọc');
    const vocab = parseArray(await askAI(`Give 10 useful English vocabulary words for a ${level} learner. Topic: "${unit.vocab}". Context: ${modeDesc}.${unitCtx}\nFocus on words that appear in this unit's grammar/scenario.\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence using the grammar focus","vi":"nghĩa tiếng Việt"}]`, provider, model));
    if (!Array.isArray(vocab) || !vocab.length) throw new Error('Không tạo được từ vựng');
    const grammar = await askAI(`Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${unit.grammar}" (cấp ${level}).\nNgữ cảnh ứng dụng: ${unit.scenario}.\nGiải thích bằng tiếng Việt, ngắn gọn:\n1. **Khái niệm & Cấu trúc**\n2. **Cách dùng trong ${unit.title}**\n3. **Phỏng vấn**\n4. **Quiz** (3 câu)`, provider, model);

    const created = [];
    created.push(await saveLesson(user.id, 'listen', listen.en, { ...baseMeta, title: `Bài ${unitNum}: ${unit.title} - Nghe`, vi: listen.vi, vocab: listen.vocab, topic: unit.scenario }));
    created.push(await saveLesson(user.id, 'speak', '', { ...baseMeta, title: `Bài ${unitNum}: ${unit.title} - Nói`, topic: speak.trim() }));
    created.push(await saveLesson(user.id, 'writing', '', { ...baseMeta, title: `Bài ${unitNum}: ${unit.title} - Viết`, prompt: writing.trim() }));
    created.push(await saveLesson(user.id, 'reading', reading.body, { ...baseMeta, title: `Bài ${unitNum}: ${unit.title} - Đọc`, topic: unit.scenario, questions: reading.questions || [] }));
    for (const word of vocab) {
      if (!word?.word) continue;
      created.push(await saveLesson(user.id, 'vocab', word.word, { ...baseMeta, word: word.word, ipa: word.ipa || '', def: word.def || '', ex: word.ex || '', vi: word.vi || '', topic: unit.vocab }));
    }
    created.push(await saveLesson(user.id, 'grammar', grammar, { ...baseMeta, topic: `Bài ${unitNum}: ${unit.title} - Ngữ pháp: ${unit.grammar}` }));

    return Response.json({
      ok: true,
      unit: unitNum,
      title: unit.title,
      created: created.length,
    });
  } catch (e) {
    console.error('[english gen-batch error]', e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
