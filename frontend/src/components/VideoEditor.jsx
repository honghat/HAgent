import { Suspense, createContext, forwardRef, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

const PhotoTab = lazy(() => import('./PhotoTab.jsx'))
const AnimateTab = lazy(() => import('./AnimateTab.jsx'))
const ComfyUIWorkflows = lazy(() => import('./ComfyUIWorkflows.jsx'))
const TTSTab = lazy(() => import('./TTSTab.jsx'))
const STTTab = lazy(() => import('./STTTab.jsx'))
const VideoPageAI = lazy(() => import('./video/VideoPage.jsx'))
const StoryBrowser = lazy(() => import('./StoryBrowser'))
const StoryDetail = lazy(() => import('./StoryDetail'))
const StoryReader = lazy(() => import('./StoryReader'))
import {
  addClipToTrack,
  clamp,
  clipColor,
  emptyTimeline,
  ensureMusicTrack,
  fmtTime,
  nextId,
  removeClipFromTrack,
  timelineDuration,
  trackKindIcon,
  updateClipInTrack,
} from './video/editorUtils.js'
import {
  AudioPanel,
  EffectsPanel,
  MusicPanel,
  PhotoPanel,
  ProjectAssetsPanel,
  PropertiesPanel,
  ReupPanel,
  TextPanel,
  STTPanel,
  TTSPanel,
  UploadPanel,
  VideoPanel,
  WatermarkPanel,
} from './video/editorPanels.jsx'

const PX_PER_SEC = 60
const TlZoomCtx = createContext(PX_PER_SEC)
const PANELS = [
  { id: 'project', label: 'Project', icon: '◳' },
  { id: 'tracks', label: 'Tracks', icon: '☰', mobileOnly: true },
  { id: 'upload', label: 'Tải lên', icon: '⬆' },
  { id: 'photo', label: 'Photo', icon: '◰' },
  { id: 'video', label: 'Animate', icon: '▶' },
  { id: 'audio', label: 'Audio', icon: '♪' },
  { id: 'tts', label: 'TTS', icon: '🎙️' },
  { id: 'stt', label: 'STT', icon: '📝' },
  { id: 'music', label: 'Nhạc', icon: '♫' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'effects', label: 'Effects', icon: '✨' },
  { id: 'watermark', label: 'Logo', icon: '🔖' },
  { id: 'reup', label: 'Reup', icon: '↺' },
]

const PROJECT_TABS = ['projects', 'outputs', 'photo', 'animate', 'comfyui', 'tts', 'stt', 'videoai', 'story']
const DESKTOP_PANELS = PANELS.filter(p => !p.mobileOnly).map(p => p.id)

export default function VideoEditor({ token: tokenProp }) {
  const token = tokenProp || localStorage.getItem('token')
  const api = useMemo(() => {
    const inst = axios.create()
    if (token) inst.defaults.headers.common.Authorization = `Bearer ${token}`
    return inst
  }, [token])

  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [timeline, setTimelineState] = useState(emptyTimeline())
  const [assets, setAssets] = useState([])
  const [selected, setSelected] = useState(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [renderJob, setRenderJob] = useState(null)
  const [exportDialog, setExportDialog] = useState(false)
  const [activePanel, setActivePanel] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return 'tracks'
    const saved = typeof window !== 'undefined' ? localStorage.getItem('hagent_video_editor_panel') : ''
    return DESKTOP_PANELS.includes(saved) ? saved : 'project'
  })
  const [watermark, setWatermark] = useState({})
  const [newProjectDialog, setNewProjectDialog] = useState(false)
  const [renameDialog, setRenameDialog] = useState(null)
  const clipboardRef = useRef(null)
  const previewRef = useRef(null)

  // Undo/redo history
  const historyRef = useRef({ past: [], future: [] })
  const [historyCount, setHistoryCount] = useState(0) // triggers re-render for canUndo/canRedo

  const setTimeline = useCallback((updater, { recordHistory = true } = {}) => {
    setTimelineState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (recordHistory && JSON.stringify(next) !== JSON.stringify(prev)) {
        historyRef.current.past.push(prev)
        if (historyRef.current.past.length > 50) historyRef.current.past.shift()
        historyRef.current.future = []
        setHistoryCount(c => c + 1)
      }
      return next
    })
  }, [])

  const undo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!past.length) return
    const prev = past.pop()
    setTimelineState(cur => { future.push(cur); return prev })
    setHistoryCount(c => c + 1)
  }, [])

  const redo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!future.length) return
    const next = future.pop()
    setTimelineState(cur => { historyRef.current.past.push(cur); return next })
    setHistoryCount(c => c + 1)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/api/editor/projects')
      setProjects(r.data.projects || [])
    } catch {
      /* */
    }
  }, [api])
  useEffect(() => {
    refresh()
  }, [refresh])

  const loadProject = useCallback(
    async pid => {
      const r = await api.get(`/api/editor/projects/${pid}`)
      setProject(r.data)
      const tl = r.data.timeline?.tracks?.length
        ? ensureMusicTrack(r.data.timeline)
        : emptyTimeline()
      setTimeline(tl, { recordHistory: false })
      historyRef.current = { past: [], future: [] }
      setWatermark(r.data.watermark || {})
      setAssets(r.data.assets || [])
      setPlayhead(0)
      setSelected(null)
      setRenderJob(null)
    },
    [api],
  )
  const newProject = useCallback(async ({ title, width, height, fps }) => {
    const r = await api.post('/api/editor/projects', {
      title: title || 'Untitled',
      width,
      height,
      fps,
    })
    await refresh()
    await loadProject(r.data.id)
    setNewProjectDialog(false)
  }, [api, loadProject, refresh])
  const removeProject = useCallback(
    async pid => {
      if (!confirm('Xoá project?')) return
      await api.delete(`/api/editor/projects/${pid}`)
      if (project?.id === pid) setProject(null)
      refresh()
    },
    [api, project, refresh],
  )

  const toggleOrientation = useCallback(async () => {
    if (!project) return
    const newW = project.height
    const newH = project.width
    await api.put(`/api/editor/projects/${project.id}`, {
      width: newW,
      height: newH,
    })
    setProject(p => ({ ...p, width: newW, height: newH }))
  }, [api, project])

  const renameProject = useCallback(async newTitle => {
    if (!project) return
    if (!newTitle || !newTitle.trim() || newTitle === project.title) return
    await api.put(`/api/editor/projects/${project.id}`, { title: newTitle.trim() })
    setProject(p => ({ ...p, title: newTitle.trim() }))
    refresh()
  }, [api, project, refresh])

  const saveTimeline = useCallback(async () => {
    if (!project) return
    await api.put(`/api/editor/projects/${project.id}`, {
      timeline,
      duration: timelineDuration(timeline),
      watermark,
    })
  }, [api, project, timeline, watermark])
  useEffect(() => {
    if (!project) return
    const t = setTimeout(saveTimeline, 1200)
    return () => clearTimeout(t)
  }, [timeline, project, saveTimeline])

  const uploadAsset = useCallback(
    async file => {
      if (!project || !file) return
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post(`/api/editor/projects/${project.id}/assets`, fd)
      setAssets(prev => [...prev, r.data])
    },
    [api, project],
  )
  const removeAsset = useCallback(
    async aid => {
      await api.delete(`/api/editor/assets/${aid}`)
      setAssets(prev => prev.filter(a => a.id !== aid))
    },
    [api],
  )

  const _firstEmptyStart = useCallback(
    (trackId, dur) => {
      const track = timeline.tracks.find(t => t.id === trackId)
      const clips = (track?.clips || []).slice().sort((a, b) => (a.start || 0) - (b.start || 0))
      const d = Math.max(dur || 0, 0.01)
      let cursor = 0
      for (const c of clips) {
        if ((c.start || 0) - cursor >= d) return cursor
        cursor = Math.max(cursor, c.end || 0)
      }
      return Math.max(cursor, playhead || 0)
    },
    [timeline, playhead],
  )

  const addAssetToTimeline = useCallback(
    asset => {
      console.log('[addAssetToTimeline] called', asset)
      const trackId =
        asset.kind === 'audio'
          ? timeline.tracks.find(t => t.kind === 'audio')?.id
          : asset.kind === 'music'
            ? timeline.tracks.find(t => t.kind === 'music')?.id
            : timeline.tracks.find(t => t.kind === 'video')?.id
      console.log('[addAssetToTimeline] trackId', trackId, 'timeline.tracks', timeline.tracks)
      if (!trackId) return
      const dur = asset.duration && asset.duration > 0
        ? asset.duration
        : asset.kind === 'image'
          ? 4
          : 5
      const start = _firstEmptyStart(trackId, dur)
      const item = {
        id: nextId('clip'),
        asset_path: asset.path,
        asset_name: asset.name,
        kind: asset.kind,
        start,
        end: start + dur,
        in: 0,
        out: dur,
        volume: 1.0,
        fade_in: 0,
        fade_out: 0,
        effects: {},
        fit: asset.kind === 'image' ? 'fill' : 'contain',
        pos: asset.kind === 'image' ? undefined : { x: 0.5, y: 0.5 },
        size: asset.kind === 'image' ? undefined : { w: 0.34, h: 0.34 },
        opacity: asset.kind === 'image' ? undefined : 1,
      }
      console.log('[addAssetToTimeline] adding item', item)
      setTimeline(tl => addClipToTrack(tl, trackId, item))
    },
    [timeline, playhead, _firstEmptyStart],
  )

  const addAssetToTrack = useCallback(
    (asset, trackId) => {
      const dur = asset.duration && asset.duration > 0
        ? asset.duration
        : asset.kind === 'image' ? 4 : 5
      const start = _firstEmptyStart(trackId, dur)
      const item = {
        id: nextId('clip'),
        asset_path: asset.path,
        asset_name: asset.name,
        kind: asset.kind,
        start,
        end: start + dur,
        in: 0,
        out: dur,
        volume: 1.0,
        fade_in: 0,
        fade_out: 0,
        effects: {},
        fit: asset.kind === 'image' ? 'fill' : 'contain',
        pos: asset.kind === 'image' ? undefined : { x: 0.5, y: 0.5 },
        size: asset.kind === 'image' ? undefined : { w: 0.34, h: 0.34 },
        opacity: asset.kind === 'image' ? undefined : 1,
      }
      setTimeline(tl => addClipToTrack(tl, trackId, item))
    },
    [playhead, _firstEmptyStart],
  )

  const addText = useCallback(
    (preset = {}) => {
      const trackId = timeline.tracks.find(t => t.kind === 'text')?.id
      if (!trackId) return
      const item = {
        id: nextId('txt'),
        kind: 'text',
        text: preset.name || 'Text mới',
        size: preset.size || 64,
        color: preset.color || '#ffffff',
        anim: preset.anim || 'fade-in',
        style: preset.style || 'clean',
        pos: { x: 0.5, y: 0.5 },
        start: playhead,
        end: playhead + 3,
      }
      setTimeline(tl => addClipToTrack(tl, trackId, item))
    },
    [timeline, playhead],
  )

  const addBackgroundClip = useCallback(
    color => {
      const trackId = timeline.tracks.find(t => t.kind === 'video')?.id
      if (!trackId) return
      const start = playhead
      const dur = Math.max(5, Math.min(12, timelineDuration(timeline) || 5))
      const item = {
        id: nextId('bg'),
        kind: 'solid',
        color: color || '#ffffff',
        asset_name: `Nền ${color || '#ffffff'}`,
        start,
        end: start + dur,
        in: 0,
        out: dur,
        volume: 0,
        fade_in: 0,
        fade_out: 0,
        effects: {},
        fit: 'fill',
        z: 0,
      }
      setTimeline(tl => addClipToTrack(tl, trackId, item))
      setSelected({ trackId, itemId: item.id })
    },
    [timeline, playhead],
  )

  const updateClip = useCallback(
    (trackId, itemId, patch) =>
      setTimeline(tl => updateClipInTrack(tl, trackId, itemId, patch)),
    [],
  )
  const removeClip = useCallback((trackId, itemId) => {
    setTimeline(tl => removeClipFromTrack(tl, trackId, itemId))
    setSelected(null)
  }, [])

  const addTrack = useCallback(kind => {
    setTimeline(tl => {
      const sameKind = tl.tracks.filter(t => t.kind === kind).length + 1
      const newTrack = {
        id: nextId(kind === 'video' ? 'v' : kind === 'audio' ? 'a' : kind === 'music' ? 'm' : 't'),
        kind,
        name: `${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'music' ? 'Nhạc nền' : 'Text'} ${sameKind}`,
        items: [],
      }
      return { ...tl, tracks: [...tl.tracks, newTrack] }
    })
  }, [])

  const selectPanel = useCallback(panel => {
    setActivePanel(panel)
    if (panel && panel !== 'tracks') {
      localStorage.setItem('hagent_video_editor_panel', panel)
    }
  }, [])

  const removeTrack = useCallback(trackId => {
    setTimeline(tl => ({
      ...tl,
      tracks: tl.tracks.filter(t => t.id !== trackId),
    }))
  }, [])

  const splitAtPlayhead = useCallback(() => {
    if (!selected) return
    const tr = timeline.tracks.find(t => t.id === selected.trackId)
    const it = tr?.items.find(i => i.id === selected.itemId)
    if (!it) return
    if (playhead <= it.start + 0.05 || playhead >= it.end - 0.05) return
    const offset = playhead - it.start
    const newItem = {
      ...it,
      id: nextId('clip'),
      start: playhead,
      in: (it.in || 0) + offset,
    }
    setTimeline(tl =>
      addClipToTrack(
        updateClipInTrack(tl, selected.trackId, selected.itemId, {
          end: playhead,
          out: (it.in || 0) + offset,
        }),
        selected.trackId,
        newItem,
      ),
    )
  }, [timeline, selected, playhead])

  const startRender = useCallback(async (opts = {}) => {
    if (!project) return
    await saveTimeline()
    const r = await api.post(`/api/editor/projects/${project.id}/render`, opts)
    setRenderJob({ id: r.data.job_id, status: 'queued', progress: 0 })
    setExportDialog(false)
  }, [api, project, saveTimeline])

  useEffect(() => {
    if (!renderJob?.id) return
    if (renderJob.status === 'done' || renderJob.status === 'error') {
      if (renderJob.status === 'error' && renderJob.error) {
        alert('Export lỗi: ' + renderJob.error)
      }
      return
    }
    let alive = true
    const poll = async () => {
      while (alive) {
        try {
          const r = await api.get(`/api/editor/jobs/${renderJob.id}`)
          if (!alive) return
          setRenderJob(j => ({ ...j, ...r.data }))
          if (r.data.status === 'done' || r.data.status === 'error') return
        } catch {
          /* */
        }
        await new Promise(res => setTimeout(res, 1500))
      }
    }
    poll()
    return () => {
      alive = false
    }
  }, [renderJob?.id, renderJob?.status, renderJob?.error, api])

  const copySelected = useCallback(() => {
    if (!selected) return
    const tr = timeline.tracks.find(t => t.id === selected.trackId)
    const it = tr?.items.find(i => i.id === selected.itemId)
    if (!it) return
    clipboardRef.current = { trackKind: tr.kind, item: { ...it } }
  }, [timeline, selected])

  const pasteAtPlayhead = useCallback(() => {
    const cb = clipboardRef.current
    if (!cb) return
    const trackId = timeline.tracks.find(t => t.kind === cb.trackKind)?.id
    if (!trackId) return
    const len = cb.item.end - cb.item.start
    const newItem = {
      ...cb.item,
      id: nextId(cb.item.kind === 'text' ? 'txt' : 'clip'),
      start: playhead,
      end: playhead + len,
    }
    setTimeline(tl => addClipToTrack(tl, trackId, newItem))
    setSelected({ trackId, itemId: newItem.id })
  }, [timeline, playhead])

  const duplicateSelected = useCallback(() => {
    if (!selected) return
    const tr = timeline.tracks.find(t => t.id === selected.trackId)
    const it = tr?.items.find(i => i.id === selected.itemId)
    if (!it) return
    const len = it.end - it.start
    const newItem = {
      ...it,
      id: nextId(it.kind === 'text' ? 'txt' : 'clip'),
      start: it.end,
      end: it.end + len,
    }
    setTimeline(tl => addClipToTrack(tl, selected.trackId, newItem))
    setSelected({ trackId: selected.trackId, itemId: newItem.id })
  }, [timeline, selected])

  useEffect(() => {
    function onKey(e) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target?.isContentEditable
      ) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c' && selected) {
        e.preventDefault()
        copySelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        pasteAtPlayhead()
        return
      }
      if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        removeClip(selected.trackId, selected.itemId)
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        splitAtPlayhead()
      }
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, removeClip, copySelected, pasteAtPlayhead, duplicateSelected, undo, redo, splitAtPlayhead])

  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    const dur = timelineDuration(timeline)
    const tick = now => {
      const dt = (now - last) / 1000
      last = now
      setPlayhead(p => {
        const np = p + dt
        if (np >= dur) {
          setPlaying(false)
          return p
        }
        return np
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, timeline])

  const activeVisualClips = useMemo(() => {
    const clips = []
    timeline.tracks.forEach(tr => {
      if (tr.kind !== 'video') return
      tr.items
        .filter(i => playhead >= i.start && playhead < i.end)
        .forEach(i => clips.push({ ...i, trackId: tr.id }))
    })
    return clips
  }, [timeline, playhead])

  const activeVideoClip = useMemo(() => {
    if (!activeVisualClips.length) return null
    return activeVisualClips.find(i => i.kind === 'solid') || activeVisualClips.find(i => i.fit) || activeVisualClips[0]
  }, [activeVisualClips])

  const activeOverlayClips = useMemo(
    () => activeVisualClips.filter(i => i.id !== activeVideoClip?.id),
    [activeVisualClips, activeVideoClip],
  )

  const activeTextClips = useMemo(() => {
    const tr = timeline.tracks.find(t => t.kind === 'text')
    if (!tr) return []
    return tr.items.filter(i => playhead >= i.start && playhead < i.end)
  }, [timeline, playhead])

  const activeAudioClips = useMemo(() => {
    const allClips = []
    timeline.tracks.forEach(tr => {
      if (tr.kind === 'audio' || tr.kind === 'music') {
        tr.items.filter(i => playhead >= i.start && playhead < i.end).forEach(i => allClips.push(i))
      }
    })
    return allClips
  }, [timeline, playhead])

  const audioRefs = useRef({})
  const audioStartedRef = useRef({})
  const activeAudioIds = useMemo(
    () => activeAudioClips.map(c => c.id).join(','),
    [activeAudioClips],
  )

  useEffect(() => {
    const ids = new Set(activeAudioClips.map(c => c.id))
    Object.entries(audioRefs.current).forEach(([id, el]) => {
      if (el && !ids.has(id) && !el.paused) {
        try {
          el.pause()
        } catch {
          /* */
        }
        delete audioStartedRef.current[id]
      }
    })
    activeAudioClips.forEach(c => {
      const el = audioRefs.current[c.id]
      if (!el) return
      el.volume = Math.max(0, Math.min(1, c.volume ?? 1))
      if (!audioStartedRef.current[c.id]) {
        const want = (c.in || 0) + (playhead - c.start)
        try { el.currentTime = Math.max(0, want) } catch { /* */ }
        audioStartedRef.current[c.id] = true
      }
      if (playing) {
        if (el.paused) el.play().catch(() => {})
      } else if (!el.paused) {
        el.pause()
      }
    })
  }, [activeAudioIds, playing])

  useEffect(() => {
    const v = previewRef.current
    if (!v || !activeVideoClip) {
      if (v && !v.paused) v.pause()
      return
    }
    const want = (activeVideoClip.in || 0) + (playhead - activeVideoClip.start)
    if (Math.abs(v.currentTime - want) > 0.2) {
      try {
        v.currentTime = want
      } catch {
        /* */
      }
    }
    v.volume = Math.max(0, Math.min(1, activeVideoClip.volume ?? 1))
    if (playing && v.paused) v.play().catch(() => {})
    if (!playing && !v.paused) v.pause()
  }, [activeVideoClip, playhead, playing])

  if (!project) {
    return (
      <>
        <ProjectsView
          projects={projects}
          api={api}
          token={token}
          onOpen={loadProject}
          onNew={() => setNewProjectDialog(true)}
          onDelete={removeProject}
          onRename={(pid, title) => setRenameDialog({ id: pid, title })}
        />
        {newProjectDialog && (
          <NewProjectDialog
            onClose={() => setNewProjectDialog(false)}
            onCreate={newProject}
          />
        )}
        {renameDialog && (
          <RenameDialog
            current={renameDialog.title}
            onClose={() => setRenameDialog(null)}
            onSave={async title => {
              await api.put(`/api/editor/projects/${renameDialog.id}`, { title })
              setRenameDialog(null)
              refresh()
            }}
          />
        )}
      </>
    )
  }

  const PanelSwitch = () => (
    <>
      {activePanel === 'upload' && <UploadPanel onUpload={uploadAsset} />}
      {activePanel === 'project' && (
        <ProjectAssetsPanel
          assets={assets}
          onAdd={addAssetToTimeline}
          onDelete={removeAsset}
          onAddBackground={addBackgroundClip}
        />
      )}
      {activePanel === 'photo' && (
        <PhotoPanel api={api} projectId={project.id} onImported={a => { setAssets(p => [...p, a]); addAssetToTimeline(a) }} />
      )}
      {activePanel === 'video' && (
        <VideoPanel api={api} projectId={project.id} onImported={a => { setAssets(p => [...p, a]); addAssetToTimeline(a) }} />
      )}
      {activePanel === 'text' && <TextPanel onAdd={addText} />}
      {activePanel === 'audio' && (
        <AudioPanel api={api} projectId={project.id} onImported={a => { setAssets(p => [...p, a]); addAssetToTimeline(a) }} />
      )}
      {activePanel === 'tts' && (
        <TTSPanel api={api} projectId={project.id} onImported={a => { setAssets(p => [...p, a]); addAssetToTimeline(a) }} />
      )}
      {activePanel === 'stt' && (
        <STTPanel token={token} />
      )}
      {activePanel === 'music' && (
        <MusicPanel api={api} projectId={project?.id} onImported={a => { setAssets(p => [...p, a]); addAssetToTimeline(a) }} />
      )}
      {activePanel === 'effects' && (
        <EffectsPanel selected={selected} timeline={timeline} onUpdate={updateClip} />
      )}
      {activePanel === 'watermark' && (
        <WatermarkPanel
          api={api}
          assets={assets}
          watermark={watermark}
          onChange={setWatermark}
          onAssetDeleted={a => setAssets(prev => prev.filter(x => x.id !== a.id))}
        />
      )}
      {activePanel === 'reup' && (
        <ReupPanel api={api} />
      )}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0c] text-white">
      <Topbar
        project={project}
        playing={playing}
        playhead={playhead}
        duration={timelineDuration(timeline)}
        onTogglePlay={() => setPlaying(p => !p)}
        onRewind={() => {
          setPlayhead(0)
          setPlaying(true)
        }}
        onBack={() => setProject(null)}
        onSplit={splitAtPlayhead}
        onCopy={copySelected}
        onPaste={pasteAtPlayhead}
        onDuplicate={duplicateSelected}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyRef.current.past.length > 0}
        canRedo={historyRef.current.future.length > 0}
        hasSelection={!!selected}
        hasClipboard={!!clipboardRef.current}
        onRename={() => setRenameDialog({ id: project.id, title: project.title })}
        onRender={() => setExportDialog(true)}
        onToggleOrientation={toggleOrientation}
        renderJob={renderJob}
      />
      <div className="relative flex min-h-0 flex-1 flex-col-reverse overflow-hidden md:flex-row">
        <Sidebar active={activePanel} onSelect={selectPanel} />
        <div className="hidden w-[280px] shrink-0 border-r border-white/8 bg-[#101013] md:block">
          <PanelSwitch />
        </div>
        {activePanel && activePanel !== 'tracks' && (
          <div className="absolute inset-x-0 bottom-14 z-20 max-h-[45vh] overflow-y-auto border-y border-white/8 bg-[#101013]/95 backdrop-blur md:hidden">
            <PanelSwitch />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Preview
            ref={previewRef}
            clip={activeVideoClip}
            overlayClips={activeOverlayClips}
            project={project}
            playhead={playhead}
            watermark={watermark}
            textClips={activeTextClips}
            audioClips={activeAudioClips}
            audioRefs={audioRefs}
            selectedItemId={selected?.itemId}
            onSelectVisual={(trackId, itemId) => setSelected({ trackId, itemId })}
            onMoveVisual={(trackId, itemId, pos) => updateClip(trackId, itemId, { pos, fit: null })}
            onResizeVisual={(trackId, itemId, size) => updateClip(trackId, itemId, { size, fit: null })}
            onSelectText={itemId => {
              const trackId = timeline.tracks.find(t => t.kind === 'text')?.id
              if (trackId) setSelected({ trackId, itemId })
            }}
            onMoveText={(itemId, pos) => {
              const trackId = timeline.tracks.find(t => t.kind === 'text')?.id
              if (trackId) updateClip(trackId, itemId, { pos })
            }}
          />
          <div className={activePanel === 'tracks' ? 'contents md:contents' : 'hidden md:contents'}>
            <Timeline
              timeline={timeline}
              playhead={playhead}
              onSeek={t => {
                audioStartedRef.current = {}
                setPlayhead(t)
              }}
              selected={selected}
              onSelect={setSelected}
              onUpdate={updateClip}
              onRemove={removeClip}
              onAddTrack={addTrack}
              onRemoveTrack={removeTrack}
              onDrop={addAssetToTrack}
            />
          </div>
        </div>
        <PropertiesPanel
          selected={selected}
          timeline={timeline}
          onUpdate={updateClip}
          onRemove={removeClip}
        />
      </div>
      {renderJob && renderJob.status === 'done' && (
        <RenderModal job={renderJob} onClose={() => setRenderJob(null)} />
      )}
      {exportDialog && (
        <ExportDialog
          project={project}
          onClose={() => setExportDialog(false)}
          onConfirm={startRender}
        />
      )}
      {renameDialog && (
        <RenameDialog
          current={renameDialog.title}
          onClose={() => setRenameDialog(null)}
          onSave={async title => {
            await renameProject(title)
            setRenameDialog(null)
          }}
        />
      )}
    </div>
  )
}

function Sidebar({ active, onSelect }) {
  return (
    <aside className="flex w-full shrink-0 items-center gap-1 overflow-x-auto border-t border-white/8 bg-[#0a0a0c] px-1 py-1 md:w-14 md:flex-col md:border-r md:border-t-0 md:py-3">
      {PANELS.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(active === p.id ? null : p.id)}
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md transition ${p.mobileOnly ? 'md:hidden' : ''} ${
            active === p.id
              ? 'bg-violet-500/15 text-violet-300'
              : 'text-white/40 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          <span className="text-[15px] leading-none">{p.icon}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {p.label}
          </span>
        </button>
      ))}
    </aside>
  )
}

function ProjectsView({ projects, api, token, onOpen, onNew, onDelete, onRename }) {
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem('hagent_video_editor_tab')
    return PROJECT_TABS.includes(saved) ? saved : 'projects'
  })
  const [storyView, setStoryView] = useState('browse')
  const [currentStory, setCurrentStory] = useState(null)
  const [currentChapter, setCurrentChapter] = useState(null)

  function onSelectStory(s) { setCurrentStory(s); setCurrentChapter(null); setStoryView('detail') }
  function onStartReading(s, ch) { setCurrentStory(s); setCurrentChapter(ch); setStoryView('reader') }
  function onBackToBrowse() { setCurrentStory(null); setCurrentChapter(null); setStoryView('browse') }
  function onBackToDetail() { setStoryView('detail') }
  function selectTab(nextTab) {
    setTab(nextTab)
    localStorage.setItem('hagent_video_editor_tab', nextTab)
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Video Editor</h1>
            <p className="mt-1 text-[12px] text-gray-500">
              Cắt, ghép, hiệu ứng — render bằng ffmpeg
            </p>
          </div>
          {tab !== 'photo' && tab !== 'animate' && tab !== 'comfyui' && tab !== 'tts' && tab !== 'stt' && tab !== 'videoai' && tab !== 'story' && (
            <button
              onClick={onNew}
              className="rounded-md bg-indigo-600 px-4 py-2 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 active:scale-95"
            >
              + Project mới
            </button>
          )}
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200">
          <TabBtn active={tab === 'projects'} onClick={() => selectTab('projects')} icon="◳" label="Projects" badge={projects.length}>
            Projects ({projects.length})
          </TabBtn>
          <TabBtn active={tab === 'outputs'} onClick={() => selectTab('outputs')} icon="⎙" label="Đã render">
            File đã render
          </TabBtn>
          <TabBtn active={tab === 'photo'} onClick={() => selectTab('photo')} icon="◰" label="Photo">
            Photo
          </TabBtn>
          <TabBtn active={tab === 'animate'} onClick={() => selectTab('animate')} icon="▶" label="Animate">
            Animate
          </TabBtn>
          <TabBtn active={tab === 'comfyui'} onClick={() => selectTab('comfyui')} icon="✦" label="ComfyUI">
            ComfyUI
          </TabBtn>
          <TabBtn active={tab === 'tts'} onClick={() => selectTab('tts')} icon="♪" label="TTS">
            TTS
          </TabBtn>
          <TabBtn active={tab === 'stt'} onClick={() => selectTab('stt')} icon="📝" label="STT">
            STT
          </TabBtn>
          <TabBtn active={tab === 'videoai'} onClick={() => selectTab('videoai')} icon="🎙️" label="Dịch Video">
            Dịch Video
          </TabBtn>
          <TabBtn active={tab === 'story'} onClick={() => { selectTab('story'); setStoryView('browse') }} icon="📖" label="Story">
            Story
          </TabBtn>
        </div>

        {tab === 'projects' &&
          (projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center text-[13px] text-gray-400">
              Chưa có project nào — bấm "Project mới" để bắt đầu
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    onRename?.(p.id, p.title)
                  }}
                  className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition hover:border-indigo-400 hover:bg-indigo-50"
                  title="Click để mở, nháy đúp để đổi tên"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-bold text-gray-900">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {p.width}×{p.height} · {p.fps}fps · {fmtTime(p.duration || 0)}
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        onDelete(p.id)
                      }}
                      className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === 'outputs' && <OutputsList api={api} />}
        {tab === 'photo' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <PhotoTab />
          </Suspense>
        )}
        {tab === 'animate' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <AnimateTab />
          </Suspense>
        )}
        {tab === 'comfyui' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <ComfyUIWorkflows token={token} />
          </Suspense>
        )}
        {tab === 'tts' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <TTSTab />
          </Suspense>
        )}
        {tab === 'stt' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <STTTab />
          </Suspense>
        )}
        {tab === 'videoai' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <div className="-mx-6 -mb-8">
              <VideoPageAI token={token} />
            </div>
          </Suspense>
        )}
        {tab === 'story' && (
          <Suspense fallback={<div className="py-16 text-center text-[12px] text-gray-400">Đang tải...</div>}>
            <div className="-mx-6 -mb-8 min-h-[60vh]">
              {storyView === 'browse' && (
                <StoryBrowser onSelectStory={onSelectStory} onResumeStory={onStartReading} />
              )}
              {storyView === 'detail' && currentStory && (
                <StoryDetail
                  story={currentStory}
                  onBack={onBackToBrowse}
                  onSelectChapter={ch => onStartReading(currentStory, ch)}
                />
              )}
              {storyView === 'reader' && currentStory && (
                <StoryReader
                  story={currentStory}
                  initialChapter={currentChapter}
                  onBack={onBackToDetail}
                />
              )}
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, children, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative shrink-0 px-3 py-2 text-[12px] font-bold transition sm:px-4 ${
        active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon && <span className="text-[16px] leading-none sm:hidden">{icon}</span>}
        <span className="hidden sm:inline">{children}</span>
        {badge != null && (
          <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-bold text-gray-600 sm:hidden">
            {badge}
          </span>
        )}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
      )}
    </button>
  )
}

function OutputsList({ api }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const [ytDialog, setYtDialog] = useState(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/editor/outputs')
      setItems(r.data.items || [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  const remove = async jid => {
    await api.delete(`/api/editor/outputs/${jid}`)
    refresh()
  }

  const uploadYoutube = async (item, meta) => {
    setUploading(item.id)
    try {
      const r = await api.post('/api/editor/outputs/' + item.id + '/youtube', meta)
      if (r.data.ok) {
        alert('Đăng YouTube thành công!')
      } else {
        alert('Lỗi: ' + (r.data.error || 'Không rõ'))
      }
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(null)
      setYtDialog(null)
    }
  }

  const fmtSize = n => {
    if (!n) return '—'
    if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB'
    if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB'
    if (n > 1e3) return (n / 1e3).toFixed(0) + ' KB'
    return n + ' B'
  }
  const fmtDate = ms => {
    if (!ms) return ''
    return new Date(ms).toLocaleString('vi-VN')
  }
  const totalSize = items.reduce((s, x) => s + (x.size || 0), 0)

  if (loading) {
    return <div className="py-10 text-center text-[12px] text-gray-400">Đang tải...</div>
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[11px] text-gray-500">
        <span>{items.length} file · Tổng {fmtSize(totalSize)}</span>
        <span className="font-mono text-[10px] text-gray-400">data/editor/output/</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-[12px] text-gray-400">
          Chưa có file render nào
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <div
              key={it.id}
              className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 transition hover:border-indigo-400"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-100 text-[14px]">
                {it.status === 'done' ? '🎬' : it.status === 'error' ? '⚠' : '⏳'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12px] font-semibold text-gray-900" title={it.title}>
                    {it.title}
                  </span>
                  <StatusBadge status={it.status} />
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[10px] text-gray-500">
                  <span>{fmtDate(it.created_at)}</span>
                  {it.exists && <span>{fmtSize(it.size)}</span>}
                  {!it.exists && it.status === 'done' && <span className="text-amber-600">file đã bị xoá</span>}
                  {it.error && <span className="truncate text-red-600" title={it.error}>{it.error.slice(0, 80)}</span>}
                </div>
              </div>
              {it.exists && it.output_path && (
                <a href={it.output_path} target="_blank" rel="noreferrer"
                  className="rounded border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
                >Mở</a>
              )}
              {it.exists && it.output_path && (
                <a href={it.output_path} download
                  className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                >Tải</a>
              )}
              {it.exists && it.output_path && (
                <button
                  onClick={() => setYtDialog(it)}
                  disabled={uploading === it.id}
                  className="flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
                  </svg>
                  {uploading === it.id ? '...' : 'YouTube'}
                </button>
              )}
              <button onClick={() => remove(it.id)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                title="Xoá"
              >×</button>
            </div>
          ))}
        </div>
      )}
      {ytDialog && (
        <YouTubeDialog
          item={ytDialog}
          uploading={uploading === ytDialog.id}
          onClose={() => setYtDialog(null)}
          onConfirm={meta => uploadYoutube(ytDialog, meta)}
        />
      )}
    </div>
  )
}

function YouTubeDialog({ item, uploading, onClose, onConfirm }) {
  const [title, setTitle] = useState(item.title || '')
  const [desc, setDesc] = useState('')
  const [priv, setPriv] = useState('private')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-[14px] font-bold text-gray-900">Đăng lên YouTube</h3>
        <label className="mb-1 block text-[11px] font-semibold text-gray-600">Tiêu đề</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="mb-3 w-full rounded border border-gray-300 px-3 py-1.5 text-[13px] outline-none focus:border-indigo-400"
          placeholder="Tiêu đề video..." />
        <label className="mb-1 block text-[11px] font-semibold text-gray-600">Mô tả</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
          className="mb-3 w-full rounded border border-gray-300 px-3 py-1.5 text-[12px] outline-none focus:border-indigo-400"
          placeholder="Mô tả video..." />
        <label className="mb-1 block text-[11px] font-semibold text-gray-600">Quyền riêng tư</label>
        <select value={priv} onChange={e => setPriv(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 px-3 py-1.5 text-[13px] outline-none focus:border-indigo-400">
          <option value="private">Riêng tư</option>
          <option value="unlisted">Không công khai</option>
          <option value="public">Công khai</option>
        </select>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded border border-gray-300 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50">Huỷ</button>
          <button onClick={() => onConfirm({ title, description: desc, privacy: priv })}
            disabled={uploading || !title.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-red-600 py-2 text-[12px] font-bold text-white hover:bg-red-500 disabled:opacity-60"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
            </svg>
            {uploading ? 'Đang đăng...' : 'Đăng YouTube'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    done: ['Done', 'bg-emerald-100 text-emerald-700 border border-emerald-200'],
    error: ['Lỗi', 'bg-red-100 text-red-700 border border-red-200'],
    running: ['Đang render', 'bg-amber-100 text-amber-700 border border-amber-200'],
    queued: ['Chờ', 'bg-gray-100 text-gray-600 border border-gray-200'],
  }
  const [label, cls] = map[status] || [status, 'bg-gray-100 text-gray-600 border border-gray-200']
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${cls}`}>
      {label}
    </span>
  )
}

function Topbar({
  project,
  playing,
  playhead,
  duration,
  onBack,
  onTogglePlay,
  onRewind,
  onSplit,
  onCopy,
  onPaste,
  onDuplicate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasSelection,
  hasClipboard,
  onRename,
  onRender,
  onToggleOrientation,
  renderJob,
}) {
  const isPortrait = project.height > project.width
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/8 bg-[#0a0a0c] px-2 py-2 md:px-3">
      <button
        onClick={onBack}
        className="shrink-0 rounded p-1.5 text-white/40 hover:bg-white/5 hover:text-white"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div
        onDoubleClick={onRename}
        onClick={onRename}
        className="min-w-0 flex-1 cursor-pointer truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-bold tracking-tight transition hover:bg-white/5 md:flex-none md:flex-initial"
        title={`${project.title} (chạm để đổi tên)`}
      >
        {project.title}
      </div>
      <button
        onClick={onToggleOrientation}
        className="group hidden shrink-0 items-center gap-1.5 rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/50 transition hover:bg-violet-500/15 hover:text-violet-300 md:flex"
        title={`Đổi sang ${isPortrait ? 'ngang' : 'dọc'}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {project.width}×{project.height}
      </button>
      <div className="flex shrink-0 items-center gap-1 md:ml-3">
        <IconBtn onClick={onRewind} title="Phát lại từ đầu (R)">
          ⏮
        </IconBtn>
        <IconBtn onClick={onTogglePlay} primary>
          {playing ? '⏸' : '▶'}
        </IconBtn>
        <span className="hidden md:contents">
          <IconBtn onClick={onUndo} title="Undo (⌘Z)" disabled={!canUndo}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" />
            </svg>
          </IconBtn>
          <IconBtn onClick={onRedo} title="Redo (⌘Y)" disabled={!canRedo}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10H11a5 5 0 000 10h4M21 10l-4-4M21 10l-4 4" />
            </svg>
          </IconBtn>
          <IconBtn onClick={onSplit} title="Split (S)">
            ✂
          </IconBtn>
          <IconBtn onClick={onCopy} title="Copy (⌘C)" disabled={!hasSelection}>
            ⎘
          </IconBtn>
          <IconBtn onClick={onPaste} title="Paste (⌘V)" disabled={!hasClipboard}>
            ⏍
          </IconBtn>
          <IconBtn onClick={onDuplicate} title="Duplicate (⌘D)" disabled={!hasSelection}>
            ⎗
          </IconBtn>
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <span className="hidden font-mono text-[11px] text-white/50 md:inline">
          {fmtTime(playhead)} / {fmtTime(duration)}
        </span>
        <button
          onClick={onRender}
          disabled={
            renderJob &&
            renderJob.status !== 'done' &&
            renderJob.status !== 'error'
          }
          className="shrink-0 whitespace-nowrap rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-bold shadow-lg shadow-violet-500/20 transition hover:bg-violet-400 disabled:opacity-50 md:px-4 md:text-[12px]"
        >
          {renderJob && renderJob.status === 'running'
            ? `${renderJob.progress || 0}%`
            : 'Export'}
        </button>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, title, primary, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-30 ${
        primary
          ? 'bg-white/10 text-white hover:bg-white/15'
          : 'text-white/60 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function animCss(name, durSec) {
  const d = Math.min(2, Math.max(0.4, durSec / 3))
  switch (name) {
    case 'fade-in':
      return `hagentFadeIn ${d}s ease-out both`
    case 'fade-out':
      return `hagentFadeOut ${d}s ease-in ${Math.max(0, durSec - d)}s both`
    case 'slide-up':
      return `hagentSlideUp ${d}s ease-out both`
    case 'slide-down':
      return `hagentSlideDown ${d}s ease-out both`
    case 'slide-left':
      return `hagentSlideLeft ${d}s ease-out both`
    case 'slide-right':
      return `hagentSlideRight ${d}s ease-out both`
    case 'zoom-in':
      return `hagentZoomIn ${d}s ease-out both`
    case 'bounce':
      return `hagentBounce ${d}s ease-out both`
    case 'typewriter':
      return `hagentType ${durSec}s steps(40) both`
    case 'glow':
      return `hagentGlow ${Math.max(1.2, d)}s ease-in-out infinite`
    default:
      return undefined
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3)
}

function textStyleToCss(id, color = '#fff') {
  switch (id) {
    case 'outline':
      return { color, WebkitTextStroke: '2px #000', textShadow: 'none' }
    case 'gradient':
      return {
        background: 'linear-gradient(45deg,#ff4d6d,#ffd000,#4dd0ff)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textShadow: 'none',
      }
    case 'gradient2':
      return {
        background: 'linear-gradient(135deg,#a855f7,#ec4899)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textShadow: 'none',
      }
    case 'neon':
      return {
        color: '#fff',
        textShadow: `0 0 6px ${color},0 0 12px ${color},0 0 24px ${color},0 0 40px ${color}`,
      }
    case 'neon2':
      return {
        color: '#00ffea',
        textShadow: '0 0 6px #00ffea,0 0 18px #00ffea,0 0 40px #00ffea',
      }
    case 'shadow':
      return { color, textShadow: '3px 3px 0 #000,5px 5px 0 #555' }
    case 'shadow3d':
      return { color, textShadow: '1px 1px 0 #111,2px 2px 0 #222,3px 3px 0 #333,4px 4px 0 #444,5px 5px 6px rgba(0,0,0,.5)' }
    case 'block':
      return {
        color,
        background: 'rgba(0,0,0,.85)',
        padding: '0.15em 0.4em',
        borderRadius: 4,
        textShadow: 'none',
      }
    case 'block-color':
      return {
        color: '#fff',
        background: color,
        padding: '0.15em 0.5em',
        borderRadius: 6,
        textShadow: 'none',
      }
    case 'stroke':
      return {
        color: 'transparent',
        WebkitTextStroke: `2px ${color}`,
        textShadow: 'none',
      }
    default:
      return { color, textShadow: '0 2px 8px rgba(0,0,0,.85), 0 0 2px #000' }
  }
}

function effectsToStyle(fx = {}, progress = 0.5) {
  const filters = []
  const transforms = []
  const style = {}
  const p = clamp(progress, 0, 1)
  const e = easeOutCubic(p)

  if (fx.saturation != null && fx.saturation !== 1) filters.push(`saturate(${fx.saturation})`)
  if (fx.brightness != null && fx.brightness !== 0) filters.push(`brightness(${1 + fx.brightness})`)
  if (fx.contrast != null && fx.contrast !== 1) filters.push(`contrast(${fx.contrast})`)
  if (fx.blur) filters.push(`blur(${fx.blur}px)`)
  if (fx.grayscale) filters.push('grayscale(1)')
  if (fx.sepia) filters.push(`sepia(${typeof fx.sepia === 'number' ? fx.sepia : 1})`)
  if (fx.hue) filters.push(`hue-rotate(${fx.hue}deg)`)
  if (fx.sharpen) filters.push('contrast(1.1) saturate(1.1)')

  if (fx.zoom === 'in') transforms.push(`scale(${1 + p * 0.25})`)
  else if (fx.zoom === 'out') transforms.push(`scale(${1.25 - p * 0.25})`)
  if (fx.slide === 'left') transforms.push(`translateX(${-50 + e * 50}%)`)
  else if (fx.slide === 'right') transforms.push(`translateX(${50 - e * 50}%)`)

  if (fx.motion === 'enter-left') {
    transforms.push(`translateX(${(-120 + e * 120).toFixed(2)}%)`)
    style.opacity = e
  } else if (fx.motion === 'enter-right') {
    transforms.push(`translateX(${(120 - e * 120).toFixed(2)}%)`)
    style.opacity = e
  } else if (fx.motion === 'pop') {
    transforms.push(`scale(${(0.25 + e * 0.75).toFixed(3)})`)
    style.opacity = e
  } else if (fx.motion === 'float') {
    transforms.push(`translateY(${Math.sin(p * Math.PI * 2) * -8}%)`)
  } else if (fx.motion === 'bounce-in') {
    const bounce = Math.sin(p * Math.PI * 3) * (1 - p) * 0.22
    transforms.push(`scale(${(0.45 + e * 0.55 + bounce).toFixed(3)})`)
    style.opacity = e
  } else if (fx.motion === 'pulse') {
    transforms.push(`scale(${(1 + Math.sin(p * Math.PI * 4) * 0.08).toFixed(3)})`)
  } else if (fx.motion === 'shake') {
    transforms.push(`translateX(${(Math.sin(p * Math.PI * 18) * 5 * (1 - p)).toFixed(2)}%) rotate(${(Math.sin(p * Math.PI * 20) * 2.5 * (1 - p)).toFixed(2)}deg)`)
  } else if (fx.motion === 'spin') {
    transforms.push(`rotate(${(p * 360).toFixed(1)}deg) scale(${(0.8 + e * 0.2).toFixed(3)})`)
    style.opacity = e
  } else if (fx.motion === 'shatter') {
    const breakP = clamp((p - 0.55) / 0.45, 0, 1)
    transforms.push(`scale(${(1 + breakP * 0.18).toFixed(3)}) rotate(${(breakP * 8).toFixed(2)}deg)`)
    filters.push(`blur(${(breakP * 2).toFixed(2)}px)`)
    style.opacity = 1 - breakP
  }

  return {
    filter: filters.length ? filters.join(' ') : undefined,
    transform: transforms.length ? transforms.join(' ') : undefined,
    transition: 'filter 0.3s ease, transform 0.3s ease',
    ...style,
  }
}

function ParticleCanvas({ type }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = 0
    let h = 0
    let dpr = 1
    let ready = false

    const particles = []

    const fitCanvas = (force = false) => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextW = Math.round(canvas.clientWidth)
      const nextH = Math.round(canvas.clientHeight)
      if (nextW < 24 || nextH < 24) return false
      if (!force && Math.abs(nextW - w) < 2 && Math.abs(nextH - h) < 2) return false
      w = nextW
      h = nextH
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ready = true
      return true
    }

    const init = () => {
      particles.length = 0
      if (type === 'snow') {
        for (let i = 0; i < 95; i++) {
          const depth = Math.random() ** 0.55
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.45 + depth * 2.2,
            vx: (Math.random() - 0.5) * (0.18 + depth * 0.28),
            vy: 0.3 + depth * 1.35,
            alpha: 0.12 + depth * 0.42,
            phase: Math.random() * Math.PI * 2,
            sway: 0.01 + Math.random() * 0.025,
          })
        }
      } else if (type === 'rain') {
        for (let i = 0; i < 115; i++) {
          const depth = Math.random() ** 0.7
          particles.push({
            x: Math.random() * w * 1.35 - w * 0.18,
            y: Math.random() * h,
            len: (7 + Math.random() * 18) * (0.55 + depth * 0.55),
            vx: -0.9 - depth * 1.8,
            vy: 5.5 + depth * 8.5,
            alpha: 0.08 + depth * 0.24,
            width: 1,
          })
        }
      } else if (type === 'sparkle') {
        for (let i = 0; i < 50; i++) particles.push({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 2.5 + 0.5,
          life: Math.random(), speed: Math.random() * 0.03 + 0.01,
          alpha: 0,
        })
      } else if (type === 'fire') {
        for (let i = 0; i < 120; i++) {
          const depth = Math.random()
          particles.push({
            x: Math.random() * w,
            y: h + Math.random() * 30,
            r: 10 + depth * 26,
            vx: (Math.random() - 0.5) * (0.7 + depth * 1.8),
            vy: -(1.2 + depth * 4.2),
            alpha: 0.18 + depth * 0.32,
            life: Math.random(),
            decay: 0.008 + Math.random() * 0.018,
            hue: 24 + Math.random() * 28,
            wobble: Math.random() * Math.PI * 2,
          })
        }
      } else if (type === 'leaves') {
        for (let i = 0; i < 40; i++) particles.push({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 5 + 4, vx: Math.random() * 1.5 + 0.5, vy: Math.random() * 1.5 + 0.5,
          rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.05,
          alpha: Math.random() * 0.6 + 0.4, hue: Math.random() * 40 + 20,
        })
      }
    }

    const draw = () => {
      if (!ready && fitCanvas(true)) init()
      if (!ready) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      ctx.clearRect(0, 0, w, h)
      if (type === 'snow') {
        for (const p of particles) {
          const drift = Math.sin(performance.now() * p.sway * 0.06 + p.phase) * (0.7 + p.r * 0.15)
          const x = p.x + drift
          const glow = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 2)
          glow.addColorStop(0, `rgba(255,255,255,${p.alpha * 0.35})`)
          glow.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.beginPath()
          ctx.arc(x, p.y, p.r * 2, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${p.alpha})`
          ctx.fill()
          p.x += p.vx; p.y += p.vy
          if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w }
          if (p.x < -10) p.x = w + 10
          if (p.x > w + 10) p.x = -10
        }
      } else if (type === 'rain') {
        for (const p of particles) {
          ctx.beginPath()
          ctx.globalAlpha = p.alpha
          ctx.strokeStyle = 'rgba(205,228,255,0.85)'
          ctx.lineWidth = p.width
          ctx.lineCap = 'round'
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.vx * (p.len / p.vy), p.y + p.len)
          ctx.stroke()
          p.x += p.vx; p.y += p.vy
          if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * w * 1.3 - w * 0.15 }
        }
        ctx.globalAlpha = 1
      } else if (type === 'sparkle') {
        for (const p of particles) {
          p.life += p.speed
          if (p.life > 1) p.life = 0
          const a = p.life < 0.5 ? p.life * 2 : (1 - p.life) * 2
          const size = p.r * (0.5 + a * 1.5)
          // 4-point star
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.globalAlpha = a * 0.9
          ctx.fillStyle = `hsl(${50 + p.r * 30},100%,90%)`
          for (let j = 0; j < 4; j++) {
            ctx.save(); ctx.rotate(j * Math.PI / 2)
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 0.3, -size); ctx.lineTo(0, -size * 1.5); ctx.lineTo(-size * 0.3, -size); ctx.closePath()
            ctx.fill(); ctx.restore()
          }
          ctx.restore()
        }
        ctx.globalAlpha = 1
      } else if (type === 'fire') {
        const base = ctx.createLinearGradient(0, h, 0, h * 0.58)
        base.addColorStop(0, 'rgba(255,80,0,0.22)')
        base.addColorStop(0.55, 'rgba(255,160,30,0.08)')
        base.addColorStop(1, 'rgba(255,200,80,0)')
        ctx.fillStyle = base
        ctx.fillRect(0, h * 0.56, w, h * 0.44)
        ctx.globalCompositeOperation = 'lighter'
        for (const p of particles) {
          const a = Math.max(0, p.alpha * (1 - p.life))
          const radius = p.r * (1 - p.life * 0.75)
          const x = p.x + Math.sin(p.life * 8 + p.wobble) * radius * 0.25
          const grad = ctx.createRadialGradient(x, p.y, 0, x, p.y, Math.max(1, radius))
          grad.addColorStop(0, `hsla(${p.hue + 32},100%,88%,${a * 1.2})`)
          grad.addColorStop(0.42, `hsla(${p.hue},100%,56%,${a * 0.75})`)
          grad.addColorStop(1, `hsla(8,100%,36%,0)`)
          ctx.beginPath(); ctx.ellipse(x, p.y, radius * 0.45, radius, 0, 0, Math.PI * 2)
          ctx.fillStyle = grad; ctx.fill()
          p.x += p.vx; p.y += p.vy; p.life += p.decay
          if (p.life > 1) {
            p.x = Math.random() * w
            p.y = h + Math.random() * 24
            p.life = 0
            p.vy = -(1.2 + Math.random() * 4.2)
            p.vx = (Math.random() - 0.5) * 2.2
          }
        }
        ctx.globalCompositeOperation = 'source-over'
      } else if (type === 'leaves') {
        for (const p of particles) {
          ctx.save()
          ctx.translate(p.x, p.y); ctx.rotate(p.rot)
          ctx.globalAlpha = p.alpha
          ctx.fillStyle = `hsl(${p.hue + 80},70%,45%)`
          ctx.beginPath()
          ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          p.x += p.vx; p.y += p.vy; p.rot += p.rotV
          p.vx += Math.sin(p.rot) * 0.02
          if (p.y > h + 20 || p.x > w + 20) { p.x = -10; p.y = Math.random() * h * 0.5 }
        }
        ctx.globalAlpha = 1
      }
      rafRef.current = requestAnimationFrame(draw)
    }

    if (fitCanvas(true)) init()
    draw()
    const ro = new ResizeObserver(() => {
      if (fitCanvas()) init()
    })
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [type])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full rounded-[inherit]"
    />
  )
}

// vignette overlay rendered on top of video clip in preview
function VignetteOverlay({ strength = 0.5 }) {
  if (!strength) return null
  const alpha = Math.min(0.9, strength * 0.8)
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${alpha}) 100%)`,
    }} />
  )
}

const Preview = forwardRef(function PreviewInner({
    clip,
    overlayClips = [],
    project,
    playhead,
    watermark,
    textClips = [],
    onMoveText,
    onMoveVisual,
    onResizeVisual,
    onSelectVisual,
    onSelectText,
    selectedItemId,
    audioClips = [],
    audioRefs,
  }, ref) {
    const boxRef = useRef(null)
    const stageRef = useRef(null)
    const [stage, setStage] = useState({ w: 0, h: 0 })

    useEffect(() => {
      const c = boxRef.current
      if (!c) return
      const compute = () => {
        const cw = c.clientWidth
        const ch = c.clientHeight
        if (!cw || !ch) return
        const r = project.width / project.height
        let w = cw
        let h = w / r
        if (h > ch) { h = ch; w = h * r }
        if (w > 900) { w = 900; h = w / r }
        setStage({ w: Math.floor(w), h: Math.floor(h) })
      }
      compute()
      const ro = new ResizeObserver(compute)
      ro.observe(c)
      return () => ro.disconnect()
    }, [project.width, project.height])

    const startDragText = (e, item) => {
      e.preventDefault()
      e.stopPropagation()
      const stageEl = stageRef.current
      if (!stageEl) return
      const rect = stageEl.getBoundingClientRect()
      const onMove = ev => {
        const x = (ev.clientX - rect.left) / rect.width
        const y = (ev.clientY - rect.top) / rect.height
        onMoveText?.(item.id, {
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
        })
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    const startDragVisual = (e, item) => {
      e.preventDefault()
      e.stopPropagation()
      const stageEl = stageRef.current
      if (!stageEl) return
      const rect = stageEl.getBoundingClientRect()
      onSelectVisual?.(item.trackId, item.id)
      const onMove = ev => {
        const x = (ev.clientX - rect.left) / rect.width
        const y = (ev.clientY - rect.top) / rect.height
        onMoveVisual?.(item.trackId, item.id, {
          x: clamp(x, 0, 1),
          y: clamp(y, 0, 1),
        })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    const startResizeVisual = (e, item) => {
      e.preventDefault()
      e.stopPropagation()
      const stageEl = stageRef.current
      if (!stageEl) return
      const rect = stageEl.getBoundingClientRect()
      const startX = e.clientX
      const startY = e.clientY
      const current = item.size || { w: 0.34, h: 0.34 }
      onSelectVisual?.(item.trackId, item.id)
      const onMove = ev => {
        const dx = (ev.clientX - startX) / rect.width
        const dy = (ev.clientY - startY) / rect.height
        const delta = Math.max(dx, dy)
        const nextW = clamp((current.w || 0.34) + delta, 0.04, 1.2)
        const nextH = clamp((current.h || 0.34) + delta, 0.04, 1.2)
        onResizeVisual?.(item.trackId, item.id, { w: nextW, h: nextH })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    const clipProgress = clip ? clamp((playhead - clip.start) / Math.max(0.1, clip.end - clip.start), 0, 1) : 0
    const effectStyle = clip?.effects ? effectsToStyle(clip.effects, clipProgress) : {}
    const transformStyle = {
      transform: [
        effectStyle.transform,
        clip?.scale ? `scale(${clip.scale})` : null,
        clip?.position_x || clip?.position_y
          ? `translate(${clip.position_x || 0}%, ${clip.position_y || 0}%)`
          : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      filter: effectStyle.filter,
      transition: effectStyle.transition,
    }

    const fontScale = stage.w > 0 ? stage.w / project.width : 0
    const wm = watermark || {}
    const API_BASE = import.meta.env.VITE_API_BASE || ''
    const wmSrc = wm.data_url || (wm.asset_path ? `${API_BASE}${wm.asset_path}` : null)
    const wmSize = Math.max(22, stage.w * (wm.scale ?? 0.15))
    const wmMargin = Math.max(8, stage.w * 0.02)
    const wmPos = wm.position || 'bottom-right'
    const wmStyle = {
      width: `${wmSize}px`,
      height: `${wmSize}px`,
      opacity: wm.opacity ?? 0.85,
      top: wmPos === 'top-left' || wmPos === 'top-right' ? `${wmMargin}px` : undefined,
      bottom: wmPos === 'bottom-left' || wmPos === 'bottom-right' ? `${wmMargin}px` : undefined,
      left: wmPos === 'top-left' || wmPos === 'bottom-left' ? `${wmMargin}px` : undefined,
      right: wmPos === 'top-right' || wmPos === 'bottom-right' ? `${wmMargin}px` : undefined,
      ...(wmPos === 'center'
        ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
        : {}),
    }

    return (
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-[#050507] p-2 md:p-4">
        <div ref={boxRef} className="relative flex h-full w-full items-center justify-center">
        <div
          ref={stageRef}
          className="relative overflow-hidden rounded-md bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={{ width: stage.w || 1, height: stage.h || 1 }}
        >
          {clip ? (
            clip.kind === 'solid' ? (
              <div
                className="h-full w-full"
                style={{ background: clip.color || '#ffffff', ...transformStyle }}
              />
            ) : clip.kind === 'image' ? (
              <img
                src={clip.asset_path}
                alt=""
                className="h-full w-full"
                style={{
                  objectFit: clip.fit || 'contain',
                  ...transformStyle,
                }}
              />
            ) : (
              <video
                ref={ref}
                src={clip.asset_path}
                className="h-full w-full"
                style={{
                  objectFit: clip.fit || 'contain',
                  ...transformStyle,
                }}
                playsInline
                muted={false}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-white/20">
              Trống — thêm clip vào timeline
            </div>
          )}
          {clip?.effects?.vignette > 0 && <VignetteOverlay strength={clip.effects.vignette} />}
          {clip?.effects?.particle && <ParticleCanvas type={clip.effects.particle} />}
          {overlayClips.map(item => {
            const pos = item.pos || { x: 0.5, y: 0.5 }
            const size = item.size || { w: 0.34, h: 0.34 }
            const itemProgress = clamp((playhead - item.start) / Math.max(0.1, item.end - item.start), 0, 1)
            const itemEffectStyle = effectsToStyle(item.effects, itemProgress)
            const overlayStyle = {
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: `${size.w * 100}%`,
              height: `${size.h * 100}%`,
              opacity: item.opacity ?? 1,
              filter: itemEffectStyle.filter,
              transition: itemEffectStyle.transition,
              transform: ['translate(-50%, -50%)', itemEffectStyle.transform]
                .filter(Boolean)
                .join(' '),
            }
            const selected = selectedItemId === item.id
            const commonClass = `h-full w-full object-contain ${selected ? 'ring-2 ring-yellow-400' : 'ring-1 ring-transparent'}`
            return (
              <div
                key={item.id}
                className="group absolute z-10 cursor-move select-none"
                style={overlayStyle}
                onPointerDown={e => startDragVisual(e, item)}
                onClick={e => {
                  e.stopPropagation()
                  onSelectVisual?.(item.trackId, item.id)
                }}
              >
                {item.kind === 'image' ? (
                  <img src={item.asset_path} alt="" className={commonClass} draggable={false} />
                ) : (
                  <video src={item.asset_path} className={commonClass} muted playsInline />
                )}
                {selected && (
                  <button
                    type="button"
                    className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border border-black/70 bg-yellow-300 shadow"
                    onPointerDown={e => startResizeVisual(e, item)}
                    aria-label="Resize overlay"
                  />
                )}
              </div>
            )
          })}
          {wm.enabled && wmSrc && (
            <img
              src={wmSrc}
              alt=""
              className="pointer-events-none absolute z-20 rounded-full object-cover"
              style={wmStyle}
            />
          )}
          {audioClips.map(a => (
            <audio
              key={a.id}
              ref={el => {
                if (audioRefs && audioRefs.current) audioRefs.current[a.id] = el
              }}
              src={a.asset_path}
              preload="auto"
              className="hidden"
            />
          ))}
          {textClips.map(t => {
            const pos = t.pos || { x: 0.5, y: 0.5 }
            const dur = Math.max(0.1, t.end - t.start)
            const styleSpan = textStyleToCss(t.style, t.color)
            return (
              <div
                key={t.id}
                onMouseDown={e => startDragText(e, t)}
                onClick={e => {
                  e.stopPropagation()
                  onSelectText?.(t.id)
                }}
                className={`absolute cursor-move select-none px-3 py-1 ring-1 transition ${
                  selectedItemId === t.id
                    ? 'ring-yellow-400/80'
                    : 'ring-transparent hover:ring-violet-400/60'
                }`}
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '92%',
                  animation: animCss(t.anim, dur),
                }}
              >
                <span
                  style={{
                    fontSize: `${(t.size || 64) * fontScale}px`,
                    fontWeight: t.font === 'Arial' || t.font === 'Verdana' || t.font === 'Georgia' ? 700 : 800,
                    fontFamily: t.font ? `'${t.font}', sans-serif` : 'inherit',
                    lineHeight: 1.2,
                    whiteSpace: 'pre-wrap',
                    textAlign: 'center',
                    display: 'inline-block',
                    ...styleSpan,
                  }}
                >
                  {t.text}
                </span>
              </div>
            )
          })}
        </div>
        </div>
      </div>
    )
  }
)

function Timeline({
  timeline,
  playhead,
  onSeek,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onAddTrack,
  onRemoveTrack,
  onDrop,
}) {
  const [pps, setPps] = useState(PX_PER_SEC) // px per second (zoom)
  const dur = Math.max(timelineDuration(timeline), 30)
  const w = dur * pps
  const scrollRef = useRef(null)
  const dragSeek = useRef(false)

  const seekFromEvent = e => {
    const sc = scrollRef.current
    if (!sc) return
    const rect = sc.getBoundingClientRect()
    const x = e.clientX - rect.left + sc.scrollLeft
    const t = clamp((x - 96) / pps, 0, dur)
    onSeek(t)
  }

  const handleWheel = useCallback(e => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const sc = scrollRef.current
    const factor = e.deltaY < 0 ? 1.15 : 0.87
    setPps(prev => {
      const next = clamp(prev * factor, 8, 600)
      // Keep playhead centered while zooming
      if (sc) {
        const headPx = 96 + playhead * next
        const viewW = sc.clientWidth
        sc.scrollLeft = Math.max(0, headPx - viewW / 2)
      }
      return next
    })
  }, [playhead])

  const onDownTrack = e => {
    if (e.target.closest('.clip-block') || e.target.closest('.track-head')) return
    dragSeek.current = true
    seekFromEvent(e)
    const onMove = ev => dragSeek.current && seekFromEvent(ev)
    const onUp = () => {
      dragSeek.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <TlZoomCtx.Provider value={pps}>
    <div className="relative flex h-48 shrink-0 flex-col border-t-2 border-violet-500/20 bg-[#0c0c0f] md:h-64">
      <style>{`
        [data-tl-scroll]::-webkit-scrollbar { width: 4px; height: 4px; }
        [data-tl-scroll]::-webkit-scrollbar-track { background: transparent; }
        [data-tl-scroll]::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        [data-tl-scroll]::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        [data-tl-scroll]::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
      <div className="flex items-center gap-1 border-b border-white/8 bg-[#08080a] px-2 py-1">
        <span className="mr-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
          Tracks
        </span>
        <button onClick={() => onAddTrack('video')} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70 hover:border-violet-400/50 hover:text-white">+ Video</button>
        <button onClick={() => onAddTrack('audio')} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70 hover:border-violet-400/50 hover:text-white">+ Audio</button>
        <button onClick={() => onAddTrack('text')} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70 hover:border-violet-400/50 hover:text-white">+ Text</button>
        <button onClick={() => onAddTrack('music')} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70 hover:border-pink-400/50 hover:text-pink-300">+ Nhạc</button>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setPps(p => clamp(p * 1.5, 8, 600))} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/60 hover:text-white" title="Zoom in (Ctrl+Scroll)">+</button>
          <span className="min-w-[36px] text-center font-mono text-[9px] text-white/30">{Math.round(pps)}px</span>
          <button onClick={() => setPps(p => clamp(p / 1.5, 8, 600))} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/60 hover:text-white" title="Zoom out">−</button>
          <button onClick={() => setPps(PX_PER_SEC)} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/40 hover:text-white" title="Reset zoom">↺</button>
        </div>
      </div>
      <Ruler duration={dur} playhead={playhead} onSeek={onSeek} />
      <div
        ref={scrollRef}
        data-tl-scroll
        className="relative flex-1 touch-pan-x touch-pan-y overflow-auto"
        onPointerDown={onDownTrack}
        onWheel={handleWheel}
      >
        <div className="relative" style={{ width: w + 96, minHeight: '100%' }}>
          <div className="timeline-bg absolute inset-0" />
          {timeline.tracks.map(tr => (
            <Track
              key={tr.id}
              track={tr}
              selected={selected}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onRemoveTrack={onRemoveTrack}
              onDrop={onDrop}
            />
          ))}
          <Playhead playhead={playhead} onSeek={onSeek} maxDur={dur} />
        </div>
      </div>
    </div>
    </TlZoomCtx.Provider>
  )
}

function Playhead({ playhead, onSeek, maxDur }) {
  const pps = useContext(TlZoomCtx)
  const drag = useRef(false)
  const onDown = e => {
    e.stopPropagation()
    e.preventDefault()
    drag.current = true
    const onMove = ev => {
      if (!drag.current) return
      const sc = document.querySelector('[data-tl-scroll]')
      if (!sc) return
      const rect = sc.getBoundingClientRect()
      const x = ev.clientX - rect.left + sc.scrollLeft
      const t = clamp((x - 96) / pps, 0, maxDur)
      onSeek(t)
    }
    const onUp = () => {
      drag.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 h-full"
      style={{ left: 96 + playhead * pps - 8, width: 16 }}
    >
      <div
        onMouseDown={onDown}
        className="pointer-events-auto absolute -top-3 left-1/2 -translate-x-1/2 cursor-ew-resize"
        title="Kéo để di chuyển playhead"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 shadow-lg ring-2 ring-rose-300/50">
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      </div>
      <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-rose-500/90" />
    </div>
  )
}

function Ruler({ duration, playhead, onSeek }) {
  const pps = useContext(TlZoomCtx)
  // Adaptive tick interval based on zoom
  const tickInterval = pps < 20 ? 10 : pps < 40 ? 5 : pps < 100 ? 2 : 1
  const majorEvery = pps < 20 ? 30 : pps < 40 ? 10 : pps < 100 ? 5 : 5
  const ticks = []
  for (let s = 0; s <= duration; s += tickInterval) {
    const x = s * pps
    const isMajor = s % majorEvery === 0
    ticks.push(
      <div
        key={s}
        className="absolute top-0 flex h-full flex-col items-start text-[9px] font-mono text-white/40"
        style={{ left: 96 + x }}
      >
        <div className={`w-px ${isMajor ? 'h-full bg-white/30' : 'h-2 bg-white/15'}`} />
        {isMajor && <span className="absolute left-1 top-1">{s}s</span>}
      </div>,
    )
  }
  const onClick = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const t = clamp((x - 96) / pps, 0, duration)
    onSeek?.(t)
  }
  return (
    <div
      onMouseDown={onClick}
      className="relative h-7 shrink-0 cursor-pointer border-b border-white/10 bg-[#08080a] hover:bg-white/5"
    >
      <div
        style={{ width: duration * pps + 96, height: '100%' }}
        className="relative"
      >
        {ticks}
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-rose-500/80"
          style={{ left: 96 + playhead * pps }}
        />
      </div>
    </div>
  )
}

const TRACK_KIND_STYLE = {
  video:  { head: 'bg-sky-950/80 border-sky-800/40',   icon: 'text-sky-400',    h: 'h-14' },
  image:  { head: 'bg-sky-950/80 border-sky-800/40',   icon: 'text-sky-400',    h: 'h-14' },
  text:   { head: 'bg-violet-950/80 border-violet-800/40', icon: 'text-violet-400', h: 'h-10' },
  audio:  { head: 'bg-emerald-950/80 border-emerald-800/40', icon: 'text-emerald-400', h: 'h-14' },
  music:  { head: 'bg-pink-950/80 border-pink-800/40', icon: 'text-pink-400',   h: 'h-14' },
}

function Track({ track, selected, onSelect, onUpdate, onRemove, onRemoveTrack, onDrop }) {
  const [dragOver, setDragOver] = useState(false)
  const style = TRACK_KIND_STYLE[track.kind] || TRACK_KIND_STYLE.video
  const handleDragOver = e => {
    if (!e.dataTransfer.types.includes('application/hagent-asset')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }
  const handleDrop = e => {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData('application/hagent-asset')
    if (!raw) return
    try { onDrop?.(JSON.parse(raw), track.id) } catch {}
  }

  return (
    <div
      className={`relative border-b transition-colors ${style.h} ${
        dragOver ? 'border-violet-400/50 bg-violet-500/8' : 'border-white/[0.06]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Track label */}
      <div className={`track-head sticky left-0 z-10 flex ${style.h} w-24 shrink-0 items-center gap-1.5 border-r px-2 ${style.head}`}>
        <span className={`text-[14px] leading-none ${style.icon}`}>{trackKindIcon(track.kind)}</span>
        <span className="flex-1 truncate text-[10px] font-semibold text-white/70" title={track.name}>{track.name}</span>
        {onRemoveTrack && (
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`Xoá ${track.name}?`)) onRemoveTrack(track.id) }}
            className="rounded px-0.5 text-[12px] text-white/20 hover:bg-rose-500/20 hover:text-rose-300"
            title="Xoá track"
          >×</button>
        )}
      </div>
      {/* Drop hint */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="ml-24 rounded-full bg-violet-500/80 px-3 py-0.5 text-[10px] font-bold text-white shadow-lg">
            Thả vào {track.name}
          </span>
        </div>
      )}
      {track.items.map(it => (
        <Clip key={it.id} trackId={track.id} item={it}
          isSelected={selected?.trackId === track.id && selected?.itemId === it.id}
          onSelect={onSelect} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </div>
  )
}

// Cache thumbnail data URLs
const _thumbCache = new Map()

function ClipThumbnail({ src, kind, width }) {
  const [dataUrl, setDataUrl] = useState(() => _thumbCache.get(src) || null)

  useEffect(() => {
    if (_thumbCache.has(src)) { setDataUrl(_thumbCache.get(src)); return }
    let cancelled = false

    if (kind === 'image') {
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        const cvs = document.createElement('canvas')
        cvs.width = 80; cvs.height = 45
        const ctx = cvs.getContext('2d')
        // letterbox
        const r = Math.min(80 / img.width, 45 / img.height)
        const w2 = img.width * r, h2 = img.height * r
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, 80, 45)
        ctx.drawImage(img, (80 - w2) / 2, (45 - h2) / 2, w2, h2)
        const url = cvs.toDataURL('image/jpeg', 0.7)
        _thumbCache.set(src, url)
        setDataUrl(url)
      }
      img.crossOrigin = 'anonymous'
      img.src = src
    } else {
      // video — seek to 0.5s for thumbnail
      const vid = document.createElement('video')
      vid.crossOrigin = 'anonymous'
      vid.muted = true
      vid.preload = 'metadata'
      vid.src = src
      const capture = () => {
        if (cancelled) return
        try {
          const cvs = document.createElement('canvas')
          cvs.width = 80; cvs.height = 45
          const ctx = cvs.getContext('2d')
          const r = Math.min(80 / vid.videoWidth, 45 / vid.videoHeight)
          const w2 = vid.videoWidth * r, h2 = vid.videoHeight * r
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, 80, 45)
          ctx.drawImage(vid, (80 - w2) / 2, (45 - h2) / 2, w2, h2)
          const url = cvs.toDataURL('image/jpeg', 0.7)
          _thumbCache.set(src, url)
          setDataUrl(url)
        } catch { /* cross-origin or decode error */ }
      }
      vid.addEventListener('seeked', capture, { once: true })
      vid.addEventListener('loadedmetadata', () => {
        vid.currentTime = Math.min(0.5, (vid.duration || 1) * 0.1)
      }, { once: true })
    }
    return () => { cancelled = true }
  }, [src, kind])

  if (!dataUrl) return null

  // Tile the thumbnail across the full width
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-50"
      style={{
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: '80px 100%',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left center',
      }}
    />
  )
}

// Cache waveform data to avoid re-decoding
const _waveCache = new Map()

function ClipWaveform({ src, width, height }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!src || width < 20) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = data => {
      ctx.clearRect(0, 0, width, height)
      const step = Math.max(1, Math.floor(data.length / width))
      const mid = height / 2
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (let i = 0; i < width; i++) {
        let peak = 0
        for (let j = 0; j < step; j++) {
          const v = Math.abs(data[i * step + j] || 0)
          if (v > peak) peak = v
        }
        const h = Math.max(1, peak * mid * 1.8)
        ctx.fillRect(i, mid - h / 2, 1, h)
      }
    }

    if (_waveCache.has(src)) { draw(_waveCache.get(src)); return }

    let ac
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(src, { signal: ctrl.signal })
        const buf = await res.arrayBuffer()
        ac = new AudioContext()
        const decoded = await ac.decodeAudioData(buf)
        // Downsample to 4000 points max for perf
        const ch = decoded.getChannelData(0)
        const target = 4000
        const ratio = Math.ceil(ch.length / target)
        const small = new Float32Array(Math.ceil(ch.length / ratio))
        for (let i = 0; i < small.length; i++) small[i] = ch[i * ratio] || 0
        _waveCache.set(src, small)
        draw(small)
      } catch {/* aborted or decode error */}
    })()

    return () => { ctrl.abort(); ac?.close() }
  }, [src, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 opacity-80"
    />
  )
}

function Clip({ trackId, item, isSelected, onSelect, onUpdate, onRemove }) {
  const pps = useContext(TlZoomCtx)
  const left = item.start * pps
  const width = (item.end - item.start) * pps
  const drag = useRef(null)

  const onMove = useCallback(
    e => {
      if (!drag.current) return
      const dx = (e.clientX - drag.current.x0) / pps
      const { mode, start, end } = drag.current
      if (mode === 'move') {
        const len = end - start
        const ns = Math.max(0, start + dx)
        onUpdate(trackId, item.id, { start: ns, end: ns + len })
      } else if (mode === 'left') {
        const ns = clamp(start + dx, 0, end - 0.1)
        onUpdate(trackId, item.id, {
          start: ns,
          in: (item.in || 0) + (ns - start),
        })
      } else if (mode === 'right') {
        const ne = Math.max(start + 0.1, end + dx)
        onUpdate(trackId, item.id, {
          end: ne,
          out: (item.in || 0) + (ne - start),
        })
      }
    },
    [item.id, item.in, trackId, onUpdate, pps],
  )
  const onUp = useCallback(() => {
    drag.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [onMove])
  const startDrag = (e, mode) => {
    e.stopPropagation()
    drag.current = { x0: e.clientX, mode, start: item.start, end: item.end }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onClick={e => {
        e.stopPropagation()
        onSelect({ trackId, itemId: item.id })
      }}
      onPointerDown={e => startDrag(e, 'move')}
      className={`clip-block absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border ${clipColor(
        item.kind,
      )} ${
        isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent ring-yellow-300/80 shadow-lg shadow-yellow-400/10' : 'border-opacity-60'
      } group text-[10px] font-semibold text-white shadow active:cursor-grabbing`}
      style={{ left: left + 96, width: Math.max(width, 14) }}
      title={item.text || item.asset_name || ''}
    >
      <div
        onPointerDown={e => startDrag(e, 'left')}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100 z-20"
      />
      {/* Video/image thumbnail strip */}
      {(item.kind === 'video' || item.kind === 'image') && item.asset_path && width > 24 && (
        <ClipThumbnail src={item.asset_path} kind={item.kind} width={Math.floor(width)} />
      )}
      {(item.kind === 'audio' || item.kind === 'music') && item.asset_path && width > 30 && (
        <ClipWaveform src={item.asset_path} width={Math.floor(Math.max(width - 4, 10))} height={28} />
      )}
      {/* Label bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-black/40 px-1.5 py-0.5 backdrop-blur-[2px]">
        <span className="truncate text-[9px] font-semibold text-white/90 drop-shadow">
          {item.text || item.asset_name || 'clip'}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(trackId, item.id) }}
          className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded bg-rose-500/80 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-400"
          title="Xoá clip"
        >×</button>
      </div>
      <div
        onPointerDown={e => startDrag(e, 'right')}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/20 opacity-0 group-hover:opacity-100 z-20"
      />
    </div>
  )
}

function RenameDialog({ current, onClose, onSave }) {
  const [val, setVal] = useState(current || '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50)
  }, [])

  const submit = async e => {
    e?.preventDefault()
    if (!val.trim() || val === current) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await onSave(val.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#101013] p-5 shadow-2xl"
      >
        <h3 className="mb-4 text-base font-bold text-white">Đổi tên project</h3>
        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
          }}
          autoFocus
          className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2.5 text-[14px] text-white outline-none focus:border-violet-400/60"
          placeholder="Tên project..."
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-[12px] font-bold text-white/70 hover:bg-white/5"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy || !val.trim()}
            className="rounded-md bg-violet-500 px-4 py-2 text-[12px] font-bold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  )
}

function NewProjectDialog({ onClose, onCreate }) {
  const presets = [
    { id: 'yt-hd', label: 'YouTube HD', desc: '1920×1080 · 16:9', w: 1920, h: 1080, icon: '▭' },
    { id: 'tiktok', label: 'TikTok / Reels', desc: '1080×1920 · 9:16', w: 1080, h: 1920, icon: '▯' },
    { id: 'square', label: 'Vuông', desc: '1080×1080 · 1:1', w: 1080, h: 1080, icon: '◻' },
    { id: 'yt-4k', label: 'YouTube 4K', desc: '3840×2160 · 16:9', w: 3840, h: 2160, icon: '▭' },
  ]
  const [presetId, setPresetId] = useState('yt-hd')
  const [title, setTitle] = useState('')
  const [fps, setFps] = useState(30)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const preset = presets.find(p => p.id === presetId) || presets[0]

  const submit = async e => {
    e?.preventDefault()
    setBusy(true)
    try {
      await onCreate({
        title: title.trim() || preset.label,
        width: preset.w,
        height: preset.h,
        fps,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-white/10 bg-[#101013] p-5 shadow-2xl"
      >
        <h3 className="mb-4 text-base font-bold text-white">Tạo project mới</h3>

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50">
          Tên project
        </label>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
          }}
          placeholder={preset.label}
          className="mb-4 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-[13px] text-white outline-none focus:border-violet-400/60"
        />

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50">
          Tỉ lệ khung
        </label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {presets.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                presetId === p.id
                  ? 'border-violet-400/60 bg-violet-500/15'
                  : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded text-[20px] ${
                  presetId === p.id ? 'bg-violet-500/30 text-white' : 'bg-black/30 text-white/50'
                }`}
              >
                {p.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold text-white">
                  {p.label}
                </div>
                <div className="text-[10px] text-white/50">{p.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50">
          FPS
        </label>
        <div className="mb-5 flex gap-1.5">
          {[24, 25, 30, 50, 60].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFps(f)}
              className={`flex-1 rounded border px-2 py-1.5 text-[11px] font-bold transition ${
                fps === f
                  ? 'border-violet-400/60 bg-violet-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-[12px] font-bold text-white/70 hover:bg-white/5"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-violet-500 px-5 py-2 text-[12px] font-bold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Đang tạo...' : 'Tạo project'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ExportDialog({ project, onClose, onConfirm }) {
  const isPortrait = project.height > project.width
  const presets = isPortrait
    ? [
        { label: '480p (854×480 → 540×960)', w: 540, h: 960 },
        { label: '720p HD (720×1280)', w: 720, h: 1280 },
        { label: '1080p Full HD (1080×1920)', w: 1080, h: 1920 },
        { label: '4K (2160×3840)', w: 2160, h: 3840 },
      ]
    : [
        { label: '480p (854×480)', w: 854, h: 480 },
        { label: '720p HD (1280×720)', w: 1280, h: 720 },
        { label: '1080p Full HD (1920×1080)', w: 1920, h: 1080 },
        { label: '4K (3840×2160)', w: 3840, h: 2160 },
      ]
  const defaultIdx = presets.findIndex(
    p => p.w === project.width && p.h === project.height,
  )
  const [idx, setIdx] = useState(defaultIdx >= 0 ? defaultIdx : 2)
  const [fps, setFps] = useState(project.fps || 30)
  const [quality, setQuality] = useState('high')
  const [busy, setBusy] = useState(false)

  const crfMap = { low: 28, medium: 23, high: 20, max: 17 }

  const submit = async () => {
    setBusy(true)
    try {
      await onConfirm({
        width: presets[idx].w,
        height: presets[idx].h,
        fps,
        crf: crfMap[quality],
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#101013] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-white">Export MP4</h3>

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50">
          Độ phân giải
        </label>
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {presets.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setIdx(i)}
              className={`rounded border px-2 py-2 text-[11px] font-semibold transition ${
                idx === i
                  ? 'border-violet-400/60 bg-violet-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">
              FPS
            </label>
            <select
              value={fps}
              onChange={e => setFps(parseInt(e.target.value, 10))}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white outline-none focus:border-violet-400/50"
            >
              <option value={24}>24</option>
              <option value={25}>25</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={60}>60</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">
              Chất lượng
            </label>
            <select
              value={quality}
              onChange={e => setQuality(e.target.value)}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white outline-none focus:border-violet-400/50"
            >
              <option value="low">Thấp (file nhỏ)</option>
              <option value="medium">Vừa</option>
              <option value="high">Cao</option>
              <option value="max">Tối đa</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-white/10 px-4 py-2 text-[12px] font-bold text-white/70 hover:bg-white/5 disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-violet-500 px-4 py-2 text-[12px] font-bold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Đang xử lý...' : 'Bắt đầu Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RenderModal({ job, onClose }) {
  const [uploading, setUploading] = useState(false)

  const uploadToYoutube = async () => {
    if (!confirm('Đăng video này lên Youtube?')) return
    setUploading(true)
    try {
      // TODO: Implement Youtube upload API
      alert('Tính năng đăng Youtube đang được phát triển')
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#101013] p-6 shadow-2xl">
        <h3 className="mb-3 text-base font-bold text-white">✅ Render xong</h3>
        <video
          src={job.output_path}
          controls
          className="w-full rounded bg-black"
        />
        <div className="mt-3 rounded border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/50" title={job.output_path}>
          {job.output_path}
        </div>
        <p className="mt-2 text-[10px] text-white/40">
          File lưu tại <span className="font-mono">data/editor/output/</span> · Quản lý các file render trong tab "File đã render" ở danh sách project.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={uploadToYoutube}
            disabled={uploading}
            className="rounded-md bg-red-600 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {uploading ? '⏳ Đang đăng...' : '📺 Đăng Youtube'}
          </button>
          <a
            href={job.output_path}
            download
            className="rounded-md bg-violet-500 px-4 py-2 text-[12px] font-bold text-white hover:bg-violet-400"
          >
            ⬇ Tải MP4
          </a>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-[12px] font-bold text-white/70 hover:bg-white/5"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
