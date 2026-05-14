import { prisma } from '@/lib/prisma';

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

export async function POST(req: Request) {
  const settings = await getAISettings();
  try {
    const body = await req.json();
    const { model, ...rest } = body;

    // Use settings.aiServer as the authoritative base URL. 
    // We expect it to be something like https://api.openai.com/v1
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
      // If it's still 'default' or something invalid for OpenRouter, force a safe one
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

    const payload = {
      model: finalModel,
      temperature: 0.7,
      ...rest
    };

    console.log(`[AI Request] URL: ${url} | Model: ${payload.model} | Provider: ${settings.aiProvider}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(600000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[AI Provider Error] Status: ${res.status}`, errText);
      throw new Error(`OpenRouter Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[AI Final Error]', msg);
    return Response.json(
      { 
        error: `AI Error: ${msg}`, 
        choices: [{ message: { content: `⚠️ AI LỖI: ${msg}` } }] 
      },
      { status: 503 }
    );
  }
}
