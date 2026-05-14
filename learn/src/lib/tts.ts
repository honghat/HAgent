// Shared audio element để iOS unlock audio một lần cho cả session
let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

// Unlock audio trên iOS: phải gọi trong user gesture
export function unlockAudio() {
  if (audioUnlocked || typeof window === 'undefined') return;
  try {
    if (!sharedAudio) sharedAudio = new Audio();
    sharedAudio.src = 'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////8AAAA5TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAAgAAAASAvxcBkAAAAAAAAAAAAAAAAAAAA';
    sharedAudio.play().then(() => { sharedAudio!.pause(); audioUnlocked = true; }).catch(() => {});
    // Warm up speechSynthesis
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch {}
}

// Lux TTS → fallback browser TTS
export function stopTTS() {
  try {
    if (sharedAudio) {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}
}

export async function speakText(text: string, speed = 1.0, voice = 'en_female', server = 'edge', lang = 'en'): Promise<void> {
  unlockAudio();
  // Thử API trước
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 180000);
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed, voice, lang, server }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        // Dùng sharedAudio đã unlock để play trên iOS
        const audio = sharedAudio || new Audio();
        audio.src = url;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('audio error')); };
        audio.play().catch(reject);
      });
      return;
    }
  } catch { clearTimeout(to); /* fall through */ }

  // Fallback: Browser SpeechSynthesis
  await browserSpeak(text, speed);
}

function browserSpeak(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const trySpeak = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = Math.max(0.5, Math.min(2, rate));
      u.volume = 1;
      const voices = speechSynthesis.getVoices();
      const enUS = voices.find(v => v.lang === 'en-US' && v.localService);
      const enAny = voices.find(v => v.lang.startsWith('en'));
      u.voice = enUS || enAny || null;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    };

    if (speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
      setTimeout(trySpeak, 2000);
    }
  });
}
