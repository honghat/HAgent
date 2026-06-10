import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Circle, ExternalLink, Image, MonitorOff, PanelRightClose, PanelRightOpen, RefreshCw, Save, Square, Trash2, Video, X } from 'lucide-react'

const DEFAULT_CAMERA_URL = import.meta.env.VITE_CAMERA_STREAM_URL || 'http://100.69.50.64:8080/video'
const LEGACY_CAMERA_URL = 'http://hat-linux:8080/video'
const URL_STORAGE_KEY = 'hagent_camera_stream_url'

function normalizeUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return DEFAULT_CAMERA_URL
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

export default function CameraPanel({ token }) {
  const [savedUrl, setSavedUrl] = useState(() => {
    const storedUrl = localStorage.getItem(URL_STORAGE_KEY)
    if (!storedUrl || storedUrl === LEGACY_CAMERA_URL) return DEFAULT_CAMERA_URL
    return storedUrl
  })
  const [draftUrl, setDraftUrl] = useState(savedUrl)
  const [status, setStatus] = useState('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [apiStatus, setApiStatus] = useState(null)
  const [files, setFiles] = useState([])
  const [previewFile, setPreviewFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    if (status === 'error') {
      reconnectTimer.current = setTimeout(() => {
        setStatus('loading')
        setReloadKey(v => v + 1)
      }, 3000)
    }
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [status])

  const streamUrl = useMemo(() => normalizeUrl(savedUrl), [savedUrl])
  const displayUrl = useMemo(() => streamUrl.replace(/^https?:\/\//, ''), [streamUrl])

  function saveUrl() {
    const next = normalizeUrl(draftUrl)
    setSavedUrl(next)
    setDraftUrl(next)
    localStorage.setItem(URL_STORAGE_KEY, next)
    setStatus('loading')
    setReloadKey(value => value + 1)
  }

  function refresh() {
    setStatus('loading')
    setReloadKey(value => value + 1)
    loadCameraState()
  }

  function apiHeaders(json = false) {
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }
  }

  async function apiJson(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { ...apiHeaders(Boolean(options.body)), ...(options.headers || {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || data.error || 'Camera API lỗi')
    return data
  }

  async function loadCameraState() {
    try {
      const [nextStatus, nextFiles] = await Promise.all([
        apiJson('/api/camera/status'),
        apiJson('/api/camera/files'),
      ])
      const items = Array.isArray(nextFiles.items) ? nextFiles.items : []
      setApiStatus(nextStatus)
      setFiles(items)
      setPreviewFile(current => {
        if (!current) return items[0] || null
        return items.find(item => item.filename === current.filename) || items[0] || null
      })
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function takeSnapshot() {
    setBusy('snapshot')
    setMessage('')
    try {
      const result = await apiJson('/api/camera/snapshot', { method: 'POST' })
      setMessage(`Đã chụp: ${result.path}`)
      await loadCameraState()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  async function startRecording() {
    setBusy('record')
    setMessage('')
    try {
      const result = await apiJson('/api/camera/record/start', { method: 'POST', body: JSON.stringify({}) })
      setMessage(`Đang quay: ${result.path}`)
      await loadCameraState()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  async function stopRecording() {
    setBusy('stop')
    setMessage('')
    try {
      const result = await apiJson('/api/camera/record/stop', { method: 'POST' })
      setMessage(result.path ? `Đã lưu: ${result.path}` : 'Đã dừng quay')
      await loadCameraState()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  function fileUrl(item) {
    const query = token ? `?t=${encodeURIComponent(token)}` : ''
    return `/api/camera/files/${encodeURIComponent(item.filename)}${query}`
  }

  async function deleteFile(item) {
    if (!item) return
    setBusy(`delete:${item.filename}`)
    setMessage('')
    try {
      await apiJson(`/api/camera/files/${encodeURIComponent(item.filename)}`, { method: 'DELETE' })
      setMessage(`Đã xóa: ${item.filename}`)
      setPreviewFile(current => current?.filename === item.filename ? null : current)
      await loadCameraState()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    loadCameraState()
    const timer = window.setInterval(loadCameraState, 5000)
    return () => window.clearInterval(timer)
  }, [token])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f4]">
      <div className="shrink-0 border-b border-black/[0.06] bg-white/90 px-3 py-2 backdrop-blur-xl">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-950 text-white">
              <Camera className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-gray-950">Camera 100.69.50.64</h1>
              <p className="truncate text-[11px] text-gray-500">{displayUrl}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-2xl">
            <input
              value={draftUrl}
              onChange={event => setDraftUrl(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') saveUrl()
              }}
              className="h-9 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              placeholder="http://100.69.50.64:8080/video"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={saveUrl}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-950 text-white transition hover:bg-black"
              title="Lưu URL camera"
              aria-label="Lưu URL camera"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={refresh}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
              title="Tải lại camera"
              aria-label="Tải lại camera"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <a
              href={streamUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
              title="Mở camera trong tab mới"
              aria-label="Mở camera trong tab mới"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-gray-100 px-2.5 text-[11px] font-semibold text-gray-600">
            <Video className="h-3.5 w-3.5" />
            Live MJPEG
          </span>

          <button
            type="button"
            onClick={takeSnapshot}
            disabled={Boolean(busy)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            <Image className="h-3.5 w-3.5" />
            Chụp ảnh
          </button>

          {apiStatus?.recording ? (
            <button
              type="button"
              onClick={stopRecording}
              disabled={Boolean(busy)}
              className="flex h-7 items-center gap-1.5 rounded-md bg-red-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              Dừng quay
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={Boolean(busy)}
              className="flex h-7 items-center gap-1.5 rounded-md bg-gray-950 px-2.5 text-[11px] font-semibold text-white transition hover:bg-black disabled:opacity-50"
            >
              <Circle className="h-3.5 w-3.5 fill-current" />
              Quay video
            </button>
          )}

          {message && <span className="min-w-0 truncate text-[11px] font-medium text-gray-500">{message}</span>}
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 bg-black ${sidebarOpen ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]' : 'grid-cols-1'}`}>
        <div className="relative min-h-0 bg-black">
          <div className="absolute left-3 top-3 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(v => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white/70 hover:bg-black/70 hover:text-white transition"
              title={sidebarOpen ? 'Ẩn danh sách file' : 'Hiện danh sách file'}
              aria-label={sidebarOpen ? 'Ẩn danh sách file' : 'Hiện danh sách file'}
            >
              {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
          <img
            key={`${reloadKey}-${streamUrl}`}
            src={streamUrl}
            alt="Camera 100.69.50.64"
            className="h-full w-full object-contain"
            onLoad={() => setStatus('online')}
            onError={() => setStatus('error')}
          />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-xs font-semibold text-white/70">
            Đang kết nối camera...
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
            <MonitorOff className="h-10 w-10 text-white/50" />
            <div>
              <p className="text-sm font-semibold">Chưa nhận được stream</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-white/60">
                Kiểm tra máy 100.69.50.64 hoặc đổi sang URL/port camera đang chạy.
              </p>
            </div>
          </div>
        )}
        </div>

        {sidebarOpen && <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-[#101114] p-3 text-white lg:border-l lg:border-t-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold">File camera</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${apiStatus?.recording ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/60'}`}>
              {apiStatus?.recording ? 'Đang quay' : 'Sẵn sàng'}
            </span>
          </div>
          {previewFile && (
            <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-black">
              <div className="aspect-video bg-black">
                {previewFile.type === 'video' ? (
                  <video key={previewFile.filename} src={fileUrl(previewFile)} controls className="h-full w-full object-contain" />
                ) : (
                  <img key={previewFile.filename} src={fileUrl(previewFile)} alt={previewFile.filename} className="h-full w-full object-contain" />
                )}
              </div>
              <div className="flex items-center gap-1 border-t border-white/10 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{previewFile.filename}</span>
                <a
                  href={fileUrl(previewFile)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
                  title="Mở file"
                  aria-label="Mở file"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => deleteFile(previewFile)}
                  disabled={Boolean(busy)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-200 hover:bg-red-500/20 hover:text-red-100 disabled:opacity-50"
                  title="Xóa file"
                  aria-label="Xóa file"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                  title="Đóng preview"
                  aria-label="Đóng preview"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {files.length === 0 && <p className="text-[11px] leading-5 text-white/45">Chưa có ảnh hoặc video trong data/camera.</p>}
            {files.map(item => (
              <div
                key={item.filename}
                className={`rounded-md border px-2.5 py-2 text-[11px] transition hover:bg-white/[0.08] ${
                  previewFile?.filename === item.filename ? 'border-white/25 bg-white/[0.09]' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFile(item)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {item.type === 'video' ? <Video className="h-3.5 w-3.5 shrink-0 text-red-200" /> : <Image className="h-3.5 w-3.5 shrink-0 text-blue-200" />}
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.filename}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFile(item)}
                    disabled={Boolean(busy)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50"
                    title="Xóa file"
                    aria-label="Xóa file"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 truncate text-[10px] text-white/45">{item.path}</div>
              </div>
            ))}
          </div>
        </aside>}
      </div>
    </div>
  )
}
