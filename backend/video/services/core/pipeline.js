import ffmpeg from 'fluent-ffmpeg';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import axios from 'axios';
import db from '../../../src/db.js';
import { makeSender } from './queue.js';
import { sttGroq, sttLocalWhisper } from './stt.js';
import { translateBatch, generateVideoMeta } from './translator.js';
import { ttsVietnamese } from './tts.js';

const execAsync = promisify(exec);
ffmpeg.setFfmpegPath('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg');
ffmpeg.setFfprobePath('/opt/homebrew/opt/ffmpeg-full/bin/ffprobe');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'uploads');
const venvPython = path.resolve(__dirname, '..', '..', '..', 'venv', 'bin', 'python3');
const ytDlpBin = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');

const tmp = (suffix) => path.join(os.tmpdir(), `vai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`);
const ffprobeDuration = (file) => new Promise((res, rej) => ffmpeg.ffprobe(file, (err, m) => err ? rej(err) : res(m.format.duration)));

// Fetch metadata from Bilibili API
async function fetchBilibiliMetadata(url) {
  // Extract BV number from URL
  const bvMatch = url.match(/BV1[\w\dA-Za-z0-9]+/);
  if (!bvMatch) return null;

  const bvId = bvMatch[0];
  try {
    const response = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      return {
        title: data.title || 'Video Bilibili',
        desc: data.description || '',
        tags: data.stat?.pageviews ? `Lượt xem: ${data.stat.pageviews}` : ''
      };
    }
  } catch (e) {
    console.log('[Bilibili API] Skip:', e.message);
  }
  return null;
}
const extractAudioMono16k = (videoPath) => new Promise((res, rej) => {
  const out = tmp('.mp3');
  ffmpeg(videoPath).noVideo().audioChannels(1).audioFrequency(16000).audioBitrate('64k')
    .save(out).on('end', () => res(out)).on('error', rej);
});

function downloadVideo(url, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ytDlpBin)) {
      return reject(new Error(`Thiếu yt-dlp. Chạy: cd backend && npx yt-dlp-exec install`));
    }
    const base = outputPath.replace(/\.mp4$/, '');
    const p = spawn(ytDlpBin, [
      '--format', 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best',
      '--no-check-certificates', '--no-warnings', '--retries', '5',
      '--output', `${base}.%(id)s.%(ext)s`, url
    ]);
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', async (code) => {
      if (code !== 0) return reject(new Error(stderr.slice(0, 200)));
      const dir = path.dirname(outputPath);
      const prefix = path.basename(base);
      let files;
      try { files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.mp4')); } catch { files = []; }
      if (files.length > 0) {
        fs.renameSync(path.join(dir, files[0]), outputPath);
      }
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(prefix)) : [];
      const vidFile = allFiles.find(f => /\.f\d+\.mp4$/.test(f));
      const audFile = allFiles.find(f => /\.f\d+\.m4a$/.test(f));
      if (vidFile && audFile) {
        await execAsync(`/opt/homebrew/bin/ffmpeg -i "${path.join(dir, vidFile)}" -i "${path.join(dir, audFile)}" -c:v copy -c:a aac -y "${outputPath}"`);
        try { fs.unlinkSync(path.join(dir, vidFile)); } catch {}
        try { fs.unlinkSync(path.join(dir, audFile)); } catch {}
      } else if (vidFile && !fs.existsSync(outputPath)) {
        fs.renameSync(path.join(dir, vidFile), outputPath);
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024)
        return reject(new Error('Không tìm thấy file'));
      resolve(true);
    });
    p.on('error', reject);
  });
}

function saveCheckpoint(taskId, data) {
  fs.writeFileSync(path.join(uploadDir, `ckpt-${taskId}.json`), JSON.stringify(data));
}
function loadCheckpoint(taskId) {
  try { return JSON.parse(fs.readFileSync(path.join(uploadDir, `ckpt-${taskId}.json`), 'utf8')); } catch { return null; }
}
function clearCheckpoint(taskId) {
  try { fs.unlinkSync(path.join(uploadDir, `ckpt-${taskId}.json`)); } catch {}
}

export async function runPipeline(taskId) {
  const task = db.prepare('SELECT * FROM video_tasks WHERE id=?').get(taskId);
  if (!task) return;
  const send = makeSender(taskId);
  db.prepare('UPDATE video_tasks SET status=?, updated_at=? WHERE id=?').run('running', Date.now(), taskId);

  const tempFiles = [];
  const track = (f) => { if (f) tempFiles.push(f); return f; };
  const rm = (f) => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {} };

  let videoPath, segments, finalPath, srtPath;
  let checkpoint = loadCheckpoint(taskId);

  try {
    if (checkpoint?.step !== 'download' || !checkpoint) {
      if (task.source_type !== 'upload') {
        send(`Đang tải từ URL...`);
        videoPath = track(path.join(uploadDir, `dl-${taskId}-${Date.now()}.mp4`));
        try {
          await downloadVideo(task.source_ref, videoPath);
        } catch (e1) {
          if (/Sign in|age|private|members/i.test(String(e1?.message || ''))) {
            send('Thử lại với cookie Chrome...');
            const base = videoPath.replace(/\.mp4$/, '');
            const p = spawn(ytDlpBin, [
              '--format', 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best',
              '--cookies-from-browser', 'chrome',
              '--output', `${base}.%(id)s.%(ext)s`, task.source_ref
            ]);
            await new Promise((res, rej) => { 
              let s = ''; 
              p.stderr.on('data', d => s += d); 
              p.on('close', c => c ? rej(new Error(s)) : res()); 
              p.on('error', rej);
            });
            
            // Rename after cookie-based download
            const dir = path.dirname(videoPath);
            const prefix = path.basename(base);
            const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.mp4'));
            if (files.length > 0) {
              fs.renameSync(path.join(dir, files[0]), videoPath);
            }
          } else throw e1;
        }
        if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1024)
          throw new Error('yt-dlp không tải được video (thử kiểm tra lại link hoặc đóng Chrome)');
        send(`Đã tải (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);
      } else {
        videoPath = path.join(uploadDir, task.source_ref);
      }
      const dur = await ffprobeDuration(videoPath);
      send(`📹 Video: ${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`);
      saveCheckpoint(taskId, { step: 'download', videoPath, totalDuration: dur });
    } else if (checkpoint?.videoPath && fs.existsSync(checkpoint.videoPath)) {
      videoPath = checkpoint.videoPath;
    } else {
      checkpoint = null;
      clearCheckpoint(taskId);
    }

    if (checkpoint?.step !== 'stt') {
      send(`🔊 Đang tách audio...`);
      const audio = track(await extractAudioMono16k(videoPath));
      send(`🎤 Đang nhận diện thoại (${process.env.STT_ENGINE || 'groq'})...`);
      const transcribe = (process.env.STT_ENGINE || 'groq') === 'whisper-local' ? sttLocalWhisper : sttGroq;
      const raw = await transcribe(audio, task.source_lang || 'zh');
      send(`✅ ${raw.length} đoạn thoại`);
      segments = raw.filter((s, i) => {
        if (i === 0) return true;
        const p = raw[i - 1];
        if (s.text.trim() === p.text.trim()) return false;
        if (s.start < p.end - 0.05) return false;
        return true;
      }).map(s => ({ ...s, end: Math.min(s.end, s.start + 5) }));
      saveCheckpoint(taskId, { step: 'stt', videoPath, segments });
    } else {
      segments = checkpoint.segments;
    }

    if (checkpoint?.step !== 'translate') {
      send(`🌐 Đang dịch sang tiếng Việt...`);
      let viTexts = await translateBatch(segments.map(s => s.text));
      segments = segments.map((s, i) => ({ ...s, vi: viTexts[i] || '' }));
      saveCheckpoint(taskId, { step: 'translate', videoPath, segments });
    } else {
      segments = checkpoint.segments;
    }

    if (checkpoint?.step !== 'tts') {
      const voice = task.voice === 'hoaimy' ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
      send(`🔊 Đang sinh giọng đọc (${segments.length} câu, ${voice})...`);
      const limit = pLimit(2);
      await Promise.all(segments.map((seg, i) => limit(async () => {
        if (!seg.vi) return;
        seg.ttsPath = track(await ttsVietnamese(seg.vi, voice));
      })));
      // Co dãn TTS vừa với video (không đổi chiều dài video)
      const vDur = await ffprobeDuration(videoPath).catch(() => 60);
      let totalTts = 0;
      for (const seg of segments) {
        if (!seg.ttsPath) continue;
        try { totalTts += await ffprobeDuration(seg.ttsPath); } catch { totalTts += 0.5; }
      }
      const atempoVal = Math.max(0.5, Math.min(totalTts / vDur, 2.0));
      if (Math.abs(atempoVal - 1.0) > 0.02) {
        send(`⏱ Co dãn ${(atempoVal * 100).toFixed(0)}% cho vừa video`);
        for (const seg of segments) {
          if (!seg.ttsPath) continue;
          const fast = tmp('.mp3');
          await new Promise((res, rej) => {
            ffmpeg(seg.ttsPath).audioFilters(`atempo=${atempoVal.toFixed(3)}`)
              .save(fast).on('end', res).on('error', rej);
          });
          try { fs.unlinkSync(seg.ttsPath); } catch {}
          seg.ttsPath = track(fast);
        }
      }
      for (const seg of segments) {
        if (!seg.ttsPath) seg.start = seg.end = 0;
      }
      saveCheckpoint(taskId, { step: 'tts', videoPath, segments });
    } else {
      segments = checkpoint.segments;
      for (const seg of segments) {
        if (seg.ttsPath && fs.existsSync(seg.ttsPath)) track(seg.ttsPath);
      }
    }

    const totalDuration = await ffprobeDuration(videoPath).catch(() => 120);

    if (checkpoint?.step !== 'mux') {
      send(`🎚️ Ghép ${segments.filter(s => s.ttsPath).length} clip TTS...`);
      const dubTrack = track(await buildAlignedDubTrack(segments));
      send(`🎚️ Ghép âm...`);
      const mixedPath = track(path.join(uploadDir, `mix-${taskId}.mp4`));
      await muxAudio(videoPath, dubTrack, mixedPath);

      send(`📝 Chèn phụ đề...`);
      srtPath = path.join(uploadDir, `subs-${taskId}.srt`);
      fs.writeFileSync(srtPath, buildSRT(segments), 'utf8');
      finalPath = path.join(uploadDir, `final-${Date.now()}.mp4`);
      await burnSubtitles(mixedPath, srtPath, finalPath);
      saveCheckpoint(taskId, { step: 'mux', videoPath, segments, mixedPath, finalPath, srtPath, totalDuration });
    } else {
      finalPath = checkpoint.finalPath;
      srtPath = checkpoint.srtPath;
    }

    send('✅ Hoàn tất!');
    let ytTitle = task.title;
    try {
      const meta = await generateVideoMeta(segments.map(s => s.vi));
      ytTitle = meta.title;
      db.prepare(`UPDATE video_tasks SET yt_desc=?, yt_tags=? WHERE id=?`).run(meta.desc, meta.tags, taskId);
      send(`📺 Tiêu đề: ${ytTitle}`);
    } catch {}

    db.prepare(`UPDATE video_tasks SET status='done', video_file=?, srt_file=?, segments_count=?, duration=?, title=?, updated_at=? WHERE id=?`)
      .run(path.basename(finalPath), path.basename(srtPath), segments.filter(s => s.ttsPath).length, totalDuration, ytTitle, Date.now(), taskId);
    if (task.source_type !== 'upload') try { fs.unlinkSync(videoPath); } catch {}
    clearCheckpoint(taskId);
  } catch (e) {
    send(`❌ Lỗi: ${e.message}`);
    db.prepare(`UPDATE video_tasks SET status='error', error=?, updated_at=? WHERE id=?`).run(e.message, Date.now(), taskId);
  } finally {
    tempFiles.forEach(rm);
  }
}

async function buildAlignedDubTrack(segments) {
  const usable = segments.filter(s => s.ttsPath);
  if (usable.length === 0) return null;

  const listPath = tmp('.txt');
  fs.writeFileSync(listPath, usable.map(s => `file '${s.ttsPath}'`).join('\n'), 'utf8');
  const outPath = tmp('.mp3');
  await execAsync(`/opt/homebrew/bin/ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -y "${outPath}"`);
  try { fs.unlinkSync(listPath); } catch {}

  let audioCursor = 0;
  let prevSubEnd = 0;
  for (const seg of usable) {
    let dur = 0.5;
    try { dur = await ffprobeDuration(seg.ttsPath); } catch {}
    const audioStart = audioCursor;
    const audioEnd = audioCursor + dur;
    const subStart = Math.max(prevSubEnd, audioStart - 1.0);
    seg.start = subStart;
    seg.end = subStart + dur - 0.05;
    prevSubEnd = seg.end;
    audioCursor = audioEnd;
  }
  return outPath;
}

async function muxAudio(videoPath, dubPath, outPath) {
  return new Promise((res, rej) => {
    ffmpeg().input(videoPath).input(dubPath)
      .outputOptions(['-map', '0:v:0', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'])
      .save(outPath).on('end', () => res(outPath)).on('error', rej);
  });
}

async function burnSubtitles(videoPath, srtPath, outPath) {
  const srt = fs.readFileSync(srtPath, 'utf8');
  const assContent = srt2ass(srt);
  const assPath = srtPath.replace(/\.srt$/, '.ass');
  fs.writeFileSync(assPath, assContent, 'utf8');
  return new Promise((res, rej) => {
    const escapedAssPath = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    ffmpeg(videoPath)
      .complexFilter([`[0:v]drawbox=x=0:y=ih*7/8:w=iw:h=ih/8:color=white@0.5:t=fill[w]`, `[w]ass=${escapedAssPath}[out]`])
      .outputOptions(['-map', '[out]', '-map', '0:a', '-c:v', 'libx264', '-crf', '22', '-preset', 'fast', '-c:a', 'copy'])
      .save(outPath).on('end', () => { try { fs.unlinkSync(assPath); } catch {} res(outPath); })
      .on('error', (e) => { try { fs.unlinkSync(assPath); } catch {} rej(e); });
  });
}

function srt2ass(srt) {
  const header = `[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\nPlayResX: 384\nPlayResY: 288\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,18,&H0000FFFF,&H0000FFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,3,1,0,2,10,10,20,0\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const body = srt.replace(/\r\n/g, '\n').split(/\n\n+/).filter(Boolean).map(block => {
    const lines = block.split('\n');
    const idx = lines.findIndex(l => l.includes('-->'));
    if (idx === -1) return '';
    const [start, end] = lines[idx].split(' --> ').map(t => t.replace(',', '.').trim());
    const text = lines.slice(idx + 1).filter(Boolean).join('\\N');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).filter(Boolean).join('\n');
  return header + body;
}

function buildSRT(segments) {
  const fmt = (t) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return segments.filter(s => s.start < s.end).map((s, i) => `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.vi || ''}\n`).join('\n');
}
