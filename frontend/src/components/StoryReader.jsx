import { useState, useEffect, useRef, useMemo } from 'react'
import { ArrowLeft, Settings, Volume2, VolumeX, Play, Pause, Square, SkipBack, SkipForward, ChevronDown, BookOpen, AlertCircle, X } from 'lucide-react'
import { saveTruyenCVHistory } from '../api.js'

const BASE = window.location.origin

function cleanStoryContent(text) {
  return String(text || '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\(["'])/g, '$1')
}

function cleanTtsText(text) {
  return String(text || '')
    .replace(/&quot;|&#34;|&#x22;/gi, '')
    .replace(/["“”„‟«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function apiGet(url) {
  const r = await fetch(`${BASE}${url}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json()
}

const THEMES = {
  light: { bg: 'bg-[#faf9f6]', text: 'text-gray-900', border: 'border-gray-200/50', card: 'bg-white', tag: 'bg-gray-100 text-gray-600' },
  sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5c3d24]', border: 'border-[#e8ddbf]', card: 'bg-[#faf4e6]', tag: 'bg-[#ebdcb9] text-[#785135]' },
  gray: { bg: 'bg-[#2d3139]', text: 'text-[#cccccc]', border: 'border-[#3f444f]', card: 'bg-[#353a43]', tag: 'bg-[#3f444f] text-[#aaaaaa]' },
  night: { bg: 'bg-[#121212]', text: 'text-[#9e9e9e]', border: 'border-[#222222]', card: 'bg-[#1a1a1a]', tag: 'bg-[#262626] text-[#888888]' },
}

const THEME_OPTIONS = [
  { key: 'light', label: 'Sáng', title: 'Trắng kem', swatch: 'bg-[#faf9f6]' },
  { key: 'sepia', label: 'Cổ', title: 'Cổ điển', swatch: 'bg-[#f4ecd8]' },
  { key: 'gray', label: 'Xám', title: 'Tối dịu', swatch: 'bg-[#2d3139]' },
  { key: 'night', label: 'Đêm', title: 'Đêm đen', swatch: 'bg-[#121212]' },
]

const FONTS = {
  serif: 'font-serif font-medium',
  sans: 'font-sans',
}

const SIZES = {
  sm: 'text-sm leading-[1.95] sm:text-base sm:leading-[1.95]',
  md: 'text-base leading-[1.95] sm:text-lg sm:leading-[1.95]',
  lg: 'text-lg leading-[1.95] sm:text-xl sm:leading-[1.95]',
  xl: 'text-xl leading-[1.95] sm:text-2xl sm:leading-[1.95]',
}

const WIDTHS = {
  narrow: 'max-w-md',
  medium: 'max-w-xl',
  wide: 'max-w-5xl',
}

const FONT_OPTIONS = [
  { key: 'serif', label: 'Serif' },
  { key: 'sans', label: 'Sans' },
]

const SIZE_OPTIONS = [
  { key: 'sm', label: 'SM' },
  { key: 'md', label: 'MD' },
  { key: 'lg', label: 'LG' },
  { key: 'xl', label: 'XL' },
]

const WIDTH_OPTIONS = [
  { key: 'narrow', label: 'Hẹp' },
  { key: 'medium', label: 'Vừa' },
  { key: 'wide', label: 'Rộng' },
]

const TTS_PROVIDERS = [
  { key: 'edge', label: 'Edge', shortLabel: 'Edge', meta: 'Microsoft' },
  { key: 'google', label: 'Google', shortLabel: 'Google', meta: 'gTTS' },
  { key: 'browser', label: 'Trình duyệt', shortLabel: 'Browser', meta: 'Tiếng Việt' },
]

const TTS_SPEED_OPTIONS = [
  { value: 0.8, label: '0.8x' },
  { value: 1, label: '1x' },
  { value: 1.2, label: '1.2x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
]

export default function StoryReader({ story, initialChapter, sessionId, token, onBack }) {
  const [currentChapter, setCurrentChapter] = useState(initialChapter)
  // Danh sách chương đã tải (≥1). Ở chế độ phân trang chỉ có 1; liên tục thì nối thêm.
  const [sections, setSections] = useState([])
  const [chaptersList, setChaptersList] = useState([])
  const [loading, setLoading] = useState(true)

  const getChapterLabel = (ch) => {
    if (!ch) return ''
    const title = ch.title || ''
    if (/^\s*(chương|chuong|chapter|chap)\s*\d+/i.test(title)) {
      return title
    }
    const idx = chaptersList.findIndex(c => c.slug === ch.slug)
    let num = idx !== -1 ? ch.chapter_number || chaptersList[idx].chapter_number : null
    if (num == null) {
      const match = ch.slug?.match(/chapter-(\d+)/) || ch.slug?.match(/(\d+)/)
      if (match) num = Number(match[1])
    }
    if (num == null && idx !== -1) {
      num = idx + 1
    }
    if (num != null) {
      const cleanTitle = title.replace(/^(?:chương|chuong|chapter|chap)?\s*\d+\s*[:.-]?\s*/i, '').trim()
      if (!cleanTitle || cleanTitle === String(num)) {
        return `Chương ${num}`
      }
      return `Chương ${num}: ${cleanTitle}`
    }
    return title
  }
  const [chaptersLoading, setChaptersLoading] = useState(true)
  const [error, setError] = useState(null)
  const [appendingNext, setAppendingNext] = useState(false)
  // Chương đang trong tầm nhìn (cho header + lịch sử) khi đọc liên tục
  const [viewSlug, setViewSlug] = useState(initialChapter?.slug || null)

  // Reading Preferences States
  const [theme, setTheme] = useState('sepia')
  const [fontFamily, setFontFamily] = useState('serif')
  const [fontSize, setFontSize] = useState('md')
  const [containerWidth, setContainerWidth] = useState('wide')
  const [showSettings, setShowSettings] = useState(false)
  const [showChaptersMenu, setShowChaptersMenu] = useState(false)
  const [ttsServer, setTtsServer] = useState(() => {
    if (typeof window === 'undefined') return 'edge'
    return localStorage.getItem('hagent_reader_ttsServer') || 'edge'
  })
  const [ttsSpeed, setTtsSpeed] = useState(() => {
    if (typeof window === 'undefined') return 1
    const savedSpeed = Number(localStorage.getItem('hagent_reader_ttsSpeed'))
    return TTS_SPEED_OPTIONS.some(option => option.value === savedSpeed) ? savedSpeed : 1
  })
  const [continuousMode, setContinuousMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('hagent_reader_continuous') === '1'
  })

  // TTS States
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(-1)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)

  const audioRef = useRef(null)
  const speechRef = useRef(null)
  const ttsSpeedRef = useRef(ttsSpeed)
  const paragraphRefs = useRef([])
  const containerRef = useRef(null)
  const autoAdvanceRef = useRef(false)
  const retriesRef = useRef({})
  // Ref để track index hiện tại trong async context (tránh stale closure)
  const currentIndexRef = useRef(-1)
  const sectionRefs = useRef([])
  const appendingNextRef = useRef(false)
  // Luôn trỏ tới mảng đoạn phẳng mới nhất + chế độ liên tục (tránh stale trong callback async)
  const paragraphsRef = useRef([])
  const continuousModeRef = useRef(continuousMode)
  // Khi cần TTS đọc tiếp sau khi nối chương mới: lưu global index bắt đầu
  const ttsContinueRef = useRef(null)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('hagent_reader_theme')
      const savedFont = localStorage.getItem('hagent_reader_font')
      const savedSize = localStorage.getItem('hagent_reader_size')
      const savedWidth = localStorage.getItem('hagent_reader_width')
      const savedTtsServer = localStorage.getItem('hagent_reader_ttsServer')
      const savedTtsSpeed = Number(localStorage.getItem('hagent_reader_ttsSpeed'))
      const savedContinuous = localStorage.getItem('hagent_reader_continuous')

      if (savedTheme) setTheme(savedTheme)
      if (savedFont) setFontFamily(savedFont)
      if (savedSize) setFontSize(savedSize)
      if (savedWidth) setContainerWidth(savedWidth)
      if (savedTtsServer) setTtsServer(savedTtsServer)
      if (TTS_SPEED_OPTIONS.some(option => option.value === savedTtsSpeed)) setTtsSpeed(savedTtsSpeed)
      if (savedContinuous != null) {
        const on = savedContinuous === '1'
        setContinuousMode(on)
        continuousModeRef.current = on
      }
    } catch {}
  }, [])

  useEffect(() => {
    ttsSpeedRef.current = ttsSpeed
    if (audioRef.current) {
      audioRef.current.playbackRate = ttsSpeed
    }
  }, [ttsSpeed])

  // Mở một phiên đọc mới từ ngoài (chọn chương ở Chi tiết) → nhảy tới chương đó.
  // Đổi tab không đổi sessionId nên không reset (reader vẫn giữ vị trí + TTS đang chạy).
  useEffect(() => {
    if (sessionId == null || !initialChapter) return
    setCurrentChapter(initialChapter)
  }, [sessionId])

  // Save preference helper
  const savePreference = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {}
  }

  // Load list of all chapters for the story (for navigation & dropdown)
  useEffect(() => {
    setChaptersLoading(true)
    apiGet(`/api/truyencv/story/${story.slug}`)
      .then(data => {
        if (data && data.chapters) {
          setChaptersList(data.chapters)
          // If no initial chapter was selected, take the first one
          if (!currentChapter && data.chapters.length > 0) {
            setCurrentChapter(data.chapters[0])
          }
        }
        setChaptersLoading(false)
      })
      .catch(e => {
        console.error('Error loading chapters catalog:', e)
        setChaptersLoading(false)
      })
  }, [story.slug])

  // Fetch specific chapter content whenever currentChapter updates
  useEffect(() => {
    if (!currentChapter) return

    setLoading(true)
    setError(null)
    // Stop any playing TTS audio when moving to a new chapter
    stopAudio()
    setActiveParagraphIndex(-1)
    currentIndexRef.current = -1
    ttsContinueRef.current = null
    setViewSlug(currentChapter.slug)

    apiGet(`/api/truyencv/story/${story.slug}/chapter/${currentChapter.slug}`)
      .then(data => {
        // Chọn một chương = khởi tạo lại ngăn xếp đọc bắt đầu từ chương đó
        setSections([{ slug: currentChapter.slug, title: data.title || currentChapter.title, content: data.content }])
        setLoading(false)

        // Scroll container back to top
        if (containerRef.current) {
          containerRef.current.scrollTop = 0
        }

        // Save reading history / bookmark
        saveReadingProgress(currentChapter)

        // If we flagged auto-advance (TTS finished previous chapter), start TTS on new chapter
        if (autoAdvanceRef.current) {
          // small delay to ensure DOM and refs updated
          setTimeout(() => {
            autoAdvanceRef.current = false
            // start reading from first paragraph
            if (ttsEnabled) playParagraph(0)
          }, 300)
        }
      })
      .catch(e => {
        console.error(e)
        setError('Không thể tải nội dung chương. Vui lòng thử lại.')
        setLoading(false)
      })
  }, [currentChapter, story.slug])

  // Save reading progress to local storage
  const saveReadingProgress = async (chapter) => {
    try {
      const history = JSON.parse(localStorage.getItem('hagent_reading_history') || '{}')
      history[story.slug] = {
        storyTitle: story.title,
        coverUrl: story.cover_url,
        chapterSlug: chapter.slug,
        chapterTitle: chapter.title,
        timestamp: Date.now()
      }
      localStorage.setItem('hagent_reading_history', JSON.stringify(history))
      
      // Also update the active chapter key in parent's storage context
      localStorage.setItem('hagent_entertainment_chapter', JSON.stringify(chapter))

      if (token) {
        try {
          await saveTruyenCVHistory(history, token)
        } catch (serverErr) {
          console.error('Error saving history to server:', serverErr)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Find next/prev chapters
  const getPrevAndNext = () => {
    if (chaptersList.length === 0 || !currentChapter) return { prev: null, next: null }
    const idx = chaptersList.findIndex(c => c.slug === currentChapter.slug)
    if (idx === -1) return { prev: null, next: null }
    return {
      prev: idx > 0 ? chaptersList[idx - 1] : null,
      next: idx < chaptersList.length - 1 ? chaptersList[idx + 1] : null
    }
  }

  const { prev: prevChapter, next: nextChapter } = getPrevAndNext()

  // Tách mỗi section thành các đoạn; gộp lại thành mảng phẳng cho TTS
  const parsedSections = useMemo(() => sections.map(sec => ({
    ...sec,
    paragraphs: cleanStoryContent(sec.content || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n+/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  })), [sections])

  const paragraphs = useMemo(() => parsedSections.flatMap(s => s.paragraphs), [parsedSections])

  // Giữ ref luôn-mới để callback async (onended) đọc đúng dữ liệu sau khi nối chương
  useEffect(() => { paragraphsRef.current = paragraphs }, [paragraphs])
  useEffect(() => { continuousModeRef.current = continuousMode }, [continuousMode])

  // Sau khi nối chương xong, nếu TTS đang chờ thì đọc tiếp từ đoạn đầu chương mới
  useEffect(() => {
    const i = ttsContinueRef.current
    if (i != null && paragraphs.length > i) {
      ttsContinueRef.current = null
      if (ttsEnabled) playParagraph(i)
    }
  }, [paragraphs.length, ttsEnabled])

  // Chương kế tiếp sau section cuối cùng đã tải (dựa trên mục lục)
  const getNextAfterLastSection = () => {
    if (!sections.length || !chaptersList.length) return null
    const lastSlug = sections[sections.length - 1].slug
    const idx = chaptersList.findIndex(c => c.slug === lastSlug)
    return idx >= 0 && idx < chaptersList.length - 1 ? chaptersList[idx + 1] : null
  }

  // Nối thêm chương kế tiếp vào cuối (đọc liên tục / TTS xuyên chương)
  const loadNextChapter = async () => {
    if (appendingNextRef.current) return null
    const next = getNextAfterLastSection()
    if (!next) return null
    appendingNextRef.current = true
    setAppendingNext(true)
    try {
      const data = await apiGet(`/api/truyencv/story/${story.slug}/chapter/${next.slug}`)
      setSections(prev => prev.some(s => s.slug === next.slug)
        ? prev
        : [...prev, { slug: next.slug, title: data.title || next.title, content: data.content }])
      return next
    } catch (e) {
      console.error('Lỗi nối chương:', e)
      return null
    } finally {
      appendingNextRef.current = false
      setAppendingNext(false)
    }
  }

  // Khi TTS đọc hết toàn bộ đoạn đã tải
  const advanceAtChapterEnd = () => {
    const next = getNextAfterLastSection()
    if (ttsEnabled && next) {
      if (continuousModeRef.current) {
        ttsContinueRef.current = paragraphsRef.current.length
        loadNextChapter()
      } else {
        autoAdvanceRef.current = true
        setCurrentChapter(next)
      }
    } else {
      stopAudio()
      setActiveParagraphIndex(-1)
      currentIndexRef.current = -1
    }
  }

  // Cuộn để cập nhật chương đang xem + tự nối chương khi gần cuối (chỉ chế độ liên tục)
  const handleScroll = () => {
    const el = containerRef.current
    if (!el || !continuousMode) return
    const contTop = el.getBoundingClientRect().top
    let visible = sections[0]?.slug
    for (let i = 0; i < sections.length; i++) {
      const node = sectionRefs.current[i]
      if (node && node.getBoundingClientRect().top - contTop <= 120) visible = sections[i].slug
    }
    if (visible && visible !== viewSlug) {
      setViewSlug(visible)
      const sec = sections.find(s => s.slug === visible)
      if (sec) saveReadingProgress({ slug: sec.slug, title: sec.title })
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600 && !appendingNextRef.current) {
      loadNextChapter()
    }
  }

  // Bật/tắt chế độ đọc liên tục
  const handleToggleContinuous = () => {
    const nextOn = !continuousMode
    setContinuousMode(nextOn)
    continuousModeRef.current = nextOn
    savePreference('hagent_reader_continuous', nextOn ? '1' : '0')
    if (!nextOn) {
      // Tắt: thu về đúng chương đang xem, quay lại phân trang
      const sec = sections.find(s => s.slug === viewSlug) || sections[0]
      if (sec) {
        setSections([sec])
        setCurrentChapter({ slug: sec.slug, title: sec.title })
      }
    }
  }

  // Chương hiển thị ở header + lịch sử
  const headerChapter = (() => {
    if (!sections.length) return currentChapter
    const s = sections.find(x => x.slug === viewSlug) || sections[0]
    return { slug: s.slug, title: s.title }
  })()

  // Clean audio resources
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (speechRef.current) {
      window.speechSynthesis.cancel()
      speechRef.current = null
    }
    setTtsPlaying(false)
    setTtsLoading(false)
  }

  const speakBrowserParagraph = (index, textToSpeak) => {
    if (!window.speechSynthesis) {
      throw new Error('Trình duyệt không hỗ trợ SpeechSynthesis')
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.lang = 'vi-VN'
    utterance.rate = ttsSpeedRef.current
    utterance.pitch = 1
    utterance.onstart = () => {
      if (currentIndexRef.current === index) {
        setTtsLoading(false)
        setTtsPlaying(true)
        retriesRef.current[index] = 0
      }
    }
    utterance.onend = () => {
      if (currentIndexRef.current !== index) return
      speechRef.current = null
      if (index + 1 < paragraphsRef.current.length) {
        playParagraph(index + 1)
      } else {
        advanceAtChapterEnd()
      }
    }
    utterance.onerror = (e) => {
      console.error('[TTS] browser.onerror', { index, error: e })
      if (currentIndexRef.current !== index) return
      retriesRef.current[index] = (retriesRef.current[index] || 0) + 1
      if (retriesRef.current[index] <= 2) {
        setTimeout(() => playParagraph(index), 1500)
      } else {
        retriesRef.current[index] = 0
        stopAudio()
      }
    }

    speechRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  // Play audio for a specific paragraph index
  const playParagraph = async (index) => {
    if (index < 0 || index >= paragraphsRef.current.length) {
      stopAudio()
      setActiveParagraphIndex(-1)
      currentIndexRef.current = -1
      return
    }

    stopAudio()
    // reset retry counter for this paragraph when we intentionally start it
    retriesRef.current[index] = 0
    setActiveParagraphIndex(index)
    currentIndexRef.current = index  // Cập nhật ref ngay lập tức (không bị stale)
    setTtsLoading(true)

    const textToSpeak = cleanTtsText(paragraphsRef.current[index])
    
    // Auto-scroll the active paragraph into view
    if (paragraphRefs.current[index]) {
      paragraphRefs.current[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }

    try {
      if (ttsServer === 'browser') {
        speakBrowserParagraph(index, textToSpeak)
        return
      }

      const payload = {
        server: ttsServer,
        text: textToSpeak,
        voice: 'vi-VN-HoaiMyNeural',
      }
      console.debug('[TTS] fetch start', { index, payload })
      const response = await fetch(`${BASE}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      console.debug('[TTS] fetch done', { index, status: response.status, server: ttsServer })
      if (!response.ok) {
        const bodyText = await response.text()
        console.error('[TTS] non-ok response', { index, status: response.status, bodyText })
        throw new Error(`HTTP ${response.status}: ${bodyText}`)
      }

      const audioBlob = await response.blob()
      console.debug('[TTS] blob received', { index, size: audioBlob.size })

      // Dùng ref (không phải state) để check — tránh stale closure sau await
      if (currentIndexRef.current !== index) {
        console.debug('[TTS] abort due to index change', { index, current: currentIndexRef.current })
        return
      }

      const blobUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(blobUrl)
      audio.playbackRate = ttsSpeedRef.current
      audioRef.current = audio

      audio.onplay = () => {
        console.debug('[TTS] onplay', { index })
        setTtsLoading(false)
        setTtsPlaying(true)
        retriesRef.current[index] = 0
      }

      audio.onended = () => {
        console.debug('[TTS] onended', { index })
        URL.revokeObjectURL(blobUrl)
        if (currentIndexRef.current === index) {
          if (index + 1 < paragraphsRef.current.length) {
            playParagraph(index + 1)
          } else {
            advanceAtChapterEnd()
          }
        }
      }

      audio.onerror = (e) => {
        console.error('[TTS] audio.onerror', { index, error: e })
        URL.revokeObjectURL(blobUrl)
        setTtsLoading(false)
        setTtsPlaying(false)
        if (currentIndexRef.current === index) {
          retriesRef.current[index] = (retriesRef.current[index] || 0) + 1
          console.debug('[TTS] audio retry', { index, count: retriesRef.current[index] })
          if (retriesRef.current[index] <= 2) {
            setTimeout(() => playParagraph(index), 1500)
          } else {
            retriesRef.current[index] = 0
          }
        }
      }

      audio.play().then(() => {
        console.debug('[TTS] audio.play success', { index })
      }).catch(err => {
        console.error('[TTS] audio.play failed', { index, err })
        retriesRef.current[index] = (retriesRef.current[index] || 0) + 1
        if (retriesRef.current[index] <= 2) {
          console.debug('[TTS] audio.play retry', { index, count: retriesRef.current[index] })
          setTimeout(() => playParagraph(index), 700)
        } else {
          URL.revokeObjectURL(blobUrl)
          setTtsLoading(false)
          setTtsPlaying(false)
          retriesRef.current[index] = 0
        }
      })
    } catch (e) {
      console.error('[TTS] error', { index, error: e })
      setTtsLoading(false)
      setTtsPlaying(false)
      if (currentIndexRef.current === index) {
        retriesRef.current[index] = (retriesRef.current[index] || 0) + 1
        console.debug('[TTS] fetch retry', { index, count: retriesRef.current[index] })
        if (retriesRef.current[index] <= 2) {
          setTimeout(() => playParagraph(index), 1500)
        } else {
          retriesRef.current[index] = 0
        }
      }
    }
  }

  // Handle play/pause toggle for the TTS system
  const handleTtsPlayPause = () => {
    if (!ttsEnabled) {
      setTtsEnabled(true)
      playParagraph(activeParagraphIndex === -1 ? 0 : activeParagraphIndex)
      return
    }

    if (ttsPlaying) {
      if (ttsServer === 'browser' && window.speechSynthesis) {
        window.speechSynthesis.pause()
      } else if (audioRef.current) {
        audioRef.current.pause()
      }
      setTtsPlaying(false)
    } else {
      if (ttsServer === 'browser' && speechRef.current && window.speechSynthesis) {
        window.speechSynthesis.resume()
        setTtsPlaying(true)
      } else if (audioRef.current) {
        audioRef.current.play()
        setTtsPlaying(true)
      } else {
        playParagraph(activeParagraphIndex === -1 ? 0 : activeParagraphIndex)
      }
    }
  }

  const handleTtsParagraphClick = (idx) => {
    if (!ttsEnabled) {
      setTtsEnabled(true)
    }
    playParagraph(idx)
  }

  const handleTtsStop = () => {
    stopAudio()
    setActiveParagraphIndex(-1)
    currentIndexRef.current = -1
    setTtsEnabled(false)
  }

  const handleTtsSpeedChange = (speed) => {
    setTtsSpeed(speed)
    savePreference('hagent_reader_ttsSpeed', String(speed))
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }

  const currentTheme = THEMES[theme]
  const isWarmTheme = theme === 'light' || theme === 'sepia'
  const selectedTtsProvider = TTS_PROVIDERS.find(provider => provider.key === ttsServer) || TTS_PROVIDERS[0]
  const selectedTtsSpeed = TTS_SPEED_OPTIONS.find(option => option.value === ttsSpeed) || TTS_SPEED_OPTIONS[1]
  const labelClass = isWarmTheme ? 'text-stone-500' : 'text-gray-400'
  const panelSurfaceClass = isWarmTheme
    ? 'border-[#eadfce] bg-white/60 shadow-[0_12px_32px_rgba(80,53,25,0.08)]'
    : 'border-white/10 bg-white/[0.04] shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
  const controlTrackClass = isWarmTheme ? 'border-[#eadfce] bg-[#f5efe5]' : 'border-white/10 bg-white/[0.06]'
  const activeControlClass = isWarmTheme
    ? 'bg-[#e86f00] text-white shadow-sm shadow-orange-700/20'
    : 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
  const inactiveControlClass = isWarmTheme
    ? 'text-stone-600 hover:bg-white hover:text-stone-950'
    : 'text-gray-300 hover:bg-white/10 hover:text-white'
  const headerButtonClass = isWarmTheme
    ? 'border-[#e6d8c5] bg-white/75 text-stone-700 hover:border-[#e86f00]/45 hover:bg-white'
    : 'border-white/10 bg-white/[0.04] text-gray-200 hover:border-amber-400/40 hover:bg-white/[0.08]'
  const quietIconButtonClass = isWarmTheme
    ? 'text-stone-500 hover:bg-black/[0.05] hover:text-stone-900'
    : 'text-gray-300 hover:bg-white/10 hover:text-white'
  const ttsChipClass = isWarmTheme
    ? 'border-[#eadfce] bg-[#fffaf2] text-stone-700'
    : 'border-white/10 bg-white/[0.05] text-gray-200'
  const selectedRingClass = isWarmTheme ? 'ring-[#e86f00] ring-offset-[#faf4e6]' : 'ring-amber-400 ring-offset-[#1a1a1a]'
  const segmentButtonClass = (active) => `flex min-h-8 items-center justify-center rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${active ? activeControlClass : inactiveControlClass}`

  return (
    <div className={`h-full flex flex-col transition-colors duration-300 ${currentTheme.bg} ${currentTheme.text}`}>
      {/* Reader Nav-Header */}
      <div className={`border-b px-4 py-3 sm:px-6 transition-colors duration-300 ${currentTheme.card} ${currentTheme.border} premium-shadow shrink-0 z-10`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                stopAudio()
                onBack()
              }}
              className={`rounded-lg p-2 transition-all shrink-0 ${quietIconButtonClass}`}
              title="Quay lại chi tiết"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* Chapter Quick Selector */}
            <div className="relative min-w-0 flex-1 sm:min-w-[14rem] lg:max-w-2xl">
              <button
                onClick={() => {
                  setShowChaptersMenu(prev => !prev)
                  setShowSettings(false)
                }}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold shadow-sm transition-colors duration-200 ${headerButtonClass}`}
              >
                <BookOpen className="h-4 w-4 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{getChapterLabel(headerChapter) || 'Đang tải...'}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>

              {showChaptersMenu && (
                <div className={`absolute left-0 top-full mt-2 w-[min(19rem,calc(100vw-2rem))] sm:w-80 max-h-[60vh] overflow-y-auto rounded-2xl border p-2 shadow-xl z-30 transition-all ${currentTheme.card} ${currentTheme.border} custom-scrollbar`}>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.18em] px-3 py-2 border-b border-gray-200/60 mb-2 flex items-center justify-between">
                    <span>Mục lục</span>
                    <span>{chaptersList.length} chương</span>
                  </div>
                  {chaptersLoading ? (
                    <div className="p-4 text-center text-xs text-gray-400">Đang tải danh mục...</div>
                  ) : (
                    chaptersList.map(ch => (
                      <button
                        key={ch.slug}
                        onClick={() => {
                          setCurrentChapter(ch)
                          setShowChaptersMenu(false)
                        }}
                        className={`w-full text-left py-2 px-3 rounded-xl text-sm transition-colors duration-150 ${
                          viewSlug === ch.slug ? 'bg-amber-600/10 font-semibold text-amber-600' : 'text-inherit hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{getChapterLabel(ch)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Toolbar buttons */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div className={`hidden h-9 items-center gap-2 rounded-lg border px-3 text-[11px] font-semibold shadow-sm md:inline-flex ${ttsChipClass}`}>
              <Volume2 className="h-3.5 w-3.5 text-[#e86f00]" />
              <span>{selectedTtsProvider.shortLabel}</span>
              <span className={isWarmTheme ? 'text-stone-400' : 'text-gray-500'}>{selectedTtsSpeed.label}</span>
            </div>
            <button
              onClick={() => {
                if (ttsEnabled) {
                  handleTtsStop()
                } else {
                  setTtsEnabled(true)
                  playParagraph(0)
                }
              }}
              className={`rounded-lg p-2 transition-all shrink-0 ${
                ttsEnabled 
                  ? activeControlClass
                  : `border ${headerButtonClass}`
              }`}
              title="Đọc thành tiếng (TTS AI)"
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Preferences Settings Button */}
            <button
              onClick={() => {
                setShowSettings(prev => !prev)
                setShowChaptersMenu(false)
              }}
              className={`rounded-lg p-2 transition-all shrink-0 ${showSettings ? activeControlClass : quietIconButtonClass}`}
              title="Tùy chỉnh giao diện đọc"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Overlay/Panel */}
      {showSettings && (
        <div className={`min-h-0 max-h-[calc(100svh-13rem)] overflow-y-auto overscroll-contain border-b transition-all z-20 ${currentTheme.card} ${currentTheme.border} premium-shadow shrink-0 font-sans custom-scrollbar sm:max-h-none sm:overflow-visible`}>
          <div className="mx-auto max-w-5xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className={`sticky top-0 z-20 -mx-4 -mt-4 mb-3 flex items-center justify-between border-b px-4 py-3 sm:hidden ${currentTheme.card} ${currentTheme.border}`}>
              <span className="text-xs font-semibold">Tùy chỉnh đọc</span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${quietIconButtonClass}`}
                title="Đóng tùy chỉnh"
                aria-label="Đóng tùy chỉnh"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <section className={`rounded-lg border p-3 ${panelSurfaceClass}`}>
                <span className={`mb-2 block text-[10px] font-semibold uppercase ${labelClass}`}>Chủ đề màu</span>
                <div className="flex flex-wrap gap-2">
                  {THEME_OPTIONS.map(option => (
                    <button
                      key={option.key}
                      onClick={() => {
                        setTheme(option.key)
                        savePreference('hagent_reader_theme', option.key)
                      }}
                      className={`relative h-8 w-8 rounded-full border transition-all ${option.swatch} ${
                        theme === option.key ? `ring-2 ring-offset-2 ${selectedRingClass}` : isWarmTheme ? 'border-[#d9c9b6] hover:border-[#e86f00]/60' : 'border-white/20 hover:border-amber-400/60'
                      }`}
                      title={option.title}
                      aria-label={option.label}
                    >
                      {theme === option.key && (
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#e86f00]">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <section className={`rounded-lg border p-3 ${panelSurfaceClass}`}>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Phông chữ</span>
                    <div className={`flex gap-1 rounded-lg border p-1 ${controlTrackClass}`}>
                      {FONT_OPTIONS.map(option => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setFontFamily(option.key)
                            savePreference('hagent_reader_font', option.key)
                          }}
                          className={`flex-1 ${segmentButtonClass(fontFamily === option.key)}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Cỡ chữ</span>
                    <div className={`flex gap-1 rounded-lg border p-1 ${controlTrackClass}`}>
                      {SIZE_OPTIONS.map(option => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setFontSize(option.key)
                            savePreference('hagent_reader_size', option.key)
                          }}
                          className={`flex-1 ${segmentButtonClass(fontSize === option.key)}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Căn lề</span>
                    <div className={`flex gap-1 rounded-lg border p-1 ${controlTrackClass}`}>
                      {WIDTH_OPTIONS.map(option => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setContainerWidth(option.key)
                            savePreference('hagent_reader_width', option.key)
                          }}
                          className={`flex-1 ${segmentButtonClass(containerWidth === option.key)}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 border-current/10">
                  <div className="min-w-0">
                    <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Đọc liên tục</span>
                    <span className={`mt-0.5 block text-[10px] ${labelClass}`}>Cuộn hết chương tự nối chương kế</span>
                  </div>
                  <div className={`flex gap-1 rounded-lg border p-1 ${controlTrackClass}`}>
                    <button onClick={() => { if (continuousMode) handleToggleContinuous() }} className={segmentButtonClass(!continuousMode)}>Tắt</button>
                    <button onClick={() => { if (!continuousMode) handleToggleContinuous() }} className={segmentButtonClass(continuousMode)}>Bật</button>
                  </div>
                </div>
              </section>

              <section className={`rounded-lg border p-3 lg:col-span-2 ${panelSurfaceClass}`}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Giọng đọc</span>
                      <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${ttsChipClass}`}>
                        <Volume2 className="h-3 w-3 text-[#e86f00]" />
                        {selectedTtsProvider.shortLabel}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {TTS_PROVIDERS.map(option => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setTtsServer(option.key)
                            savePreference('hagent_reader_ttsServer', option.key)
                          }}
                          className={`min-h-12 rounded-lg border px-3 py-2 text-left transition-all ${
                            ttsServer === option.key
                              ? `${activeControlClass} border-transparent`
                              : `${controlTrackClass} ${inactiveControlClass}`
                          }`}
                        >
                          <span className="block text-xs font-semibold">{option.label}</span>
                          <span className={`mt-0.5 block text-[10px] ${ttsServer === option.key ? 'text-white/75' : labelClass}`}>{option.meta}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`block text-[10px] font-semibold uppercase ${labelClass}`}>Tốc độ đọc</span>
                      <span className={`text-[11px] font-semibold ${isWarmTheme ? 'text-[#e86f00]' : 'text-amber-400'}`}>{selectedTtsSpeed.label}</span>
                    </div>
                    <div className={`grid grid-cols-5 gap-1 rounded-lg border p-1 ${controlTrackClass}`}>
                      {TTS_SPEED_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          onClick={() => handleTtsSpeedChange(option.value)}
                          className={segmentButtonClass(ttsSpeed === option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Reader Layout Body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onClick={() => {
          setShowSettings(false)
          setShowChaptersMenu(false)
        }}
        className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-8 relative"
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600/20 border-t-amber-600"></div>
            <p className="text-xs opacity-60 font-sans">Đang tải nội dung chương...</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3">
            <AlertCircle className="h-10 w-10 text-red-500 opacity-80" />
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <button
              onClick={() => setCurrentChapter(currentChapter)}
              className="mt-2 rounded-full bg-amber-600 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-amber-600/10"
            >
              Thử tải lại chương
            </button>
          </div>
        ) : (
          <article className={`mx-auto ${WIDTHS[containerWidth]} pb-20`}>
            {(() => {
              let gi = -1
              return parsedSections.map((sec, sIdx) => (
                <div key={sec.slug} ref={el => sectionRefs.current[sIdx] = el}>
                  {sIdx === 0 ? (
                    <header className="mb-10 text-center border-b border-gray-400/10 pb-6">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-amber-600/80 mb-2 block font-sans">
                        {story.title}
                      </span>
                      <h1 className="text-xl sm:text-2xl font-bold font-sans tracking-tight leading-tight">
                        {getChapterLabel(sec)}
                      </h1>
                    </header>
                  ) : (
                    <div className="my-12 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-widest text-amber-600/70">
                      <span className="h-px flex-1 bg-gray-400/15"></span>
                      <span className="shrink-0 truncate max-w-[60%]">{getChapterLabel(sec)}</span>
                      <span className="h-px flex-1 bg-gray-400/15"></span>
                    </div>
                  )}

                  <div className={`space-y-3 font-medium selection:bg-amber-600 selection:text-white ${FONTS[fontFamily]} ${SIZES[fontSize]}`}>
                    {sec.paragraphs.map(pText => {
                      gi += 1
                      const idx = gi
                      const isActive = activeParagraphIndex === idx
                      return (
                        <p
                          key={idx}
                          ref={el => paragraphRefs.current[idx] = el}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTtsParagraphClick(idx)
                          }}
                          className={`rounded-lg px-2.5 py-1 transition-all duration-300 cursor-pointer relative group ${
                            isActive
                              ? theme === 'light' || theme === 'sepia' ? 'bg-amber-500/10 border-l-4 border-amber-600 pl-3 scale-[1.01]' : 'bg-white/10 border-l-4 border-amber-500 pl-3 scale-[1.01]'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 border-l-4 border-transparent'
                          }`}
                        >
                          {/* Speaker play indicator */}
                          <span className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-amber-600 hidden md:block">
                            <Volume2 className="h-3.5 w-3.5" />
                          </span>
                          {pText}
                        </p>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}

            {continuousMode ? (
              <div className="mt-12 pt-6 border-t border-gray-400/10 flex items-center justify-center font-sans text-xs text-gray-400">
                {appendingNext ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600/20 border-t-amber-600"></span>
                    Đang tải chương tiếp...
                  </span>
                ) : getNextAfterLastSection() ? (
                  <span>Cuộn xuống để đọc tiếp</span>
                ) : (
                  <span>— Hết truyện —</span>
                )}
              </div>
            ) : (
              <div className="mt-16 pt-8 border-t border-gray-400/10 flex items-center justify-between font-sans text-xs">
                <button
                  disabled={!prevChapter}
                  onClick={() => {
                    if (prevChapter) setCurrentChapter(prevChapter)
                  }}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-2 font-bold transition-all shadow-sm ${
                    prevChapter
                      ? 'border-amber-600 text-amber-600 bg-transparent hover:bg-amber-600/5'
                      : 'border-transparent opacity-30 cursor-not-allowed'
                  }`}
                >
                  ← Chương trước
                </button>

                <button
                  onClick={() => {
                    stopAudio()
                    onBack()
                  }}
                  className="text-gray-400 hover:text-amber-600 font-bold transition-colors"
                >
                  Mục lục truyện
                </button>

                <button
                  disabled={!nextChapter}
                  onClick={() => {
                    if (nextChapter) setCurrentChapter(nextChapter)
                  }}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-2 font-bold transition-all shadow-sm ${
                    nextChapter
                      ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700 shadow-amber-600/10'
                      : 'border-transparent opacity-30 cursor-not-allowed'
                  }`}
                >
                  Chương sau →
                </button>
              </div>
            )}
          </article>
        )}
      </div>

      {/* Floating Audio Controller for TTS */}
      {ttsEnabled && activeParagraphIndex !== -1 && (
        <div className={`border-t px-3 sm:px-6 py-3 transition-all z-20 flex items-center justify-between gap-2 sm:gap-4 font-sans text-xs premium-shadow ${currentTheme.card} ${currentTheme.border}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-amber-600/10 text-amber-600 animate-pulse shrink-0">
              <Volume2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold whitespace-nowrap text-[10px] text-amber-600 uppercase tracking-wider">Đang phát giọng đọc AI</div>
              <div className="text-[11px] truncate mt-0.5 max-w-[120px] sm:max-w-md font-medium">
                {paragraphs[activeParagraphIndex] || '...'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Skip back paragraph */}
            <button
              onClick={() => playParagraph(activeParagraphIndex - 1)}
              disabled={activeParagraphIndex <= 0 || ttsLoading}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-gray-500 hover:text-gray-800 dark:hover:text-white disabled:opacity-40"
              title="Đoạn trước"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            {/* Play/Pause toggle */}
            <button
              onClick={handleTtsPlayPause}
              disabled={ttsLoading}
              className="p-2.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-sm shadow-amber-600/25 flex items-center justify-center disabled:opacity-50"
              title={ttsPlaying ? 'Tạm dừng' : 'Tiếp tục phát'}
            >
              {ttsLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : ttsPlaying ? (
                <Pause className="h-4 w-4 fill-white" />
              ) : (
                <Play className="h-4 w-4 fill-white ml-0.5" />
              )}
            </button>

            {/* Skip forward paragraph */}
            <button
              onClick={() => playParagraph(activeParagraphIndex + 1)}
              disabled={activeParagraphIndex >= paragraphs.length - 1 || ttsLoading}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-gray-500 hover:text-gray-800 dark:hover:text-white disabled:opacity-40"
              title="Đoạn sau"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Stop TTS mode */}
            <button
              onClick={handleTtsStop}
              className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-all"
              title="Dừng nghe đọc"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
