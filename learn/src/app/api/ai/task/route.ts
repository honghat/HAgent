import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

async function getAISettings() {
  try {
    const results: any = await prisma.$queryRawUnsafe('SELECT * FROM "Settings" WHERE id = 1 LIMIT 1');
    const s = results[0];
    if (s) return {
      aiServer: s.aiServer || 'http://100.69.50.64:8080',
      aiProvider: s.aiProvider || 'local',
      aiKey: s.aiKey || '',
      aiHost: s.aiHost || '100.69.50.64',
      aiModel: s.aiModel || 'default'
    };
  } catch (e) {
    console.error('[getAISettings Raw SQL error]', e);
  }
  return { 
    aiServer: process.env.AI_SERVER || 'http://100.69.50.64:8080', 
    aiProvider: 'local', 
    aiKey: '',
    aiModel: 'default'
  };
}

function cleanTopic(raw: string): string {
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

// Fire AI call in background — response returns immediately with taskId.
// AI result is saved to EnglishLesson when complete, survives client navigation.
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, prompt, model } = await req.json();
  if (!type || !prompt) return Response.json({ error: 'Missing type or prompt' }, { status: 400 });

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const settings = await getAISettings();

  // Ghi marker "đang chạy" vào DB để client poll được
  await prisma.englishLesson.create({
    data: {
      userId: user.id,
      type: `${type}_pending`,
      content: taskId,
      metadata: JSON.stringify({ taskId, prompt: prompt.slice(0, 100), status: 'running', model }),
    },
  });

  // Chạy nền — không await, response trả về ngay
  (async () => {
    try {
      let baseUrl = settings.aiServer.replace(/\/+$/, '');
      let url = `${baseUrl}/chat/completions`;
      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hatai.io.vn',
        'X-OpenRouter-Title': 'HatAI'
      };

      if (settings.aiKey) {
        headers['Authorization'] = `Bearer ${settings.aiKey}`;
      }

      // AUTO-PATCH MODEL NAMES FOR OPENROUTER
      // If client sends 'default', use the one from DB settings
      let finalModel = (model && model !== 'default') ? model : (settings.aiModel || 'deepseek/deepseek-chat');

      if (settings.aiServer.includes('openrouter.ai')) {
        // If it's still 'default', force a safe one
        if (finalModel === 'default') finalModel = 'deepseek/deepseek-chat';

        if (finalModel === 'deepseek-chat' || finalModel === 'deepseek-reasoner') {
          finalModel = `deepseek/${finalModel}`;
        } else if (finalModel.startsWith('gpt-')) {
          finalModel = `openai/${finalModel}`;
        } else if (finalModel.startsWith('claude-')) {
          finalModel = `anthropic/${finalModel}`;
        } else if (finalModel.startsWith('gemini-')) {
          finalModel = `google/${finalModel}`;
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: finalModel, 
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      
      // CHỈ làm sạch (clean) đối với các task dạng "chủ đề ngắn" (1 câu)
      // KHÔNG làm sạch các bài giảng dài như grammar, reading, sample...
      const skipClean = ['grammar', 'reading', 'writing_sample', 'speak_sample', 'listen'].includes(type);
      const contentToSave = skipClean ? rawContent.trim() : cleanTopic(rawContent);

      if (contentToSave && contentToSave.length > 5) {
        await prisma.englishLesson.create({
          data: {
            userId: user.id,
            type,
            content: contentToSave,
            metadata: JSON.stringify({ taskId, generated: true }),
          },
        });
      } else {
        throw new Error("AI returned empty or invalid content");
      }
      // Xoá marker pending SAU KHI đã lưu kết quả thành công
      await prisma.englishLesson.deleteMany({
        where: { userId: user.id, type: `${type}_pending`, content: taskId },
      });
    } catch (e) {
      console.error('[AI Task Error]', e);
      // Đánh dấu lỗi trong marker với chi tiết
      await prisma.englishLesson.updateMany({
        where: { userId: user.id, type: `${type}_pending`, content: taskId },
        data: { metadata: JSON.stringify({ taskId, status: 'error', error: e instanceof Error ? e.message : String(e) }) },
      });
    }
  })();

  return Response.json({ taskId });
}

// Client poll để check task xong chưa
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ status: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type');
  if (!taskId || !type) return Response.json({ error: 'Missing taskId or type' }, { status: 400 });

  // Còn marker pending → đang chạy
  const pending = await prisma.englishLesson.findFirst({
    where: { userId: user.id, type: `${type}_pending`, content: taskId },
  });
  if (pending) {
    const meta = JSON.parse(pending.metadata || '{}');
    if (meta.status === 'error') {
      await prisma.englishLesson.delete({ where: { id: pending.id } });
      return Response.json({ status: 'error', error: meta.error });
    }
    return Response.json({ status: 'running' });
  }

  // Không còn pending → tìm kết quả
  const result = await prisma.englishLesson.findFirst({
    where: { userId: user.id, type },
    orderBy: { createdAt: 'desc' },
  });
  if (result && result.metadata?.includes(taskId)) {
    return Response.json({ status: 'done', content: result.content, id: result.id });
  }
  return Response.json({ status: 'unknown' });
}

export async function DELETE(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ status: 'unauthorized' }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type');

  if (taskId && type) {
    // Xóa một task cụ thể
    await prisma.englishLesson.deleteMany({
      where: { userId: user.id, type: `${type}_pending`, content: taskId }
    });
    return Response.json({ ok: true });
  }
  
  // Xóa các task pending cũ hơn 3 phút (giảm từ 5 xuống 3 cho quyết liệt hơn)
  const staleTime = new Date(Date.now() - 180000);
  await prisma.englishLesson.deleteMany({
    where: {
      userId: user.id,
      type: { endsWith: '_pending' },
      createdAt: { lt: staleTime }
    }
  });
  
  return Response.json({ ok: true });
}
