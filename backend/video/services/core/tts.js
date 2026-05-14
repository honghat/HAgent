import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import googleTTS from 'google-tts-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = (suffix) => path.join(os.tmpdir(), `vai-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`);

async function trimLeadingSilence(ttsPath) {
  const out = tmp('.mp3');
  await new Promise((res) => {
    ffmpeg(ttsPath)
      .audioFilters('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05')
      .save(out).on('end', res).on('error', () => res());
  });
  try { if (fs.statSync(out).size > 500) return out; } catch {}
  try { fs.unlinkSync(out); } catch {}
  return ttsPath;
}

// Edge TTS
async function ttsEdge(text, voice) {
  const python = process.env.HATAI_PYTHON || '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python';
  const script = path.join(__dirname, '..', '..', 'scripts', 'tts.py');
  const outPath = tmp('.mp3');
  return new Promise((resolve) => {
    const params = JSON.stringify({ text, voice, output_path: outPath });
    const child = spawn(python, [script, params]);
    const t = setTimeout(() => { child.kill(); resolve(null); }, 30000);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve(code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 500 ? outPath : null);
    });
    child.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

// Google TTS
async function ttsGoogle(text) {
  const MAX = 200;
  const parts = text.split(' ').reduce((acc, w) => {
    const last = acc[acc.length - 1] || '';
    const next = (last + ' ' + w).trim();
    if (next.length > MAX && last) acc.push(w);
    else acc[acc.length - 1] = next;
    return acc;
  }, ['']);

  const bufs = [];
  for (const part of parts) {
    if (!part) continue;
    const results = await googleTTS.getAllAudioBase64(part, {
      lang: 'vi', slow: false, host: 'https://translate.google.com', timeout: 10000
    });
    bufs.push(...results.map(r => Buffer.from(r.base64, 'base64')));
  }
  return Buffer.concat(bufs);
}

export async function ttsVietnamese(text, voice = 'vi-VN-HoaiMyNeural') {
  if (!text?.trim()) return null;

  let rawPath = null;

  if (voice === 'google') {
    try {
      const buf = await ttsGoogle(text);
      if (buf?.length > 100) {
        rawPath = tmp('.mp3');
        fs.writeFileSync(rawPath, buf);
      }
    } catch {}
  } else {
    rawPath = await ttsEdge(text, voice);
  }

  if (!rawPath) return null;
  const trimmed = await trimLeadingSilence(rawPath);
  if (trimmed !== rawPath) try { fs.unlinkSync(rawPath); } catch {}
  return trimmed;
}
