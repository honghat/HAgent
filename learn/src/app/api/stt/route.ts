function getWhisperBase(): string | null {
  const w = process.env.WHISPER_SERVER?.trim();
  if (w) return w;
  return null;
}

// Model name for local Whisper server (e.g. "base", "small", "medium")
// OpenAI-compatible servers use "whisper-1"
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'medium';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function GET() {
  const base = getWhisperBase();
  if (!base) return Response.json({ available: false, reason: 'WHISPER_SERVER not set' });
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    return Response.json({ available: res.ok, url: base, model: WHISPER_MODEL });
  } catch {
    return Response.json({ available: false, reason: 'Server not reachable' });
  }
}

export async function POST(req: Request) {
  const base = getWhisperBase();
  
  try {
    const formData = await req.formData();
    const audio = formData.get('audio') as Blob;
    if (!audio) return Response.json({ error: 'No audio' }, { status: 400 });

    const type = audio.type || '';
    let ext = 'webm';
    if (type.includes('mp4')) ext = 'mp4';
    else if (type.includes('ogg')) ext = 'ogg';

    let language = formData.get('language') as string;
    if (!language || language === 'undefined' || language === 'null') {
      language = 'en';
    }

    let prompt = (formData.get('prompt') as string) || '';
    if (language === 'en' && !prompt) {
      prompt = 'This is an English speaking practice session. Please transcribe the audio accurately in English.';
    }

    // --- 1. ƯU TIÊN DÙNG GROQ CLOUD TRỰC TIẾP (Nếu có Key) ---
    if (GROQ_API_KEY) {
      try {
        console.log('[STT] Đang dùng Groq Cloud trực tiếp...');
        const groqForm = new FormData();
        groqForm.append('file', audio, `audio.${ext}`);
        
        // Use full large-v3 for maximum accuracy
        groqForm.append('model', 'whisper-large-v3');
        groqForm.append('language', language);
        if (prompt) groqForm.append('prompt', prompt);

        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: groqForm,
          signal: AbortSignal.timeout(30000),
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          return Response.json({ text: data.text || '' });
        }
        const groqErr = await groqRes.text();
        console.error(`[STT] Groq Cloud lỗi: ${groqRes.status} - ${groqErr}`);
      } catch (e) {
        console.error('[STT] Groq Cloud Connection Error:', e);
      }
    }

    // --- 2. DÙNG LOCAL WHISPER PROXY (Nếu không có Groq hoặc Groq lỗi) ---
    if (!base) {
      return Response.json({ error: 'Chưa cấu hình Whisper Server & không có Groq Key.' }, { status: 503 });
    }

    const form = new FormData();
    form.append('file', audio, `audio.${ext}`);
    form.append('model', WHISPER_MODEL);
    form.append('language', 'en');
    form.append('response_format', 'json');

    const res = await fetch(`${base}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return Response.json({ text: data.text || '' });
  } catch (e: unknown) {
    console.error('[STT]', String(e));
    return Response.json({ error: String(e) }, { status: 503 });
  }
}
