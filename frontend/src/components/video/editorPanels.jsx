// Sidebar panels for VideoEditor: Upload, Photo, Video, Text, Effects.
// Plain functions returning JSX, used by VideoEditor.jsx.
import { useEffect, useRef, useState } from 'react'
import { fmtTime, trackKindIcon } from './editorUtils.js'
import MusicLibrary from '../MusicLibrary.jsx'
import { useSpeechToText } from '../../hooks/useSpeechToText.js'

async function readJsonResponse(res) {
  const raw = await res.text()
  if (!raw) return {}
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`API không trả JSON (HTTP ${res.status}). Kiểm tra backend/proxy.`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`API trả JSON lỗi định dạng (HTTP ${res.status}).`)
  }
}

export function UploadPanel({ onUpload }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const onPick = async file => {
    if (!file) return
    setBusy(true)
    try {
      await onUpload(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell title="Tải lên">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/5 py-6 text-[13px] font-semibold text-white/80 transition hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-white disabled:opacity-50"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" />
        </svg>
        {busy ? 'Đang upload...' : 'Chọn video / ảnh'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      <div className="mt-2 rounded-md border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/40">
        File sau khi upload sẽ xuất hiện ở tab <b className="text-white/70">Project</b>. Từ đó kéo vào timeline để dùng.
      </div>
    </PanelShell>
  )
}

export function ProjectAssetsPanel({ assets, onAdd, onDelete, onAddBackground }) {
  const [bgColor, setBgColor] = useState('#ffffff')
  const backgrounds = [
    ['#ffffff', 'Trắng'],
    ['#000000', 'Đen'],
    ['#f4f4f5', 'Xám sáng'],
    ['#0f172a', 'Navy'],
    ['#fef3c7', 'Vàng nhạt'],
    ['#dcfce7', 'Xanh nhạt'],
  ]
  return (
    <PanelShell title={`Asset của Project (${assets.length})`}>
      <div className="mb-3 rounded-md border border-white/10 bg-white/[0.03] p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Nền màu</span>
          <input
            type="color"
            value={bgColor}
            onChange={e => setBgColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
          />
        </div>
        <div className="mb-2 grid grid-cols-6 gap-1">
          {backgrounds.map(([color, label]) => (
            <button
              key={color}
              type="button"
              title={label}
              onClick={() => setBgColor(color)}
              className={`aspect-square rounded border ${bgColor === color ? 'border-violet-300' : 'border-white/15'}`}
              style={{ background: color }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onAddBackground?.(bgColor)}
          className="w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white/75 transition hover:bg-violet-500/25 hover:text-white"
        >
          + Thêm nền màu
        </button>
      </div>
      <AssetGrid assets={assets} onAdd={onAdd} onDelete={onDelete} />
    </PanelShell>
  )
}

export function PhotoPanel({ api, projectId, onImported }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    let alive = true
    api
      .get('/api/photo/history?limit=60')
      .then(r => alive && setItems(r.data || []))
      .catch(e => console.error('photo history', e))
    return () => {
      alive = false
    }
  }, [api])

  const importItem = async name => {
    console.log('[PhotoPanel] importItem clicked', { name, projectId })
    if (!projectId) {
      alert('Chưa chọn project — vào project trước rồi mới Add')
      return
    }
    setBusy(name)
    try {
      const r = await api.post(
        `/api/editor/projects/${projectId}/assets/import`,
        { source: 'photo', name },
      )
      console.log('[PhotoPanel] import OK', r.data)
      onImported(r.data)
    } catch (e) {
      console.error('photo import', e)
      alert('Import lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelShell title={`Ảnh từ Photo (${items.length})`}>
      {items.length === 0 ? (
        <Empty msg="Chưa có ảnh trong tab Photo" />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {items.map(it => (
            <div
              key={it.name}
              className="group relative aspect-square overflow-hidden rounded border border-white/10 bg-black/40 transition hover:border-violet-400/60"
            >
              <img
                src={`/cache-images/${it.name}`}
                alt=""
                className="pointer-events-none h-full w-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => importItem(it.name)}
                disabled={busy === it.name}
                className="absolute bottom-1 right-1 rounded-md bg-violet-500/90 px-2 py-1 text-[10px] font-bold text-white shadow-md transition hover:bg-violet-400 disabled:opacity-60"
              >
                {busy === it.name ? '...' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  )
}

export function VideoPanel({ api, projectId, onImported }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    let alive = true
    api
      .get('/api/i2v/history?limit=60')
      .then(r => alive && setItems(r.data?.items || []))
      .catch(e => console.error('i2v history', e))
    return () => {
      alive = false
    }
  }, [api])

  const importItem = async name => {
    console.log('[VideoPanel] importItem clicked', { name, projectId })
    if (!projectId) {
      alert('Chưa chọn project — vào project trước rồi mới Add')
      return
    }
    setBusy(name)
    try {
      const r = await api.post(
        `/api/editor/projects/${projectId}/assets/import`,
        { source: 'video', name },
      )
      console.log('[VideoPanel] import OK', r.data)
      onImported(r.data)
    } catch (e) {
      console.error('video import', e)
      alert('Import lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelShell title={`Video từ Animate (${items.length})`}>
      {items.length === 0 ? (
        <Empty msg="Chưa có video trong tab Animate" />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {items.map(it => (
            <div
              key={it.name}
              className="group relative aspect-video overflow-hidden rounded border border-white/10 bg-black/40 transition hover:border-violet-400/60"
            >
              <video
                src={it.url}
                muted
                preload="metadata"
                className="pointer-events-none h-full w-full object-cover"
              />
              <button
                onClick={() => importItem(it.name)}
                disabled={busy === it.name}
                className="absolute bottom-1 right-1 rounded-md bg-violet-500/90 px-2 py-1 text-[10px] font-bold text-white shadow-md transition hover:bg-violet-400 disabled:opacity-60"
              >
                {busy === it.name ? '...' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  )
}

export function TextPanel({ onAdd }) {
  const [custom, setCustom] = useState('')
  const [size, setSize] = useState(72)
  const [color, setColor] = useState('#ffffff')
  const [anim, setAnim] = useState('fade-in')
  const [styleId, setStyleId] = useState('clean')

  const presets = [
    { name: 'Tiêu đề', size: 96, color: '#ffffff' },
    { name: 'Subtitle', size: 56, color: '#ffffff' },
    { name: 'Highlight', size: 72, color: '#ffd000' },
    { name: 'Caption', size: 40, color: '#ffffff' },
    { name: 'Big Bold', size: 128, color: '#ff4d6d' },
    { name: 'Soft', size: 48, color: '#a8b3cf' },
  ]
  const anims = [
    { id: 'none', label: 'Không' },
    { id: 'fade-in', label: 'Fade in' },
    { id: 'fade-out', label: 'Fade out' },
    { id: 'slide-up', label: 'Slide ↑' },
    { id: 'slide-down', label: 'Slide ↓' },
    { id: 'slide-left', label: 'Slide ←' },
    { id: 'slide-right', label: 'Slide →' },
    { id: 'zoom-in', label: 'Zoom in' },
    { id: 'bounce', label: 'Bounce' },
    { id: 'typewriter', label: 'Typewriter' },
    { id: 'glow', label: 'Glow pulse' },
  ]
  const styles = [
    { id: 'clean', label: 'Sạch', sample: { textShadow: '0 2px 8px rgba(0,0,0,.85)' } },
    { id: 'outline', label: 'Viền', sample: { WebkitTextStroke: '2px #000' } },
    { id: 'gradient', label: 'Gradient', sample: { background: 'linear-gradient(45deg,#ff4d6d,#ffd000)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } },
    { id: 'neon', label: 'Neon', sample: { textShadow: '0 0 6px #0ff,0 0 12px #0ff,0 0 24px #0ff' } },
    { id: 'shadow', label: 'Shadow 3D', sample: { textShadow: '3px 3px 0 #000,5px 5px 0 #555' } },
    { id: 'block', label: 'Block', sample: { background: 'rgba(0,0,0,.85)', padding: '0.15em 0.4em', borderRadius: 4 } },
  ]

  const make = (extra = {}) => ({
    name: extra.name || custom.trim() || 'Text',
    size: extra.size ?? size,
    color: extra.color ?? color,
    anim,
    style: styleId,
  })

  return (
    <PanelShell title="Text / Phụ đề">
      <div className="mb-4 space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-2.5">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
          Khung tự do
        </label>
        <textarea
          value={custom}
          onChange={e => setCustom(e.target.value)}
          rows={2}
          placeholder="Gõ chữ vào đây..."
          className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={size}
            min={8}
            step={2}
            onChange={e => setSize(parseInt(e.target.value, 10) || 64)}
            className="w-16 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-violet-400/50"
          />
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-black/30"
          />
          <button
            onClick={() => {
              if (!custom.trim()) return
              onAdd(make())
              setCustom('')
            }}
            disabled={!custom.trim()}
            className="ml-auto rounded-md bg-violet-500 px-3 py-1 text-[11px] font-bold text-white shadow-md transition hover:bg-violet-400 disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      </div>

      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
        Style
      </h4>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {styles.map(s => (
          <button
            key={s.id}
            onClick={() => setStyleId(s.id)}
            className={`flex h-12 items-center justify-center rounded border text-[11px] font-bold transition ${
              styleId === s.id
                ? 'border-violet-400/60 bg-violet-500/15'
                : 'border-white/10 bg-white/5 hover:border-white/30'
            }`}
          >
            <span style={{ color: '#fff', ...s.sample }}>{s.label}</span>
          </button>
        ))}
      </div>

      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
        Animation
      </h4>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {anims.map(a => (
          <button
            key={a.id}
            onClick={() => setAnim(a.id)}
            className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition ${
              anim === a.id
                ? 'border-violet-400/60 bg-violet-500/15 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
        Preset nhanh
      </h4>
      <div className="grid grid-cols-1 gap-2">
        {presets.map(p => (
          <button
            key={p.name}
            onClick={() => onAdd(make(p))}
            className="rounded-md border border-white/8 bg-white/5 p-3 text-left transition hover:border-violet-400/40 hover:bg-violet-500/10"
          >
            <span
              className="block truncate font-bold leading-tight"
              style={{ color: p.color, fontSize: Math.min(28, p.size / 4) }}
            >
              {p.name}
            </span>
            <span className="text-[10px] text-white/40">
              {p.size}px · {anim} · {styleId}
            </span>
          </button>
        ))}
      </div>
    </PanelShell>
  )
}

function AudioWaveform({ playing }) {
  return (
    <span className="flex items-end gap-[2px] h-4">
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-emerald-400"
          style={{
            height: playing ? undefined : '6px',
            animation: playing ? `wavebar 0.6s ease-in-out ${(i * 0.11) % 0.6}s infinite alternate` : 'none',
            minHeight: '3px',
            maxHeight: '16px',
          }}
        />
      ))}
    </span>
  )
}

function fmtDur(s) {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function AudioPanel({ api, projectId, onImported }) {
  const fileInputRef = useRef(null)
  const audioRef = useRef(null)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [playingName, setPlayingName] = useState(null)
  const [search, setSearch] = useState('')

  const refresh = async () => {
    try {
      const r = await api.get('/api/editor/audio-library')
      setItems(r.data.items || [])
    } catch (e) {
      console.error('audio-library list', e)
    }
  }
  useEffect(() => { refresh() }, [])

  const upload = async file => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post('/api/editor/audio-library/upload', fd)
      await refresh()
    } catch (e) {
      alert('Upload lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(false)
    }
  }

  const importAndAdd = async name => {
    if (!projectId) { alert('Mở 1 project trước'); return }
    setBusy(name)
    try {
      const r = await api.post(`/api/editor/projects/${projectId}/audio-library/import`, { name })
      onImported?.(r.data)
    } catch (e) {
      alert('Import lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setBusy(null)
    }
  }

  const removeItem = async name => {
    if (!confirm(`Xoá "${name}"?`)) return
    if (playingName === name) { audioRef.current?.pause(); setPlayingName(null) }
    await api.delete(`/api/editor/audio-library/${encodeURIComponent(name)}`)
    setItems(t => t.filter(x => x.name !== name))
  }

  const handlePlay = item => {
    const API_BASE = import.meta.env.VITE_API_BASE || ''
    if (playingName === item.name) {
      audioRef.current?.pause()
      setPlayingName(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = `${API_BASE}${item.path}`
      audioRef.current.play().catch(() => {})
    }
    setPlayingName(item.name)
  }

  const filtered = search
    ? items.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <PanelShell title={`Audio (${items.length})`}>
      <style>{`@keyframes wavebar{from{height:3px}to{height:16px}}`}</style>
      <audio ref={audioRef} onEnded={() => setPlayingName(null)} hidden />

      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm audio..."
            className="w-full rounded-md border border-white/8 bg-white/5 py-1.5 pl-7 pr-2 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-violet-500/50"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md border border-white/10 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16"/>
          </svg>
          {uploading ? '...' : 'Upload'}
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Empty msg={search ? 'Không tìm thấy' : 'Upload file audio để bắt đầu'} />
      ) : (
        <div className="flex flex-col gap-0.5">
          {filtered.map(a => (
            <div
              key={a.name}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                playingName === a.name ? 'bg-emerald-500/10 ring-1 ring-emerald-500/25' : 'hover:bg-white/5'
              }`}
            >
              {/* Play */}
              <button
                onClick={() => handlePlay(a)}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-white/60 hover:bg-emerald-500/25 hover:text-emerald-300 transition"
              >
                {playingName === a.name ? (
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>
                  </svg>
                ) : (
                  <svg className="h-3 w-3 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  {playingName === a.name && <AudioWaveform playing />}
                  <span className="truncate text-[12px] font-medium text-white/85">{a.name}</span>
                </div>
                {a.duration > 0 && (
                  <span className="text-[10px] text-white/30">{fmtDur(a.duration)}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => importAndAdd(a.name)}
                  disabled={busy === a.name}
                  title="Thêm vào timeline"
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {busy === a.name ? '...' : '+'}
                </button>
                <button
                  onClick={() => removeItem(a.name)}
                  className="rounded p-1 text-white/25 hover:text-rose-400"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Playing bar */}
      {playingName && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
          <AudioWaveform playing />
          <span className="flex-1 truncate text-[11px] text-emerald-300">{playingName}</span>
          <button onClick={() => { audioRef.current?.pause(); setPlayingName(null) }} className="text-white/40 hover:text-white/80">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}
    </PanelShell>
  )
}

const EFFECT_PRESETS = [
  // Particle
  { id: 'snow',    label: '❄️ Tuyết rơi',  color: 'sky',    apply: { particle: 'snow' } },
  { id: 'rain',    label: '🌧 Mưa rơi',    color: 'blue',   apply: { particle: 'rain' } },
  { id: 'sparkle', label: '✨ Sparkle',    color: 'yellow', apply: { particle: 'sparkle' } },
  { id: 'fire',    label: '🔥 Lửa',        color: 'orange', apply: { particle: 'fire' } },
  { id: 'leaves',  label: '🍂 Lá rơi',    color: 'amber',  apply: { particle: 'leaves' } },
  // Motion
  { id: 'kb-in',   label: 'Ken Burns +', color: 'sky',    apply: { zoom: 'in' } },
  { id: 'kb-out',  label: 'Ken Burns −', color: 'sky',    apply: { zoom: 'out' } },
  { id: 'pan-l',   label: 'Pan ←',       color: 'sky',    apply: { slide: 'left', zoom: 'in' } },
  { id: 'pan-r',   label: 'Pan →',       color: 'sky',    apply: { slide: 'right', zoom: 'in' } },
  { id: 'in-left', label: 'Vào trái',    color: 'violet', apply: { motion: 'enter-left' } },
  { id: 'in-right',label: 'Vào phải',    color: 'violet', apply: { motion: 'enter-right' } },
  { id: 'pop',     label: 'Pop',         color: 'yellow', apply: { motion: 'pop' } },
  { id: 'float',   label: 'Float',       color: 'teal',   apply: { motion: 'float' } },
  { id: 'shatter', label: 'Tan vỡ',      color: 'red',    apply: { motion: 'shatter' } },
  { id: 'bounce-in', label: 'Bounce',    color: 'yellow', apply: { motion: 'bounce-in' } },
  { id: 'pulse',   label: 'Pulse',       color: 'pink',   apply: { motion: 'pulse' } },
  { id: 'shake',   label: 'Shake',       color: 'red',    apply: { motion: 'shake' } },
  { id: 'spin',    label: 'Spin',        color: 'violet', apply: { motion: 'spin' } },
  // Color grading
  { id: 'cinema',  label: '🎬 Cinema',   color: 'amber',  apply: { saturation: 0.8, contrast: 1.2, brightness: -0.08, vignette: 0.5 } },
  { id: 'noir',    label: '🎞 Noir',     color: 'gray',   apply: { grayscale: true, saturation: 0, contrast: 1.4, vignette: 0.7 } },
  { id: 'warm',    label: '🌅 Golden',   color: 'orange', apply: { saturation: 1.3, hue: 15, brightness: 0.05, vignette: 0.3 } },
  { id: 'cold',    label: '❄️ Arctic',   color: 'blue',   apply: { saturation: 0.7, hue: -20, brightness: -0.05 } },
  { id: 'vivid',   label: '✨ Vivid',    color: 'violet', apply: { saturation: 1.8, contrast: 1.1, brightness: 0.04 } },
  { id: 'vintage', label: '📷 Vintage',  color: 'yellow', apply: { sepia: 0.5, saturation: 0.8, brightness: 0.05, vignette: 0.5 } },
  { id: 'dream',   label: '💭 Dream',    color: 'pink',   apply: { saturation: 1.2, blur: 1.5, brightness: 0.06, vignette: 0.2 } },
  { id: 'horror',  label: '🩸 Horror',   color: 'red',    apply: { saturation: 0.4, contrast: 1.3, brightness: -0.15, hue: 10, vignette: 0.7 } },
  { id: 'teal',    label: '🌊 Teal',     color: 'teal',   apply: { saturation: 1.1, hue: -30, contrast: 1.1 } },
  { id: 'retro',   label: '📼 Retro',    color: 'amber',  apply: { sepia: 0.8, saturation: 0.6, contrast: 0.9, vignette: 0.6 } },
  { id: 'sharp',   label: '🔪 Sharp',    color: 'white',  apply: { sharpen: true, contrast: 1.15, saturation: 1.1 } },
  { id: 'reset',   label: '↺ Reset',     color: 'gray',   apply: null },
]

const EFFECT_GROUPS = [
  {
    id: 'motion',
    icon: '↗',
    label: 'Chuyển động',
    ids: ['in-left', 'in-right', 'pop', 'bounce-in', 'float', 'pulse', 'shake', 'spin', 'shatter'],
  },
  {
    id: 'camera',
    icon: '⌁',
    label: 'Camera',
    ids: ['kb-in', 'kb-out', 'pan-l', 'pan-r'],
  },
  {
    id: 'particle',
    icon: '✦',
    label: 'Overlay',
    ids: ['sparkle', 'fire', 'snow', 'rain', 'leaves'],
  },
  {
    id: 'filter',
    icon: '◐',
    label: 'Màu',
    ids: ['cinema', 'vivid', 'warm', 'cold', 'teal', 'vintage', 'retro', 'noir', 'dream', 'horror', 'sharp'],
  },
]

const PRESET_COLOR = {
  sky:    'border-sky-500/40 bg-sky-500/10 text-sky-300',
  amber:  'border-amber-500/40 bg-amber-500/10 text-amber-300',
  gray:   'border-white/15 bg-white/5 text-white/60',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  blue:   'border-blue-500/40 bg-blue-500/10 text-blue-300',
  violet: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  yellow: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  pink:   'border-pink-500/40 bg-pink-500/10 text-pink-300',
  red:    'border-red-500/40 bg-red-500/10 text-red-300',
  teal:   'border-teal-500/40 bg-teal-500/10 text-teal-300',
  white:  'border-white/20 bg-white/8 text-white/80',
}

export function EffectsPanel({ selected, timeline, onUpdate }) {
  const [activeGroup, setActiveGroup] = useState('motion')
  if (!selected) return <PanelShell title="Hiệu ứng"><Empty msg="Chọn 1 clip ở timeline để áp hiệu ứng" /></PanelShell>
  const tr = timeline.tracks.find(t => t.id === selected.trackId)
  const it = tr?.items.find(i => i.id === selected.itemId)
  if (!it || it.kind === 'text' || it.kind === 'audio' || it.kind === 'music' || it.kind === 'solid')
    return <PanelShell title="Hiệu ứng"><Empty msg="Hiệu ứng áp cho clip video/ảnh" /></PanelShell>

  const fx = it.effects || {}
  const set = patch => onUpdate(selected.trackId, selected.itemId, { effects: { ...fx, ...patch } })
  const applyPreset = apply => onUpdate(selected.trackId, selected.itemId, { effects: apply || {} })
  const group = EFFECT_GROUPS.find(g => g.id === activeGroup) || EFFECT_GROUPS[0]
  const presets = group.ids.map(id => EFFECT_PRESETS.find(p => p.id === id)).filter(Boolean)

  return (
    <PanelShell title="Hiệu ứng">
      <div className="hagent-editor-scrollbar mb-3 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/25 p-1">
        {EFFECT_GROUPS.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition ${
              activeGroup === g.id
                ? 'bg-white text-black shadow-sm'
                : 'text-white/55 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded ${
              activeGroup === g.id ? 'bg-black/10' : 'bg-white/8 text-white/70'
            }`}>
              {g.icon}
            </span>
            <span>{g.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {presets.map(p => {
          const active = JSON.stringify(fx) === JSON.stringify(p.apply || {})
          const cls = active
            ? 'border-yellow-400/60 bg-yellow-400/10 text-yellow-200'
            : (PRESET_COLOR[p.color] || PRESET_COLOR.gray)
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p.apply)}
              className={`rounded-md border px-2 py-1.5 text-left text-[10px] font-semibold transition hover:opacity-90 ${cls}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={() => applyPreset(null)}
        className="mt-2 w-full rounded-md border border-white/10 bg-white/5 py-1.5 text-[10px] font-bold text-white/45 transition hover:bg-white/10 hover:text-white"
      >
        Reset hiệu ứng
      </button>

      {/* Fine controls */}
      <div className="mt-4 space-y-2.5">
        <Slider label="Saturation" v={fx.saturation ?? 1} min={0} max={2} step={0.05} onChange={v => set({ saturation: v })} />
        <Slider label="Brightness" v={fx.brightness ?? 0} min={-0.5} max={0.5} step={0.02} onChange={v => set({ brightness: v })} />
        <Slider label="Contrast"   v={fx.contrast ?? 1} min={0.5} max={2} step={0.05} onChange={v => set({ contrast: v })} />
        <Slider label="Hue shift"  v={fx.hue ?? 0} min={-180} max={180} step={5} onChange={v => set({ hue: v })} />
        <Slider label="Blur"       v={fx.blur ?? 0} min={0} max={20} step={0.5} onChange={v => set({ blur: v })} />
        <Slider label="Vignette"   v={fx.vignette ?? 0} min={0} max={1} step={0.05} onChange={v => set({ vignette: v })} />
        <Slider label="Sepia"      v={typeof fx.sepia === 'number' ? fx.sepia : (fx.sepia ? 1 : 0)} min={0} max={1} step={0.05} onChange={v => set({ sepia: v > 0 ? v : false })} />

        {/* Toggle switches */}
        <div className="flex items-center justify-between pt-1">
          {[
            { key: 'grayscale', label: 'B&W' },
            { key: 'sharpen',   label: 'Sharpen' },
          ].map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-[11px] text-white/60">
              <span className="relative inline-block h-4 w-7 rounded-full transition" style={{ background: fx[key] ? '#7c3aed' : 'rgba(255,255,255,0.1)' }}>
                <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: fx[key] ? '14px' : '2px' }} />
                <input type="checkbox" className="sr-only" checked={!!fx[key]} onChange={e => set({ [key]: e.target.checked || undefined })} />
              </span>
              {label}
            </label>
          ))}
          <button onClick={() => applyPreset(null)} className="text-[10px] text-white/30 hover:text-white/70">↺ Reset</button>
        </div>
      </div>
    </PanelShell>
  )
}

export function PropertiesPanel({ selected, timeline, onUpdate, onRemove }) {
  if (!selected) {
    return (
      <aside className="hidden w-[260px] shrink-0 border-l border-white/8 bg-[#0f0f12] p-4 text-[11px] text-white/40 md:block">
        Chọn 1 clip để chỉnh thông số
      </aside>
    )
  }
  const tr = timeline.tracks.find(t => t.id === selected.trackId)
  const it = tr?.items.find(i => i.id === selected.itemId)
  if (!it) return null
  const set = patch => onUpdate(selected.trackId, selected.itemId, patch)

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-l border-white/8 bg-[#0f0f12] p-3 text-[11px] md:flex">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          Thuộc tính
        </span>
        <button
          onClick={() => onRemove(selected.trackId, selected.itemId)}
          className="text-rose-400 hover:underline"
        >
          Xoá
        </button>
      </div>
      <div className="space-y-3">
        <NumField
          label="Bắt đầu (s)"
          v={it.start}
          step={0.1}
          onChange={v => set({ start: v, end: v + (it.end - it.start) })}
        />
        <NumField
          label="Kết thúc (s)"
          v={it.end}
          step={0.1}
          onChange={v => set({ end: Math.max(v, it.start + 0.1) })}
        />
        {it.kind !== 'text' && (
          <>
            {(it.kind === 'video' || it.kind === 'image' || it.kind === 'solid') && (
              <>
                {it.kind === 'solid' ? (
                  <>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Màu nền
                    </label>
                    <input
                      type="color"
                      value={it.color || '#ffffff'}
                      onChange={e => set({ color: e.target.value })}
                      className="h-9 w-full cursor-pointer rounded border border-white/10 bg-black/30"
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Fit mode
                    </label>
                    <select
                      value={it.fit || 'overlay'}
                      onChange={e => {
                        const fit = e.target.value
                        set(fit === 'overlay'
                          ? {
                              fit: null,
                              pos: it.pos || { x: 0.5, y: 0.5 },
                              size: it.size || { w: 0.34, h: 0.34 },
                              opacity: it.opacity ?? 1,
                            }
                          : { fit })
                      }}
                      className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
                    >
                      <option value="overlay">Layer kéo thả</option>
                      <option value="contain">Contain (vừa khung)</option>
                      <option value="cover">Cover (đầy khung)</option>
                      <option value="fill">Fill (kéo giãn)</option>
                    </select>
                    {it.fit ? (
                      <>
                        <Slider
                          label="Scale (%)"
                          v={(it.scale ?? 1) * 100}
                          min={10}
                          max={200}
                          step={5}
                          onChange={v => set({ scale: v / 100 })}
                        />
                        <Slider
                          label="Position X"
                          v={it.position_x ?? 0}
                          min={-100}
                          max={100}
                          step={1}
                          onChange={v => set({ position_x: v })}
                        />
                        <Slider
                          label="Position Y"
                          v={it.position_y ?? 0}
                          min={-100}
                          max={100}
                          step={1}
                          onChange={v => set({ position_y: v })}
                        />
                      </>
                    ) : (
                      <>
                        <Slider
                          label="Layer width (%)"
                          v={((it.size?.w ?? 0.34) * 100)}
                          min={4}
                          max={120}
                          step={1}
                          onChange={v => set({ size: { ...(it.size || {}), w: v / 100 } })}
                        />
                        <Slider
                          label="Layer height (%)"
                          v={((it.size?.h ?? 0.34) * 100)}
                          min={4}
                          max={120}
                          step={1}
                          onChange={v => set({ size: { ...(it.size || {}), h: v / 100 } })}
                        />
                        <Slider
                          label="Opacity"
                          v={it.opacity ?? 1}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={v => set({ opacity: v })}
                        />
                      </>
                    )}
                  </>
                )}
              </>
            )}
            <Slider
              label="Volume"
              v={it.volume ?? 1}
              min={0}
              max={2}
              step={0.05}
              onChange={v => set({ volume: v })}
            />
            <Slider
              label="Fade in (s)"
              v={it.fade_in || 0}
              min={0}
              max={5}
              step={0.1}
              onChange={v => set({ fade_in: v })}
            />
            <Slider
              label="Fade out (s)"
              v={it.fade_out || 0}
              min={0}
              max={5}
              step={0.1}
              onChange={v => set({ fade_out: v })}
            />
          </>
        )}
        {it.kind === 'text' && (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Font
            </label>
            <select
              value={it.font || 'Noto Sans'}
              onChange={e => set({ font: e.target.value })}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
            >
              <option value="Noto Sans">Noto Sans (tiếng Việt)</option>
              <option value="Arial">Arial</option>
              <option value="Arial Bold">Arial Bold</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Impact">Impact (không dấu)</option>
              <option value="Arial Black">Arial Black (không dấu)</option>
              <option value="Trebuchet MS">Trebuchet MS (không dấu)</option>
              <option value="Comic Sans MS">Comic Sans MS (không dấu)</option>
            </select>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Text
            </label>
            <textarea
              value={it.text || ''}
              onChange={e => set({ text: e.target.value })}
              rows={2}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
            />
            <NumField
              label="Cỡ chữ"
              v={it.size || 64}
              step={2}
              min={8}
              onChange={v => set({ size: v })}
            />
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Màu
            </label>
            <input
              type="color"
              value={it.color || '#ffffff'}
              onChange={e => set({ color: e.target.value })}
              className="h-8 w-full rounded border border-white/10 bg-black/30"
            />
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Style
            </label>
            <select
              value={it.style || 'clean'}
              onChange={e => set({ style: e.target.value })}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
            >
              <option value="clean">Sạch</option>
              <option value="outline">Viền đen</option>
              <option value="stroke">Chỉ viền</option>
              <option value="shadow">Shadow 3D</option>
              <option value="shadow3d">Shadow sâu</option>
              <option value="block">Block đen</option>
              <option value="block-color">Block màu</option>
              <option value="gradient">Gradient vàng đỏ</option>
              <option value="gradient2">Gradient tím hồng</option>
              <option value="neon">Neon glow</option>
              <option value="neon2">Neon xanh</option>
            </select>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Animation
            </label>
            <select
              value={it.anim || 'fade-in'}
              onChange={e => set({ anim: e.target.value })}
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
            >
              <option value="none">Không</option>
              <option value="fade-in">Fade in</option>
              <option value="fade-out">Fade out</option>
              <option value="slide-up">Slide ↑</option>
              <option value="slide-down">Slide ↓</option>
              <option value="slide-left">Slide ←</option>
              <option value="slide-right">Slide →</option>
              <option value="zoom-in">Zoom in</option>
              <option value="bounce">Bounce</option>
              <option value="typewriter">Typewriter</option>
              <option value="glow">Glow pulse</option>
            </select>
          </>
        )}
      </div>
    </aside>
  )
}

// ----- reup -----
export function ReupPanel({ api }) {
  const inputRef = useRef(null)
  const [uploaded, setUploaded] = useState(null)
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState([])
  const [polling, setPolling] = useState(null)
  const [aiTasks, setAiTasks] = useState([])
  const [showAiPicker, setShowAiPicker] = useState(false)
  const [opts, setOpts] = useState({
    flip: false, speed: 1.0, crop: 0, brightness: 0,
    contrast: 1.0, saturation: 1.0, border: 0, trim_start: 0, trim_end: 0,
  })

  const setOpt = (k, v) => setOpts(p => ({ ...p, [k]: v }))

  const loadJobs = async () => {
    try { const r = await api.get('/api/editor/reup/jobs'); setJobs(r.data.items || []) } catch {}
  }

  const loadAiTasks = async () => {
    try {
      const r = await api.get('/api/video/tasks')
      setAiTasks((r.data.tasks || []).filter(t => t.status === 'done' && t.video_file))
    } catch {}
  }

  const importFromAi = async task => {
    setBusy(true)
    try {
      const r = await api.post('/api/editor/reup/import', { source_path: `/uploads/${task.video_file}` })
      setUploaded(r.data)
      setShowAiPicker(false)
    } catch (e) { alert('Import lỗi: ' + (e.response?.data?.detail || e.message)) }
    finally { setBusy(false) }
  }

  useEffect(() => { loadJobs() }, [])

  useEffect(() => {
    if (!polling) return
    const iv = setInterval(async () => {
      try {
        const r = await api.get(`/api/editor/reup/jobs/${polling}`)
        if (r.data.status === 'done' || r.data.status === 'error') { setPolling(null); loadJobs() }
      } catch {}
    }, 1500)
    return () => clearInterval(iv)
  }, [polling])

  const upload = async file => {
    setBusy(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post('/api/editor/reup/upload', fd)
      setUploaded(r.data)
    } catch (e) { alert('Upload lỗi: ' + (e.response?.data?.detail || e.message)) }
    finally { setBusy(false) }
  }

  const process = async () => {
    if (!uploaded || busy || polling) return
    setBusy(true)
    try {
      const r = await api.post('/api/editor/reup/process', { source_path: uploaded.path, ...opts })
      setPolling(r.data.job_id)
      loadJobs()
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.detail || e.message)) }
    finally { setBusy(false) }
  }

  const delJob = async jid => { await api.delete(`/api/editor/reup/jobs/${jid}`); loadJobs() }

  const fmtSize = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? (n / 1e3).toFixed(0) + ' KB' : (n || 0) + ' B'

  return (
    <PanelShell title="Dịch Video · Reup">
      <div
        onClick={() => !busy && inputRef.current?.click()}
        className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[.03] px-3 py-4 transition hover:border-violet-400/40 hover:bg-violet-500/[.07]"
      >
        <span className="text-[20px] text-white/40">↑</span>
        <span className="text-[12px] font-semibold text-white/70">
          {busy ? 'Đang upload...' : uploaded ? uploaded.path.split('/').at(-1) : 'Chọn video gốc'}
        </span>
        {uploaded && (
          <span className="text-[10px] text-white/35">{uploaded.width}×{uploaded.height} · {uploaded.duration?.toFixed(1)}s</span>
        )}
      </div>
      <input ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      {/* Import từ Video AI */}
      <button
        onClick={() => { if (!showAiPicker) loadAiTasks(); setShowAiPicker(p => !p) }}
        className="mb-3 flex w-full items-center justify-between rounded-md border border-white/8 bg-white/[.03] px-3 py-1.5 text-[11px] text-white/50 transition hover:border-violet-400/30 hover:text-white/80"
      >
        <span>🎙️ Chọn từ Video đã dịch</span>
        <span className="text-[10px]">{showAiPicker ? '▲' : '▼'}</span>
      </button>
      {showAiPicker && (
        <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-white/8 bg-white/[.02]">
          {aiTasks.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-white/30">Chưa có video nào đã dịch xong</div>
          ) : aiTasks.map(t => (
            <button key={t.id} onClick={() => importFromAi(t)} disabled={busy}
              className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left transition last:border-0 hover:bg-violet-500/10 disabled:opacity-40">
              <span className="text-[10px]">🎬</span>
              <span className="flex-1 truncate text-[11px] text-white/70">{t.title}</span>
              <span className="shrink-0 text-[9px] text-white/30">
                {t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 space-y-2.5 rounded-lg border border-white/8 bg-white/[.02] p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={opts.flip} onChange={e => setOpt('flip', e.target.checked)} className="accent-violet-500" />
          <span className="text-[11px] text-white/65">Lật ngang (hflip)</span>
        </label>
        <ReupSlider label="Tốc độ" v={opts.speed} min={1.0} max={1.5} step={0.05} fmt={v => `${v.toFixed(2)}×`} onChange={v => setOpt('speed', v)} />
        <ReupSlider label="Crop viền" v={opts.crop} min={0} max={10} step={0.5} fmt={v => `${v}%`} onChange={v => setOpt('crop', v)} />
        <ReupSlider label="Brightness" v={opts.brightness} min={-0.3} max={0.3} step={0.02} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(2)} onChange={v => setOpt('brightness', v)} />
        <ReupSlider label="Contrast" v={opts.contrast} min={0.7} max={1.5} step={0.05} fmt={v => v.toFixed(2)} onChange={v => setOpt('contrast', v)} />
        <ReupSlider label="Saturation" v={opts.saturation} min={0.5} max={2.0} step={0.1} fmt={v => v.toFixed(1)} onChange={v => setOpt('saturation', v)} />
        <ReupSlider label="Border" v={opts.border} min={0} max={30} step={2} fmt={v => `${v}px`} onChange={v => setOpt('border', v)} />
        <ReupSlider label="Cắt đầu" v={opts.trim_start} min={0} max={10} step={0.5} fmt={v => `${v}s`} onChange={v => setOpt('trim_start', v)} />
        <ReupSlider label="Cắt đuôi" v={opts.trim_end} min={0} max={10} step={0.5} fmt={v => `${v}s`} onChange={v => setOpt('trim_end', v)} />
      </div>

      <button onClick={process} disabled={!uploaded || busy || !!polling}
        className="mb-4 w-full rounded-lg bg-violet-600 py-2 text-[13px] font-bold text-white transition hover:bg-violet-500 disabled:opacity-40">
        {polling ? '⏳ Đang xử lý...' : 'Xử lý Reup'}
      </button>

      {jobs.length > 0 && (
        <div className="space-y-1.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Lịch sử ({jobs.length})</div>
          {jobs.map(j => (
            <div key={j.id} className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[.02] px-2 py-1.5">
              <span className="shrink-0 text-[12px]">{j.status === 'done' ? '✓' : j.status === 'error' ? '✗' : '⏳'}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] text-white/50">#{j.id} · {j.status}</div>
                {j.exists && <div className="text-[9px] text-white/30">{fmtSize(j.size)}</div>}
                {j.error && <div className="truncate text-[9px] text-red-400">{j.error.slice(0, 60)}</div>}
              </div>
              {j.exists && j.out_name && (
                <a href={`/data/editor/reup/output/${j.out_name}`} download
                  className="rounded bg-violet-600/80 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-violet-500">Tải</a>
              )}
              <button onClick={() => delJob(j.id)} className="shrink-0 text-[14px] text-white/25 hover:text-red-400">×</button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  )
}

function ReupSlider({ label, v, min, max, step, fmt, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-[10px] text-white/50">{label}</span>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-400" />
      <span className="w-10 text-right font-mono text-[10px] text-violet-300">{fmt ? fmt(v) : v}</span>
    </div>
  )
}

// ----- shared -----
function PanelShell({ title, children }) {
  return (
    <div className="flex h-full flex-col p-3 text-[12px] text-white/85">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/40">
        {title}
      </h3>
      <div className="hagent-editor-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
    </div>
  )
}

function Empty({ msg }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] py-10 text-center text-[11px] font-medium text-white/30">
      {msg}
    </div>
  )
}

function AssetGrid({ assets, onAdd, onDelete }) {
  if (assets.length === 0) {
    return <Empty msg="Chưa có file đã tải lên" />
  }
  return (
    <div className="space-y-1">
      {assets.map(a => (
        <div
          key={a.id}
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('application/hagent-asset', JSON.stringify(a))
            e.dataTransfer.effectAllowed = 'copy'
          }}
          className="group flex cursor-grab items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] p-2 transition hover:border-violet-400/40 hover:bg-violet-500/5 active:cursor-grabbing"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/50 text-[12px] text-white/80">
            {trackKindIcon(a.kind)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-white/90">
              {a.name}
            </p>
            <p className="text-[10px] text-white/35">
              {a.kind} · {fmtTime(a.duration || 0)}
            </p>
          </div>
          <button
            onClick={() => onAdd(a)}
            className="rounded p-1 text-white/40 hover:bg-violet-500/20 hover:text-white"
            title="Thêm vào track đầu tiên"
          >
            +
          </button>
          <button
            onClick={() => onDelete(a.id)}
            className="rounded p-1 text-white/30 hover:bg-rose-500/20 hover:text-rose-300"
          >
            ×
          </button>
        </div>
      ))}
      <p className="pt-1 text-center text-[10px] text-white/25">
        Kéo thả vào track bất kỳ ở timeline
      </p>
    </div>
  )
}

function NumField({ label, v, onChange, step = 1, min, max }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </label>
      <input
        type="number"
        value={Number(v).toFixed(2)}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-violet-400/50"
      />
    </div>
  )
}

function Slider({ label, v, min, max, step, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          {label}
        </label>
        <span className="font-mono text-[10px] text-white/50">
          {Number(v).toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-400"
      />
    </div>
  )
}

export function TTSPanel({ api, projectId, onImported }) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('vi-VN-HoaiMyNeural')
  const [rate, setRate] = useState(0)
  const [loading, setLoading] = useState(false)

  const VOICES = [
    { value: 'vi-VN-HoaiMyNeural', label: '🇻🇳 Hoài My (Nữ)' },
    { value: 'vi-VN-NamMinhNeural', label: '🇻🇳 Nam Minh (Nam)' },
    { value: 'en-US-AriaNeural', label: '🇺🇸 Aria (Female)' },
    { value: 'en-US-GuyNeural', label: '🇺🇸 Guy (Male)' },
    { value: 'en-GB-SoniaNeural', label: '🇬🇧 Sonia (Female)' },
    { value: 'ja-JP-NanamiNeural', label: '🇯🇵 Nanami (Female)' },
    { value: 'ko-KR-SunHiNeural', label: '🇰🇷 SunHi (Female)' },
  ]

  const generateTTS = async () => {
    if (!text.trim()) {
      alert('Nhập text để tạo giọng nói')
      return
    }
    if (!projectId) {
      alert('Mở 1 project trước')
      return
    }

    setLoading(true)
    try {
      // Generate TTS
      const ttsRes = await api.post('/api/tts/speak', {
        text: text.trim(),
        server: 'edge',
        voice,
        rate: rate === 0 ? '+0%' : (rate > 0 ? `+${rate}%` : `${rate}%`),
        pitch: '+0Hz'
      }, { responseType: 'blob' })

      // Upload to audio library
      const fd = new FormData()
      const filename = `tts_${Date.now()}.mp3`
      fd.append('file', new File([ttsRes.data], filename, { type: 'audio/mpeg' }))
      await api.post('/api/editor/audio-library/upload', fd)

      // Import to project
      const importRes = await api.post(
        `/api/editor/projects/${projectId}/audio-library/import`,
        { name: filename }
      )
      
      onImported?.(importRes.data)
      setText('')
    } catch (e) {
      alert('Lỗi TTS: ' + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PanelShell title="Text to Speech (Edge)">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Nội dung
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Nhập text cần chuyển thành giọng nói..."
            rows={4}
            className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-violet-400/50"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Giọng đọc
          </label>
          <select
            value={voice}
            onChange={e => setVoice(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-violet-400/50"
          >
            {VOICES.map(v => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Tốc độ: {rate > 0 ? '+' : ''}{rate}%
          </label>
          <input
            type="range"
            min="-50"
            max="50"
            value={rate}
            onChange={e => setRate(parseInt(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-400"
          />
        </div>

        <button
          onClick={generateTTS}
          disabled={loading || !text.trim()}
          className="w-full rounded-md bg-violet-500/90 py-2.5 text-[12px] font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '⏳ Đang tạo...' : '🎵 Tạo & Add vào timeline'}
        </button>

        <div className="rounded-md border border-white/8 bg-white/[0.02] p-2 text-[10px] leading-relaxed text-white/40">
          Audio sẽ được tạo và tự động thêm vào timeline tại vị trí playhead hiện tại.
        </div>
      </div>
    </PanelShell>
  )
}

export function STTPanel({ token }) {
  const [file, setFile] = useState(null)
  const [provider, setProviderState] = useState(() => localStorage.getItem('hagent_stt_provider') || 'groq')
  const [language, setLanguage] = useState('vi')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [toggleBusy, setToggleBusy] = useState('')
  const [transcript, setTranscript] = useState('')
  const [micError, setMicError] = useState('')
  const [elapsedByProvider, setElapsedByProvider] = useState({})
  const [status, setStatus] = useState({})

  const refreshStatus = async () => {
    try {
      const res = await fetch('/api/stt/status')
      setStatus(await readJsonResponse(res))
    } catch {
      setStatus({})
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const mic = useSpeechToText({
    token,
    language,
    prompt,
    provider,
    onTranscript: text => {
      setMicError('')
      setTranscript(text)
    },
    onTiming: seconds => setElapsedByProvider(prev => ({ ...prev, [provider]: seconds })),
    onError: message => setMicError(message || 'STT mic lỗi'),
  })

  const selectProvider = nextProvider => {
    setProviderState(nextProvider)
    localStorage.setItem('hagent_stt_provider', nextProvider)
  }

  const providerLabel = {
    groq: 'Groq',
    sensevoice: 'SenseVoice',
    whisper: 'Whisper',
  }

  const providerStatus = key => {
    if (key === 'groq') return status.groq_available ? 'ready' : 'missing'
    if (status[key]?.service_alive) return 'ready'
    if (status[key]?.tunnel_pm2 === 'registered') return 'starting'
    return 'off'
  }

  const canUseProvider = key => key === 'groq' ? providerStatus(key) === 'ready' : status[key]?.service_alive === true

  const runSTT = async () => {
    if (!file) {
      alert('Chọn file audio/video trước')
      return
    }
    if (!canUseProvider(provider)) {
      alert(`${providerLabel[provider] || provider} chưa sẵn sàng. Bấm Bật rồi chờ trạng thái ready, hoặc chọn Groq.`)
      return
    }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file)
      fd.append('language', language)
      fd.append('prompt', prompt || '')
      fd.append('provider', provider)
      fd.append('temperature', '0')

      const startedAt = performance.now()
      const res = await fetch('/api/stt', {
        method: 'POST',
        body: fd,
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        throw new Error(data?.detail || data?.error || 'STT thất bại')
      }
      setTranscript((data?.text || '').trim())
      setElapsedByProvider(prev => ({
        ...prev,
        [provider]: ((performance.now() - startedAt) / 1000).toFixed(2),
      }))
    } catch (e) {
      alert('Lỗi STT: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const toggleProvider = async (targetProvider, action) => {
    setToggleBusy(`${targetProvider}:${action}`)
    try {
      const res = await fetch('/api/stt/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider, action }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok || data.ok === false) throw new Error(data.detail || data.message || 'Toggle STT lỗi')
      await refreshStatus()
    } catch (e) {
      alert('Lỗi toggle STT: ' + (e.message || 'Unknown error'))
    } finally {
      setToggleBusy('')
    }
  }

  return (
    <PanelShell title="Speech to Text">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(providerLabel).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => selectProvider(key)}
              className={`rounded-md border px-1.5 py-2 text-left transition ${
                provider === key
                  ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              }`}
            >
              <span className="block truncate text-[10px] font-bold">{label}</span>
              <span className="block text-[9px] text-white/35">{providerStatus(key)}</span>
              <span className="text-[9px] text-white/35">{elapsedByProvider[key] ? `${elapsedByProvider[key]}s` : '--'}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {['sensevoice', 'whisper'].map(key => (
            <button
              key={key}
              onClick={() => toggleProvider(key, 'on')}
              disabled={!!toggleBusy}
              className="rounded-md border border-emerald-400/20 bg-emerald-500/10 py-2 text-[10px] font-bold text-emerald-200 disabled:opacity-50"
            >
              {toggleBusy === `${key}:on` ? 'Đang bật...' : `Bật ${providerLabel[key]}`}
            </button>
          ))}
          {['sensevoice', 'whisper'].map(key => (
            <button
              key={key}
              onClick={() => toggleProvider(key, 'off')}
              disabled={!!toggleBusy}
              className="rounded-md border border-white/10 bg-white/[0.04] py-2 text-[10px] font-bold text-white/60 disabled:opacity-50"
            >
              {toggleBusy === `${key}:off` ? 'Đang tắt...' : `Tắt ${providerLabel[key]}`}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            File audio/video
          </label>
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-[12px] text-white file:mr-2 file:rounded file:border-0 file:bg-violet-500/90 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Ngôn ngữ
          </label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-violet-400/50"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="">Tự động (auto)</option>
          </select>
        </div>

        {provider === 'sensevoice' && language === 'vi' && (
          <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            SenseVoice không hỗ trợ tiếng Việt — kết quả có thể sai. Dùng Whisper hoặc Groq cho tiếng Việt.
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Prompt (tuỳ chọn)
          </label>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Từ khóa gợi ý ngữ cảnh..."
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-violet-400/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={runSTT}
            disabled={loading || mic.transcribing || !file}
            className="rounded-md bg-violet-500/90 py-2.5 text-[12px] font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : 'File'}
          </button>

          <button
            onClick={() => {
              if (!canUseProvider(provider)) {
                setMicError(`${providerLabel[provider] || provider} chưa sẵn sàng. Bấm Bật rồi chờ ready, hoặc chọn Groq.`)
                return
              }
              setMicError('')
              mic.toggle()
            }}
            disabled={loading || mic.transcribing}
            className={`rounded-md border py-2.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mic.recording
                ? 'border-rose-400/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/20'
                : 'border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]'
            }`}
          >
            {mic.recording ? 'Dừng' : mic.transcribing ? 'Gửi...' : 'Mic'}
          </button>
        </div>

        {micError && (
          <div className="rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">
            {micError}
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Transcript
          </label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={7}
            placeholder="Kết quả STT sẽ hiện ở đây..."
            className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-violet-400/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(transcript || '')}
            disabled={!transcript}
            className="rounded-md border border-white/15 bg-white/[0.04] py-2 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Copy
          </button>
          <button
            onClick={() => setTranscript('')}
            disabled={!transcript}
            className="rounded-md border border-white/15 bg-white/[0.04] py-2 text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Xóa
          </button>
        </div>
      </div>
    </PanelShell>
  )
}

export function MusicPanel({ api, projectId, onImported }) {
  const [busy, setBusy] = useState(null)

  const handleSelect = async track => {
    if (!projectId) { alert('Mở 1 project trước rồi chọn nhạc'); return }
    setBusy(track.id)
    try {
      const r = await api.post(`/api/editor/projects/${projectId}/music-import`, {
        track_id: track.id,
        filename: track.filename,
        title: track.title,
      })
      onImported?.(r.data)
    } catch (e) {
      alert('Import lỗi: ' + (e.response?.data?.detail || e.message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelShell title="Thư viện nhạc">
      {busy && (
        <div className="mb-2 text-[11px] text-violet-300 text-center">Đang import...</div>
      )}
      <MusicLibrary selectable onSelect={handleSelect} />
    </PanelShell>
  )
}

const POSITIONS = [
  { id: 'bottom-right', label: 'Dưới phải' },
  { id: 'bottom-left',  label: 'Dưới trái' },
  { id: 'top-right',    label: 'Trên phải' },
  { id: 'top-left',     label: 'Trên trái' },
  { id: 'center',       label: 'Giữa' },
]

export function WatermarkPanel({ api, assets, watermark, onChange, onAssetDeleted }) {
  const wm = watermark || {}
  const set = patch => onChange({ ...wm, ...patch })
  const imgAssets = (assets || []).filter(a => a.kind === 'image')
  const API_BASE = import.meta.env.VITE_API_BASE || ''
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const fileInputRef = useRef(null)

  const uploadLogo = file => {
    const reader = new FileReader()
    reader.onload = e => set({ data_url: e.target.result, asset_path: null, enabled: true })
    reader.readAsDataURL(file)
  }

  const deleteAsset = async (asset) => {
    if (!api) return
    if (!window.confirm(`Xóa ảnh "${asset.name || asset.path}" khỏi project? File sẽ bị xóa vĩnh viễn.`)) return
    setDeletingId(asset.id)
    try {
      await api.delete(`/api/editor/assets/${asset.id}`)
      onAssetDeleted && onAssetDeleted(asset)
      if (wm.asset_path === asset.path) {
        onChange({ ...wm, asset_path: null, data_url: null, enabled: false })
      }
    } catch (err) {
      window.alert('Xóa thất bại: ' + (err?.response?.data?.detail || err.message))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <PanelShell title="Logo / Watermark">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white/80">Bật watermark</span>
        <label className="relative inline-block h-5 w-9 cursor-pointer">
          <span className="block h-5 w-9 rounded-full transition" style={{ background: wm.enabled ? '#7c3aed' : 'rgba(255,255,255,0.1)' }} />
          <span className="absolute top-1 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: wm.enabled ? '22px' : '4px' }} />
          <input type="checkbox" className="sr-only" checked={!!wm.enabled} onChange={e => set({ enabled: e.target.checked })} />
        </label>
      </div>

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Ảnh logo</label>

      {(wm.data_url || wm.asset_path) ? (
        <div className="mb-2 flex items-center justify-center gap-2">
          <div className="flex h-20 items-center justify-center">
            <img
              src={wm.data_url || `${API_BASE}${wm.asset_path}`}
              className="h-16 w-16 rounded-full border border-white/15 bg-black/40 object-cover"
              alt="logo"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Xóa logo của project này? Khi không có logo riêng, hệ thống sẽ tự dùng logo mặc định trong thư mục branding.')) {
                onChange({ ...wm, data_url: null, asset_path: null, enabled: false })
              }
            }}
            title="Xóa logo project (dùng logo mặc định)"
            className="flex h-8 items-center gap-1.5 rounded-md border border-red-400/25 bg-red-500/10 px-2 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/></svg>
            Xóa logo
          </button>
        </div>
      ) : (
        <div className="mb-2 rounded-md border border-dashed border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] leading-4 text-white/50">
          Chưa có logo riêng — khi bật watermark, hệ thống sẽ tự dùng logo mặc định trong thư mục <code className="text-violet-300">data/editor/branding/</code>.
        </div>
      )}

      {imgAssets.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-white/40">Ảnh trong project — bấm để dùng làm logo, bấm × để xoá</span>
            <span className="text-[10px] text-white/30">{imgAssets.length}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {imgAssets.slice(0, 9).map(a => (
              <div key={a.id} className="group relative">
                <button onClick={() => set({ asset_path: a.path, data_url: null, enabled: true })}
                  title="Bấm để dùng ảnh này làm logo"
                  className={`aspect-square w-full overflow-hidden rounded border transition ${wm.asset_path === a.path ? 'border-violet-400' : 'border-white/10 hover:border-white/30'}`}>
                  <img src={`${API_BASE}${a.path}`} className="h-full w-full object-cover" alt="" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteAsset(a)}
                  disabled={deletingId === a.id}
                  title="Xóa ảnh này khỏi project"
                  className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white shadow hover:bg-red-500 group-hover:flex disabled:opacity-50"
                >
                  {deletingId === a.id ? (
                    <span className="block h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 6l12 12M6 18L18 6"/></svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => fileInputRef.current?.click()}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/5 py-2 text-[11px] text-white/60 hover:border-violet-400/50 hover:text-white">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16"/></svg>
        Upload logo PNG
      </button>
      <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />

      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Vị trí</label>
      <div className="mb-3 grid grid-cols-3 gap-1">
        {POSITIONS.map(p => (
          <button key={p.id} onClick={() => set({ position: p.id })}
            className={`rounded border py-1.5 text-[10px] font-semibold transition ${wm.position === p.id ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <Slider label="Kích thước (%)" v={(wm.scale ?? 0.08) * 100} min={3} max={40} step={1} onChange={v => set({ scale: v / 100 })} />
      <div className="mt-2.5">
        <Slider label="Độ trong" v={wm.opacity ?? 0.4} min={0.1} max={1} step={0.05} onChange={v => set({ opacity: v })} />
      </div>
    </PanelShell>
  )
}
