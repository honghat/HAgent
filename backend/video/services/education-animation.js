import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { callLLM } from '../../src/services/llm.js';
import { ttsVietnamese } from './core/tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '..', '..', '..', 'data', 'uploads');

const DEFAULT_SCENE_COUNT = 6;
const MIN_DURATION = 12;
const MAX_DURATION = 60;
const FPS = 15;
const DEFAULT_CHANNEL = '@duide_duide';
const LAYOUTS = ['hero', 'split', 'orbit', 'timeline', 'comparison', 'stack', 'quiz'];
const MOTIFS = ['studio', 'lab', 'map', 'dashboard', 'storybook', 'space', 'chalk'];
const PALETTE_PRESETS = [
  ['#2563eb', '#10b981', '#f97316', '#111827', '#f8fafc'],
  ['#0f766e', '#f59e0b', '#e11d48', '#172554', '#f7fee7'],
  ['#7c3aed', '#06b6d4', '#facc15', '#1f2937', '#fdf4ff'],
  ['#dc2626', '#0891b2', '#84cc16', '#111827', '#fff7ed'],
  ['#4338ca', '#14b8a6', '#fb7185', '#0f172a', '#ecfeff'],
  ['#0369a1', '#65a30d', '#ea580c', '#1e293b', '#f0f9ff'],
];

const CHARACTER_PRESETS = [
  { id: 'doctor-teal', label: 'Bác sĩ', emoji: '👩‍⚕️', prop: '🩺', skin: '#ffd6c9', hair: '#202033', outfit: '#8fd8c8', accent: '#e11d48', hairStyle: 'long', accessory: 'cap' },
  { id: 'doctor-blue', label: 'Bác sĩ nam', emoji: '👨‍⚕️', prop: '💉', skin: '#f2c2a8', hair: '#2f2725', outfit: '#9bd3f0', accent: '#2563eb', hairStyle: 'short', accessory: 'glasses' },
  { id: 'teacher-red', label: 'Giáo viên', emoji: '👩‍🏫', prop: '📚', skin: '#f7c7b2', hair: '#3a2b34', outfit: '#fca5a5', accent: '#dc2626', hairStyle: 'bun', accessory: 'book' },
  { id: 'student-yellow', label: 'Học sinh', emoji: '🧒', prop: '✏️', skin: '#f1b99d', hair: '#1f2937', outfit: '#fde68a', accent: '#f59e0b', hairStyle: 'short', accessory: 'none' },
  { id: 'scientist-lab', label: 'Nhà khoa học', emoji: '👩‍🔬', prop: '🔬', skin: '#ffd8c2', hair: '#4b5563', outfit: '#ffffff', accent: '#14b8a6', hairStyle: 'short', accessory: 'glasses' },
  { id: 'robot-mascot', label: 'Trợ lý AI', emoji: '🤖', prop: '💡', skin: '#dbeafe', hair: '#64748b', outfit: '#bfdbfe', accent: '#7c3aed', hairStyle: 'robot', accessory: 'antenna' },
];

export const freeAnimationTools = [
  {
    id: 'html-css',
    name: 'HTML/CSS motion',
    cost: 'Miễn phí',
    role: 'Dựng bản nháp đẹp bằng layout web, CSS transform, caption và icon',
    url: '',
  },
  {
    id: 'viggle',
    name: 'Viggle',
    cost: 'Có lượt miễn phí',
    role: 'Animate nhân vật từ ảnh hoặc motion reference cho các đoạn nhân vật',
    url: 'https://viggle.ai/tools/ai-animation-generator',
  },
  {
    id: 'krikey',
    name: 'Krikey AI',
    cost: 'Có gói miễn phí',
    role: 'Tạo avatar hoạt hình 3D và lời thoại ngắn cho lớp học',
    url: 'https://www.krikey.ai/',
  },
  {
    id: 'flexclip',
    name: 'FlexClip Education',
    cost: 'Có gói miễn phí',
    role: 'Ghép template giáo dục, voiceover và subtitle nhanh',
    url: 'https://www.flexclip.com/create/ai-education-video.html',
  },
  {
    id: 'open-source',
    name: 'Blender / OpenToonz',
    cost: 'Miễn phí, open source',
    role: 'Sửa chuyển động nâng cao khi cần kiểm soát thủ công',
    url: 'https://www.blender.org/',
  },
];

const voiceMap = {
  hoaimy: 'vi-VN-HoaiMyNeural',
  namminh: 'vi-VN-NamMinhNeural',
  google: 'google',
};

const SYSTEM_PROMPT = `Bạn là đạo diễn hoạt hình giáo dục ngắn cho học sinh Việt Nam và là art director HTML/CSS motion.
Tạo storyboard hoạt hình minh họa giáo dục chuyên nghiệp, phù hợp render bằng HTML/CSS: hook mạnh, 5-6 cảnh, chữ ngắn, nhân vật/đạo cụ minh họa lớn, nền trắng hoặc pastel sạch, chữ đen đậm đặt trực tiếp trên cảnh, phụ đề rõ ở đáy, nhịp chuyển cảnh nhanh, có câu hỏi/CTA cuối.
Mỗi video phải có visualSystem riêng, không lặp lại bố cục/template: chọn palette pastel, motif, layout từng cảnh, pose nhân vật, đạo cụ minh họa và chuyển động phù hợp đúng chủ đề. Tránh giao diện dashboard, card kính, biểu đồ khô; ưu tiên cảm giác video minh họa kể chuyện giống kênh giáo dục hoạt hình.
Chỉ trả về JSON hợp lệ, không markdown.
Schema:
{
  "title": "string",
  "objective": "string",
  "audience": "string",
  "channel": "string",
  "durationSec": number,
  "format": "9:16|16:9|1:1",
  "style": "string",
  "narration": "string",
  "visualSystem": {
    "seed": "string unique slug",
    "motif": "studio|lab|map|dashboard|storybook|space|chalk",
    "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"],
    "background": "string",
    "motionLanguage": "string",
    "sceneLayouts": ["hero|split|orbit|timeline|comparison|stack|quiz"],
    "texture": "string",
    "htmlNotes": "string"
  },
  "scenes": [
    {
      "title": "string",
      "durationSec": number,
      "voiceover": "string",
      "onscreenText": "string",
      "visual": "string",
      "motion": "string",
      "icon": "string",
      "layout": "hero|split|orbit|timeline|comparison|stack|quiz",
      "visualMetaphor": "string",
      "dataPoints": ["string", "string", "string"],
      "editNote": "string"
    }
  ],
  "editing": {
    "editGoal": "string",
    "broll": ["string"],
    "captionStyle": "string"
  }
}`;

function clampDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(n)));
}

function normalizeFormat(format) {
  return ['9:16', '16:9', '1:1'].includes(format) ? format : '9:16';
}

function safeText(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 600);
}

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickBySeed(list, seed, offset = 0) {
  return list[(hashString(seed) + offset) % list.length];
}

function safeSlug(value, fallback = 'visual') {
  const slug = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function safeHex(value, fallback) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function normalizeLayout(value, fallback = 'hero') {
  return LAYOUTS.includes(value) ? value : fallback;
}

function normalizeMotif(value, fallback = 'studio') {
  return MOTIFS.includes(value) ? value : fallback;
}

function buildVisualSystem(raw = {}, input = {}) {
  const seedBase = raw?.seed || input.visualSeed || `${input.topic || input.title || 'video'}-${input.style || ''}-${randomUUID().slice(0, 8)}`;
  const seed = safeSlug(seedBase, `visual-${randomUUID().slice(0, 8)}`);
  const preset = PALETTE_PRESETS[hashString(seed) % PALETTE_PRESETS.length];
  const palette = Array.isArray(raw?.palette) && raw.palette.length >= 3
    ? raw.palette.slice(0, 5).map((color, index) => safeHex(color, preset[index] || preset[0]))
    : preset;
  while (palette.length < 5) palette.push(preset[palette.length] || preset[0]);

  const motif = normalizeMotif(raw?.motif, pickBySeed(MOTIFS, seed, 1));
  const sceneLayouts = Array.isArray(raw?.sceneLayouts) && raw.sceneLayouts.length
    ? raw.sceneLayouts.slice(0, 6).map((layout, index) => normalizeLayout(layout, LAYOUTS[(hashString(seed) + index) % LAYOUTS.length]))
    : Array.from({ length: DEFAULT_SCENE_COUNT }, (_, index) => LAYOUTS[(hashString(seed) + index) % LAYOUTS.length]);

  return {
    seed,
    motif,
    palette,
    background: safeText(raw?.background, `Nền ${motif} riêng cho chủ đề ${input.topic || input.title || 'bài học'}`),
    motionLanguage: safeText(raw?.motionLanguage, pickBySeed([
      'cắt nhanh, pop-in rõ, số liệu bật theo nhịp',
      'camera pan nhẹ, line-reveal và thẻ kiến thức trượt lớp',
      'zoom mềm, split-screen và marker nổi bật',
      'morphing shapes, timeline reveal và câu hỏi cuối',
    ], seed, 2)),
    sceneLayouts,
    texture: safeText(raw?.texture, pickBySeed(['grid blueprint', 'paper grain', 'soft geometry', 'clean dashboard', 'chalk marks'], seed, 3)),
    htmlNotes: safeText(raw?.htmlNotes, 'Renderer phải tạo HTML/CSS khác nhau theo visual system này.'),
  };
}

function buildCharacterCast(visualSystem = {}, sceneCount = DEFAULT_SCENE_COUNT) {
  const seed = visualSystem.seed || 'hagent-cast';
  const start = hashString(seed) % CHARACTER_PRESETS.length;
  return Array.from({ length: Math.max(1, sceneCount) }, (_, index) => {
    const preset = CHARACTER_PRESETS[(start + index) % CHARACTER_PRESETS.length];
    return { ...preset };
  });
}

function safeChannel(value) {
  const raw = String(value || DEFAULT_CHANNEL).trim();
  const channel = raw.startsWith('@') ? raw : `@${raw}`;
  return channel.replace(/\s+/g, '').slice(0, 80) || DEFAULT_CHANNEL;
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizePlan(raw, input = {}) {
  const durationSec = clampDuration(raw?.durationSec || input.durationSec);
  const sceneCount = Math.max(5, Math.min(6, Array.isArray(raw?.scenes) ? raw.scenes.length : DEFAULT_SCENE_COUNT));
  const baseSceneDuration = Math.max(3, Math.round(durationSec / sceneCount));
  const visualSystem = buildVisualSystem(raw?.visualSystem, {
    ...input,
    title: raw?.title,
    topic: input.topic || raw?.title,
  });
  const scenes = (Array.isArray(raw?.scenes) ? raw.scenes : []).slice(0, 6).map((scene, index) => ({
    id: `scene-${index + 1}`,
    title: safeText(scene.title, `Ý ${index + 1}`),
    durationSec: Math.max(3, Math.round(Number(scene.durationSec) || baseSceneDuration)),
    voiceover: safeText(scene.voiceover, ''),
    onscreenText: safeText(scene.onscreenText || scene.title, ''),
    visual: safeText(scene.visual, ''),
    motion: safeText(scene.motion, ''),
    icon: safeText(scene.icon, pickIcon(index)),
    layout: normalizeLayout(scene.layout, visualSystem.sceneLayouts[index % visualSystem.sceneLayouts.length]),
    visualMetaphor: safeText(scene.visualMetaphor, scene.visual || scene.title),
    dataPoints: Array.isArray(scene.dataPoints)
      ? scene.dataPoints.slice(0, 3).map(item => safeText(item, '')).filter(Boolean)
      : [],
    editNote: safeText(scene.editNote, ''),
  }));

  if (scenes.length < 5) return buildFallbackPlan(input);

  const sum = scenes.reduce((acc, scene) => acc + scene.durationSec, 0);
  if (sum !== durationSec && scenes.length > 0) {
    const delta = durationSec - sum;
    scenes[scenes.length - 1].durationSec = Math.max(3, scenes[scenes.length - 1].durationSec + delta);
  }

  return {
    title: safeText(raw?.title, `Hoạt hình: ${input.topic || 'bài học'}`),
    objective: safeText(raw?.objective, `Giúp học sinh hiểu ${input.topic || 'bài học'}`),
    audience: safeText(raw?.audience, input.audience || 'Người xem'),
    channel: safeChannel(raw?.channel || input.channel),
    durationSec,
    format: normalizeFormat(raw?.format || input.format),
    style: safeText(raw?.style, input.style || 'Hoạt hình HTML/CSS sáng, rõ, hiện đại'),
    narration: safeText(raw?.narration, scenes.map(s => s.voiceover).filter(Boolean).join(' ')),
    visualSystem,
    scenes,
    editing: {
      editGoal: safeText(raw?.editing?.editGoal, 'Giữ nhịp nhanh, cắt theo từng ý chính, ưu tiên phụ đề dễ đọc.'),
      broll: Array.isArray(raw?.editing?.broll) ? raw.editing.broll.slice(0, 6).map(item => safeText(item)) : [],
      captionStyle: safeText(raw?.editing?.captionStyle, 'Phụ đề lớn, 1-2 dòng, màu tương phản cao.'),
    },
  };
}

function pickIcon(index) {
  return ['spark', 'seed', 'cycle', 'compare', 'idea', 'check', 'book'][index % 7];
}

export function buildFallbackPlan(input = {}) {
  const topic = safeText(input.topic, 'vòng đời của cây');
  const durationSec = clampDuration(input.durationSec);
  const format = normalizeFormat(input.format);
  const audience = safeText(input.audience, 'Người xem');
  const channel = safeChannel(input.channel);
  const style = safeText(input.style, 'Hoạt hình HTML/CSS sáng, rõ, hiện đại');
  const sceneDuration = Math.max(3, Math.round(durationSec / DEFAULT_SCENE_COUNT));
  const visualSystem = buildVisualSystem(input.visualSystem, {
    topic,
    style,
    visualSeed: `${topic}-${Date.now()}-${randomUUID().slice(0, 6)}`,
  });
  const scenes = [
    {
      title: topic,
      voiceover: `Bạn có biết vì sao ${topic} lại quan trọng không? Cùng xem trong một phút.`,
      onscreenText: topic,
      visual: 'Một bảng bài học hiện ra cùng biểu tượng chủ đề.',
      motion: 'Tiêu đề trượt nhẹ vào giữa, icon nảy lên.',
      icon: 'spark',
      editNote: 'Dùng đoạn này làm hook 3 giây đầu.',
    },
    {
      title: 'Bước đầu tiên',
      voiceover: `${topic} bắt đầu từ một điểm đơn giản, rồi thay đổi từng bước.`,
      onscreenText: 'Bắt đầu từ đâu?',
      visual: 'Ba thẻ kiến thức xuất hiện theo thứ tự.',
      motion: 'Thẻ 1, 2, 3 bật lên nối bằng mũi tên.',
      icon: 'seed',
      editNote: 'Cắt theo nhịp từng thẻ kiến thức.',
    },
    {
      title: 'Vai trò từng bước',
      voiceover: `Mỗi bước đều có vai trò riêng, vì vậy ta cần quan sát theo thứ tự.`,
      onscreenText: 'Mỗi bước có vai trò',
      visual: 'Sơ đồ vòng tròn nối ba ý chính.',
      motion: 'Đường nối xoay nhẹ quanh ý trung tâm.',
      icon: 'cycle',
      editNote: 'Giữ phụ đề không che sơ đồ.',
    },
    {
      title: 'So sánh nhanh',
      voiceover: `Khi so sánh trước và sau, ta sẽ thấy điểm khác biệt rõ hơn.`,
      onscreenText: 'Trước vs Sau',
      visual: 'Hai khung so sánh nằm cạnh nhau với nhãn nổi bật.',
      motion: 'Khung bên trái mờ dần, khung bên phải bật sáng.',
      icon: 'compare',
      editNote: 'Có thể thêm split-screen hoặc b-roll minh họa.',
    },
    {
      title: 'Ví dụ dễ nhớ',
      voiceover: `Hãy nhớ bằng hình ảnh: nhỏ, lớn dần, rồi tạo ra kết quả mới.`,
      onscreenText: 'Nhỏ -> lớn dần -> kết quả',
      visual: 'Thanh tiến trình tăng dần và bật dấu kiểm.',
      motion: 'Các cột tăng chiều cao, dấu kiểm sáng lên.',
      icon: 'idea',
      editNote: 'Có thể thêm b-roll hoặc hình minh họa thật.',
    },
    {
      title: 'Ôn tập nhanh',
      voiceover: `Tóm lại, hãy nhớ ba ý chính và thử giải thích lại bằng lời của bạn.`,
      onscreenText: 'Bạn nhớ được gì?',
      visual: 'Ba nhãn tóm tắt gom về giữa màn hình.',
      motion: 'Nhãn gom lại và kết thúc bằng câu hỏi.',
      icon: 'check',
      editNote: 'Thêm câu hỏi cuối video để học sinh trả lời.',
    },
  ].map((scene, index) => ({
    ...scene,
    id: `scene-${index + 1}`,
    layout: visualSystem.sceneLayouts[index % visualSystem.sceneLayouts.length],
    visualMetaphor: scene.visual,
    dataPoints: scene.onscreenText.split(/\s+/).slice(0, 3),
    durationSec: index === DEFAULT_SCENE_COUNT - 1
      ? Math.max(3, durationSec - sceneDuration * (DEFAULT_SCENE_COUNT - 1))
      : sceneDuration,
  }));

  return {
    title: `Hoạt hình giáo dục: ${topic}`,
    objective: `Giúp người xem nắm được ý chính về ${topic}.`,
    audience,
    channel,
    durationSec,
    format,
    style,
    narration: scenes.map(scene => scene.voiceover).join(' '),
    visualSystem,
    scenes,
    editing: {
      editGoal: 'Dùng MP4 nháp và SRT để cắt gọn, chỉnh phụ đề, thêm intro/outro và b-roll nếu cần.',
      broll: ['Ảnh minh họa thật', 'Cận cảnh giáo viên giải thích', 'Câu hỏi ôn tập cuối video'],
      captionStyle: 'Phụ đề 1-2 dòng, nền sáng, chữ đậm.',
    },
  };
}

export async function buildEducationAnimationPlan(input = {}) {
  const normalizedInput = {
    topic: safeText(input.topic, 'vòng đời của cây'),
    audience: safeText(input.audience, 'Người xem'),
    durationSec: clampDuration(input.durationSec),
    format: normalizeFormat(input.format),
    style: safeText(input.style, 'Hoạt hình HTML/CSS sáng, rõ, hiện đại'),
    provider: safeText(input.provider, ''),
    channel: safeChannel(input.channel),
  };

  if (normalizedInput.provider) {
    try {
      const { content } = await callLLM(
        SYSTEM_PROMPT,
        [{
          role: 'user',
          content: JSON.stringify({
            topic: normalizedInput.topic,
            audience: normalizedInput.audience,
            channel: normalizedInput.channel,
            durationSec: normalizedInput.durationSec,
            format: normalizedInput.format,
            style: normalizedInput.style,
            constraint: 'Nội dung phục vụ giáo dục, ngắn, an toàn, không quảng cáo. HTML của mỗi video phải khác nhau thông qua visualSystem riêng: motif, palette, layout từng cảnh, dataPoints và motionLanguage không sao chép template cũ.',
          }),
        }],
        { provider: normalizedInput.provider, maxTokens: 2400 },
      );
      const parsed = extractJsonObject(content);
      if (parsed) return normalizePlan(parsed, normalizedInput);
    } catch (err) {
      console.warn('[education-animation] LLM plan fallback:', err.message);
    }
  }

  return buildFallbackPlan(normalizedInput);
}

function dimensionsForFormat(format) {
  if (format === '16:9') return { width: 1280, height: 720 };
  if (format === '1:1') return { width: 1080, height: 1080 };
  return { width: 720, height: 1280 };
}

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

function resolveFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'ffmpeg' || fs.existsSync(candidate)) return candidate;
  }
  return 'ffmpeg';
}

function resolveVoice(voice) {
  return voiceMap[voice] || voiceMap.hoaimy;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildIllustrationAnimationHtml({ plan, format, width, height, sceneStarts, visualSystem, palette, htmlSeed }) {
  const [accent, secondary, highlight, ink, paper] = palette;
  const motif = normalizeMotif(visualSystem.motif);
  const seedHash = hashString(htmlSeed);
  const lineWidth = 5 + (seedHash % 3);
  const bgWashOpacity = 0.08 + ((seedHash % 9) / 100);
  const characterTone = seedHash % 2 === 0 ? '#ffd6c9' : '#f8c9bd';
  const hairColor = ['#202033', '#2b2430', '#35313b', '#191b2a'][seedHash % 4];
  const scrubColor = motif === 'chalk' ? '#8fd8c8' : secondary;
  const titleShadow = seedHash % 2 === 0 ? 'rgba(255,255,255,.78)' : 'rgba(255,246,196,.82)';
  const artViewBox = `0 0 ${width} ${height}`;
  const characterCast = buildCharacterCast(visualSystem, plan.scenes.length);

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(plan.title)}</title>
  <!-- HAgent unique editorial illustration system: ${escapeHtml(htmlSeed)} / ${escapeHtml(motif)} -->
  <style>
    :root {
      --w: ${width}px;
      --h: ${height}px;
      --p: 0;
      --scene-p: 0;
      --enter: 0;
      --bob: 0;
      --hand: 0;
      --tilt: 0;
      --accent: ${accent};
      --secondary: ${secondary};
      --highlight: ${highlight};
      --ink: ${ink};
      --paper: ${paper};
      --line: ${lineWidth}px;
      --wash: ${bgWashOpacity};
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #111827;
    }
    body {
      display: grid;
      place-items: center;
    }
    .stage {
      position: relative;
      width: var(--w);
      height: var(--h);
      overflow: hidden;
      isolation: isolate;
      background:
        radial-gradient(circle at 76% 22%, color-mix(in srgb, var(--secondary) 26%, transparent), transparent 25%),
        radial-gradient(circle at 22% 78%, color-mix(in srgb, var(--highlight) 20%, transparent), transparent 24%),
        linear-gradient(180deg, color-mix(in srgb, var(--paper) 94%, white), #ffffff 58%, color-mix(in srgb, var(--accent) 6%, #ffffff));
      color: var(--ink);
    }
    .stage::before {
      content: "";
      position: absolute;
      inset: 0;
      opacity: .2;
      background-image:
        linear-gradient(90deg, rgba(15,23,42,.045) 1px, transparent 1px),
        linear-gradient(0deg, rgba(15,23,42,.035) 1px, transparent 1px);
      background-size: 38px 38px;
      transform: translate3d(calc(var(--p) * -18px), calc(var(--p) * 10px), 0);
      z-index: -2;
    }
    .stage::after {
      content: "";
      position: absolute;
      inset: 0;
      opacity: var(--wash);
      background:
        repeating-linear-gradient(-8deg, transparent 0 18px, rgba(15,23,42,.09) 18px 20px),
        radial-gradient(circle at 50% 50%, transparent 0 44%, rgba(255,255,255,.8) 86%);
      mix-blend-mode: multiply;
      pointer-events: none;
      z-index: 10;
    }
    .motif-lab {
      background:
        radial-gradient(circle at 73% 23%, color-mix(in srgb, var(--secondary) 34%, transparent), transparent 23%),
        linear-gradient(180deg, #f9fffd, color-mix(in srgb, var(--secondary) 10%, white));
    }
    .motif-map {
      background:
        radial-gradient(circle at 22% 22%, color-mix(in srgb, var(--highlight) 18%, transparent), transparent 20%),
        linear-gradient(140deg, #fffef7, color-mix(in srgb, var(--accent) 8%, white));
    }
    .motif-storybook {
      background:
        radial-gradient(circle at 75% 18%, color-mix(in srgb, var(--highlight) 20%, transparent), transparent 22%),
        linear-gradient(180deg, #fff9f1, #ffffff 66%, color-mix(in srgb, var(--secondary) 8%, white));
    }
    .motif-space {
      background:
        radial-gradient(circle at 74% 20%, color-mix(in srgb, var(--secondary) 32%, transparent), transparent 22%),
        linear-gradient(180deg, #eef7ff, #ffffff 56%, #f8fbff);
    }
    .brand {
      position: absolute;
      top: 5.2%;
      right: 5.4%;
      z-index: 6;
      color: rgba(15,23,42,.22);
      font-size: clamp(14px, calc(var(--w) * .023), 22px);
      font-weight: 850;
      letter-spacing: 0;
    }
    .scene-counter {
      position: absolute;
      top: 5.3%;
      left: 5.5%;
      z-index: 6;
      min-width: 74px;
      padding: .5em .78em;
      border-radius: 999px;
      border: var(--line) solid var(--ink);
      background: white;
      color: var(--ink);
      font-size: clamp(14px, calc(var(--w) * .021), 20px);
      font-weight: 900;
      text-align: center;
      box-shadow: 8px 8px 0 color-mix(in srgb, var(--highlight) 62%, white);
      transform: rotate(-2deg);
    }
    .headline {
      position: absolute;
      left: 7%;
      top: 14%;
      z-index: 6;
      max-width: 41%;
      padding: .08em .18em .16em;
      color: var(--ink);
      font-size: clamp(30px, calc(var(--w) * .052), 58px);
      line-height: 1.02;
      font-weight: 950;
      letter-spacing: 0;
      text-wrap: balance;
      text-shadow:
        4px 0 0 ${titleShadow},
        -4px 0 0 ${titleShadow},
        0 4px 0 ${titleShadow},
        0 -4px 0 ${titleShadow};
      transform: translate3d(calc((1 - var(--enter)) * -34px), 0, 0) rotate(-1deg);
      opacity: calc(.25 + var(--enter) * .75);
    }
    .keyword {
      position: absolute;
      left: 9%;
      top: 39%;
      z-index: 6;
      max-width: 34%;
      padding: .26em .45em .34em;
      background: var(--highlight);
      color: white;
      font-size: clamp(19px, calc(var(--w) * .032), 34px);
      line-height: 1.06;
      font-weight: 950;
      letter-spacing: 0;
      white-space: normal;
      overflow-wrap: anywhere;
      box-shadow: 7px 7px 0 var(--ink);
      transform: rotate(-3deg) scale(calc(.88 + var(--enter) * .12));
    }
    .side-note {
      display: none;
    }
    .stage[data-layout="comparison"] .headline,
    .stage[data-layout="split"] .headline {
      max-width: 39%;
      top: 12%;
    }
    .stage[data-layout="quiz"] .keyword {
      background: #ef4444;
      color: white;
    }
    .stage[data-layout="timeline"] .keyword {
      top: auto;
      bottom: 25%;
      left: 8%;
    }
    .art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
    }
    svg {
      overflow: visible;
    }
    .sketch {
      stroke: var(--ink);
      stroke-width: var(--line);
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .thin {
      stroke-width: calc(var(--line) * .6);
    }
    .no-fill {
      fill: none;
    }
    .character,
    .prop,
    .diagram {
      display: none;
      transform-box: fill-box;
      transform-origin: center;
      will-change: transform, opacity;
    }
    .emoji-character,
    .prop-emoji {
      position: absolute;
      z-index: 4;
      font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
      line-height: 1;
      user-select: none;
      will-change: transform, opacity;
      filter: drop-shadow(0 24px 22px rgba(15,23,42,.16));
    }
    .emoji-character {
      left: 63%;
      top: 52%;
      font-size: clamp(170px, calc(var(--w) * .24), 310px);
      transform: translate(-50%, -50%) scale(calc(.92 + var(--enter) * .08)) rotate(calc(var(--tilt) * 1deg));
    }
    .emoji-character::before {
      content: "";
      position: absolute;
      inset: 8%;
      border-radius: 999px;
      background: color-mix(in srgb, var(--secondary) 18%, white);
      z-index: -1;
      filter: blur(1px);
      transform: scale(1.12);
    }
    .prop-emoji {
      right: 14%;
      top: 30%;
      font-size: clamp(58px, calc(var(--w) * .095), 108px);
      transform: translate3d(calc(var(--bob) * 8px), calc(var(--bob) * -8px), 0) rotate(calc(var(--tilt) * -4deg));
    }
    .character {
      transform: translate3d(calc(540px + var(--bob) * 4px), calc(80px + var(--bob) * -10px), 0) rotate(calc(var(--tilt) * 1deg));
    }
    .torso { fill: var(--character-outfit, ${scrubColor}); }
    .skin { fill: var(--character-skin, ${characterTone}); }
    .hair { fill: var(--character-hair, ${hairColor}); }
    .white { fill: #ffffff; }
    .character-accent { fill: var(--character-accent, ${highlight}); }
    .hair-alt,
    .accessory {
      display: none;
    }
    .stage[data-hair="short"] .hair-base,
    .stage[data-hair="bun"] .hair-base,
    .stage[data-hair="robot"] .hair-base {
      display: none;
    }
    .stage[data-hair="short"] .hair-short,
    .stage[data-hair="bun"] .hair-bun,
    .stage[data-hair="robot"] .hair-robot {
      display: block;
    }
    .stage[data-accessory="cap"] .accessory-cap,
    .stage[data-accessory="glasses"] .accessory-glasses,
    .stage[data-accessory="book"] .accessory-book,
    .stage[data-accessory="antenna"] .accessory-antenna {
      display: block;
    }
    .shadow-stroke {
      stroke: rgba(15,23,42,.16);
      stroke-width: 12px;
      stroke-linecap: round;
    }
    .arm-left {
      transform-box: fill-box;
      transform-origin: 92% 12%;
      transform: rotate(calc(var(--hand) * -7deg));
    }
    .arm-right {
      transform-box: fill-box;
      transform-origin: 8% 10%;
      transform: rotate(calc(var(--hand) * 9deg));
    }
    .prop {
      opacity: calc(.1 + var(--enter) * .9);
      transform: translate3d(calc(815px + (1 - var(--enter)) * 28px), calc(420px + var(--bob) * 7px), 0) scale(.84) rotate(calc(var(--hand) * -5deg));
    }
    .diagram {
      opacity: calc(.05 + var(--enter) * .95);
      transform: translate3d(calc(730px + (1 - var(--enter)) * 34px), 140px, 0) scale(.86);
    }
    .prop-card {
      fill: rgba(255,255,255,.88);
      stroke: var(--ink);
      stroke-width: var(--line);
      filter: drop-shadow(8px 8px 0 color-mix(in srgb, var(--accent) 22%, transparent));
    }
    .shape-a { fill: color-mix(in srgb, var(--secondary) 32%, white); }
    .shape-b { fill: color-mix(in srgb, var(--highlight) 42%, white); }
    .shape-c { fill: color-mix(in srgb, var(--accent) 28%, white); }
    .label-text {
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-size: 28px;
      font-weight: 950;
      fill: var(--ink);
      letter-spacing: 0;
    }
    .small-label {
      font-size: 20px;
      font-weight: 900;
    }
    .stage[data-layout="split"] .character {
      transform: translate3d(570px, calc(82px + var(--bob) * -8px), 0) scale(.96);
    }
    .stage[data-layout="comparison"] .character {
      transform: translate3d(528px, calc(92px + var(--bob) * -8px), 0) scale(.9);
    }
    .stage[data-layout="comparison"] .diagram {
      transform: translate3d(780px, 130px, 0) scale(.82);
    }
    .stage[data-layout="timeline"] .character {
      transform: translate3d(618px, calc(98px + var(--bob) * -6px), 0) scale(.84);
    }
    .stage[data-layout="timeline"] .diagram {
      transform: translate3d(705px, 105px, 0) scale(.84);
    }
    .stage[data-layout="quiz"] .character {
      transform: translate3d(540px, calc(72px + var(--bob) * -12px), 0) scale(1.02) rotate(calc(var(--tilt) * 1.2deg));
    }
    .stage[data-layout="stack"] .diagram {
      transform: translate3d(740px, 150px, 0) scale(.82);
    }
    .subtitle {
      position: absolute;
      left: 50%;
      bottom: 4.6%;
      z-index: 8;
      width: min(88%, 980px);
      min-height: 56px;
      display: grid;
      place-items: center;
      padding: .45em .86em .5em;
      transform: translateX(-50%);
      background: rgba(10,10,10,.82);
      color: #facc15;
      border: 2px solid rgba(250,204,21,.42);
      font-size: clamp(18px, calc(var(--w) * .032), 31px);
      line-height: 1.18;
      font-weight: 850;
      text-align: center;
      letter-spacing: 0;
      text-shadow: 0 2px 0 #000;
    }
    .subtitle.compact {
      font-size: clamp(16px, calc(var(--w) * .026), 25px);
      line-height: 1.16;
    }
    .vertical .headline {
      top: 8.5%;
      left: 7%;
      max-width: 86%;
      font-size: clamp(29px, calc(var(--w) * .064), 48px);
      line-height: 1.04;
    }
    .vertical .keyword {
      top: 31%;
      left: 8%;
      max-width: 78%;
      font-size: clamp(20px, calc(var(--w) * .048), 34px);
      line-height: 1.08;
    }
    .vertical .side-note {
      display: none;
    }
    .vertical .character {
      transform: translate3d(calc(42px + var(--bob) * 3px), calc(390px + var(--bob) * -10px), 0) scale(.96) rotate(calc(var(--tilt) * 1deg));
    }
    .vertical .emoji-character {
      left: 52%;
      top: 54%;
      font-size: clamp(185px, calc(var(--w) * .43), 330px);
    }
    .vertical .prop-emoji {
      right: 10%;
      top: 36%;
      font-size: clamp(64px, calc(var(--w) * .16), 116px);
    }
    .vertical .diagram {
      transform: translate3d(210px, 760px, 0) scale(.66);
    }
    .vertical .prop {
      transform: translate3d(300px, 880px, 0) scale(.58) rotate(calc(var(--hand) * -5deg));
    }
    .vertical[data-layout] .character {
      transform: translate3d(calc(42px + var(--bob) * 3px), calc(390px + var(--bob) * -10px), 0) scale(.96) rotate(calc(var(--tilt) * 1deg));
    }
    .vertical[data-layout] .diagram {
      transform: translate3d(210px, 760px, 0) scale(.66);
    }
    .vertical[data-layout] .prop {
      transform: translate3d(300px, 880px, 0) scale(.58) rotate(calc(var(--hand) * -5deg));
    }
    .vertical .subtitle {
      width: 90%;
      bottom: 4.8%;
      font-size: clamp(18px, calc(var(--w) * .046), 31px);
    }
    .square .headline { max-width: 56%; font-size: clamp(30px, calc(var(--w) * .06), 62px); }
    .square .character { transform: translate3d(470px, 190px, 0) scale(.98); }
    .square .emoji-character { left: 62%; top: 55%; font-size: clamp(190px, calc(var(--w) * .28), 330px); }
    .square .prop-emoji { right: 13%; top: 30%; }
    .square .diagram { transform: translate3d(560px, 180px, 0) scale(.78); }
    .square .prop { transform: translate3d(640px, 620px, 0) scale(.68) rotate(calc(var(--hand) * -5deg)); }
  </style>
</head>
<body>
  <main class="stage motif-${motif} ${format === '16:9' ? 'wide' : format === '1:1' ? 'square' : 'vertical'}" id="stage" data-layout="${escapeHtml(plan.scenes[0]?.layout || 'hero')}">
    <div class="brand">${escapeHtml(plan.channel || DEFAULT_CHANNEL)}</div>
    <div class="scene-counter" id="sceneCounter">01/${String(plan.scenes.length).padStart(2, '0')}</div>
    <h1 class="headline" id="headline">${escapeHtml(plan.scenes[0]?.onscreenText || plan.scenes[0]?.title || plan.title)}</h1>
    <div class="keyword" id="keyword">${escapeHtml(plan.scenes[0]?.onscreenText || plan.title)}</div>
    <div class="emoji-character" id="emojiCharacter">${escapeHtml(characterCast[0]?.emoji || '👩‍🏫')}</div>
    <div class="prop-emoji" id="propEmoji">${escapeHtml(characterCast[0]?.prop || '💡')}</div>

    <svg class="art" viewBox="${artViewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <g opacity=".55">
        <circle cx="1070" cy="140" r="96" class="shape-a" filter="url(#softBlur)" />
        <circle cx="170" cy="585" r="120" class="shape-b" filter="url(#softBlur)" />
        <path d="M870 74 C950 36 1030 54 1090 110 C1020 128 960 150 900 206 C870 166 858 118 870 74Z" class="shape-c" opacity=".62" />
      </g>

      <g class="diagram" transform="translate(700 170)">
        <rect x="90" y="34" width="330" height="230" rx="24" class="prop-card" />
        <path d="M128 216 C168 145 210 178 252 114 C292 164 331 112 382 78" class="sketch no-fill" />
        <circle cx="129" cy="216" r="12" class="shape-b sketch thin" />
        <circle cx="252" cy="114" r="12" class="shape-a sketch thin" />
        <circle cx="382" cy="78" r="12" class="shape-c sketch thin" />
        <text x="124" y="316" class="label-text small-label" id="dataOne">Ý chính</text>
        <text x="124" y="356" class="label-text small-label" id="dataTwo">Ví dụ</text>
        <text x="124" y="396" class="label-text small-label" id="dataThree">Ghi nhớ</text>
      </g>

      <g class="prop" transform="translate(746 418)">
        <path d="M96 70 C164 20 222 36 258 94 C214 130 156 146 94 126 C78 108 76 88 96 70Z" class="shape-b sketch" />
        <path d="M124 82 C152 98 188 104 230 88" class="sketch no-fill thin" />
        <path d="M80 148 C118 154 170 166 242 142" class="sketch no-fill" />
        <text x="42" y="208" class="label-text" id="propLabel">Minh họa</text>
      </g>

      <g class="character" transform="translate(570 92)">
        <path d="M238 542 C308 566 418 564 486 530" class="shadow-stroke no-fill" opacity=".45" />
        <path d="M310 262 C246 294 216 374 214 528 L506 528 C500 384 466 300 402 264 C374 290 338 290 310 262Z" class="torso sketch" />
        <path d="M309 292 C336 318 374 320 404 292" class="sketch no-fill thin" />
        <path d="M260 326 C196 366 158 424 122 484" class="skin sketch arm-left" />
        <path d="M125 485 C105 498 100 520 116 535 C142 548 166 524 154 502" class="skin sketch" />
        <path d="M454 324 C510 360 546 418 578 482" class="skin sketch arm-right" />
        <path d="M578 482 C604 494 616 518 602 535 C574 550 548 525 562 502" class="skin sketch" />
        <path d="M298 148 C270 192 282 252 328 278 C374 302 430 276 442 218 C454 158 404 112 350 116 C326 118 310 128 298 148Z" class="skin sketch" />
        <path d="M286 164 C304 96 400 70 452 132 C494 182 468 248 432 278 C434 218 420 172 372 154 C334 198 298 200 286 164Z" class="hair hair-base sketch" />
        <path d="M296 170 C318 104 420 102 450 168 C432 142 392 142 360 156 C334 170 312 178 296 170Z" class="hair hair-alt hair-short sketch" />
        <path d="M290 166 C302 96 396 76 442 134 C486 188 454 250 426 278 C430 214 410 168 366 154 C330 190 304 194 290 166Z" class="hair hair-alt hair-bun sketch" />
        <circle cx="456" cy="144" r="34" class="hair hair-alt hair-bun sketch" />
        <path d="M298 150 L438 150 L458 204 C436 246 400 272 350 270 C310 268 284 232 284 190Z" class="hair hair-alt hair-robot sketch" />
        <path d="M332 132 C360 114 398 114 430 132 L418 160 L340 160Z" class="white accessory accessory-cap sketch" />
        <path d="M340 130 C365 112 398 112 423 130" class="sketch no-fill thin accessory accessory-cap" />
        <path d="M308 210 H350 M382 210 H424 M350 210 H382" class="sketch no-fill thin accessory accessory-glasses" />
        <rect x="312" y="193" width="42" height="30" rx="12" class="white accessory accessory-glasses sketch thin" />
        <rect x="382" y="193" width="42" height="30" rx="12" class="white accessory accessory-glasses sketch thin" />
        <path d="M342 334 H398 V392 H342Z" class="white accessory accessory-book sketch" />
        <path d="M370 334 V392 M350 354 H363 M378 354 H391" class="sketch no-fill thin accessory accessory-book" />
        <path d="M372 118 V80" class="sketch no-fill thin accessory accessory-antenna" />
        <circle cx="372" cy="72" r="13" class="character-accent accessory accessory-antenna sketch thin" />
        <path d="M315 210 C325 204 336 204 346 211" class="sketch no-fill thin" />
        <path d="M386 211 C397 204 408 204 418 211" class="sketch no-fill thin" />
        <path d="M352 230 C365 238 378 238 392 230" class="sketch no-fill thin" />
        <circle cx="430" cy="215" r="9" class="character-accent sketch thin" />
        <path d="M330 270 L356 318 L388 270" class="white sketch thin" />
      </g>
    </svg>

    <div class="subtitle" id="subtitle">${escapeHtml(plan.scenes[0]?.voiceover || plan.objective)}</div>
  </main>
  <script>
    const plan = ${safeJsonForHtml(plan)};
    const visualSystem = ${safeJsonForHtml(visualSystem)};
    const characterCast = ${safeJsonForHtml(characterCast)};
    const sceneStarts = ${safeJsonForHtml(sceneStarts)};
    const total = ${plan.durationSec};
    const iconMap = {
      spark: 'Điểm lạ',
      seed: 'Bắt đầu',
      cycle: 'Chu kỳ',
      compare: 'So sánh',
      idea: 'Vì sao?',
      check: 'Ghi nhớ',
      book: 'Bài học'
    };
    const propEmojiMap = {
      spark: '✨',
      seed: '🌱',
      cycle: '🔁',
      compare: '⚖️',
      idea: '💡',
      check: '✅',
      book: '📘'
    };
    const layouts = ['hero', 'split', 'orbit', 'timeline', 'comparison', 'stack', 'quiz'];
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
    function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
    function sceneAt(time) {
      let index = 0;
      for (let i = 0; i < sceneStarts.length; i += 1) {
        if (time >= sceneStarts[i]) index = i;
      }
      const scene = plan.scenes[index] || plan.scenes[0];
      const local = time - sceneStarts[index];
      const p = clamp(local / Math.max(.001, scene.durationSec), 0, 1);
      return { scene, index, p };
    }
    function shortText(text, max) {
      const value = String(text || '').trim();
      return value.length > max ? value.slice(0, max - 1).trim() + '…' : value;
    }
    function smartLabel(text, maxWords) {
      const words = String(text || '').replace(/[.,!?;:]/g, '').split(/\\s+/).filter(Boolean);
      if (words.length <= maxWords) return words.join(' ');
      return words.slice(0, maxWords).join(' ');
    }
    function displayTitle(scene, index) {
      const rawTitle = String(scene.title || '').trim();
      const normalized = rawTitle.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
      if (index === 0 && ['mo van de', 'mo dau', 'gioi thieu', 'hook'].includes(normalized)) {
        return scene.onscreenText || plan.title;
      }
      return rawTitle || scene.onscreenText || plan.title;
    }
    function dataPoints(scene) {
      if (Array.isArray(scene.dataPoints) && scene.dataPoints.length) {
        return [scene.dataPoints[0], scene.dataPoints[1] || scene.title, scene.dataPoints[2] || 'Ghi nhớ'];
      }
      const words = String(scene.onscreenText || scene.title || '').replace(/[.,!?;:]/g, '').split(/\\s+/).filter(Boolean);
      return [
        words.slice(0, 3).join(' ') || 'Ý chính',
        words.slice(3, 6).join(' ') || 'Ví dụ',
        words.slice(6, 9).join(' ') || 'Ghi nhớ'
      ];
    }
    function pickLayout(scene, index) {
      return scene.layout || (visualSystem.sceneLayouts || layouts)[index % (visualSystem.sceneLayouts || layouts).length] || 'hero';
    }
    function applyCharacter(index) {
      const character = characterCast[index % characterCast.length] || characterCast[0];
      const stage = document.getElementById('stage');
      stage.dataset.character = character.id || 'character';
      stage.dataset.hair = character.hairStyle || 'long';
      stage.dataset.accessory = character.accessory || 'none';
      stage.style.setProperty('--character-skin', character.skin || '#ffd6c9');
      stage.style.setProperty('--character-hair', character.hair || '#202033');
      stage.style.setProperty('--character-outfit', character.outfit || '#8fd8c8');
      stage.style.setProperty('--character-accent', character.accent || '#e11d48');
      document.getElementById('emojiCharacter').textContent = character.emoji || '👩‍🏫';
      document.getElementById('propEmoji').textContent = propEmojiMap[(plan.scenes[index] || {}).icon] || character.prop || '💡';
    }
    window.setAnimationFrame = function setAnimationFrame(time) {
      const state = sceneAt(clamp(time, 0, total));
      const { scene, index, p } = state;
      const enter = ease(Math.min(1, p * 3.2));
      const bob = Math.sin((p * Math.PI * 2) + index * .7);
      const hand = Math.sin((p * Math.PI * 4) + index);
      const tilt = Math.sin((p * Math.PI * 2) + index * .3) * 1.6;
      const root = document.documentElement;
      root.style.setProperty('--p', clamp(time / total, 0, 1).toFixed(4));
      root.style.setProperty('--scene-p', p.toFixed(4));
      root.style.setProperty('--enter', enter.toFixed(4));
      root.style.setProperty('--bob', bob.toFixed(4));
      root.style.setProperty('--hand', hand.toFixed(4));
      root.style.setProperty('--tilt', tilt.toFixed(4));

      const stage = document.getElementById('stage');
      stage.dataset.layout = pickLayout(scene, index);
      applyCharacter(index);
      document.getElementById('sceneCounter').textContent = String(index + 1).padStart(2, '0') + '/' + String(plan.scenes.length).padStart(2, '0');
      document.getElementById('headline').textContent = shortText(displayTitle(scene, index), 32);
      document.getElementById('keyword').textContent = smartLabel(scene.onscreenText || iconMap[scene.icon] || scene.title, 5);
      const subtitle = document.getElementById('subtitle');
      const subtitleText = shortText(scene.voiceover || scene.onscreenText || scene.title, 135);
      subtitle.textContent = subtitleText;
      subtitle.classList.toggle('compact', subtitleText.length > 92);
      const points = dataPoints(scene);
      document.getElementById('dataOne').textContent = shortText(points[0], 18);
      document.getElementById('dataTwo').textContent = shortText(points[1], 18);
      document.getElementById('dataThree').textContent = shortText(points[2], 18);
      document.getElementById('propLabel').textContent = shortText(scene.visual || scene.title, 22);
    };
    window.setAnimationFrame(0);
    let start;
    function loop(ts) {
      if (window.__HAGENT_RENDERING) return;
      if (!start) start = ts;
      const time = ((ts - start) / 1000) % total;
      window.setAnimationFrame(time);
      requestAnimationFrame(loop);
    }
    if (!window.__HAGENT_RENDERING) requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}

export function buildAnimationHtml(planInput = {}, options = {}) {
  const plan = normalizePlan(planInput, planInput);
  const format = normalizeFormat(options.format || plan.format);
  const { width, height } = dimensionsForFormat(format);
  const visualSystem = plan.visualSystem || buildVisualSystem({}, plan);
  const palette = visualSystem.palette || PALETTE_PRESETS[0];
  const [accent, secondary, highlight, ink, paper] = palette;
  const motifClass = `motif-${normalizeMotif(visualSystem.motif)}`;
  const htmlSeed = visualSystem.seed || safeSlug(`${plan.title}-${randomUUID().slice(0, 6)}`);
  const visualHash = hashString(htmlSeed);
  const textureSize = 30 + (visualHash % 28);
  const shapeRadius = 18 + (visualHash % 24);
  const stageAngle = 115 + (visualHash % 55);
  const sceneStarts = [];
  let cursor = 0;
  for (const scene of plan.scenes) {
    sceneStarts.push(cursor);
    cursor += scene.durationSec;
  }

  return buildIllustrationAnimationHtml({
    plan,
    format,
    width,
    height,
    sceneStarts,
    visualSystem,
    palette,
    htmlSeed,
  });

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(plan.title)}</title>
  <!-- HAgent unique HTML visual system: ${escapeHtml(htmlSeed)} / ${escapeHtml(visualSystem.motif)} -->
  <style>
    :root {
      --w: ${width}px;
      --h: ${height}px;
      --p: 0;
      --scene-p: 0;
      --accent: ${accent};
      --mint: ${secondary};
      --orange: ${highlight};
      --ink: ${ink};
      --muted: #64748b;
      --paper: ${paper};
      --bg: ${paper};
      --texture-size: ${textureSize}px;
      --shape-radius: ${shapeRadius}px;
      --stage-angle: ${stageAngle}deg;
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #dbeafe;
    }
    body {
      display: grid;
      place-items: center;
    }
    .stage {
      position: relative;
      width: var(--w);
      height: var(--h);
      overflow: hidden;
      isolation: isolate;
      background:
        linear-gradient(var(--stage-angle), color-mix(in srgb, var(--paper) 90%, white), color-mix(in srgb, var(--accent) 10%, var(--paper)) 42%, color-mix(in srgb, var(--orange) 12%, var(--paper)) 100%);
      color: var(--ink);
    }
    .noise {
      position: absolute;
      inset: 0;
      opacity: .18;
      background-image:
        linear-gradient(90deg, rgba(15,23,42,.05) 1px, transparent 1px),
        linear-gradient(0deg, rgba(15,23,42,.05) 1px, transparent 1px);
      background-size: var(--texture-size) var(--texture-size);
      transform: translate3d(calc(var(--p) * -24px), calc(var(--p) * 18px), 0);
      z-index: -2;
    }
    .orb {
      position: absolute;
      border-radius: 999px;
      filter: blur(1px);
      opacity: .92;
      z-index: -1;
    }
    .orb.a {
      width: 27%;
      aspect-ratio: 1;
      left: -8%;
      top: 9%;
      background: rgba(37,99,235,.14);
      transform: translate3d(calc(var(--p) * 44px), calc(var(--p) * -16px), 0);
    }
    .orb.b {
      width: 23%;
      aspect-ratio: 1;
      right: -6%;
      bottom: 12%;
      background: rgba(16,185,129,.16);
      transform: translate3d(calc(var(--p) * -38px), calc(var(--p) * 22px), 0);
    }
    .motif-lab .noise {
      opacity: .24;
      background-image:
        linear-gradient(120deg, color-mix(in srgb, var(--accent) 16%, transparent) 1px, transparent 1px),
        linear-gradient(0deg, rgba(15,23,42,.045) 1px, transparent 1px);
    }
    .motif-map .noise {
      opacity: .22;
      background-image:
        repeating-linear-gradient(35deg, rgba(15,23,42,.045) 0 2px, transparent 2px 22px),
        repeating-linear-gradient(145deg, color-mix(in srgb, var(--mint) 14%, transparent) 0 2px, transparent 2px 26px);
    }
    .motif-dashboard .noise {
      opacity: .16;
      background-size: calc(var(--texture-size) * 1.4) calc(var(--texture-size) * .82);
    }
    .motif-storybook .noise {
      opacity: .2;
      background-image:
        radial-gradient(circle at 20% 20%, rgba(15,23,42,.05) 0 2px, transparent 3px),
        linear-gradient(0deg, rgba(15,23,42,.035) 1px, transparent 1px);
    }
    .motif-space .stage,
    .stage.motif-space {
      background:
        radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--mint) 24%, transparent), transparent 25%),
        linear-gradient(var(--stage-angle), color-mix(in srgb, var(--ink) 92%, #1e293b), color-mix(in srgb, var(--accent) 30%, #020617));
      color: white;
      --muted: rgba(255,255,255,.72);
    }
    .motif-chalk .stage,
    .stage.motif-chalk {
      background:
        linear-gradient(var(--stage-angle), #12322f, #16251e 54%, #233712);
      color: white;
      --muted: rgba(255,255,255,.72);
    }
    .layout {
      position: absolute;
      inset: 6.2%;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 4.6%;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      color: var(--muted);
      font-size: clamp(17px, calc(var(--w) * .025), 26px);
      font-weight: 750;
    }
    .pill {
      min-width: 88px;
      padding: .65em 1em;
      border-radius: 999px;
      background: rgba(255,255,255,.82);
      border: 1px solid rgba(148,163,184,.24);
      box-shadow: 0 18px 42px rgba(15,23,42,.08);
      text-align: center;
    }
    .lesson {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card {
      position: relative;
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-height: 0;
      padding: clamp(28px, calc(var(--w) * .055), 72px);
      border-radius: clamp(18px, calc(var(--shape-radius) + var(--w) * .012), 46px);
      background: rgba(255,255,255,.86);
      border: 1px solid rgba(148,163,184,.18);
      box-shadow: 0 34px 80px rgba(15,23,42,.12);
      backdrop-filter: blur(18px);
    }
    .card::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      height: 9px;
      background: linear-gradient(90deg, var(--accent), var(--mint), var(--orange));
      opacity: .95;
    }
    .lower-third {
      position: absolute;
      left: clamp(24px, calc(var(--w) * .05), 62px);
      bottom: clamp(22px, calc(var(--h) * .038), 48px);
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 56%;
      padding: .72em 1em;
      border-radius: 999px;
      background: rgba(255,255,255,.78);
      border: 1px solid rgba(148,163,184,.22);
      color: #334155;
      font-size: clamp(15px, calc(var(--w) * .024), 24px);
      font-weight: 800;
      box-shadow: 0 18px 42px rgba(15,23,42,.08);
    }
    .lower-third-dot {
      width: .8em;
      height: .8em;
      border-radius: 999px;
      background: linear-gradient(145deg, var(--accent), var(--mint));
      box-shadow: 0 0 0 .35em color-mix(in srgb, var(--accent) 16%, transparent);
    }
    .scene-title {
      margin: 0;
      max-width: 92%;
      color: var(--ink);
      font-size: clamp(40px, calc(var(--w) * .076), 78px);
      line-height: 1.02;
      letter-spacing: 0;
      font-weight: 850;
      transform: translateY(calc((1 - var(--scene-p)) * 22px));
      opacity: calc(.25 + var(--scene-p) * .75);
    }
    .visual {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 0;
    }
    .icon-wrap {
      position: absolute;
      top: 0;
      right: 0;
      width: clamp(86px, calc(var(--w) * .17), 148px);
      aspect-ratio: 1;
      border-radius: clamp(18px, calc(var(--shape-radius) * 1.2), 42%);
      display: grid;
      place-items: center;
      color: white;
      font-size: clamp(38px, calc(var(--w) * .085), 74px);
      font-weight: 900;
      background: linear-gradient(145deg, var(--accent), var(--mint));
      box-shadow: 0 24px 54px color-mix(in srgb, var(--accent) 28%, transparent);
      transform: rotate(calc((var(--scene-p) - .5) * 11deg)) scale(calc(.86 + var(--scene-p) * .14));
    }
    .scene-0 .icon-wrap { --accent: ${accent}; }
    .scene-1 .icon-wrap { --accent: ${secondary}; }
    .scene-2 .icon-wrap { --accent: ${highlight}; }
    .scene-3 .icon-wrap { --accent: ${accent}; }
    .scene-4 .icon-wrap { --accent: ${secondary}; }
    .diagram {
      position: relative;
      width: min(82%, 690px);
      aspect-ratio: 1.45;
      display: grid;
      place-items: center;
    }
    .topic-node {
      position: absolute;
      width: 32%;
      aspect-ratio: 1;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: linear-gradient(145deg, var(--accent), var(--mint));
      color: white;
      box-shadow: 0 30px 70px color-mix(in srgb, var(--accent) 26%, transparent);
      transform: translateY(calc(sin(var(--scene-p) * 6.28318) * 12px)) scale(calc(.88 + var(--scene-p) * .12));
    }
    .topic-node::before,
    .topic-node::after {
      content: "";
      position: absolute;
      inset: -22%;
      border-radius: inherit;
      border: 3px solid color-mix(in srgb, var(--accent) 20%, transparent);
      transform: scale(calc(.85 + var(--scene-p) * .35));
      opacity: calc(.65 - var(--scene-p) * .28);
    }
    .topic-node::after {
      inset: -38%;
      border-color: color-mix(in srgb, var(--mint) 20%, transparent);
      transform: scale(calc(.75 + var(--scene-p) * .5));
    }
    .topic-icon {
      font-size: clamp(58px, calc(var(--w) * .13), 116px);
      font-weight: 900;
      line-height: 1;
    }
    .mini-card {
      position: absolute;
      width: 32%;
      min-height: 26%;
      display: grid;
      place-items: center;
      padding: 18px;
      border-radius: clamp(18px, calc(var(--shape-radius) * .95), 34px);
      background: white;
      border: 1px solid rgba(148,163,184,.28);
      box-shadow: 0 20px 46px rgba(15,23,42,.1);
      color: var(--ink);
      font-size: clamp(20px, calc(var(--w) * .037), 36px);
      font-weight: 850;
      text-align: center;
      line-height: 1.08;
    }
    .mini-card.one {
      left: 0;
      top: 5%;
      transform: translateX(calc((1 - min(1, var(--scene-p) * 3)) * -42px));
      opacity: min(1, var(--scene-p) * 3);
    }
    .mini-card.two {
      right: 0;
      top: 35%;
      transform: translateX(calc((1 - max(0, min(1, var(--scene-p) * 3 - .8))) * 42px));
      opacity: max(0, min(1, var(--scene-p) * 3 - .8));
    }
    .mini-card.three {
      left: 16%;
      bottom: 0;
      transform: translateY(calc((1 - max(0, min(1, var(--scene-p) * 3 - 1.6))) * 42px));
      opacity: max(0, min(1, var(--scene-p) * 3 - 1.6));
    }
    .metric-strip {
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 3%;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: clamp(10px, calc(var(--w) * .02), 20px);
    }
    .metric {
      min-height: clamp(64px, calc(var(--h) * .07), 94px);
      display: grid;
      place-items: center;
      border-radius: 22px;
      background: rgba(15,23,42,.88);
      color: white;
      font-size: clamp(16px, calc(var(--w) * .028), 28px);
      font-weight: 900;
      transform: translateY(calc((1 - var(--scene-p)) * 22px));
      opacity: calc(.2 + var(--scene-p) * .8);
    }
    .caption {
      align-self: end;
      margin: 0;
      min-height: 3.2em;
      display: grid;
      place-items: center;
      padding: .75em 1.05em;
      border-radius: clamp(18px, calc(var(--w) * .032), 30px);
      background: color-mix(in srgb, var(--accent) 11%, white);
      color: color-mix(in srgb, var(--accent) 82%, #111827);
      font-size: clamp(28px, calc(var(--w) * .049), 50px);
      line-height: 1.12;
      font-weight: 850;
      text-align: center;
      transform: translateY(calc((1 - var(--scene-p)) * 18px));
    }
    .progress {
      height: 10px;
      border-radius: 999px;
      background: rgba(148,163,184,.28);
      overflow: hidden;
    }
    .progress > span {
      display: block;
      width: calc(var(--p) * 100%);
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), var(--mint), var(--orange));
    }
    .card[data-layout="split"] {
      grid-template-columns: .85fr 1.15fr;
      grid-template-rows: auto 1fr;
      column-gap: 5%;
    }
    .card[data-layout="split"] .scene-title,
    .card[data-layout="split"] .caption { grid-column: 1; }
    .card[data-layout="split"] .visual { grid-column: 2; grid-row: 1 / span 3; }
    .card[data-layout="timeline"] .diagram {
      width: min(92%, 760px);
      aspect-ratio: 2.4;
    }
    .card[data-layout="timeline"] .topic-node {
      left: 4%;
      width: 24%;
    }
    .card[data-layout="timeline"] .mini-card.one { left: 28%; top: 26%; }
    .card[data-layout="timeline"] .mini-card.two { left: 50%; top: 26%; right: auto; }
    .card[data-layout="timeline"] .mini-card.three { left: 72%; top: 26%; bottom: auto; }
    .card[data-layout="comparison"] .diagram {
      width: min(90%, 720px);
      aspect-ratio: 1.75;
    }
    .card[data-layout="comparison"] .topic-node { width: 24%; }
    .card[data-layout="comparison"] .mini-card.one { left: 2%; top: 22%; min-height: 40%; }
    .card[data-layout="comparison"] .mini-card.two { right: 2%; top: 22%; min-height: 40%; }
    .card[data-layout="comparison"] .mini-card.three { left: 34%; bottom: 0; }
    .card[data-layout="orbit"] .mini-card {
      border-radius: 999px;
    }
    .card[data-layout="orbit"] .mini-card.one { left: 3%; top: 14%; }
    .card[data-layout="orbit"] .mini-card.two { right: 4%; top: 14%; }
    .card[data-layout="orbit"] .mini-card.three { left: 34%; bottom: 0; }
    .card[data-layout="stack"] .diagram {
      aspect-ratio: 1.05;
    }
    .card[data-layout="stack"] .mini-card.one,
    .card[data-layout="stack"] .mini-card.two,
    .card[data-layout="stack"] .mini-card.three {
      left: 7%;
      right: auto;
      width: 86%;
      min-height: 18%;
    }
    .card[data-layout="stack"] .mini-card.one { top: 10%; }
    .card[data-layout="stack"] .mini-card.two { top: 36%; }
    .card[data-layout="stack"] .mini-card.three { top: 62%; bottom: auto; }
    .card[data-layout="quiz"] .caption {
      background: color-mix(in srgb, var(--orange) 18%, white);
      color: color-mix(in srgb, var(--orange) 78%, #111827);
    }
    .card[data-layout="quiz"] .topic-node {
      border-radius: 28%;
      transform: rotate(calc((var(--scene-p) - .5) * 8deg)) scale(calc(.9 + var(--scene-p) * .1));
    }
    .channel-mark {
      position: absolute;
      right: 6.2%;
      bottom: 5.2%;
      padding: .58em .84em;
      border-radius: 999px;
      background: rgba(17,24,39,.78);
      color: #fff;
      font-size: clamp(16px, calc(var(--w) * .026), 25px);
      font-weight: 850;
      letter-spacing: 0;
      box-shadow: 0 18px 42px rgba(15,23,42,.18);
    }
    .wide .layout { inset: 5.2%; }
    .wide .card {
      grid-template-columns: .9fr 1.1fr;
      grid-template-rows: auto 1fr;
      column-gap: 4%;
      align-items: stretch;
    }
    .wide .scene-title { grid-column: 1; align-self: end; }
    .wide .visual { grid-column: 2; grid-row: 1 / span 2; }
    .wide .caption { grid-column: 1; align-self: start; }
    .square .diagram { width: min(78%, 720px); }
  </style>
</head>
<body>
  <main class="stage ${motifClass} ${format === '16:9' ? 'wide' : format === '1:1' ? 'square' : 'vertical'}" id="stage">
    <div class="noise"></div>
    <div class="orb a"></div>
    <div class="orb b"></div>
    <div class="layout">
      <header class="topbar">
        <div class="lesson">${escapeHtml(plan.channel || DEFAULT_CHANNEL)}</div>
        <div class="pill" id="sceneCounter">1/${plan.scenes.length}</div>
      </header>
      <section class="card scene-0" id="card" data-layout="${escapeHtml(plan.scenes[0]?.layout || visualSystem.sceneLayouts[0] || 'hero')}">
        <h1 class="scene-title" id="sceneTitle">${escapeHtml(plan.scenes[0]?.title || plan.title)}</h1>
        <div class="visual">
          <div class="icon-wrap" id="iconWrap">✦</div>
          <div class="diagram">
            <div class="topic-node"><span class="topic-icon" id="topicIcon">✦</span></div>
            <div class="mini-card one" id="cardOne">Bắt đầu</div>
            <div class="mini-card two" id="cardTwo">Thay đổi</div>
            <div class="mini-card three" id="cardThree">Kết quả</div>
            <div class="metric-strip">
              <div class="metric" id="metricOne">01</div>
              <div class="metric" id="metricTwo">02</div>
              <div class="metric" id="metricThree">03</div>
            </div>
          </div>
        </div>
        <p class="caption" id="caption">${escapeHtml(plan.scenes[0]?.onscreenText || plan.title)}</p>
        <div class="lower-third"><span class="lower-third-dot"></span><span id="lowerThird">${escapeHtml(plan.objective)}</span></div>
      </section>
      <div class="progress"><span></span></div>
    </div>
    <div class="channel-mark">${escapeHtml(plan.channel || DEFAULT_CHANNEL)}</div>
  </main>
  <script>
    const plan = ${safeJsonForHtml(plan)};
    const visualSystem = ${safeJsonForHtml(visualSystem)};
    const sceneStarts = ${safeJsonForHtml(sceneStarts)};
    const total = ${plan.durationSec};
    const iconMap = {
      spark: '✦',
      seed: '●',
      cycle: '↻',
      compare: '⇄',
      idea: '!',
      check: '✓',
      book: 'A'
    };
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
    function sceneAt(time) {
      let index = 0;
      for (let i = 0; i < sceneStarts.length; i += 1) {
        if (time >= sceneStarts[i]) index = i;
      }
      const scene = plan.scenes[index] || plan.scenes[0];
      const local = time - sceneStarts[index];
      const p = clamp(local / Math.max(.001, scene.durationSec), 0, 1);
      return { scene, index, p };
    }
    function words(text) {
      const list = String(text || '').replace(/[.,!?;:]/g, '').split(/\\s+/).filter(Boolean);
      if (list.length <= 3) return ['Bắt đầu', 'Thay đổi', 'Kết quả'];
      return [list.slice(0, 2).join(' '), list.slice(2, 4).join(' '), list.slice(4, 6).join(' ') || 'Kết quả'];
    }
    function sceneWords(scene) {
      if (Array.isArray(scene.dataPoints) && scene.dataPoints.length) {
        return [scene.dataPoints[0] || 'Ý 1', scene.dataPoints[1] || 'Ý 2', scene.dataPoints[2] || 'Ý 3'];
      }
      return words(scene.onscreenText || scene.visualMetaphor || scene.title);
    }
    function pickLayout(index) {
      const layouts = visualSystem.sceneLayouts || ['hero', 'split', 'orbit', 'timeline', 'comparison', 'stack', 'quiz'];
      return layouts[index % layouts.length] || 'hero';
    }
    window.setAnimationFrame = function setAnimationFrame(time) {
      const root = document.documentElement;
      const state = sceneAt(clamp(time, 0, total));
      const { scene, index, p } = state;
      root.style.setProperty('--p', clamp(time / total, 0, 1).toFixed(4));
      root.style.setProperty('--scene-p', p.toFixed(4));
      const card = document.getElementById('card');
      card.className = 'card scene-' + (index % 5);
      card.dataset.layout = scene.layout || pickLayout(index);
      document.getElementById('sceneTitle').textContent = scene.title;
      document.getElementById('caption').textContent = scene.onscreenText || scene.voiceover || scene.title;
      document.getElementById('sceneCounter').textContent = (index + 1) + '/' + plan.scenes.length;
      const icon = iconMap[scene.icon] || iconMap[pickIcon(index)] || '✦';
      document.getElementById('iconWrap').textContent = icon;
      document.getElementById('topicIcon').textContent = icon;
      const w = sceneWords(scene);
      document.getElementById('cardOne').textContent = w[0] || 'Bắt đầu';
      document.getElementById('cardTwo').textContent = w[1] || 'Thay đổi';
      document.getElementById('cardThree').textContent = w[2] || 'Kết quả';
      document.getElementById('metricOne').textContent = String(index + 1).padStart(2, '0');
      document.getElementById('metricTwo').textContent = Math.round((p || .01) * 100) + '%';
      document.getElementById('metricThree').textContent = scene.icon === 'compare' ? 'A/B' : 'KEY';
      document.getElementById('lowerThird').textContent = scene.visual || plan.objective;
    };
    function pickIcon(index) {
      return ['spark', 'seed', 'cycle', 'idea', 'check', 'book'][index % 6];
    }
    window.setAnimationFrame(0);
    let start;
    function loop(ts) {
      if (!start) start = ts;
      const time = ((ts - start) / 1000) % total;
      window.setAnimationFrame(time);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}

function formatTimestamp(seconds, srt = false) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const sec = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const sep = srt ? ',' : '.';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

function buildSrt(plan) {
  let cursor = 0;
  return plan.scenes.map((scene, index) => {
    const start = cursor;
    const end = cursor + scene.durationSec;
    cursor = end;
    return `${index + 1}\n${formatTimestamp(start, true)} --> ${formatTimestamp(end, true)}\n${scene.voiceover || scene.onscreenText}\n`;
  }).join('\n');
}

function csvEscape(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function buildShotList(plan) {
  const rows = [['Start', 'End', 'Scene', 'Voiceover', 'Visual', 'Motion', 'Edit note']];
  let cursor = 0;
  for (const scene of plan.scenes) {
    const start = cursor;
    const end = cursor + scene.durationSec;
    cursor = end;
    rows.push([
      formatTimestamp(start),
      formatTimestamp(end),
      scene.title,
      scene.voiceover,
      scene.visual,
      scene.motion,
      scene.editNote,
    ]);
  }
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

function buildEditReadme(plan) {
  return [
    `Title: ${plan.title}`,
    `Objective: ${plan.objective}`,
    `Channel: ${safeChannel(plan.channel)}`,
    '',
    'Edit workflow:',
    '1. Review video.mp4 and captions.srt.',
    '2. Tighten pauses and keep one idea per cut.',
    '3. Apply captions, teacher intro/outro, and optional b-roll.',
    '4. Export 9:16 for Reels/Shorts or 16:9 for classroom display.',
    '5. Use youtube-description.txt and tiktok-caption.txt for publishing metadata.',
    '',
    `Edit goal: ${plan.editing?.editGoal || ''}`,
    `Caption style: ${plan.editing?.captionStyle || ''}`,
    '',
    'Suggested b-roll:',
    ...(plan.editing?.broll || []).map(item => `- ${item}`),
  ].join('\n');
}

function slugWords(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3)
    .slice(0, 5);
}

function buildPublishMetadata(plan) {
  const topicTags = slugWords(`${plan.title} ${plan.objective}`);
  const hashtags = Array.from(new Set(['giaoduc', 'hoctap', 'kienthuc', ...topicTags]))
    .slice(0, 8)
    .map(tag => `#${tag}`);
  const channel = safeChannel(plan.channel);
  const summary = plan.scenes.map((scene, index) => `${index + 1}. ${scene.title}: ${scene.voiceover}`).join('\n');
  const youtubeTitle = plan.title.slice(0, 95);
  const youtubeDescription = [
    plan.objective,
    '',
    `Kênh: ${channel}`,
    '',
    'Nội dung chính:',
    summary,
    '',
    hashtags.join(' '),
  ].join('\n');
  const tiktokCaption = `${plan.title}\n${plan.objective}\n${channel}\n${hashtags.slice(0, 6).join(' ')}`.slice(0, 2200);

  return {
    youtubeTitle,
    youtubeDescription,
    youtubeTags: hashtags.map(tag => tag.slice(1)).join(', '),
    tiktokCaption,
    hashtags,
    recommendedFormats: {
      youtube: plan.format === '16:9' ? '16:9 long-form' : '9:16 YouTube Shorts',
      tiktok: '9:16 vertical MP4, caption under 2200 chars',
    },
  };
}

async function runFfmpeg(args) {
  const ffmpeg = resolveFfmpeg();
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-1000) || `ffmpeg exited with code ${code}`));
    });
  });
}

async function normalizeSceneAudio({ inputPath, outPath, durationSec }) {
  if (inputPath) {
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-af', `apad,atrim=0:${durationSec}`,
      '-t', String(durationSec),
      '-ar', '44100',
      '-ac', '2',
      '-c:a', 'mp3',
      outPath,
    ]);
    return outPath;
  }

  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(durationSec),
    '-c:a', 'mp3',
    outPath,
  ]);
  return outPath;
}

async function buildNarrationTrack(plan, { voice = 'hoaimy', workDir, outDir }) {
  const tempFiles = [];
  const sceneAudioPaths = [];

  for (let i = 0; i < plan.scenes.length; i += 1) {
    const scene = plan.scenes[i];
    let rawTts = null;
    try {
      rawTts = await ttsVietnamese(scene.voiceover || scene.onscreenText || scene.title, resolveVoice(voice));
      if (rawTts) tempFiles.push(rawTts);
    } catch (err) {
      console.warn('[education-animation] TTS fallback silence:', err.message);
    }

    const normalized = path.join(workDir, `scene-audio-${String(i + 1).padStart(2, '0')}.mp3`);
    await normalizeSceneAudio({
      inputPath: rawTts,
      outPath: normalized,
      durationSec: scene.durationSec,
    });
    sceneAudioPaths.push(normalized);
  }

  const listPath = path.join(workDir, 'audio-list.txt');
  fs.writeFileSync(listPath, sceneAudioPaths.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const narrationPath = path.join(outDir, 'voiceover.mp3');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', narrationPath]);
  tempFiles.forEach(file => {
    try { fs.unlinkSync(file); } catch {}
  });
  return narrationPath;
}

async function muxVoiceover(videoPath, audioPath, outPath) {
  await runFfmpeg([
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    outPath,
  ]);
  return outPath;
}

async function renderHtmlFrames({ html, framesDir, width, height, durationSec }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.addInitScript(() => {
      window.__HAGENT_RENDERING = true;
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.__HAGENT_RENDERING = true;
    });
    const totalFrames = Math.max(1, Math.round(durationSec * FPS));
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const time = frame / FPS;
      await page.evaluate(t => window.setAnimationFrame(t), time);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      await page.screenshot({
        path: path.join(framesDir, `frame-${String(frame + 1).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 90,
        animations: 'disabled',
      });
    }
  } finally {
    await browser.close();
  }
}

export async function renderEducationAnimation(planInput = {}, options = {}) {
  ensureUploadDir();
  const plan = normalizePlan(planInput, planInput);
  const format = normalizeFormat(options.format || plan.format);
  const { width, height } = dimensionsForFormat(format);
  const id = `edu-animation-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outDir = path.join(uploadDir, id);
  const framesDir = path.join(os.tmpdir(), id);
  const workDir = path.join(os.tmpdir(), `${id}-audio`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const html = buildAnimationHtml(plan, { format });
  const metadata = buildPublishMetadata(plan);
  const includeTts = options.includeTts !== false;
  const voice = options.voice || 'hoaimy';

  try {
    fs.writeFileSync(path.join(outDir, 'preview.html'), html, 'utf8');
    fs.writeFileSync(path.join(outDir, 'captions.srt'), buildSrt(plan), 'utf8');
    fs.writeFileSync(path.join(outDir, 'shot-list.csv'), buildShotList(plan), 'utf8');
    fs.writeFileSync(path.join(outDir, 'edit-readme.txt'), buildEditReadme(plan), 'utf8');
    fs.writeFileSync(path.join(outDir, 'storyboard.json'), JSON.stringify(plan, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'youtube-description.txt'), metadata.youtubeDescription, 'utf8');
    fs.writeFileSync(path.join(outDir, 'tiktok-caption.txt'), metadata.tiktokCaption, 'utf8');

    await renderHtmlFrames({ html, framesDir, width, height, durationSec: plan.durationSec });

    const visualVideoPath = path.join(outDir, includeTts ? 'visual-only.mp4' : 'video.mp4');
    await runFfmpeg([
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(framesDir, 'frame-%05d.jpg'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      visualVideoPath,
    ]);

    let finalVideoPath = visualVideoPath;
    let audioFile = null;
    if (includeTts) {
      const narrationPath = await buildNarrationTrack(plan, { voice, workDir, outDir });
      finalVideoPath = path.join(outDir, 'video.mp4');
      await muxVoiceover(visualVideoPath, narrationPath, finalVideoPath);
      audioFile = `${id}/voiceover.mp3`;
    }

    return {
      id,
      plan,
      html,
      metadata,
      files: {
        video: `${id}/video.mp4`,
        visualVideo: includeTts ? `${id}/visual-only.mp4` : `${id}/video.mp4`,
        audio: audioFile,
        html: `${id}/preview.html`,
        captions: `${id}/captions.srt`,
        shotList: `${id}/shot-list.csv`,
        readme: `${id}/edit-readme.txt`,
        storyboard: `${id}/storyboard.json`,
        youtubeDescription: `${id}/youtube-description.txt`,
        tiktokCaption: `${id}/tiktok-caption.txt`,
      },
      meta: {
        fps: FPS,
        width,
        height,
        durationSec: plan.durationSec,
        renderer: 'html-css-playwright',
        voice,
        includeTts,
      },
    };
  } finally {
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getDirSizeBytes(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return sum + getDirSizeBytes(fullPath);
      if (entry.isFile()) return sum + fs.statSync(fullPath).size;
      return sum;
    }, 0);
  } catch {
    return 0;
  }
}

function safeAnimationRunId(id) {
  const base = path.basename(String(id || '').trim());
  return /^edu-animation-\d+-[a-z0-9-]+$/i.test(base) ? base : '';
}

function resolveAnimationRunDir(id) {
  const safeId = safeAnimationRunId(id);
  if (!safeId) return null;
  const fullPath = path.resolve(uploadDir, safeId);
  if (!fullPath.startsWith(`${uploadDir}${path.sep}`)) return null;
  return fullPath;
}

function fileIfExists(id, dir, fileName) {
  return fs.existsSync(path.join(dir, fileName)) ? `${id}/${fileName}` : null;
}

function readAnimationRun(id) {
  const dir = resolveAnimationRunDir(id);
  if (!dir || !fs.existsSync(dir)) return null;

  const stat = fs.statSync(dir);
  const plan = readJsonFile(path.join(dir, 'storyboard.json')) || {};
  const format = normalizeFormat(plan.format);
  const { width, height } = dimensionsForFormat(format);
  const ts = Number(String(id).match(/^edu-animation-(\d+)-/)?.[1]);
  const createdAt = Number.isFinite(ts) ? new Date(ts).toISOString() : stat.mtime.toISOString();
  const videoPath = path.join(dir, 'video.mp4');

  return {
    id,
    title: plan.title || id,
    channel: safeChannel(plan.channel),
    createdAt,
    updatedAt: stat.mtime.toISOString(),
    sizeBytes: getDirSizeBytes(dir),
    videoSizeBytes: fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0,
    plan,
    files: {
      video: fileIfExists(id, dir, 'video.mp4'),
      visualVideo: fileIfExists(id, dir, 'visual-only.mp4') || fileIfExists(id, dir, 'video.mp4'),
      audio: fileIfExists(id, dir, 'voiceover.mp3'),
      html: fileIfExists(id, dir, 'preview.html'),
      captions: fileIfExists(id, dir, 'captions.srt'),
      shotList: fileIfExists(id, dir, 'shot-list.csv'),
      readme: fileIfExists(id, dir, 'edit-readme.txt'),
      storyboard: fileIfExists(id, dir, 'storyboard.json'),
      youtubeDescription: fileIfExists(id, dir, 'youtube-description.txt'),
      tiktokCaption: fileIfExists(id, dir, 'tiktok-caption.txt'),
    },
    meta: {
      fps: FPS,
      width,
      height,
      durationSec: plan.durationSec || 0,
      renderer: 'html-css-playwright',
      voice: 'unknown',
      includeTts: fs.existsSync(path.join(dir, 'voiceover.mp3')),
    },
  };
}

export function listEducationAnimationRuns({ limit = 50 } = {}) {
  ensureUploadDir();
  const max = Math.max(1, Math.min(200, Number(limit) || 50));
  return fs.readdirSync(uploadDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && safeAnimationRunId(entry.name))
    .map(entry => readAnimationRun(entry.name))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, max);
}

export function deleteEducationAnimationRun(id) {
  const dir = resolveAnimationRunDir(id);
  if (!dir || !fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
