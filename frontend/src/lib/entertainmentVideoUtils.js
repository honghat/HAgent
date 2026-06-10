import {
  Banknote,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Camera,
  Car,
  Code,
  Coffee,
  Dumbbell,
  Film,
  Gamepad2,
  GraduationCap,
  HandCoins,
  Heart,
  Home,
  Landmark,
  Languages,
  Music2,
  Newspaper,
  Palette,
  Plane,
  Rocket,
  Shapes,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Trophy,
  Utensils,
  WalletCards,
} from 'lucide-react'

export const VIDEO_LIBRARY_KEY = 'hagent_entertainment_videos'
export const VIDEO_PROGRESS_KEY = 'hagent_entertainment_video_progress'
export const FORCE_START_VIDEO_KEY = 'hagent_entertainment_force_start_video'
export const TTS_PREFETCH_AHEAD = 8
export const DEFAULT_VIDEO_VOLUME = 0.4
export const DEFAULT_YOUTUBE_VOLUME = 40
export const DEFAULT_YOUTUBE_QUALITY = 'hd2160'

const DIRECT_VIDEO_EXTS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v']
const TTS_MAX_CHARS = 420
const TTS_MAX_SEGMENTS = 8
const TTS_MAX_SPAN_SECONDS = 18
const TTS_CONTIGUOUS_GAP_SECONDS = 1.25
const NON_SPEECH_CUES = new Set([
  'music',
  'musics',
  'background music',
  'intro music',
  'outro music',
  'theme music',
  'music playing',
  'music continues',
  'instrumental',
  'song',
  'singing',
  'applause',
  'clapping',
  'cheering',
  'laughter',
  'laughs',
  'silence',
  'am nhac',
  'nhac',
  'tieng nhac',
  'nhac nen',
  'vo tay',
  'tieng vo tay',
  'cuoi',
  'tieng cuoi',
  'im lang',
])

export const VOICE_CHOICES = [
  { id: 'hoaimy', label: 'Hoài My', server: 'edge', voice: 'vi-VN-HoaiMyNeural' },
  { id: 'namminh', label: 'Nam Minh', server: 'edge', voice: 'vi-VN-NamMinhNeural' },
  { id: 'google', label: 'Google', server: 'google', voice: 'vi' },
  { id: 'linh', label: 'Linh', server: 'linh', voice: 'vi' },
]

export const VIDEO_CATEGORIES = [
  {
    id: 'travel',
    label: 'Du lịch',
    icon: Plane,
    selected: 'border-sky-300 bg-sky-50 text-sky-700 shadow-sm shadow-sky-100',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  {
    id: 'ai',
    label: 'AI',
    icon: Bot,
    selected: 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm shadow-teal-100',
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
  },
  {
    id: 'life',
    label: 'Cuộc sống',
    icon: Heart,
    selected: 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  {
    id: 'english',
    label: 'Tiếng Anh',
    icon: Languages,
    selected: 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  {
    id: 'other',
    label: 'Khác',
    icon: Shapes,
    selected: 'border-gray-300 bg-gray-100 text-gray-700 shadow-sm',
    badge: 'border-gray-200 bg-gray-100 text-gray-600',
  },
]
const CATEGORY_STYLES = [
  {
    selected: 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  {
    selected: 'border-amber-300 bg-amber-50 text-amber-700 shadow-sm shadow-amber-100',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  {
    selected: 'border-cyan-300 bg-cyan-50 text-cyan-700 shadow-sm shadow-cyan-100',
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  {
    selected: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 shadow-sm shadow-fuchsia-100',
    badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  },
  {
    selected: 'border-orange-300 bg-orange-50 text-orange-700 shadow-sm shadow-orange-100',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  {
    selected: 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  {
    selected: 'border-lime-300 bg-lime-50 text-lime-700 shadow-sm shadow-lime-100',
    badge: 'border-lime-200 bg-lime-50 text-lime-700',
  },
  {
    selected: 'border-pink-300 bg-pink-50 text-pink-700 shadow-sm shadow-pink-100',
    badge: 'border-pink-200 bg-pink-50 text-pink-700',
  },
  {
    selected: 'border-slate-300 bg-slate-100 text-slate-700 shadow-sm',
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
  },
]

const CUSTOM_CATEGORY_ICONS = [
  Sparkles,
  Rocket,
  Trophy,
  BookOpen,
  Camera,
  Film,
  Music2,
  Gamepad2,
  GraduationCap,
  BriefcaseBusiness,
  HandCoins,
  Coffee,
  Palette,
  Newspaper,
  Home,
  Car,
]

const CATEGORY_KEYWORD_ICONS = [
  { words: ['kiem tien', 'money', 'rich', 'tai chinh', 'finance', 'income', 'dau tu', 'kinh te'], icon: Banknote, style: CATEGORY_STYLES[0] },
  { words: ['kinh doanh', 'business', 'startup', 'cong viec', 'job', 'career', 'marketing', 'sales'], icon: BriefcaseBusiness, style: CATEGORY_STYLES[5] },
  { words: ['tiet kiem', 'vi tien', 'wallet', 'bank', 'ngan hang'], icon: WalletCards, style: CATEGORY_STYLES[1] },
  { words: ['hoc', 'study', 'learn', 'giao duc', 'khoa hoc', 'course'], icon: GraduationCap, style: CATEGORY_STYLES[2] },
  { words: ['sach', 'truyen', 'book', 'story', 'novel', 'doc'], icon: BookOpen, style: CATEGORY_STYLES[3] },
  { words: ['video', 'phim', 'film', 'movie', 'youtube', 'content'], icon: Film, style: CATEGORY_STYLES[4] },
  { words: ['code', 'lap trinh', 'dev', 'developer', 'software'], icon: Code, style: CATEGORY_STYLES[5] },
  { words: ['suc khoe', 'health', 'y te', 'medical'], icon: Stethoscope, style: CATEGORY_STYLES[6] },
  { words: ['the thao', 'sport', 'gym', 'fitness', 'tap'], icon: Dumbbell, style: CATEGORY_STYLES[7] },
  { words: ['nhac', 'music', 'song', 'audio'], icon: Music2, style: CATEGORY_STYLES[3] },
  { words: ['game', 'gaming'], icon: Gamepad2, style: CATEGORY_STYLES[4] },
  { words: ['anh', 'photo', 'camera', 'chup'], icon: Camera, style: CATEGORY_STYLES[2] },
  { words: ['an', 'food', 'nau an', 'cafe', 'coffee'], icon: Utensils, style: CATEGORY_STYLES[1] },
  { words: ['mua sam', 'shopping', 'shop'], icon: ShoppingBag, style: CATEGORY_STYLES[7] },
  { words: ['nha', 'home', 'family', 'gia dinh'], icon: Home, style: CATEGORY_STYLES[8] },
  { words: ['xe', 'car', 'oto', 'auto'], icon: Car, style: CATEGORY_STYLES[5] },
  { words: ['tin', 'news', 'bao', 'thoi su'], icon: Newspaper, style: CATEGORY_STYLES[8] },
  { words: ['nghe thuat', 'art', 'design', 'sang tao'], icon: Palette, style: CATEGORY_STYLES[3] },
  { words: ['chinh tri', 'luat', 'policy', 'government'], icon: Landmark, style: CATEGORY_STYLES[8] },
]

export function voiceMeta(id) {
  return VOICE_CHOICES.find(v => v.id === id) || VOICE_CHOICES[0]
}

export function loadBool(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function normalizeCategoryText(value = '') {
  return String(value || '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function categoryHash(value = '') {
  return normalizeCategoryText(value).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function customCategoryMeta(id, label) {
  const text = normalizeCategoryText(`${label} ${id}`)
  const keyword = CATEGORY_KEYWORD_ICONS.find(item => item.words.some(word => {
    const needle = normalizeCategoryText(word)
    return needle.length <= 2 ? ` ${text} `.includes(` ${needle} `) : text.includes(needle)
  }))
  if (keyword) {
    return {
      icon: keyword.icon,
      ...keyword.style,
    }
  }
  const index = categoryHash(`${id}:${label}`)
  return {
    icon: CUSTOM_CATEGORY_ICONS[index % CUSTOM_CATEGORY_ICONS.length],
    ...CATEGORY_STYLES[index % CATEGORY_STYLES.length],
  }
}

export function decorateVideoCategories(categories = []) {
  const seen = new Set()
  const decorated = []
  const source = Array.isArray(categories) && categories.length ? categories : VIDEO_CATEGORIES
  for (const item of source) {
    const id = String(item?.id || '').trim()
    if (!id || seen.has(id) || id === 'all') continue
    const known = VIDEO_CATEGORIES.find(category => category.id === id)
    const label = String(item?.label || known?.label || id).trim() || id
    const meta = known || customCategoryMeta(id, label)
    decorated.push({
      ...item,
      ...meta,
      id,
      label,
    })
    seen.add(id)
  }
  if (!seen.has('other')) {
    decorated.push(VIDEO_CATEGORIES.find(item => item.id === 'other'))
  }
  return decorated
}

export function videoCategory(value, categories = VIDEO_CATEGORIES) {
  const id = String(value || '').trim()
  return categories.some(item => item.id === id) ? id : 'other'
}

export function videoCategoryLabel(value, categories = VIDEO_CATEGORIES) {
  return categories.find(item => item.id === videoCategory(value, categories))?.label || 'Khác'
}

export function videoCategoryMeta(value, categories = VIDEO_CATEGORIES) {
  return categories.find(item => item.id === videoCategory(value, categories)) || categories.find(item => item.id === 'other') || VIDEO_CATEGORIES[VIDEO_CATEGORIES.length - 1]
}

export function normalizeSourceLang(value = '') {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-')
}

export function isVietnameseLang(value = '') {
  return normalizeSourceLang(value).startsWith('vi')
}

export function videoLanguageMeta(value = '') {
  const lang = normalizeSourceLang(value)
  const base = lang.split('-')[0]
  const labels = {
    vi: 'Tiếng Việt',
    en: 'English',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    th: 'Thai',
    id: 'Indonesian',
    ru: 'Russian',
  }
  if (!lang) {
    return {
      code: '',
      label: '?',
      title: 'Chưa nhận diện ngôn ngữ',
      className: 'border-gray-200 bg-gray-50 text-gray-400',
    }
  }
  if (isVietnameseLang(lang)) {
    return {
      code: lang,
      label: labels.vi,
      title: `Ngôn ngữ: ${labels.vi}`,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  return {
    code: lang,
    label: labels[base] || lang.toUpperCase(),
    title: `Ngôn ngữ: ${labels[base] || lang.toUpperCase()} - sẽ dịch sang tiếng Việt`,
    className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  }
}

export function buildFallbackNarration(activeVideo) {
  const rawTitle = String(activeVideo?.title || '').trim()
  const cleanTitle = rawTitle.replace(/\s*[\[(].*?[\])]\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'video này'
  if (isVietnameseLang(activeVideo?.sourceLang)) {
    return `Đang phát ${cleanTitle}. Chưa có lời thoại tại đoạn này, hệ thống sẽ tiếp tục lắng nghe.`
  }
  return `Đang phát ${cleanTitle}. Hệ thống sẽ tự dịch và đọc bằng tiếng Việt khi có lời thoại tiếp theo.`
}

export function buildVideoSource(rawInput, titleInput = '') {
  const input = (extractIframeSrc(rawInput) || rawInput || '').trim()
  if (!input) return null

  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null

  const youtubeId = getYoutubeId(url)
  if (youtubeId) {
    return {
      id: makeId(),
      type: 'youtube',
      title: titleInput.trim() || getTitleFromUrl(url, 'youtube'),
      input,
      src: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
      openUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      createdAt: Date.now(),
    }
  }

  const lowerPath = url.pathname.toLowerCase()
  const isDirectVideo = DIRECT_VIDEO_EXTS.some(ext => lowerPath.endsWith(ext))
  return {
    id: makeId(),
    type: isDirectVideo ? 'direct' : 'embed',
    title: titleInput.trim() || getTitleFromUrl(url, isDirectVideo ? 'direct' : 'embed'),
    input,
    src: input,
    openUrl: input,
    createdAt: Date.now(),
  }
}

export function loadLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_LIBRARY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item?.id && item?.src) : []
  } catch {
    return []
  }
}

export function loadProgressMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_PROGRESS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveProgressMap(map) {
  localStorage.setItem(VIDEO_PROGRESS_KEY, JSON.stringify(map))
}

export function progressKey(item) {
  return item?.src || item?.openUrl || item?.input || ''
}

export function savedProgressFor(item) {
  const forced = forceStartProgressFor(item)
  if (forced) return forced
  const local = loadProgressMap()[progressKey(item)] || {}
  const db = {
    position: Number(item?.progressPosition || 0),
    duration: Number(item?.progressDuration || 0),
    watchedAt: Number(item?.watchedAt || 0),
  }
  const localProgress = {
    position: Number(local.position || 0),
    duration: Number(local.duration || 0),
    watchedAt: Number(local.watchedAt || 0),
  }
  return localProgress.watchedAt > db.watchedAt ? localProgress : db
}

export function chunkSpeechSegments(segments) {
  const chunks = []
  let current = []
  let length = 0
  const pushCurrent = () => {
    if (!current.length) return
    chunks.push({
      start: current[0].start,
      duration: Math.max(0.8, current[current.length - 1].start + current[current.length - 1].duration - current[0].start),
      text: joinSpeechText(current),
    })
    current = []
    length = 0
  }

  for (const seg of segments) {
    const text = cleanSpeechText(seg.text)
    if (!text) continue
    const last = current[current.length - 1]
    const gap = last ? seg.start - (last.start + last.duration) : 0
    const span = current.length ? seg.start + seg.duration - current[0].start : seg.duration
    if (
      current.length
      && (
        current.length >= TTS_MAX_SEGMENTS
        || length + text.length > TTS_MAX_CHARS
        || span > TTS_MAX_SPAN_SECONDS
        || gap > TTS_CONTIGUOUS_GAP_SECONDS
      )
    ) {
      pushCurrent()
    }
    current.push({ ...seg, text })
    length += text.length
  }
  pushCurrent()
  return chunks
}

export function displayTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = value % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function progressLabel(item) {
  const { position, duration } = savedProgressFor(item)
  if (!Number.isFinite(position) || position < 5) return ''
  if (duration > 0 && position >= duration - 8) return ''
  return `xem tiếp ${displayTime(position)}`
}

export function formatTime(ts) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ts)
}

export function withYoutubeJsApi(src, startPosition = 0) {
  try {
    const url = new URL(src)
    if (!url.hostname.includes('youtube')) return src
    if (url.hostname === 'www.youtube-nocookie.com' || url.hostname === 'youtube-nocookie.com') {
      url.hostname = 'www.youtube.com'
    }
    url.searchParams.set('enablejsapi', '1')
    url.searchParams.set('playsinline', '1')
    url.searchParams.set('vq', DEFAULT_YOUTUBE_QUALITY)
    const start = Math.floor(Number(startPosition) || 0)
    if (start >= 5) url.searchParams.set('start', String(start))
    else url.searchParams.delete('start')
    if (typeof window !== 'undefined') url.searchParams.set('origin', window.location.origin)
    return url.toString()
  } catch {
    return src
  }
}

function makeId() {
  return `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeYoutubeId(value = '') {
  const match = String(value).match(/[A-Za-z0-9_-]{6,}/)
  return match ? match[0] : ''
}

function getYoutubeId(url) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') return normalizeYoutubeId(url.pathname.split('/').filter(Boolean)[0])
  if (!host.endsWith('youtube.com')) return ''

  const fromQuery = normalizeYoutubeId(url.searchParams.get('v') || '')
  if (fromQuery) return fromQuery

  const parts = url.pathname.split('/').filter(Boolean)
  if (['embed', 'shorts', 'live'].includes(parts[0])) return normalizeYoutubeId(parts[1])
  return ''
}

function extractIframeSrc(input) {
  const match = String(input).match(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/i)
  return match ? match[1].replace(/&amp;/g, '&') : ''
}

function getTitleFromUrl(url, type) {
  if (type === 'youtube') return ''
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
  return last || url.hostname
}

function forceStartProgressFor(item) {
  if (!item?.id) return null
  try {
    const forcedId = localStorage.getItem(FORCE_START_VIDEO_KEY) || ''
    if (String(forcedId) !== String(item.id)) return null
    const key = progressKey(item)
    if (key) {
      const map = loadProgressMap()
      if (map[key]) {
        delete map[key]
        saveProgressMap(map)
      }
    }
    localStorage.removeItem(FORCE_START_VIDEO_KEY)
    return { position: 0, duration: 0, watchedAt: Date.now() }
  } catch {
    return null
  }
}

function cleanSpeechText(value) {
  const text = String(value || '')
    .replace(/^\s*(?:>{1,}|[›»]{1,})\s*/, '')
    .replace(/[<>]+/g, ' ')
    .replace(/\[\s*[_\W]+\s*\]/g, ' ')
    .replace(/[\[(【{]\s*([^\])】}]{0,80})\s*[\])】}]/g, (match, cue) => (isNonSpeechCue(cue) ? ' ' : match))
    .replace(/\s+/g, ' ')
    .trim()
  const cue = text.replace(/[\[\](){}【】♪♫♬♩\s:：.\-–—!！]/g, ' ').trim()
  if (isNonSpeechCue(cue)) {
    return ''
  }
  return text
}

function captionCueKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isNonSpeechCue(value) {
  const key = captionCueKey(value)
  return !key || NON_SPEECH_CUES.has(key)
}

function joinSpeechText(items) {
  return items.reduce((text, item) => {
    const next = (item.text || '').trim()
    if (!next) return text
    if (!text) return next
    return `${text} ${next}`
  }, '')
}
