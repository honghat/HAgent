/**
 * MusicLibrary — thư viện nhạc nền dùng chung giữa các dự án.
 * Props:
 *   selectable  — hiện nút "Chọn" (dùng trong VideoEditor)
 *   onSelect(track) — callback khi chọn track
 */
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_BASE || ''

function fmt(secs) {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function WaveBar({ playing, idx }) {
  const delay = `${(idx * 0.11) % 0.6}s`
  return (
    <span
      className="inline-block w-[3px] rounded-full bg-violet-400"
      style={{
        height: playing ? undefined : '8px',
        animation: playing ? `wavebar 0.6s ease-in-out ${delay} infinite alternate` : 'none',
        minHeight: '4px',
        maxHeight: '18px',
      }}
    />
  )
}

function Waveform({ playing }) {
  return (
    <span className="flex items-end gap-[2px] h-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <WaveBar key={i} playing={playing} idx={i} />
      ))}
    </span>
  )
}

function TrackRow({ track, playing, onPlay, onDelete, onRename, onSelect, selectable }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(track.title)
  const inputRef = useRef(null)

  const commitRename = () => {
    if (title.trim() && title !== track.title) onRename(track.id, title.trim())
    setEditing(false)
  }

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
        playing ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : 'hover:bg-white/5'
      }`}
    >
      {/* Play btn */}
      <button
        onClick={() => onPlay(track)}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-white/70 transition hover:bg-violet-500/30 hover:text-violet-300"
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform / info */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => e.key === 'Enter' ? commitRename() : e.key === 'Escape' && setEditing(false)}
            className="w-full rounded bg-white/10 px-2 py-0.5 text-[13px] text-white outline-none ring-1 ring-violet-500"
          />
        ) : (
          <div
            className="flex items-center gap-2 truncate"
            onDoubleClick={() => { setEditing(true); setTitle(track.title) }}
          >
            {playing && <Waveform playing />}
            <span className="truncate text-[13px] font-medium text-white/90">{track.title}</span>
          </div>
        )}
        <div className="mt-0.5 flex gap-2 text-[11px] text-white/35">
          <span>{fmt(track.duration)}</span>
          {track.size > 0 && <span>{fmtSize(track.size)}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {selectable && (
          <button
            onClick={() => onSelect(track)}
            className="rounded px-2 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20"
          >
            Chọn
          </button>
        )}
        <button
          onClick={() => { setEditing(true); setTitle(track.title) }}
          className="rounded p-1 text-white/40 hover:text-white/80"
          title="Đổi tên"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(track.id)}
          className="rounded p-1 text-white/30 hover:text-red-400"
          title="Xoá"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function MusicLibrary({ selectable = false, onSelect }) {
  const [tracks, setTracks] = useState([])
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  const load = () =>
    axios.get(`${API}/api/music/library`).then(r => setTracks(r.data || []))

  useEffect(() => { load() }, [])

  const handlePlay = track => {
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = `${API}${track.url}`
      audioRef.current.play().catch(() => {})
    }
    setPlayingId(track.id)
  }

  const handleEnded = () => setPlayingId(null)

  const handleUpload = async file => {
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']
    if (!allowed.includes(ext)) return alert('Định dạng không hỗ trợ')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^.]+$/, ''))
      const r = await axios.post(`${API}/api/music/upload`, fd)
      // get duration from audio element
      const audio = new Audio(`${API}${r.data.url}`)
      audio.addEventListener('loadedmetadata', async () => {
        await axios.patch(`${API}/api/music/${r.data.id}`, { title: r.data.title }).catch(() => {})
        // update duration in db via a separate call if needed
      })
      await load()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Upload thất bại')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async id => {
    if (playingId === id) { audioRef.current?.pause(); setPlayingId(null) }
    await axios.delete(`${API}/api/music/${id}`)
    setTracks(t => t.filter(x => x.id !== id))
  }

  const handleRename = async (id, title) => {
    const r = await axios.patch(`${API}/api/music/${id}`, { title })
    setTracks(t => t.map(x => x.id === id ? r.data : x))
  }

  const onDrop = e => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const filtered = search
    ? tracks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : tracks

  return (
    <div
      className="flex h-full flex-col gap-3"
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <style>{`
        @keyframes wavebar {
          from { height: 4px; }
          to { height: 18px; }
        }
      `}</style>

      <audio ref={audioRef} onEnded={handleEnded} hidden />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm nhạc..."
            className="w-full rounded-lg border border-white/8 bg-white/5 py-1.5 pl-8 pr-3 text-[13px] text-white/80 placeholder-white/25 outline-none focus:border-violet-500/50 focus:ring-0"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-violet-500/15 px-3 py-1.5 text-[12px] font-semibold text-violet-300 transition hover:bg-violet-500/25 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" />
          </svg>
          {uploading ? 'Đang upload...' : 'Thêm'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.ogg,.flac,.aac"
          hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
        />
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-white/25">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-[12px]">{search ? 'Không tìm thấy' : 'Kéo file nhạc vào đây hoặc nhấn Thêm'}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map(t => (
              <TrackRow
                key={t.id}
                track={t}
                playing={playingId === t.id}
                onPlay={handlePlay}
                onDelete={handleDelete}
                onRename={handleRename}
                onSelect={onSelect}
                selectable={selectable}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mini player */}
      {playingId && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/8 px-3 py-2">
          <Waveform playing />
          <span className="flex-1 truncate text-[12px] text-violet-300">
            {tracks.find(t => t.id === playingId)?.title}
          </span>
          <button
            onClick={() => { audioRef.current?.pause(); setPlayingId(null) }}
            className="text-white/40 hover:text-white/80"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
