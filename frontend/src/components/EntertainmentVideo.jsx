import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  ExternalLink,
  Film,
  Languages,
  Link as LinkIcon,
  ListVideo,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Volume2,
  X,
  Youtube,
} from 'lucide-react'
import {
  DEFAULT_VIDEO_VOLUME,
  DEFAULT_YOUTUBE_QUALITY,
  DEFAULT_YOUTUBE_VOLUME,
  TTS_PREFETCH_AHEAD,
  VIDEO_CATEGORIES,
  VIDEO_LIBRARY_KEY,
  VOICE_CHOICES,
  buildFallbackNarration,
  buildVideoSource,
  chunkSpeechSegments,
  decorateVideoCategories,
  displayTime,
  formatTime,
  isVietnameseLang,
  loadBool,
  loadLibrary,
  loadProgressMap,
  normalizeSourceLang,
  progressKey,
  progressLabel,
  saveProgressMap,
  savedProgressFor,
  videoCategory,
  videoCategoryLabel,
  videoCategoryMeta,
  videoLanguageMeta,
  voiceMeta,
  withYoutubeJsApi,
} from '../lib/entertainmentVideoUtils.js'

const ACTIVE_VIDEO_KEY = 'hagent_entertainment_active_video'
const BROWSER_VOICE_KEY = 'hagent_entertainment_voice_choice'
const AUTO_TRANSLATE_NON_VI_KEY = 'hagent_video_auto_translate_non_vi'
const SHOW_ADD_PANEL_KEY = 'hagent_video_show_add_panel'
const SHOW_ADD_FORM_KEY = 'hagent_video_show_add_form'
const SHOW_DUB_PANEL_KEY = 'hagent_video_show_dub_panel'
const SHOW_CAPTURE_PANEL_KEY = 'hagent_video_show_capture_panel'
const SHOW_LIST_KEY = 'hagent_video_show_list'
const isMediaGestureError = (error) => error?.name === 'NotAllowedError' || /not allowed by the user agent|denied permission/i.test(error?.message || '')

function Player({ item, localFileUrl, iframeRef, videoRef, youtubeStartPosition }) {
  const applyDefaultVolume = event => {
    event.currentTarget.muted = false
    event.currentTarget.volume = DEFAULT_VIDEO_VOLUME
  }

  if (localFileUrl) {
    return (
      <video
        key={localFileUrl}
        ref={videoRef}
        src={localFileUrl}
        controls
        autoPlay
        playsInline
        crossOrigin="anonymous"
        onLoadedMetadata={applyDefaultVolume}
        className="h-full w-full bg-black object-contain"
      />
    )
  }

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#101114] text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Clapperboard className="h-8 w-8 text-amber-300" />
        </div>
        <div className="text-center">
          <div className="text-sm font-bold">Chưa chọn video</div>
          <div className="mt-1 text-xs text-white/45">Dán link để bắt đầu</div>
        </div>
      </div>
    )
  }

  if (item.type === 'direct') {
    return (
      <video
        key={item.id}
        ref={videoRef}
        src={item.src}
        controls
        autoPlay
        playsInline
        crossOrigin="anonymous"
        onLoadedMetadata={applyDefaultVolume}
        className="h-full w-full bg-black object-contain"
      />
    )
  }

  return (
    <iframe
      key={`${item.id}:${Math.floor(youtubeStartPosition || 0)}`}
      ref={iframeRef}
      title={item.title}
      src={withYoutubeJsApi(item.src, youtubeStartPosition)}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      className="h-full w-full border-0 bg-black"
    />
  )
}

function authHeaders(token, json = false) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export default function EntertainmentVideo({ token, chromeVisible = true }) {
  const [videos, setVideos] = useState(() => loadLibrary())
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_VIDEO_KEY) || '')
  const [linkInput, setLinkInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('other')
  const [videoCategories, setVideoCategories] = useState(() => decorateVideoCategories(VIDEO_CATEGORIES))
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const categoryMenuRef = useRef(null)
  const filterRef = useRef(null)
  const [error, setError] = useState('')
  const [localFile, setLocalFile] = useState(null)
  const [localFileUrl, setLocalFileUrl] = useState('')
  const [showAddPanel, setShowAddPanel] = useState(() => loadBool(SHOW_ADD_PANEL_KEY, true))
  const [showAddForm, setShowAddForm] = useState(() => loadBool(
    SHOW_ADD_FORM_KEY,
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches,
  ))
  const [showDubPanel, setShowDubPanel] = useState(() => loadBool(SHOW_DUB_PANEL_KEY, false))
  const [showCapturePanel, setShowCapturePanel] = useState(() => loadBool(SHOW_CAPTURE_PANEL_KEY, false))
  const [showList, setShowList] = useState(() => loadBool(SHOW_LIST_KEY, true))
  const [captures, setCaptures] = useState([])
  const [capturesLoading, setCapturesLoading] = useState(false)
  const [captureEditUrl, setCaptureEditUrl] = useState('')
  const [captureEditTitle, setCaptureEditTitle] = useState('')
  const [voiceChoice, setVoiceChoice] = useState(() => {
    const saved = localStorage.getItem(BROWSER_VOICE_KEY)
    return VOICE_CHOICES.some(v => v.id === saved) ? saved : 'hoaimy'
  })
  const [quickDubBusy, setQuickDubBusy] = useState(false)
  const [quickDubStatus, setQuickDubStatus] = useState('')
  const [quickDubIndex, setQuickDubIndex] = useState(0)
  const [quickDubTotal, setQuickDubTotal] = useState(0)
  const [autoTranslateNonVi, setAutoTranslateNonVi] = useState(() => localStorage.getItem(AUTO_TRANSLATE_NON_VI_KEY) !== '0')
  const [captureBusy, setCaptureBusy] = useState(false)
  const [captureStatus, setCaptureStatus] = useState('')
  const [captureResult, setCaptureResult] = useState(null)
  const [speechRate, setSpeechRate] = useState(1)
  const [speaking, setSpeaking] = useState(false)
  const [youtubeStartPosition, setYoutubeStartPosition] = useState(0)
  const fileInputRef = useRef(null)
  const iframeRef = useRef(null)
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const audioUrlRef = useRef('')
  const audioPlayTokenRef = useRef(0)
  const stopSpeechRef = useRef(false)
  const ttsCacheRef = useRef(new Map())
  const progressSaveRef = useRef({ at: 0, id: '', position: 0 })
  const youtubeInfoRef = useRef({ position: 0, duration: 0 })
  const youtubePausedRef = useRef(false)
  const quickDubRef = useRef(null)
  const autoDubDoneRef = useRef('')
  const captureStatusTimerRef = useRef(null)
  const activeVideoIdRef = useRef('')
  const speechSessionRef = useRef(0)

  // id từ DB là số, activeId lưu localStorage là chuỗi → so sánh ép kiểu để khớp đúng video đã mở.
  const activeVideo = useMemo(() => videos.find(item => String(item.id) === String(activeId)) || videos[0] || null, [videos, activeId])
  const filteredVideos = useMemo(
    () => categoryFilter === 'all' ? videos : videos.filter(item => videoCategory(item.category, videoCategories) === categoryFilter),
    [videos, categoryFilter, videoCategories],
  )
  const categoryCounts = useMemo(() => {
    const counts = { all: videos.length }
    videoCategories.forEach(item => { counts[item.id] = 0 })
    videos.forEach(item => {
      const id = videoCategory(item.category, videoCategories)
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  }, [videos, videoCategories])

  useEffect(() => {
    activeVideoIdRef.current = activeVideo?.id || ''
  }, [activeVideo?.id])

  useEffect(() => {
    if (!filterOpen) return
    const onDown = event => { if (filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  useEffect(() => {
    if (!categoryMenuOpen) return
    const onDown = event => { if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target)) setCategoryMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [categoryMenuOpen])

  useEffect(() => {
    let cancelled = false

    async function loadVideoCategories() {
      if (!token) return
      try {
        const res = await fetch('/api/entertainment/videos/categories', {
          headers: authHeaders(token),
        })
        if (!res.ok) throw new Error('Không tải được chủ đề video')
        const data = await res.json()
        if (!cancelled) setVideoCategories(decorateVideoCategories(data.categories || []))
      } catch {
        if (!cancelled) setVideoCategories(decorateVideoCategories(VIDEO_CATEGORIES))
      }
    }

    loadVideoCategories()
    return () => {
      cancelled = true
    }
  }, [token])

  const fetchRealVideoTitle = async (source) => {
    const currentTitle = (source?.title || '').trim()
    if (currentTitle && !/^YouTube\s+[A-Za-z0-9_-]+$/.test(currentTitle)) return currentTitle
    const sourceUrl = source?.openUrl || source?.input || ''
    if (!token || !sourceUrl || source?.type !== 'youtube') return currentTitle
    try {
      const res = await fetch(`/api/video/tasks/yt/info?url=${encodeURIComponent(sourceUrl)}`, {
        headers: authHeaders(token),
      })
      if (!res.ok) return currentTitle
      const data = await res.json()
      return (data.title || '').trim() || currentTitle
    } catch {
      return currentTitle
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadVideos() {
      if (!token) return
      try {
        const res = await fetch('/api/entertainment/videos', {
          headers: authHeaders(token),
        })
        if (!res.ok) throw new Error('Không tải được DB video')
        const data = await res.json()
        let nextVideos = data.videos || []
        const cached = loadLibrary()
        if (nextVideos.length === 0 && cached.length > 0) {
          const migrated = []
          for (const item of cached) {
            const realTitle = await fetchRealVideoTitle(item)
            if (realTitle) item.title = realTitle
            const saved = await saveVideoToDb(item)
            migrated.push(saved || item)
          }
          nextVideos = migrated
        }
        const repaired = []
        for (const item of nextVideos) {
          const realTitle = await fetchRealVideoTitle(item)
          if (realTitle && realTitle !== item.title) {
            const saved = await saveVideoToDb({ ...item, title: realTitle })
            repaired.push(saved || { ...item, title: realTitle })
          } else {
            repaired.push(item)
          }
        }
        nextVideos = repaired
        if (!cancelled) setVideos(nextVideos)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Không tải được thư viện video')
      }
    }

    loadVideos()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    let cancelled = false

    async function loadCaptures() {
      if (!token) return
      setCapturesLoading(true)
      try {
        const res = await fetch('/api/entertainment/videos/snapshots?limit=80', {
          headers: authHeaders(token),
        })
        if (!res.ok) throw new Error('Không tải được ảnh đã chụp')
        const data = await res.json()
        if (!cancelled) setCaptures(data.captures || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Không tải được ảnh đã chụp')
      } finally {
        if (!cancelled) setCapturesLoading(false)
      }
    }

    loadCaptures()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    localStorage.setItem(VIDEO_LIBRARY_KEY, JSON.stringify(videos))
  }, [videos])

  useEffect(() => {
    if (activeVideo?.id) localStorage.setItem(ACTIVE_VIDEO_KEY, activeVideo.id)
  }, [activeVideo?.id])

  useEffect(() => {
    localStorage.setItem(BROWSER_VOICE_KEY, voiceChoice)
  }, [voiceChoice])

  useEffect(() => {
    localStorage.setItem(AUTO_TRANSLATE_NON_VI_KEY, autoTranslateNonVi ? '1' : '0')
  }, [autoTranslateNonVi])

  useEffect(() => {
    localStorage.setItem(SHOW_ADD_PANEL_KEY, showAddPanel ? '1' : '0')
    localStorage.setItem(SHOW_ADD_FORM_KEY, showAddForm ? '1' : '0')
    localStorage.setItem(SHOW_DUB_PANEL_KEY, showDubPanel ? '1' : '0')
    localStorage.setItem(SHOW_CAPTURE_PANEL_KEY, showCapturePanel ? '1' : '0')
    localStorage.setItem(SHOW_LIST_KEY, showList ? '1' : '0')
  }, [showAddPanel, showAddForm, showDubPanel, showCapturePanel, showList])

  useEffect(() => {
    if (linkInput || titleInput) setShowAddForm(true)
  }, [linkInput, titleInput])

  // Tự nhận diện ngôn ngữ; chỉ dịch + phát khi video không phải tiếng Việt (mỗi video một lần).
  useEffect(() => {
    if (!autoTranslateNonVi || !activeVideo || localFile) return
    if (activeVideo.type !== 'youtube') return
    if (isVietnameseLang(activeVideo.sourceLang)) return
    if (autoDubDoneRef.current === activeVideo.id) return
    autoDubDoneRef.current = activeVideo.id
    quickDubRef.current?.({ autoOnly: true })
  }, [activeVideo?.id, activeVideo?.sourceLang, autoTranslateNonVi, localFile])

  useEffect(() => {
    if (!localFile) {
      setLocalFileUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
      return
    }
    const nextUrl = URL.createObjectURL(localFile)
    setLocalFileUrl(nextUrl)
    return () => {
      URL.revokeObjectURL(nextUrl)
    }
  }, [localFile])

  useEffect(() => () => {
    stopSpeechRef.current = true
    audioPlayTokenRef.current += 1
    if (captureStatusTimerRef.current) window.clearTimeout(captureStatusTimerRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    ttsCacheRef.current.clear()
  }, [])

  const getSavedProgress = (item = activeVideo) => {
    if (!item) return { position: 0, duration: 0 }
    const { position, duration } = savedProgressFor(item)
    if (!Number.isFinite(position) || position < 5) return { position: 0, duration }
    if (duration > 0 && position >= duration - 8) return { position: 0, duration }
    return { position, duration }
  }

  useEffect(() => {
    if (!activeVideo || activeVideo.type !== 'youtube') {
      setYoutubeStartPosition(0)
      return
    }
    setYoutubeStartPosition(getSavedProgress(activeVideo).position)
  }, [activeVideo?.id])

  const savePlaybackProgress = async (item, position, duration = 0, force = false, reset = false) => {
    if (!item || localFile) return
    const pos = Math.max(0, Number(position) || 0)
    const dur = Math.max(0, Number(duration) || 0)
    // An iframe that is loading or blocked often reports 0. Never let that
    // erase a real saved position unless playback actually ended.
    if (pos < 1 && !reset) return
    const now = Date.now()
    const last = progressSaveRef.current
    if (!force && last.id === item.id && Math.abs(last.position - pos) < 3 && now - last.at < 5000) return
    if (!force && last.id === item.id && now - last.at < 5000) return

    const storedPosition = reset || (dur > 0 && pos >= dur - 8) ? 0 : pos
    progressSaveRef.current = { at: now, id: item.id, position: storedPosition }
    const key = progressKey(item)
    const map = loadProgressMap()
    map[key] = { position: storedPosition, duration: dur, watchedAt: now }
    saveProgressMap(map)
    setVideos(prev => prev.map(video => (
      video.id === item.id
        ? { ...video, progressPosition: storedPosition, progressDuration: dur, watchedAt: now }
        : video
    )))

    if (!token || !Number.isFinite(Number(item.id))) return
    try {
      const res = await fetch(`/api/entertainment/videos/${item.id}/progress`, {
        method: 'PATCH',
        headers: authHeaders(token, true),
        body: JSON.stringify({ position: storedPosition, duration: dur }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.video) {
          setVideos(prev => prev.map(video => (video.id === item.id ? data.video : video)))
        }
      }
    } catch {
      // Local progress is already saved; DB sync can retry on the next tick.
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeVideo || activeVideo.type === 'youtube') return undefined
    let resumed = false
    const applyResume = () => {
      if (resumed || speaking) return
      const { position, duration } = getSavedProgress(activeVideo)
      const knownDuration = video.duration || duration
      if (position > 5 && (!knownDuration || position < knownDuration - 8)) {
        video.currentTime = position
      }
      resumed = true
    }
    const handleProgress = () => {
      savePlaybackProgress(activeVideo, video.currentTime, video.duration || 0)
    }
    video.addEventListener('loadedmetadata', applyResume)
    video.addEventListener('timeupdate', handleProgress)
    video.addEventListener('pause', handleProgress)
    const handleEnded = () => savePlaybackProgress(activeVideo, 0, video.duration || 0, true, true)
    video.addEventListener('ended', handleEnded)
    if (video.readyState >= 1) applyResume()
    return () => {
      handleProgress()
      video.removeEventListener('loadedmetadata', applyResume)
      video.removeEventListener('timeupdate', handleProgress)
      video.removeEventListener('pause', handleProgress)
      video.removeEventListener('ended', handleEnded)
    }
  }, [activeVideo?.id, localFileUrl, speaking])

  const saveVideoToDb = async (source) => {
    if (!token) return null
    const res = await fetch('/api/entertainment/videos', {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({
        title: source.title,
        input: source.input,
        src: source.src,
        open_url: source.openUrl,
        video_type: source.type,
        category: videoCategory(source.category, videoCategories),
        source_lang: normalizeSourceLang(source.sourceLang || source.source_lang),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || 'Không lưu được link vào DB')
    }
    const data = await res.json()
    return data.video
  }

  const addVideo = async () => {
    const source = buildVideoSource(linkInput, titleInput)
    if (!source) {
      setError('Link không hợp lệ')
      return
    }
    try {
      source.category = categoryInput
      const realTitle = await fetchRealVideoTitle(source)
      if (realTitle) source.title = realTitle
      if (!source.title) source.title = source.openUrl || source.input || source.src
      const saved = await saveVideoToDb(source)
      const next = saved || source
      setVideos(prev => [next, ...prev.filter(item => item.src !== next.src)])
      setActiveId(next.id)
      setLocalFile(null)
      setLinkInput('')
      setTitleInput('')
      setCategoryInput('other')
      setError('')
      setShowAddForm(false)
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
        setShowAddPanel(false)
      }
    } catch (e) {
      setError(e.message || 'Không lưu được link vào DB')
    }
  }

  const updateVideoCategory = async (item, category) => {
    const nextCategory = videoCategory(category, videoCategories)
    setVideos(prev => prev.map(video => (video.id === item.id ? { ...video, category: nextCategory } : video)))
    if (!token || !Number.isFinite(Number(item.id))) return
    try {
      const res = await fetch(`/api/entertainment/videos/${item.id}/category`, {
        method: 'PATCH',
        headers: authHeaders(token, true),
        body: JSON.stringify({ category: nextCategory }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Không đổi được chủ đề')
      if (data.video) {
        setVideos(prev => prev.map(video => (video.id === item.id ? data.video : video)))
      }
    } catch (e) {
      setVideos(prev => prev.map(video => (video.id === item.id ? { ...video, category: videoCategory(item.category, videoCategories) } : video)))
      setError(e.message || 'Không đổi được chủ đề')
    }
  }

  const addVideoCategory = async () => {
    const label = newCategoryLabel.trim()
    if (!label || categoryBusy) return
    setCategoryBusy(true)
    setError('')
    try {
      const res = await fetch('/api/entertainment/videos/categories', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ label }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Không thêm được chủ đề')
      const nextCategories = decorateVideoCategories([
        ...videoCategories.filter(item => item.id !== data.category?.id),
        data.category,
      ].filter(Boolean))
      setVideoCategories(nextCategories)
      if (data.category?.id) setCategoryInput(data.category.id)
      setNewCategoryLabel('')
      setCategoryMenuOpen(false)
    } catch (e) {
      setError(e.message || 'Không thêm được chủ đề')
    } finally {
      setCategoryBusy(false)
    }
  }

  const pauseVideoPlayback = () => {
    const frame = iframeRef.current
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
    }
    const video = videoRef.current
    if (video) video.pause()
  }

  const stopActiveAudio = () => {
    audioPlayTokenRef.current += 1
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = ''
    }
  }

  const stopSpeechPlayback = () => {
    speechSessionRef.current += 1
    stopSpeechRef.current = true
    const frame = iframeRef.current
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [DEFAULT_YOUTUBE_VOLUME] }), '*')
    }

    const video = videoRef.current
    if (video) {
      video.pause()
      video.muted = false
      video.volume = DEFAULT_VIDEO_VOLUME
    }

    stopActiveAudio()
    ttsCacheRef.current.clear()
    setSpeaking(false)
    setQuickDubBusy(false)
    setQuickDubIndex(0)
    setQuickDubTotal(0)
    setQuickDubStatus('')
  }

  const removeVideo = async (id) => {
    if (String(id) === String(activeId)) stopSpeechPlayback()
    if (token && Number.isFinite(Number(id))) {
      try {
        const res = await fetch(`/api/entertainment/videos/${id}`, {
          method: 'DELETE',
          headers: authHeaders(token),
        })
        if (!res.ok) throw new Error('Không xoá được video')
      } catch (e) {
        setError(e.message || 'Không xoá được video')
        return
      }
    }
    setVideos(prev => {
      const next = prev.filter(item => item.id !== id)
      if (String(id) === String(activeId)) setActiveId(next[0]?.id || '')
      return next
    })
  }

  const clearAll = async () => {
    if (!window.confirm('Xoá toàn bộ danh sách video đã lưu?')) return
    stopSpeechPlayback()
    if (token) {
      try {
        const res = await fetch('/api/entertainment/videos', {
          method: 'DELETE',
          headers: authHeaders(token),
        })
        if (!res.ok) throw new Error('Không xoá được danh sách')
      } catch (e) {
        setError(e.message || 'Không xoá được danh sách')
        return
      }
    }
    setVideos([])
    setActiveId('')
    setLocalFile(null)
    localStorage.removeItem(ACTIVE_VIDEO_KEY)
  }

  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Chỉ chọn file video')
      return
    }
    stopSpeechPlayback()
    setLocalFile(file)
    setActiveId('')
    setError('')
  }

  const selectVideo = (item) => {
    if (item.id !== activeVideo?.id || localFile) stopSpeechPlayback()
    setActiveId(item.id)
    setLocalFile(null)
    setError('')
  }

  const youtubeCommand = (func, args = []) => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(JSON.stringify({
      event: 'command',
      func,
      args,
    }), '*')
  }

  const youtubeListen = () => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(JSON.stringify({
      event: 'listening',
      id: 'hagent-entertainment-video',
    }), '*')
  }

  const setYoutubeDefaultAudio = () => {
    youtubeCommand('unMute')
    youtubeCommand('setVolume', [DEFAULT_YOUTUBE_VOLUME])
  }

  const restoreDefaultVideoAudio = () => {
    if (activeVideo?.type === 'youtube') {
      setYoutubeDefaultAudio()
      return
    }
    const video = videoRef.current
    if (!video) return
    video.muted = false
    video.volume = DEFAULT_VIDEO_VOLUME
  }

  const configureYoutubeDefaults = () => {
    youtubeListen()
    setYoutubeDefaultAudio()
    youtubeCommand('setPlaybackQuality', [DEFAULT_YOUTUBE_QUALITY])
    youtubeCommand('setPlaybackQualityRange', [DEFAULT_YOUTUBE_QUALITY, DEFAULT_YOUTUBE_QUALITY])
  }

  const currentPlaybackPosition = () => {
    if (!localFile && activeVideo?.type === 'youtube') return Math.max(0, Number(youtubeInfoRef.current.position) || 0)
    return Math.max(0, Number(videoRef.current?.currentTime) || 0)
  }

  const currentPlaybackDuration = () => {
    if (!localFile && activeVideo?.type === 'youtube') return Math.max(0, Number(youtubeInfoRef.current.duration) || Number(activeVideo?.progressDuration) || 0)
    return Math.max(0, Number(videoRef.current?.duration) || Number(activeVideo?.progressDuration) || 0)
  }

  const isVideoPaused = () => {
    if (!localFile && activeVideo?.type === 'youtube') return youtubePausedRef.current
    return Boolean(videoRef.current?.paused)
  }

  const prepareVideoForDub = async () => {
    if (activeVideo?.type === 'youtube') {
      youtubeListen()
      youtubeCommand('getCurrentTime')
      await new Promise(resolve => window.setTimeout(resolve, 250))
      const saved = getSavedProgress(activeVideo).position
      const current = currentPlaybackPosition()
      const position = current > 1 ? current : saved
      // Giảm âm lượng gốc xuống 30 khi TTS phát; restoreDefaultVideoAudio sẽ khôi phục khi xong.
      youtubeCommand('unMute')
      youtubeCommand('setVolume', [30])
      if (current <= 1 && position > 1) youtubeCommand('seekTo', [position, true])
      youtubeCommand('playVideo')
      window.setTimeout(() => {
        if (stopSpeechRef.current) return
        youtubeCommand('playVideo')
        youtubeCommand('unMute')
        youtubeCommand('setVolume', [30])
      }, 300)
      return position
    }
    const video = videoRef.current
    if (video) {
      const saved = getSavedProgress(activeVideo).position
      const current = currentPlaybackPosition()
      const position = current > 1 ? current : saved
      // Giảm âm lượng gốc xuống 0.3 khi TTS phát; restoreDefaultVideoAudio sẽ khôi phục khi xong.
      video.muted = false
      video.volume = 0.3
      if (current <= 1 && position > 1) video.currentTime = position
      await video.play().catch(() => {})
      return position
    }
    return 0
  }

  useEffect(() => {
    if (!activeVideo || activeVideo.type !== 'youtube') return undefined
    youtubeInfoRef.current = {
      position: Number(activeVideo.progressPosition || 0),
      duration: Number(activeVideo.progressDuration || 0),
    }
    let resumeTimer = null
    let resumeRetry = null
    const handleMessage = (event) => {
      let data = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch {
          return
        }
      }
      const info = data?.info
      if (!info || typeof info !== 'object') return
      const state = Number(info.playerState)
      // YouTube playerState: 1=playing, 2=paused, 3=buffering. Coi 2 là đang dừng.
      if (Number.isFinite(state)) youtubePausedRef.current = state === 2
      const position = Number(info.currentTime)
      const duration = Number(info.duration)
      if (Number.isFinite(position)) youtubeInfoRef.current.position = position
      if (Number.isFinite(duration)) youtubeInfoRef.current.duration = duration
      if (Number.isFinite(position)) {
        savePlaybackProgress(activeVideo, position, Number.isFinite(duration) ? duration : youtubeInfoRef.current.duration)
      }
    }

    const { position } = getSavedProgress(activeVideo)
    resumeTimer = window.setTimeout(() => {
      configureYoutubeDefaults()
      if (!speaking && position > 5) youtubeCommand('seekTo', [position, true])
    }, 900)
    resumeRetry = window.setTimeout(() => {
      configureYoutubeDefaults()
      if (!speaking && position > 5) youtubeCommand('seekTo', [position, true])
    }, 2200)
    const qualityRetry = window.setTimeout(configureYoutubeDefaults, 4500)
    const pollTimer = window.setInterval(() => {
      youtubeListen()
      youtubeCommand('getCurrentTime')
      youtubeCommand('getDuration')
    }, 1200)
    window.addEventListener('message', handleMessage)
    return () => {
      window.clearTimeout(resumeTimer)
      window.clearTimeout(resumeRetry)
      window.clearTimeout(qualityRetry)
      window.clearInterval(pollTimer)
      window.removeEventListener('message', handleMessage)
      const latest = youtubeInfoRef.current
      savePlaybackProgress(activeVideo, latest.position, latest.duration, true)
    }
  }, [activeVideo?.id])

  useEffect(() => {
    const flush = () => {
      if (activeVideo?.type === 'youtube') {
        const latest = youtubeInfoRef.current
        savePlaybackProgress(activeVideo, latest.position, latest.duration, true)
      } else if (videoRef.current && activeVideo) {
        savePlaybackProgress(activeVideo, videoRef.current.currentTime, videoRef.current.duration || 0, true)
      }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [activeVideo?.id])

  const playAudioBlob = (blob, maxDurationMs = 0, sessionId = speechSessionRef.current, videoId = activeVideo?.id || '') => new Promise((resolve, reject) => {
    const audioToken = audioPlayTokenRef.current + 1
    audioPlayTokenRef.current = audioToken
    let audio = audioRef.current
    if (!audio) {
      audio = new Audio()
      audioRef.current = audio
    } else {
      audio.onended = null
      audio.onerror = null
      audio.pause()
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = ''
    }
    const url = URL.createObjectURL(blob)
    audio.src = url
    let timeout = null
    let settled = false
    const cleanup = () => {
      if (timeout) window.clearInterval(timeout)
      audio.onended = null
      audio.onerror = null
      URL.revokeObjectURL(url)
      if (audioUrlRef.current === url) audioUrlRef.current = ''
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    audioRef.current = audio
    audioUrlRef.current = url
    audio.preservesPitch = true
    const adjustPlaybackRate = () => {
      const naturalDurationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
      const requiredRate = maxDurationMs > 0 && naturalDurationMs > 0 ? naturalDurationMs / maxDurationMs : 0
      audio.playbackRate = Math.max(0.75, Math.min(Math.max(speechRate, requiredRate), 1.75))
    }
    adjustPlaybackRate()
    audio.onloadedmetadata = adjustPlaybackRate
    audio.ondurationchange = adjustPlaybackRate
    // Theo dõi video: dừng video → dừng đọc; bộ đếm thời gian cũng đóng băng khi dừng.
    let elapsed = 0
    const STEP = 100
    const alive = () => !stopSpeechRef.current
      && speechSessionRef.current === sessionId
      && activeVideoIdRef.current === videoId
      && audioPlayTokenRef.current === audioToken
    timeout = window.setInterval(() => {
      if (settled) return
      if (!alive()) {
        audio.pause()
        audio.src = ''
        finish()
        return
      }
      if (isVideoPaused()) {
        if (!audio.paused) audio.pause()
        return  // đóng băng bộ đếm trong lúc video dừng
      }
      if (audio.paused) audio.play().catch(() => {})
      elapsed += STEP
      if (maxDurationMs > 0 && elapsed >= maxDurationMs + 250) {
        audio.pause()
        audio.src = ''
        finish()
      }
    }, STEP)
    audio.onended = finish
    audio.onerror = () => {
      fail(new Error('Không phát được audio tiếng Việt'))
    }
    audio.play().catch(error => {
      fail(error)
    })
  })

  const fetchTtsBlob = (chunk, index, meta) => {
    const key = `${meta.id}:${speechRate}:${index}`
    if (ttsCacheRef.current.has(key)) return ttsCacheRef.current.get(key)
    const rate = `${speechRate >= 1 ? '+' : ''}${Math.round((speechRate - 1) * 100)}%`
    const requestBlob = async (m) => fetch('/api/tts/speak', {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({
        text: chunk.text,
        server: m.server,
        voice: m.voice,
        rate,
        speed: speechRate,
      }),
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'TTS lỗi')
      }
      return res.blob()
    })
    const promise = requestBlob(meta)
      .catch(error => (meta.server === 'google' ? Promise.reject(error) : requestBlob(voiceMeta('google'))))
      .catch(error => {
        ttsCacheRef.current.delete(key)
        throw error
      })
    ttsCacheRef.current.set(key, promise)
    return promise
  }

  const requestQuickDubWindow = async (sourceUrl, videoId, startAt = 0) => {
    const res = await fetch('/api/entertainment/videos/quick-dub', {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({
        url: sourceUrl,
        video_id: Number.isFinite(Number(videoId)) ? Number(videoId) : null,
        translate_provider: 'google',
        max_segments: 1000,
        start_at: Math.max(0, Number(startAt) || 0),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 404 && Math.max(0, Number(startAt) || 0) > 0) {
        return { segments: [], has_more: false, sourceLang: data.sourceLang || data.source_lang || '' }
      }
      throw new Error(data.detail || 'Không dịch nhanh được video này')
    }
    return data
  }

  const speakSegmentsWithServer = async (
    segments,
    sessionId = speechSessionRef.current,
    videoId = activeVideo?.id || '',
    options = {},
  ) => {
    if (speechSessionRef.current !== sessionId || activeVideoIdRef.current !== videoId) return
    const meta = voiceMeta(voiceChoice)
    const label = meta.label
    stopSpeechRef.current = false
    ttsCacheRef.current.clear()
    setSpeaking(true)
    try {
      setQuickDubStatus(`Chuẩn bị giọng ${label}...`)
      const playbackStart = await prepareVideoForDub()
      // Giữ TẤT CẢ đoạn lời thoại để tua tới/lùi đều đọc đúng vị trí.
      let playableSegments = segments.slice()
      let playableChunks = chunkSpeechSegments(playableSegments)
      let hasMore = Boolean(options?.hasMore)
      if (!playableChunks.length) {
        const fallbackText = buildFallbackNarration(activeVideo)
        playableSegments = [{ start: Math.max(0, playbackStart), duration: 6, text: fallbackText }]
        playableChunks = chunkSpeechSegments(playableSegments)
        if (!playableChunks.length) {
          setQuickDubStatus('Chưa có lời thoại ở đoạn này — sẽ tiếp tục theo dõi.')
          return
        }
        setQuickDubStatus(`Đang tạo lời thoại tự động (${label})...`)
      }
      setQuickDubTotal(playableChunks.length)

      // Bám theo VỊ TRÍ THỰC của video (không dùng đồng hồ ảo) → tua tới/lùi đọc đúng đoạn.
      const alive = () => !stopSpeechRef.current && speechSessionRef.current === sessionId && activeVideoIdRef.current === videoId
      // Chunk ứng với vị trí hiện tại: đang nằm trong chunk, hoặc chunk kế tiếp sắp tới.
      const chunkIndexAt = pos => {
        for (let i = 0; i < playableChunks.length; i += 1) {
          const c = playableChunks[i]
          if (pos < c.start + Math.max(c.duration, 0.8) + 0.4) return i
        }
        return -1
      }

      // Chỉ prefetch quanh VỊ TRÍ HIỆN TẠI và KHÔNG chặn → bắt đầu đọc ngay khi đoạn cần sẵn sàng.
      const prefetchAroundPosition = pos => {
        const startIndex = Math.max(0, chunkIndexAt(pos))
        for (let i = startIndex; i < Math.min(startIndex + TTS_PREFETCH_AHEAD, playableChunks.length); i += 1) {
          fetchTtsBlob(playableChunks[i], i, meta).catch(() => {})
        }
      }
      prefetchAroundPosition(currentPlaybackPosition())

      let lastPlayed = -1
      while (alive()) {
        // Video đang dừng → không bắt đầu đọc đoạn mới, chờ phát lại.
        if (isVideoPaused()) {
          await new Promise(resolve => window.setTimeout(resolve, 150))
          continue
        }
        const pos = currentPlaybackPosition()
        const index = chunkIndexAt(pos)
        if (index < 0) {
          if (hasMore && typeof options?.fetchMore === 'function') {
            setQuickDubStatus('Đang nạp lời thoại tiếp theo...')
            const next = await options.fetchMore(Math.max(0, pos - 1))
            if (!alive()) break
            playableSegments = Array.isArray(next?.segments) ? next.segments.slice() : []
            playableChunks = chunkSpeechSegments(playableSegments)
            hasMore = Boolean(next?.has_more ?? next?.hasMore)
            ttsCacheRef.current.clear()
            lastPlayed = -1
            setQuickDubIndex(0)
            setQuickDubTotal(playableChunks.length)
            if (playableChunks.length) {
              prefetchAroundPosition(pos)
              continue
            }
            if (!hasMore) break
          }
          const duration = currentPlaybackDuration()
          if (duration > 0 && pos < duration - 5) {
            setQuickDubStatus('Đang chờ lời thoại tiếp theo...')
            await new Promise(resolve => window.setTimeout(resolve, 500))
            continue
          }
          break
        }
        const chunk = playableChunks[index]
        // Chưa tới đoạn này → chờ, vẫn poll để bắt kịp khi người dùng tua.
        if (pos < chunk.start - 0.2) {
          await new Promise(resolve => window.setTimeout(resolve, 120))
          continue
        }
        // Đã phát đoạn này rồi (và chưa tua lùi về trước nó) → nhảy sang đoạn sau.
        if (index === lastPlayed) {
          await new Promise(resolve => window.setTimeout(resolve, 120))
          continue
        }
        setQuickDubIndex(index + 1)
        setQuickDubStatus(`Đang xem + nghe ${label} ${index + 1}/${playableChunks.length}`)
        for (let offset = 1; offset <= TTS_PREFETCH_AHEAD; offset += 1) {
          const nextIndex = index + offset
          if (nextIndex < playableChunks.length) fetchTtsBlob(playableChunks[nextIndex], nextIndex, meta).catch(() => {})
        }
        let blob
        try {
          blob = await fetchTtsBlob(chunk, index, meta)
        } catch (e) {
          lastPlayed = index
          continue
        }
        if (!alive()) break
        // Người dùng có thể đã tua trong lúc tải TTS → kiểm tra lại vị trí.
        const posNow = currentPlaybackPosition()
        if (posNow > chunk.start + chunk.duration + 0.6 || posNow < chunk.start - 1) continue
        lastPlayed = index
        const nextStart = playableChunks[index + 1]?.start ?? (chunk.start + chunk.duration)
        const remainingSlotMs = (nextStart - posNow) * 1000 - 120
        if (remainingSlotMs <= 300) continue
        const fullSlotMs = (nextStart - chunk.start) * 1000 - 100
        const slotMs = Math.max(350, Math.min(fullSlotMs, remainingSlotMs))
        await playAudioBlob(blob, slotMs, sessionId, videoId)
      }
      if (!stopSpeechRef.current && speechSessionRef.current === sessionId && activeVideoIdRef.current === videoId) {
        setQuickDubStatus('Đã đọc xong')
      }
    } catch (e) {
      if (!stopSpeechRef.current && speechSessionRef.current === sessionId && activeVideoIdRef.current === videoId) {
        if (isMediaGestureError(e)) {
          setQuickDubStatus('Trình duyệt chặn tự phát audio. Bấm nút loa để nghe.')
          return
        }
        setError(e.message || `Không đọc được bằng ${label}`)
      }
    } finally {
      if (speechSessionRef.current === sessionId && activeVideoIdRef.current === videoId) {
        restoreDefaultVideoAudio()
        setSpeaking(false)
      }
    }
  }

  const unlockAudio = () => {
    if (typeof window === 'undefined') return
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') ctx.resume()
      const source = ctx.createBufferSource()
      source.buffer = ctx.createBuffer(1, 1, 22050)
      source.connect(ctx.destination)
      source.start()
      source.stop(ctx.currentTime + 0.05)
    } catch {}
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current
    const oldSrc = audio.src
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    audio.play()
      .then(() => {
        audio.pause()
        audio.src = oldSrc
      })
      .catch(() => {})
  }

  const startQuickDubbing = async (options = {}) => {
    unlockAudio()
    const autoOnly = Boolean(options?.autoOnly)
    if (!activeVideo) {
      setError('Chọn video trước')
      return
    }
    const sourceUrl = activeVideo.openUrl || activeVideo.input || activeVideo.src
    if (!sourceUrl) {
      setError('Video này không có link nguồn để dịch')
      return
    }
    const requestVideoId = activeVideo.id
    stopSpeechRef.current = true
    stopActiveAudio()
    const sessionId = speechSessionRef.current + 1
    speechSessionRef.current = sessionId
    stopSpeechRef.current = false
    setQuickDubBusy(true)
    // Tạm dừng video trong lúc dịch; prepareVideoForDub sẽ phát lại khi xong.
    if (!autoOnly) pauseVideoPlayback()
    setQuickDubStatus(autoOnly ? 'Đang nhận diện ngôn ngữ video...' : 'Đang dịch, video tạm dừng — sẽ phát khi xong...')
    setError('')
    try {
      const applyQuickDubWindow = (data, fallbackVideoId = activeVideo.id) => {
        const nextSourceLang = normalizeSourceLang(data.sourceLang || data.source_lang)
        if (data.video) {
          setVideos(prev => prev.map(video => (video.id === data.video.id ? data.video : video)))
        } else if (nextSourceLang) {
          setVideos(prev => prev.map(video => (video.id === fallbackVideoId ? { ...video, sourceLang: nextSourceLang } : video)))
        }
        return nextSourceLang
      }
      const fetchMore = async startAt => {
        const next = await requestQuickDubWindow(sourceUrl, requestVideoId, startAt)
        applyQuickDubWindow(next, requestVideoId)
        return next
      }
      const data = await fetchMore(Math.max(0, currentPlaybackPosition() - 1))
      if (speechSessionRef.current !== sessionId || activeVideoIdRef.current !== requestVideoId) return
      const sourceLang = normalizeSourceLang(data.sourceLang || data.source_lang)
      if (autoOnly && isVietnameseLang(sourceLang)) {
        setQuickDubStatus('Video tiếng Việt, không cần dịch')
        return
      }
      const language = videoLanguageMeta(sourceLang)
      const verb = data.translated === false ? 'Đã lấy' : 'Đã dịch'
      setQuickDubStatus(`${verb} ${data.segments?.length || 0} đoạn${sourceLang ? ` · ${language.label}` : ''}`)
      await speakSegmentsWithServer(data.segments || [], sessionId, requestVideoId, {
        hasMore: Boolean(data.has_more ?? data.hasMore),
        fetchMore,
      })
    } catch (e) {
      if (speechSessionRef.current === sessionId && activeVideoIdRef.current === requestVideoId) {
        setQuickDubStatus('')
        setError(e.message || 'Không dịch nhanh được video này')
      }
    } finally {
      if (speechSessionRef.current === sessionId) setQuickDubBusy(false)
    }
  }
  quickDubRef.current = startQuickDubbing

  const stopBrowserSpeech = () => {
    stopSpeechPlayback()
    restoreDefaultVideoAudio()
  }

  const handleDrop = (event) => {
    event.preventDefault()
    handleFile(event.dataTransfer.files?.[0])
  }

  const copyEmbed = async () => {
    if (!activeVideo?.src) return
    try {
      await navigator.clipboard.writeText(activeVideo.src)
    } catch {
      setError('Không copy được link')
    }
  }

  const showCaptureStatus = (message, result = null, autoClear = true) => {
    if (captureStatusTimerRef.current) window.clearTimeout(captureStatusTimerRef.current)
    setCaptureStatus(message)
    setCaptureResult(result)
    if (!message || !autoClear) return
    captureStatusTimerRef.current = window.setTimeout(() => {
      setCaptureStatus('')
      setCaptureResult(null)
    }, 7000)
  }

  const captureVideoFrame = async () => {
    if (!activeVideo && !localFile) {
      setError('Chọn video trước')
      return
    }
    if (!localFile && !['youtube', 'direct'].includes(activeVideo?.type)) {
      setError('Chỉ chụp được YouTube hoặc link video trực tiếp')
      return
    }
    setCaptureBusy(true)
    showCaptureStatus('Đang chụp ảnh...', null, false)
    setError('')
    try {
      if (!localFile && activeVideo?.type === 'youtube') {
        youtubeListen()
        youtubeCommand('getCurrentTime')
        await new Promise(resolve => window.setTimeout(resolve, 300))
      }

      let imageData = ''
      const position = currentPlaybackPosition()
      const sourceUrl = localFile ? '' : activeVideo?.openUrl || activeVideo?.input || activeVideo?.src || ''
      const title = localFile?.name || activeVideo?.title || 'video'
      const video = videoRef.current

      if (video && (localFile || activeVideo?.type === 'direct')) {
        try {
          if (!video.videoWidth || !video.videoHeight) throw new Error('Video chưa sẵn sàng để chụp')
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Trình duyệt không tạo được canvas')
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          imageData = canvas.toDataURL('image/jpeg', 0.95)
        } catch (captureError) {
          if (localFile || !sourceUrl) throw captureError
        }
      }

      if (!imageData && !sourceUrl) throw new Error('Video này không có nguồn để chụp')

      const res = await fetch('/api/entertainment/videos/snapshots', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({
          title,
          video_id: !localFile && Number.isFinite(Number(activeVideo?.id)) ? Number(activeVideo.id) : null,
          video_type: localFile ? 'local' : activeVideo?.type || 'direct',
          url: sourceUrl,
          image_data: imageData,
          position,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Không lưu được ảnh chụp')
      showCaptureStatus(`Đã lưu ${data.filename || 'ảnh chụp'}`, data)
      if (data.url) {
        setCaptures(prev => [data, ...prev.filter(item => item.url !== data.url)])
        setShowCapturePanel(true)
      }
    } catch (e) {
      showCaptureStatus('')
      setError(e.message || 'Không chụp được ảnh video')
    } finally {
      setCaptureBusy(false)
    }
  }

  const removeCapture = async (item) => {
    if (!item?.url || !window.confirm('Xoá ảnh chụp này?')) return
    try {
      const res = await fetch(`/api/entertainment/snapshots?url=${encodeURIComponent(item.url)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Không xoá được ảnh')
      setCaptures(prev => prev.filter(capture => capture.url !== item.url))
    } catch (e) {
      setError(e.message || 'Không xoá được ảnh')
    }
  }

  const renameCapture = async () => {
    const title = captureEditTitle.trim()
    if (!captureEditUrl || !title) return
    try {
      const res = await fetch('/api/entertainment/videos/snapshots', {
        method: 'PATCH',
        headers: authHeaders(token, true),
        body: JSON.stringify({ url: captureEditUrl, title }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Không sửa được ảnh')
      if (data.capture) {
        setCaptures(prev => prev.map(item => (item.url === captureEditUrl ? data.capture : item)))
      }
      setCaptureEditUrl('')
      setCaptureEditTitle('')
    } catch (e) {
      setError(e.message || 'Không sửa được ảnh')
    }
  }

  const canCaptureFrame = Boolean(localFile || ['youtube', 'direct'].includes(activeVideo?.type))

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-[#f6f3ed] text-gray-950 lg:overflow-hidden">
      <div className={`grid min-h-full grid-cols-1 lg:h-full lg:min-h-0 ${showAddPanel ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
        <main className="flex min-h-0 flex-col lg:h-full">
          <div className={`shrink-0 border-b border-black/10 bg-white/70 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3 ${chromeVisible ? '' : 'hidden'}`}>
            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:gap-4">
              <div className="min-w-0 xl:flex-1">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                  <Youtube className="h-3.5 w-3.5" />
                  Video
                </div>
                <h2 className="mt-1 truncate text-sm font-black text-gray-950 sm:text-lg">
                  {localFile ? localFile.name : activeVideo?.title || 'Rạp giải trí'}
                </h2>
              </div>
              <div className="-mx-1 flex w-full min-w-0 items-center gap-2 overflow-x-auto px-1 pb-0.5 no-scrollbar sm:mx-0 sm:px-0 sm:pb-0 xl:flex-1 xl:justify-end">
                {activeVideo?.src && (
                  <button
                    type="button"
                    onClick={startQuickDubbing}
                    disabled={quickDubBusy}
                    className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
                    title="Dịch và lồng tiếng Việt"
                  >
                    {quickDubBusy ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Tiếng Việt</span>
                  </button>
                )}
                {canCaptureFrame && (
                  <button
                    type="button"
                    onClick={captureVideoFrame}
                    disabled={captureBusy}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 shadow-sm transition hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
                    title="Chụp ảnh video đang chiếu"
                    aria-label="Chụp ảnh video đang chiếu"
                  >
                    {captureBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </button>
                )}
                {activeVideo?.src && (
                  <>
                    <button
                      type="button"
                      onClick={copyEmbed}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 shadow-sm transition hover:text-gray-950 sm:h-9 sm:w-9"
                      title="Copy link nhúng"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={activeVideo.openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 shadow-sm transition hover:text-gray-950 sm:h-9 sm:w-9"
                      title="Mở nguồn"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 shadow-sm transition hover:text-gray-950 sm:h-9 sm:w-9"
                  title="Phát file tạm"
                >
                  <Upload className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPanel(value => !value)}
                  className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 shadow-sm transition hover:text-gray-950 sm:h-9 sm:w-9"
                  title={showAddPanel ? 'Ẩn thanh bên' : 'Hiện thanh bên'}
                  aria-label={showAddPanel ? 'Ẩn thanh bên' : 'Hiện thanh bên'}
                >
                  {showAddPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="shrink-0 p-2 sm:p-3 lg:min-h-0 lg:flex-1 lg:p-4">
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={handleDrop}
              className="relative aspect-video w-full overflow-hidden rounded-md border border-black/10 bg-black shadow-[0_16px_48px_rgba(0,0,0,0.2)] sm:rounded-lg lg:h-full lg:min-h-[20rem] lg:aspect-auto lg:shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
            >
              <Player
                item={activeVideo}
                localFileUrl={localFileUrl}
                iframeRef={iframeRef}
                videoRef={videoRef}
                youtubeStartPosition={youtubeStartPosition}
              />
              {localFile && (
                <button
                  type="button"
                  onClick={() => setLocalFile(null)}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur transition hover:bg-black"
                  title="Đóng file tạm"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {captureStatus && (
                <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-black/75 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur">
                  {captureResult?.url ? (
                    <a href={captureResult.url} target="_blank" rel="noreferrer" className="underline decoration-white/40 underline-offset-2">
                      {captureStatus}
                    </a>
                  ) : captureStatus}
                </div>
              )}
            </div>
          </div>
        </main>

        {showAddPanel && (
        <aside className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden overscroll-contain border-t border-black/10 bg-white/90 backdrop-blur-xl lg:border-l lg:border-t-0">
          <div className="shrink-0 border-b border-black/10 p-2 sm:p-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddForm(value => !value)}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-xs font-black uppercase tracking-[0.12em] text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Thêm video</span>
                <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition ${showAddForm ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowAddPanel(false)}
                title="Ẩn thanh bên"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-500 shadow-sm transition hover:text-gray-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {showAddForm && (
            <div className="mt-1.5 space-y-1.5">
              <input
                value={linkInput}
                onChange={event => setLinkInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addVideo()
                }}
                className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
                placeholder="Dán link YouTube hoặc embed"
              />
              <input
                value={titleInput}
                onChange={event => setTitleInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addVideo()
                }}
                className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
                placeholder="Tên video"
              />
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">Chủ đề</div>
                {(() => {
                  const selectedCategory = videoCategoryMeta(categoryInput, videoCategories)
                  const SelectedIcon = selectedCategory.icon
                  return (
                    <div ref={categoryMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setCategoryMenuOpen(open => !open)}
                        className={`flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm font-bold transition ${selectedCategory.badge}`}
                      >
                        <SelectedIcon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">{selectedCategory.label}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 opacity-70 transition ${categoryMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {categoryMenuOpen && (
                        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl shadow-black/10">
                          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
                            {videoCategories.map(category => {
                              const Icon = category.icon
                              const selected = categoryInput === category.id
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => {
                                    setCategoryInput(category.id)
                                    setCategoryMenuOpen(false)
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-bold transition ${
                                    selected ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate text-left">{category.label}</span>
                                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                          <div className="border-t border-black/10 bg-gray-50 p-1.5">
                            <div className="flex gap-1.5">
                              <input
                                value={newCategoryLabel}
                                onChange={event => setNewCategoryLabel(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') addVideoCategory()
                                }}
                                className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[12px] font-medium outline-none transition placeholder:text-gray-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
                                placeholder="Thêm chủ đề"
                              />
                              <button
                                type="button"
                                onClick={addVideoCategory}
                                disabled={categoryBusy || !newCategoryLabel.trim()}
                                className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-600 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Thêm chủ đề"
                              >
                                {categoryBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addVideo}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-amber-500/20 transition hover:bg-amber-600"
                >
                  <LinkIcon className="h-4 w-4" />
                  Lưu link
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 transition hover:text-gray-950"
                  title="Phát file tạm"
                >
                  <Film className="h-4 w-4" />
                </button>
              </div>
            </div>
            )}
            {error && <div className="mt-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600">{error}</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={event => handleFile(event.target.files?.[0])}
            />
          </div>

          {activeVideo && (
            <div className="shrink-0 border-b border-black/10 p-2 sm:p-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDubPanel(value => !value)}
                  className="flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-1 text-left text-[11px] font-black uppercase tracking-[0.12em] text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                >
                  <Languages className="h-3.5 w-3.5" />
                  <span className="truncate">Dịch / nghe</span>
                  <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition ${showDubPanel ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={startQuickDubbing}
                  disabled={quickDubBusy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Dịch và phát tiếng Việt"
                >
                  {quickDubBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={stopBrowserSpeech}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-gray-600 transition hover:text-gray-950"
                  title="Dừng dịch"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {quickDubStatus && (
                <div className="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                  {quickDubStatus}{quickDubTotal > 0 && speaking ? ` · ${quickDubIndex}/${quickDubTotal}` : ''}
                </div>
              )}
              {showDubPanel && (
              <div className="mt-1.5 space-y-1.5">
                <div className="grid grid-cols-2 rounded-lg border border-black/10 bg-white p-0.5">
                  {VOICE_CHOICES.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVoiceChoice(item.id)}
                      className={`h-7 rounded-md px-3 text-xs font-black transition ${voiceChoice === item.id ? 'bg-gray-950 text-white' : 'text-gray-500 hover:text-gray-950'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.05"
                    value={speechRate}
                    onChange={event => setSpeechRate(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-emerald-600"
                    title="Tốc độ đọc"
                  />
                  <span className="w-10 text-right text-[10px] font-black text-gray-400">{speechRate.toFixed(2)}x</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startQuickDubbing}
                    disabled={quickDubBusy}
                    className="flex h-8 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
                  >
                    {quickDubBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                    {speaking ? 'Đọc lại' : 'Dịch + phát'}
                  </button>
                  <button
                    type="button"
                    onClick={stopBrowserSpeech}
                    className="flex h-8 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:text-gray-950"
                  >
                    <X className="h-4 w-4" />
                    Dừng
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoTranslateNonVi(value => !value)}
                  className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-[11px] font-bold transition ${autoTranslateNonVi ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-black/10 bg-white text-gray-500 hover:text-gray-950'}`}
                  title="Tự nhận diện ngôn ngữ và dịch khi video không phải tiếng Việt"
                >
                  <span className="flex items-center gap-2">
                    <Languages className="h-3.5 w-3.5" />
                    Tự dịch video ngoại ngữ
                  </span>
                  <span className={`flex h-5 w-8 items-center rounded-full p-0.5 transition ${autoTranslateNonVi ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                    <span className={`h-4 w-4 rounded-full bg-white shadow transition ${autoTranslateNonVi ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
              </div>
              )}
            </div>
          )}

          <div className="shrink-0 border-b border-black/10 p-2 sm:p-3">
            <button
              type="button"
              onClick={() => setShowCapturePanel(value => !value)}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-[11px] font-black uppercase tracking-[0.12em] text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
            >
              <Camera className="h-3.5 w-3.5" />
              <span className="truncate">Ảnh đã chụp</span>
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{captures.length}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${showCapturePanel ? 'rotate-180' : ''}`} />
            </button>
            {showCapturePanel && (
              <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 custom-scrollbar">
                {capturesLoading ? (
                  <div className="flex h-16 items-center justify-center text-[11px] font-bold text-gray-400">
                    <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Đang tải ảnh
                  </div>
                ) : captures.length === 0 ? (
                  <div className="flex h-16 items-center justify-center text-[11px] font-bold text-gray-400">Chưa có ảnh chụp</div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {captures.map(item => (
                      <div key={item.url} className="group relative overflow-hidden rounded-lg border border-black/10 bg-gray-50">
                        <a href={item.url} target="_blank" rel="noreferrer" title={item.filename}>
                          <img src={item.url} alt={item.filename} className="aspect-video w-full object-cover" loading="lazy" />
                        </a>
                        <div className="absolute right-1 top-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <a href={item.url} target="_blank" rel="noreferrer" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black" title="Xem ảnh">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button type="button" onClick={() => { setCaptureEditUrl(item.url); setCaptureEditTitle(item.title || '') }} className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-gray-900" title="Sửa tên">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => removeCapture(item)} className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-red-600" title="Xoá ảnh">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {captureEditUrl === item.url ? (
                          <div className="flex gap-1 p-1">
                            <input value={captureEditTitle} onChange={event => setCaptureEditTitle(event.target.value)} className="min-w-0 flex-1 rounded border border-black/10 px-1 text-[10px] font-bold outline-none" />
                            <button type="button" onClick={renameCapture} className="flex h-6 w-6 items-center justify-center rounded bg-emerald-600 text-white"><Check className="h-3 w-3" /></button>
                            <button type="button" onClick={() => setCaptureEditUrl('')} className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-500"><X className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <div className="truncate px-1.5 py-1 text-[9px] font-bold text-gray-500">{item.title || displayTime(item.position)} · {formatTime(item.createdAt)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`flex flex-col overflow-hidden ${showList ? 'min-h-0 flex-1' : 'shrink-0'}`}>
            <div className="shrink-0 border-b border-black/10 px-2.5 py-2 sm:px-4 sm:py-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowList(value => !value)}
                  className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-gray-500 transition hover:text-gray-900"
                  title={showList ? 'Thu gọn danh sách' : 'Mở danh sách'}
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  Danh sách
                  <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-400">{videos.length}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showList ? '' : '-rotate-90'}`} />
                </button>
                {videos.length > 0 && showList && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Xoá tất cả"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {showList && (
              <div className="mt-1.5">
                {(() => {
                  const selected = categoryFilter === 'all'
                    ? { id: 'all', label: 'Tất cả', icon: ListVideo, badge: 'border-gray-800 bg-gray-900 text-white shadow-sm' }
                    : { ...videoCategoryMeta(categoryFilter, videoCategories), id: categoryFilter }
                  const Icon = selected.icon
                  const options = [
                    { id: 'all', label: 'Tất cả', icon: ListVideo },
                    ...videoCategories,
                  ]
                  return (
                    <div ref={filterRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setFilterOpen(open => !open)}
                        className={`flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-[11px] font-bold transition ${selected.badge}`}
                        title="Lọc danh sách"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
                        <span className="shrink-0 opacity-65">{categoryFilter === 'all' ? categoryCounts.all : (categoryCounts[categoryFilter] || 0)}</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {filterOpen && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg shadow-black/10">
                          {options.map(option => {
                            const OptIcon = option.icon
                            const count = option.id === 'all' ? categoryCounts.all : (categoryCounts[option.id] || 0)
                            const active = categoryFilter === option.id
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => { setCategoryFilter(option.id); setFilterOpen(false) }}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                                  active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                <OptIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-white/20' : 'bg-black/5 text-gray-500'}`}>{count}</span>
                                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              )}
            </div>
            {showList && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] custom-scrollbar sm:p-3">
              {filteredVideos.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-black/15 text-center">
                  <ListVideo className="mb-2 h-6 w-6 text-gray-300" />
                  <div className="text-xs font-bold text-gray-500">
                    {videos.length === 0 ? 'Chưa có link nào' : `Chưa có video ${videoCategoryLabel(categoryFilter, videoCategories)}`}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  {filteredVideos.map(item => (
                    <div
                      key={item.id}
                      className={`group relative rounded-lg border p-2.5 transition sm:p-3 ${
                        activeVideo?.id === item.id && !localFile
                          ? 'border-amber-400 bg-amber-50 shadow-sm shadow-amber-100'
                          : 'border-black/10 bg-white hover:border-amber-300 hover:shadow-sm'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectVideo(item)}
                        className="block w-full min-w-0 pr-8 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {item.type === 'youtube' ? <Youtube className="h-4 w-4 shrink-0 text-red-500" /> : <Film className="h-4 w-4 shrink-0 text-amber-600" />}
                          <div className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-snug text-gray-950">{item.title}</div>
                        </div>
                        <div className="mt-1 truncate text-[11px] font-medium text-gray-400">
                          {formatTime(item.createdAt)} · {item.type}{progressLabel(item) ? ` · ${progressLabel(item)}` : ''}
                        </div>
                      </button>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 pr-8">
                        {(() => {
                          const category = videoCategoryMeta(item.category, videoCategories)
                          const Icon = category.icon
                          return (
                            <label className={`relative flex h-7 min-w-0 max-w-[9.25rem] cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold ${category.badge}`} title="Đổi chủ đề">
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{category.label}</span>
                              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                              <select
                                value={videoCategory(item.category, videoCategories)}
                                onChange={event => updateVideoCategory(item, event.target.value)}
                                className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                              >
                                {videoCategories.map(option => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                          )
                        })()}
                        {(() => {
                          const lang = videoLanguageMeta(item.sourceLang)
                          return (
                            <span
                              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold ${lang.className}`}
                              title={lang.title}
                            >
                              <Languages className="h-3 w-3" />
                              {lang.label}
                            </span>
                          )
                        })()}
                        <button
                          type="button"
                          onClick={() => removeVideo(item.id)}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition hover:bg-red-50 hover:text-red-600 sm:right-3 sm:top-3 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
  )
}
