'use client';
import { useEffect } from 'react';
import { unlockAudio } from '@/lib/tts';

// Unlock audio cho iOS Safari/mobile: lần chạm đầu tiên sẽ unlock.
// Sau đó TTS + audio element có thể play() được tự động.
export default function AudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('touchend', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true });
    return () => {
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);
  return null;
}
