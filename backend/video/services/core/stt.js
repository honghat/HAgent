import fs from 'fs';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
let groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'uploads');

export async function sttGroq(audioPath, languageHint = 'zh') {
  if (!groq) throw new Error('GROQ_API_KEY chưa được cấu hình');

  const stat = fs.statSync(audioPath);
  const LIMIT = 24 * 1024 * 1024;

  if (stat.size <= LIMIT) {
    const r = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: languageHint
    });
    return (r.segments || []).map(s => ({
      start: s.start, end: s.end, text: (s.text || '').trim()
    })).filter(s => s.text);
  }

  // Chunk >25MB
  const ffprobeDuration = (file) => new Promise((res, rej) => {
    ffmpeg.ffprobe(file, (err, m) => err ? rej(err) : res(m.format.duration));
  });
  const dur = await ffprobeDuration(audioPath);
  const CHUNK = 600;
  const segments = [];

  for (let off = 0; off < dur; off += CHUNK) {
    const len = Math.min(CHUNK, dur - off);
    const chunkPath = audioPath + `.chunk${off}.mp3`;
    await new Promise((res, rej) => {
      ffmpeg(audioPath)
        .setStartTime(off).duration(len).audioCodec('libmp3lame')
        .save(chunkPath).on('end', res).on('error', rej);
    });
    const r = await groq.audio.transcriptions.create({
      file: fs.createReadStream(chunkPath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: languageHint
    });
    (r.segments || []).forEach(s => {
      const t = (s.text || '').trim();
      if (t) segments.push({ start: s.start + off, end: s.end + off, text: t });
    });
    try { fs.unlinkSync(chunkPath); } catch {}
  }
  return segments;
}

export async function sttLocalWhisper(audioPath, languageHint = 'zh') {
  const { spawn } = await import('child_process');
  const outDir = path.join(uploadDir, `whisper-${Date.now()}`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const p = spawn('whisper', [
      audioPath, '--language', languageHint,
      '--output_format', 'json', '--output_dir', outDir,
      '--model', 'medium'
    ]);
    p.stderr.on('data', d => process.stderr.write(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('whisper exit ' + code));
      const jsonFile = fs.readdirSync(outDir).find(f => f.endsWith('.json'));
      const data = JSON.parse(fs.readFileSync(path.join(outDir, jsonFile), 'utf8'));
      const segs = (data.segments || []).map(s => ({
        start: s.start, end: s.end, text: (s.text || '').trim()
      })).filter(s => s.text);
      resolve(segs);
    });
  });
}
