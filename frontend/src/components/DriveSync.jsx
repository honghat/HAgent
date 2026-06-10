import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Cloud, FolderOpen, X, RefreshCw, ChevronRight,
  Check, AlertCircle, Home, File, CheckCircle2, Clock, ArrowRight,
  Plus, Trash2, GripVertical, ChevronDown,
  Eye, EyeOff, Pencil, Download, Copy, ExternalLink, Mail,
} from 'lucide-react'
import DrivePreviewModal from './DrivePreviewModal'
import DriveMovePicker from './DriveMovePicker'
import ShareDriveModal from './ShareDriveModal'
import BackupJobCard from './BackupJobCard'
import MapManager from './DriveSyncMaps'
import GmailInventory from './DriveSyncGmailInventory'

const API = '/api'
const auth = t => (t ? { Authorization: `Bearer ${t}` } : {})
const DRIVE_SYNC_TAB_KEY = 'hagent_drive_sync_tab'
const DRIVE_SYNC_TABS = new Set(['dashboard', 'maps', 'history'])
const notify = (message, type, duration) => {
  if (typeof window !== 'undefined' && typeof window.__hagentToast === 'function') {
    window.__hagentToast(String(message ?? ''), type, duration)
    return
  }
  window.alert(message)
}

function fmtBytes(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

function fmtDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function accountQuota(account) {
  return {
    free: account.pool_free ?? account.free ?? 0,
    limit: account.pool_limit ?? account.limit ?? 0,
    used: account.pool_used ?? account.used ?? 0,
  }
}

function flattenBrowserEntries(entries, level = 0) {
  return entries.flatMap(entry => [
    { ...entry, level },
    ...flattenBrowserEntries(entry.children || [], level + 1),
  ])
}

function ContextMenu({ menu, onClose }) {
  useEffect(() => {
    if (!menu) return undefined
    const close = () => onClose()
    const closeOnEscape = ev => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu, onClose])

  if (!menu) return null
  const items = menu.items.filter(Boolean)
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 230))
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - Math.min(320, items.length * 34 + 40)))
  return (
    <div
      className="fixed z-[9999] w-56 overflow-hidden rounded-xl border border-black/[0.08] bg-white py-1.5 shadow-xl"
      style={{ left, top }}
      onClick={ev => ev.stopPropagation()}
      onContextMenu={ev => ev.preventDefault()}
    >
      {menu.title && <div className="truncate border-b border-black/[0.06] px-3 py-1.5 text-[10.5px] font-semibold text-gray-400">{menu.title}</div>}
      {items.map((item, index) => {
        if (item.separator) return <div key={`sep-${index}`} className="my-1 border-t border-black/[0.06]" />
        const Icon = item.icon
        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) item.onClick?.(); onClose() }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors disabled:text-gray-300 ${
              item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {Icon && <Icon size={14} className="shrink-0" />}
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Rename Modal ──────────────────────────────────────────────────────────
function RenameModal({ open, title, label, placeholder, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef(null)
  useEffect(() => {
    if (open) {
      setValue(defaultValue || '')
      setTimeout(() => inputRef.current?.select(), 60)
    }
  }, [open, defaultValue])
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  const handleConfirm = () => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/[0.08] animate-[modalIn_0.15s_ease-out]">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-gray-900 text-white shadow-sm">
            <Pencil size={14} />
          </div>
          <h3 className="text-[14px] font-bold text-gray-900">{title || 'Đổi tên'}</h3>
          <button onClick={onCancel} className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          {label && <p className="mb-2 text-[11.5px] font-semibold text-gray-500">{label}</p>}
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            placeholder={placeholder || 'Nhập tên mới...'}
            className="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-2.5 text-[13px] text-gray-900 outline-none focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-400/20 transition-all"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-5 py-3.5">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-all"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="rounded-xl bg-gradient-to-r from-slate-800 to-gray-900 px-5 py-2 text-[12px] font-bold text-white shadow-sm hover:from-slate-700 hover:to-gray-800 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-400 transition-all"
          >
            Đổi tên
          </button>
        </div>
      </div>
    </div>
  )
}

// ── File browser ─────────────────────────────────────────────────────────
function FileBrowser({ token, value, onChange, dragEnabled = false, tall = false, onDownloadStarted = null }) {
  const [path, setPath] = useState(() => {
    try { return localStorage.getItem('hagent_local_browse_path') || value || '/Volumes' } catch { return value || '/Volumes' }
  })
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [depth, setDepth] = useState(1)
  const [renaming, setRenaming] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [previewRequest, setPreviewRequest] = useState(null)
  const [renameDialog, setRenameDialog] = useState(null) // { targetPath, currentName }
  const browseAbortRef = useRef(null)
  // Dùng ref để giữ latest values — tránh re-create browse callback mỗi render
  const tokenRef = useRef(token)
  const onChangeRef = useRef(onChange)
  const showHiddenRef = useRef(showHidden)
  const depthRef = useRef(depth)
  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { showHiddenRef.current = showHidden }, [showHidden])
  useEffect(() => { depthRef.current = depth }, [depth])

  // browse là stable — không thay đổi giữa các render, không gây loop
  const browse = useCallback(async (p) => {
    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    setLoading(true)
    setBrowseError('')
    try {
      const params = new URLSearchParams({
        path: p,
        show_hidden: String(showHiddenRef.current),
        depth: String(depthRef.current),
      })
      const r = await fetch(`${API}/drive/sync/browse?${params}`, {
        headers: auth(tokenRef.current),
        signal: controller.signal,
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.detail || 'Không tải được thư mục')
      if (d.type === 'dir') { setPath(p); setEntries(d.entries || []) }
      else onChangeRef.current(p)
    } catch (e) {
      if (browseAbortRef.current !== controller) return
      setEntries([])
      const isTimeout = e?.name === 'AbortError' && controller.signal.aborted
      setBrowseError(isTimeout ? 'Tải thư mục quá lâu. Bấm Đi để thử lại.' : (e.message || 'Không tải được thư mục'))
    } finally {
      window.clearTimeout(timeout)
      if (browseAbortRef.current === controller) {
        browseAbortRef.current = null
        setLoading(false)
      }
    }
  }, []) // stable — không phụ thuộc vào bất kỳ state/prop nào

  // Persist local path vào localStorage
  useEffect(() => {
    try { localStorage.setItem('hagent_local_browse_path', path) } catch { /* ignore */ }
  }, [path])

  // Chỉ browse khi mount lần đầu
  const hasMountedRef = useRef(false)
  useEffect(() => {
    if (hasMountedRef.current) return
    hasMountedRef.current = true
    browse(path)
  }, [])

  // Re-browse khi showHidden hoặc depth thay đổi (user tự thay đổi setting)
  const prevShowHidden = useRef(showHidden)
  const prevDepth = useRef(depth)
  useEffect(() => {
    if (prevShowHidden.current === showHidden && prevDepth.current === depth) return
    prevShowHidden.current = showHidden
    prevDepth.current = depth
    browse(path)
  }, [showHidden, depth])
  useEffect(() => () => browseAbortRef.current?.abort(), [])

  const copyText = async text => {
    try { await navigator.clipboard.writeText(text) } catch { window.prompt('Copy thủ công:', text) }
  }

  const previewLocalEntry = entry => {
    if (!entry || entry.type === 'dir') return
    setPreviewRequest({ kind: 'local', item: entry })
  }

  const renameLocalPath = (targetPath, currentName) => {
    setRenameDialog({ targetPath, currentName })
  }

  const doLocalRename = async (newName) => {
    if (!renameDialog) return
    const { targetPath, currentName } = renameDialog
    if (!newName || newName === currentName) { setRenameDialog(null); return }
    setRenameDialog(null)
    setRenaming(true)
    try {
      const r = await fetch(`${API}/drive/sync/local-rename`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, name: newName }),
      })
      const d = await r.json()
      if (!r.ok) { notify(d.detail || 'Đổi tên Local thất bại', 'error'); return }
      if (value === targetPath) onChange(d.path)
      else if (value?.startsWith(`${targetPath}/`)) onChange(value.replace(targetPath, d.path))
      await browse(targetPath === path ? d.path : path)
    } catch (e) { notify(String(e), 'error') } finally { setRenaming(false) }
  }

  const handleRenameCurrent = async () => {
    if (path === '/') return
    await renameLocalPath(path, path.split('/').filter(Boolean).pop() || '')
  }

  const deleteLocalPath = async entry => {
    if (!entry) return
    const typeLabel = entry.type === 'dir' ? 'thư mục' : 'file'
    const detail = entry.type === 'dir' ? '\nToàn bộ nội dung bên trong cũng sẽ bị xóa.' : ''
    if (!window.confirm(`Xóa ${typeLabel} "${entry.name}"?${detail}`)) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/drive/sync/local-delete`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, confirm_delete: true }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Xóa Local thất bại'); return }
      if (value === entry.path || value?.startsWith(`${entry.path}/`)) onChange('')
      const parentPath = `/${path.split('/').filter(Boolean).slice(0, -1).join('/')}`.replace(/\/$/, '') || '/'
      await browse(entry.path === path ? parentPath : path)
    } catch (e) { alert(String(e)) } finally { setLoading(false) }
  }

  const openLocalMenu = (ev, entry = null) => {
    ev.preventDefault()
    ev.stopPropagation()
    setContextMenu({
      x: ev.clientX,
      y: ev.clientY,
      title: entry ? entry.name : path,
      items: entry ? [
        entry.type === 'dir' && { label: 'Mở', icon: FolderOpen, onClick: () => browse(entry.path) },
        entry.type !== 'dir' && { label: 'Xem trước', icon: Eye, onClick: () => previewLocalEntry(entry) },
        { label: entry.type === 'dir' ? 'Chọn làm nguồn' : 'Chọn file', icon: CheckCircle2, onClick: () => onChange(entry.path) },
        { label: 'Đổi tên', icon: Pencil, onClick: () => renameLocalPath(entry.path, entry.name) },
        { label: 'Sao chép đường dẫn', icon: Copy, onClick: () => copyText(entry.path) },
        { separator: true },
        { label: 'Xóa', icon: Trash2, danger: true, onClick: () => deleteLocalPath(entry) },
      ] : [
        { label: 'Làm mới', icon: RefreshCw, onClick: () => browse(path) },
        { label: 'Đổi tên thư mục hiện tại', icon: Pencil, disabled: path === '/', onClick: handleRenameCurrent },
        { label: 'Sao chép đường dẫn', icon: Copy, onClick: () => copyText(path) },
        { separator: true },
        { label: 'Xóa thư mục hiện tại', icon: Trash2, danger: true, disabled: path === '/', onClick: () => deleteLocalPath({ path, name: path.split('/').filter(Boolean).pop() || path, type: 'dir' }) },
      ],
    })
  }

  const handleDriveDrop = async (ev, destinationPath = path) => {
    const raw = ev.dataTransfer.getData('application/x-hagent-drive-item')
    if (!raw) return
    ev.preventDefault()
    ev.stopPropagation()
    let item
    try { item = JSON.parse(raw) } catch { return }
    setDownloading(true)
    try {
      const r = await fetch(`${API}/drive/sync/drive-download`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: item.accountId,
          item_id: item.id,
          destination_path: destinationPath,
        }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Tải Drive xuống Local thất bại'); return }
      onDownloadStarted?.()
      await browse(path)
      alert(`Đã bắt đầu tải "${item.name}" vào ${destinationPath}. Xem tiến độ ở tab Lịch sử.`)
    } catch (e) { alert(String(e)) } finally { setDownloading(false) }
  }

  const parts = path.split('/').filter(Boolean)
  const flatEntries = flattenBrowserEntries(entries)
  const selectedEntry = flatEntries.find(e => e.path === value)
  const parentPath = `/${parts.slice(0, -1).join('/')}`.replace(/\/$/, '') || '/'

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm ring-1 ring-black/[0.04] ${tall ? 'flex h-[28rem] min-h-0 flex-col sm:h-[32rem] lg:h-[40rem]' : ''}`}>
      {/* Breadcrumb */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-gray-50 px-2.5 py-1.5">
        <button onClick={() => browse('/')} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm transition-all" title="Gốc">
          <Home size={13} />
        </button>
        <button
          type="button"
          onClick={() => browse(parentPath)}
          disabled={path === '/'}
          className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 disabled:text-gray-300 transition-all"
          title="Trở về thư mục mẹ"
        >
          ..
        </button>
        {parts.map((seg, i) => (
          <span key={i} className="flex items-center">
            <ChevronRight size={11} className="text-gray-300" />
            <button
              onClick={() => browse('/' + parts.slice(0, i + 1).join('/'))}
              className="max-w-[120px] truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all"
            >{seg}</button>
          </span>
        ))}
      </div>
      {/* Manual input */}
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-gray-100 bg-white px-2.5 py-2">
        <div className="flex min-w-0 flex-1 gap-1.5" style={{ minWidth: '0', flexBasis: '180px' }}>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && browse(path)}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-1.5 text-[12px] text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-400/20"
            placeholder="/Volumes/MyDisk"
          />
          <button onClick={() => browse(path)} className="shrink-0 rounded-lg bg-slate-800 px-3 text-[12px] font-semibold text-white hover:bg-slate-700 transition-all shadow-sm">
            Đi
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <select
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[10.5px] font-semibold text-gray-600 outline-none"
            title="Số cấp thư mục hiển thị"
          >
            <option value={1}>Cấp 1</option>
            <option value={2}>Cấp 2</option>
          </select>
          <button
            type="button"
            onClick={() => setShowHidden(v => !v)}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold transition-all ${
              showHidden
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-700'
            }`}
            title={showHidden ? 'Ẩn file và thư mục ẩn' : 'Hiện file và thư mục ẩn'}
          >
            {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            <span className="hidden sm:inline text-[10px]">{showHidden ? 'Ẩn: Bật' : 'Ẩn: Tắt'}</span>
          </button>
          <button
            type="button"
            onClick={handleRenameCurrent}
            disabled={path === '/' || renaming}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[10.5px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:text-gray-300 transition-all"
            title="Đổi tên thư mục Local đang mở"
          >
            {renaming ? <RefreshCw size={12} className="animate-spin" /> : <Pencil size={12} />}
            <span className="hidden md:inline">Đổi tên</span>
          </button>
          <button
            type="button"
            onClick={() => browse(path)}
            disabled={loading}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[10.5px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:text-gray-300 transition-all"
            title="Tải lại thư mục Local"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden md:inline">Tải lại</span>
          </button>
        </div>
      </div>
      {/* Entries */}
      <div
        className={`overflow-y-auto ${tall ? 'min-h-0 flex-1 bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_29px,#f7f7f8_29px,#f7f7f8_58px)]' : 'max-h-56'} ${downloading ? 'ring-2 ring-inset ring-blue-300' : ''}`}
        onContextMenu={ev => openLocalMenu(ev)}
        onDragOver={ev => {
          if (Array.from(ev.dataTransfer.types).includes('application/x-hagent-drive-item')) ev.preventDefault()
        }}
        onDrop={ev => handleDriveDrop(ev, path)}
      >
        {tall && (
          <div className="sticky top-0 z-10 grid w-full grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Tên</span>
            <span className="text-right">Kích thước</span>
            <span className="text-right">Loại</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-gray-400">
            <RefreshCw size={13} className="animate-spin" /> Đang tải...
          </div>
        ) : browseError ? (
          <div className="px-4 py-8 text-center text-[12px] font-medium text-red-500">{browseError}</div>
        ) : flatEntries.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-400">Thư mục trống</div>
        ) : flatEntries.map((e, i) => {
          const active = value === e.path
          return (
            <div
              key={e.path}
              draggable={dragEnabled}
              onDragStart={ev => {
                ev.dataTransfer.setData('text/plain', e.path)
                ev.dataTransfer.setData('application/x-hagent-local-type', e.type || '')
                ev.dataTransfer.effectAllowed = 'copy'
              }}
              onDragOver={ev => {
                if (e.type === 'dir' && Array.from(ev.dataTransfer.types).includes('application/x-hagent-drive-item')) {
                  ev.preventDefault()
                  ev.stopPropagation()
                }
              }}
              onContextMenu={ev => openLocalMenu(ev, e)}
              onDrop={ev => e.type === 'dir' && handleDriveDrop(ev, e.path)}
              onClick={() => (e.type === 'dir' ? browse(e.path) : onChange(e.path))}
              className={`${tall
                ? 'grid min-h-[29px] w-full min-w-0 grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 px-3 py-1'
                : 'flex w-full items-center gap-2.5 px-3 py-2'
              } cursor-pointer text-left transition-colors ${
                active ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : tall && i % 2 ? 'bg-gray-50/80 hover:bg-blue-50/60' : 'bg-white hover:bg-blue-50/60'
              } ${dragEnabled ? 'active:cursor-grabbing' : ''}`}
            >
              <span
                className={`flex min-w-0 items-center gap-1.5 ${tall ? '' : 'flex-1'}`}
                style={{ paddingLeft: `${e.level * 16}px` }}
              >
                {dragEnabled && <GripVertical size={12} className="shrink-0 text-gray-300" />}
                {e.type === 'dir' && (e.children?.length
                  ? <ChevronDown size={12} className="shrink-0 text-gray-400" />
                  : <span className="w-3 shrink-0" />)}
                {e.type === 'dir'
                  ? <FolderOpen size={15} className="shrink-0 text-amber-500" />
                  : <File size={15} className="shrink-0 text-gray-300" />}
                <span className={`truncate text-[12px] ${e.hidden ? 'text-gray-400' : 'text-gray-700'}`}>{e.name}</span>
                {e.type !== 'dir' && (
                  <button
                    type="button"
                    onClick={ev => { ev.stopPropagation(); previewLocalEntry(e) }}
                    className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-white hover:text-blue-600"
                    title="Xem trước"
                  >
                    <Eye size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={ev => { ev.stopPropagation(); deleteLocalPath(e) }}
                  className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                  title="Xóa Local"
                >
                  <Trash2 size={12} />
                </button>
              </span>
              {tall ? (
                <>
                  <span className="truncate text-right text-[10.5px] tabular-nums text-gray-400">{e.size ? fmtBytes(e.size) : '—'}</span>
                  <span className="truncate text-right text-[10.5px] text-gray-400">{e.type === 'dir' ? 'Thư mục' : 'Tệp'}</span>
                </>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10.5px] tabular-nums text-gray-400">{e.size ? fmtBytes(e.size) : '—'}</span>
                  {e.type === 'dir' && <ChevronRight size={13} className="text-gray-300" />}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {/* Selected */}
      {value && (
        <div className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] bg-emerald-50/60 px-3 py-2">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span className="flex-1 truncate text-[11.5px] font-medium text-emerald-700">{value}</span>
          {selectedEntry && (
            <button onClick={() => deleteLocalPath(selectedEntry)} className="rounded p-0.5 text-emerald-600/60 hover:bg-red-50 hover:text-red-600" title="Xóa mục đã chọn">
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={() => onChange('')} className="rounded p-0.5 text-emerald-600/60 hover:bg-white hover:text-emerald-700">
            <X size={13} />
          </button>
        </div>
      )}
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      <DrivePreviewModal token={token} request={previewRequest} onClose={() => setPreviewRequest(null)} />
      <RenameModal
        open={!!renameDialog}
        title="Đổi tên"
        label={renameDialog ? `Tên mới cho “${renameDialog.currentName}”` : ''}
        defaultValue={renameDialog?.currentName || ''}
        onConfirm={doLocalRename}
        onCancel={() => setRenameDialog(null)}
      />
    </div>
  )
}

// ── Drive folder browser (cửa sổ đích) ───────────────────────────────────
function DriveBrowser({ token, accounts, accountId, onAccountChange, onChange, onLocalDrop, tall = false, onDownloadStarted = null }) {
  const [overview, setOverview] = useState(() => {
    try { const s = localStorage.getItem('hagent_drive_browse'); return s ? JSON.parse(s).overview !== false : true } catch { return true }
  })
  const [overviewGroups, setOverviewGroups] = useState([])
  const [activeAccountId, setActiveAccountId] = useState(() => {
    try { const s = localStorage.getItem('hagent_drive_browse'); return (s ? JSON.parse(s).accountId : null) || accountId || '' } catch { return accountId || '' }
  })
  const [stack, setStack] = useState(() => {
    try { const s = localStorage.getItem('hagent_drive_browse'); return (s ? JSON.parse(s).stack : null) || [{ id: 'root', name: 'My Drive' }] } catch { return [{ id: 'root', name: 'My Drive' }] }
  })
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [renameDialog, setRenameDialog] = useState(null) // { item, accountIdForItem }
  const [moving, setMoving] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [previewRequest, setPreviewRequest] = useState(null)
  const [movePicker, setMovePicker] = useState(null)
  const [shareModal, setShareModal] = useState(null)
  const [dropTarget, setDropTarget] = useState('')  // id folder đang hover khi kéo
  const [driveQuery, setDriveQuery] = useState('')
  const [driveSort, setDriveSort] = useState('name')
  const [selectedDriveItems, setSelectedDriveItems] = useState({})

  const current = stack[stack.length - 1]
  const destPath = stack.slice(1).map(s => s.name).join('/')
  const activeAccount = accounts.find(a => a.id === activeAccountId)
  const selectedDriveList = Object.values(selectedDriveItems)
  const canGoParent = !overview && stack.length > 1

  const load = useCallback(async (parentId) => {
    if (!activeAccountId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ account_id: activeAccountId, parent_id: parentId })
      const r = await fetch(`${API}/drive/sync/drive-folders?${params}`, { headers: auth(token) })
      const d = await r.json()
      setFolders(r.ok ? (d.items || d.folders || []) : [])
    } catch { setFolders([]) } finally { setLoading(false) }
  }, [token, activeAccountId])

  const loadOverview = useCallback(async () => {
    if (accounts.length === 0) { setOverviewGroups([]); return }
    setLoading(true)
    try {
      const groups = await Promise.all(accounts.map(async account => {
        const params = new URLSearchParams({ account_id: account.id, parent_id: 'root' })
        try {
          const r = await fetch(`${API}/drive/sync/drive-folders?${params}`, { headers: auth(token) })
          const d = await r.json()
          return { ...account, folders: r.ok ? (d.items || d.folders || []) : [], error: r.ok ? '' : (d.detail || 'Không đọc được Drive') }
        } catch {
          return { ...account, folders: [], error: 'Không đọc được Drive' }
        }
      }))
      setOverviewGroups(groups)
    } finally { setLoading(false) }
  }, [token, accounts])

  useEffect(() => {
    if (!activeAccountId && accountId) setActiveAccountId(accountId)
  }, [accountId, activeAccountId])
  useEffect(() => {
    if (!overview && accountId && accountId !== activeAccountId) {
      setActiveAccountId(accountId)
      setStack([{ id: 'root', name: 'My Drive' }])
    }
  }, [overview, accountId, activeAccountId])
  useEffect(() => {
    if (overview) loadOverview()
    else load(current.id)
  }, [overview, loadOverview, load, current.id])
  useEffect(() => { onChange(overview ? '' : destPath) }, [overview, destPath])
  useEffect(() => { setSelectedDriveItems({}) }, [overview, activeAccountId, current.id])

  // Persist drive browse state vào localStorage
  useEffect(() => {
    try { localStorage.setItem('hagent_drive_browse', JSON.stringify({ overview, accountId: activeAccountId, stack })) } catch { /* ignore */ }
  }, [overview, activeAccountId, stack])

  const enter = (f) => setStack(s => [...s, { id: f.id, name: f.name }])
  const goto = (i) => setStack(s => s.slice(0, i + 1))
  const showOverview = () => {
    setOverview(true)
    setStack([{ id: 'root', name: 'My Drive' }])
    setFolders([])
    setDropTarget('')
  }
  const openAccount = (account, folder = null) => {
    setActiveAccountId(account.id)
    onAccountChange?.(account.id)
    setStack(folder
      ? [{ id: 'root', name: 'My Drive' }, { id: folder.id, name: folder.name }]
      : [{ id: 'root', name: 'My Drive' }])
    setOverview(false)
    setDropTarget('')
  }

  const driveDragItem = ev => {
    const raw = ev.dataTransfer.getData('application/x-hagent-drive-item')
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  const destPathForFolder = folder => [...stack.slice(1).map(s => s.name), folder?.name].filter(Boolean).join('/')
  // Kéo 1 THƯ MỤC local sang Drive → tạo folder con cùng tên trong đích rồi đổ nội dung vào (hoặc tái sử dụng nếu trùng tên).
  const destWithFolder = (baseDest, localPath, localType) => {
    if (localType !== 'dir') return baseDest
    const name = String(localPath || '').replace(/\/+$/, '').split('/').filter(Boolean).pop() || ''
    const baseParts = baseDest.split('/').filter(Boolean)
    const lastPart = baseParts[baseParts.length - 1] || ''
    if (lastPart.toLowerCase() === name.toLowerCase()) {
      return baseDest
    }
    return [baseDest, name].filter(Boolean).join('/')
  }
  const refreshDrive = async () => {
    if (overview) await loadOverview()
    else await load(current.id)
  }
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text) } catch { window.prompt('Copy thủ công:', text) }
  }
  const itemKey = (accountIdForItem, item) => `${accountIdForItem}:${item.id}`
  const sortDriveItems = items => {
    const query = driveQuery.trim().toLowerCase()
    return items
      .filter(item => !query || String(item.name || '').toLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        if (driveSort === 'type') return `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`, 'vi')
        if (driveSort === 'size') return (Number(b.size || 0) - Number(a.size || 0)) || String(a.name).localeCompare(String(b.name), 'vi')
        if (driveSort === 'modified') return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')) || String(a.name).localeCompare(String(b.name), 'vi')
        return String(a.name || '').localeCompare(String(b.name || ''), 'vi')
      })
  }
  const toggleDriveSelection = (ev, item, accountIdForItem = activeAccountId, accountEmail = activeAccount?.email) => {
    ev.stopPropagation()
    const key = itemKey(accountIdForItem, item)
    setSelectedDriveItems(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = { ...item, accountId: accountIdForItem, accountEmail }
      return next
    })
  }
  const previewDriveItem = (item, accountIdForItem = activeAccountId, accountEmail = activeAccount?.email) => {
    if (!item || item.type === 'folder') return
    setPreviewRequest({ kind: 'drive', item, accountId: accountIdForItem, accountEmail })
  }
  const openCrossAccountMove = (item, accountIdForItem = activeAccountId) => {
    if (!item) return
    setMovePicker({ item: { ...item, accountId: accountIdForItem }, sourceAccountId: accountIdForItem })
  }
  const openSelectedCrossAccountMove = () => {
    if (selectedDriveList.length === 0) return
    setMovePicker({ items: selectedDriveList, sourceAccountId: selectedDriveList[0].accountId })
  }
  const openShareModal = (item, accountIdForItem = activeAccountId) => {
    if (!item) return
    setShareModal({ item, accountId: accountIdForItem })
  }
  const renameDriveItem = (item, accountIdForItem = activeAccountId) => {
    if (!item || item.id === 'root') return
    setRenameDialog({ item, accountIdForItem })
  }
  const doDriveRename = async (newName) => {
    if (!renameDialog) return
    const { item, accountIdForItem } = renameDialog
    if (!newName || newName === item.name) { setRenameDialog(null); return }
    setRenameDialog(null)
    setRenaming(true)
    try {
      const r = await fetch(`${API}/drive/sync/drive-folders/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountIdForItem, name: newName }),
      })
      const d = await r.json()
      if (!r.ok) { notify(d.detail || 'Đổi tên Drive thất bại', 'error'); return }
      if (!overview && item.id === current.id) {
        setStack(s => s.map((entry, index) => index === s.length - 1 ? { ...entry, name: d.name } : entry))
      }
      await refreshDrive()
    } catch (e) { notify(String(e), 'error') } finally { setRenaming(false) }
  }
  const deleteDriveItem = async (item, accountIdForItem = activeAccountId) => {
    if (!item) return
    const typeLabel = item.type === 'folder' ? 'thư mục' : 'file'
    if (!window.confirm(`Xóa ${typeLabel} "${item.name}" khỏi Google Drive và dọn sạch thùng rác của tài khoản này?`)) return
    setMoving(item.id)
    try {
      const r = await fetch(`${API}/drive/sync/drive-trash`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountIdForItem,
          item_id: item.id,
          confirm_delete: true,
          empty_trash: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Xóa Drive thất bại'); return }
      await refreshDrive()
      alert(`Đã xóa "${item.name}"${d.trash_emptied ? ' và dọn sạch thùng rác' : d.trash_error ? ` · chưa dọn được thùng rác: ${d.trash_error}` : ''}`)
    } catch (e) { alert(String(e)) } finally { setMoving('') }
  }
  const downloadDriveItemToLocal = async (item, accountIdForItem) => {
    const destination = window.prompt('Tải xuống thư mục Local nào?', '/Volumes')?.trim()
    if (!destination) return
    setMoving(item.id)
    try {
      const r = await fetch(`${API}/drive/sync/drive-download`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountIdForItem, item_id: item.id, destination_path: destination }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Tải Drive xuống Local thất bại'); return }
      onDownloadStarted?.()
      alert(`Đã bắt đầu tải "${item.name}" vào ${destination}. Xem tiến độ ở tab Lịch sử.`)
    } catch (e) { alert(String(e)) } finally { setMoving('') }
  }
  const downloadSelectedDriveItems = async () => {
    if (selectedDriveList.length === 0) return
    const destination = window.prompt(`Tải ${selectedDriveList.length} mục xuống thư mục Local nào?`, '/Volumes')?.trim()
    if (!destination) return
    setMoving('__bulk__')
    let ok = 0
    let failed = 0
    try {
      for (const item of selectedDriveList) {
        try {
          const r = await fetch(`${API}/drive/sync/drive-download`, {
            method: 'POST',
            headers: { ...auth(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: item.accountId, item_id: item.id, destination_path: destination }),
          })
          if (r.ok) ok += 1
          else failed += 1
        } catch {
          failed += 1
        }
      }
      onDownloadStarted?.()
      alert(`Đã bắt đầu tải ${ok}/${selectedDriveList.length} mục vào ${destination}${failed ? ` · lỗi ${failed}` : ''}. Xem tiến độ ở tab Lịch sử.`)
    } finally { setMoving('') }
  }
  const deleteSelectedDriveItems = async () => {
    if (selectedDriveList.length === 0) return
    if (!window.confirm(`Xóa ${selectedDriveList.length} mục đã chọn khỏi Google Drive và dọn thùng rác?`)) return
    setMoving('__bulk__')
    let failed = 0
    try {
      for (const item of selectedDriveList) {
        try {
          const r = await fetch(`${API}/drive/sync/drive-trash`, {
            method: 'POST',
            headers: { ...auth(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: item.accountId, item_id: item.id, confirm_delete: true, empty_trash: true }),
          })
          if (!r.ok) failed += 1
        } catch {
          failed += 1
        }
      }
      setSelectedDriveItems({})
      await refreshDrive()
      alert(`Đã xóa ${selectedDriveList.length - failed}/${selectedDriveList.length} mục${failed ? ` · lỗi ${failed}` : ''}`)
    } finally { setMoving('') }
  }
  const openDriveMenu = (ev, item = null, account = null) => {
    ev.preventDefault()
    ev.stopPropagation()
    const accountForItem = account || activeAccount
    const accountIdForItem = accountForItem?.id || activeAccountId
    setContextMenu({
      x: ev.clientX,
      y: ev.clientY,
      title: item ? item.name : (accountForItem?.email || current.name),
      items: item ? [
        item.type === 'folder' && { label: 'Mở', icon: FolderOpen, onClick: () => (account ? openAccount(account, item) : enter(item)) },
        item.type === 'folder' && { label: 'Chọn làm đích', icon: CheckCircle2, onClick: () => (account ? openAccount(account, item) : enter(item)) },
        item.type !== 'folder' && { label: 'Xem trước', icon: Eye, onClick: () => previewDriveItem(item, accountIdForItem, accountForItem?.email) },
        item.webViewLink && { label: 'Mở trên Google Drive', icon: ExternalLink, onClick: () => window.open(item.webViewLink, '_blank', 'noopener,noreferrer') },
        { label: 'Đổi tên', icon: Pencil, onClick: () => renameDriveItem(item, accountIdForItem) },
        { label: 'Chia sẻ...', icon: Mail, onClick: () => openShareModal(item, accountIdForItem) },
        { label: 'Di chuyển...', icon: ArrowRight, disabled: accounts.length < 1, onClick: () => openCrossAccountMove(item, accountIdForItem) },
        { label: 'Tải xuống Local...', icon: Download, onClick: () => downloadDriveItemToLocal(item, accountIdForItem) },
        item.webViewLink && { label: 'Sao chép link Drive', icon: Copy, onClick: () => copyText(item.webViewLink) },
        { label: 'Sao chép ID', icon: Copy, onClick: () => copyText(item.id) },
        { separator: true },
        { label: 'Xóa và dọn thùng rác', icon: Trash2, danger: true, onClick: () => deleteDriveItem(item, accountIdForItem) },
      ] : [
        account && { label: 'Mở Drive', icon: Cloud, onClick: () => openAccount(account) },
        { label: 'Làm mới', icon: RefreshCw, onClick: refreshDrive },
        !overview && current.id !== 'root' && { label: 'Đổi tên thư mục hiện tại', icon: Pencil, onClick: () => renameDriveItem(current, activeAccountId) },
        !overview && { label: 'Xóa sạch thư mục hiện tại + thùng rác', icon: Trash2, danger: true, onClick: handleCleanup },
        account && { label: 'Sao chép email', icon: Copy, onClick: () => copyText(account.email) },
      ],
    })
  }
  const moveDriveItem = async (itemOrItems, targetAccountId, targetParentId, targetLabel, options = {}) => {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]
    if (items.length === 0 || !targetAccountId) return false
    
    // Kiểm tra xem có di chuyển vào chính nó không
    const invalidItem = items.find(item => item.id === targetParentId)
    if (invalidItem) {
      notify('Không thể di chuyển thư mục vào chính nó', 'error')
      return false
    }

    const sameAccount = items[0].accountId === targetAccountId
    const useBackground = !sameAccount || items.length > 1

    if (useBackground) {
      notify(`Đang bắt đầu di chuyển ${items.length} mục trong nền...`, 'info')
      setMovePicker(null) // Đóng modal ngay lập tức để không ảnh hưởng thao tác khác
      
      let ok = 0
      let failed = 0
      for (const item of items) {
        try {
          const r = await fetch(`${API}/drive/sync/drive-move`, {
            method: 'POST',
            headers: { ...auth(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_account_id: item.accountId,
              target_account_id: targetAccountId,
              item_id: item.id,
              target_parent_id: targetParentId,
              confirm_move: true,
              background: true,
              item_name: item.name,
            }),
          })
          if (r.ok) {
            ok++
            setSelectedDriveItems(prev => {
              const next = { ...prev }
              delete next[itemKey(item.accountId, item)]
              return next
            })
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
      onDownloadStarted?.() // Thông báo parent nạp lại danh sách job để hiển thị tiến trình
      if (failed > 0) {
        notify(`Đã khởi tạo di chuyển trong nền: ${ok} thành công, ${failed} lỗi`, ok > 0 ? 'warning' : 'error')
      } else {
        notify(`Đã khởi tạo di chuyển ${ok} mục trong nền thành công`, 'success')
      }
      return true
    }

    // Cùng tài khoản & chỉ có 1 mục -> Chạy đồng bộ trực tiếp (nhanh)
    const singleItem = items[0]
    setMoving(singleItem.id)
    setMovePicker(null) // Đóng modal ngay lập tức
    try {
      const r = await fetch(`${API}/drive/sync/drive-move`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_account_id: singleItem.accountId,
          target_account_id: targetAccountId,
          item_id: singleItem.id,
          target_parent_id: targetParentId,
          confirm_move: true,
          background: false,
          item_name: singleItem.name,
        }),
      })
      const d = await r.json()
      if (!r.ok) { notify(d.detail || 'Di chuyển Drive thất bại', 'error'); return false }
      
      setSelectedDriveItems(prev => {
        const next = { ...prev }
        delete next[itemKey(singleItem.accountId, singleItem)]
        return next
      })
      await refreshDrive()
      if (!options.quiet) {
        notify(d.moved ? `Đã di chuyển "${singleItem.name}"` : d.message, 'success')
      }
      return true
    } catch (e) { notify(String(e), 'error'); return false } finally {
      setMoving('')
      setDropTarget('')
    }
  }

  // Thả thư mục Local vào 1 folder Drive → set nguồn
  const handleDropOnFolder = async (ev, f) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDropTarget('')
    const driveItem = driveDragItem(ev)
    if (driveItem) {
      moveDriveItem(driveItem, activeAccountId, f.id, f.name)
      return
    }
    const localPath = ev.dataTransfer.getData('text/plain')
    const localType = ev.dataTransfer.getData('application/x-hagent-local-type')
    if (localPath && onLocalDrop) {
      await onLocalDrop(localPath, {
        accountId: activeAccountId,
        dest: destWithFolder(destPathForFolder(f), localPath, localType),
        folderId: f.id,
        folderName: f.name,
      })
    }
  }
  const handleDropOnOverview = async (ev, account, folder = null) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDropTarget('')
    const driveItem = driveDragItem(ev)
    if (driveItem) {
      moveDriveItem(driveItem, account.id, folder?.id || 'root', folder?.name || 'My Drive')
      return
    }
    const localPath = ev.dataTransfer.getData('text/plain')
    const localType = ev.dataTransfer.getData('application/x-hagent-local-type')
    if (localPath && onLocalDrop) {
      await onLocalDrop(localPath, {
        accountId: account.id,
        dest: destWithFolder(folder?.name || '', localPath, localType),
        folderId: folder?.id || 'root',
        folderName: folder?.name || 'My Drive',
      })
    }
  }
  // Thả vào vùng chung → gom vào folder hiện tại
  const handleDropHere = async (ev) => {
    ev.preventDefault()
    setDropTarget('')
    if (overview) return
    const driveItem = driveDragItem(ev)
    if (driveItem) {
      moveDriveItem(driveItem, activeAccountId, current.id, current.name)
      return
    }
    const localPath = ev.dataTransfer.getData('text/plain')
    const localType = ev.dataTransfer.getData('application/x-hagent-local-type')
    if (localPath && onLocalDrop) {
      await onLocalDrop(localPath, {
        accountId: activeAccountId,
        dest: destWithFolder(destPath, localPath, localType),
        folderId: current.id,
        folderName: current.name,
      })
    }
  }
  const handleDriveDrag = (ev, item, accountIdForItem = activeAccountId, parentId = current.id) => {
    ev.dataTransfer.setData('application/x-hagent-drive-item', JSON.stringify({
      accountId: accountIdForItem,
      id: item.id,
      name: item.name,
      type: item.type || 'folder',
      parentId,
    }))
    ev.dataTransfer.effectAllowed = 'copyMove'
  }

  const bulkMoving = moving === '__bulk__'
  const visibleFolders = sortDriveItems(folders)
  const visibleOverviewGroups = overviewGroups
    .map(group => ({ ...group, folders: sortDriveItems(group.folders || []) }))
    .filter(group => !driveQuery.trim() || group.email.toLowerCase().includes(driveQuery.trim().toLowerCase()) || group.folders.length > 0)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch(`${API}/drive/sync/drive-folders`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: activeAccountId, name: newName.trim(), parent_id: current.id }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Lỗi'); return }
      setNewName('')
      const created = d.folder || d
      if (created?.id) enter({ id: created.id, name: created.name || newName.trim() })
      else await load(current.id)
    } catch (e) { alert(String(e)) } finally { setCreating(false) }
  }

  const handleRename = async () => {
    if (overview || current.id === 'root') return
    renameDriveItem(current, activeAccountId)
  }

  const handleCleanup = async () => {
    if (overview || !activeAccountId) return
    const targetLabel = current.id === 'root'
      ? `TOÀN BỘ nội dung My Drive của ${activeAccount?.email}`
      : `thư mục "${current.name}" cùng toàn bộ nội dung`
    if (!window.confirm(`Xóa vĩnh viễn ${targetLabel} và dọn sạch toàn bộ thùng rác của tài khoản này?`)) return
    setCleaning(true)
    try {
      const r = await fetch(`${API}/drive/sync/drive-cleanup`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeAccountId,
          folder_id: current.id,
          confirm_permanent: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.detail || 'Xóa Drive thất bại'); return }
      if (current.id === 'root') await load('root')
      else setStack(s => s.slice(0, -1))
      alert(
        `Đã xóa vĩnh viễn ${d.deleted || 0} mục${d.failed ? ` · ${d.failed} mục lỗi` : ''}`
        + `${d.trash_emptied ? ' · Đã dọn sạch thùng rác' : ' · Không dọn được thùng rác'}`,
      )
    } catch (e) { alert(String(e)) } finally { setCleaning(false) }
  }

  if (accounts.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-dashed border-black/[0.12] bg-white/50 p-4 text-center ${tall ? 'h-[28rem] sm:h-[32rem] lg:h-[40rem]' : 'h-full min-h-[200px]'}`}>
        <p className="text-[11.5px] text-gray-400">Chưa có tài khoản Google<br />để duyệt thư mục Drive</p>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm ring-1 ring-black/[0.04] ${tall ? 'flex h-[28rem] min-h-0 flex-col sm:h-[32rem] lg:h-[40rem]' : ''}`}>
      {/* Account đang duyệt */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-blue-100/60 bg-gradient-to-r from-blue-50 to-indigo-50/60 px-2.5 py-1.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
          <Cloud size={11} className="text-blue-600" />
        </div>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[10.5px] font-bold text-blue-800">
            {overview ? `Tất cả Drive · ${accounts.length} tài khoản` : activeAccount?.email}
          </span>
          {!overview && activeAccount && (() => {
            const q = accountQuota(activeAccount)
            return q.limit ? (
              <span className="truncate text-[9px] font-semibold text-blue-500">
                Còn trống {fmtBytes(q.free)} / {fmtBytes(q.limit)}{activeAccount.shared_group ? ' · Gia đình' : ''}
              </span>
            ) : null
          })()}
        </span>
        {!overview && current.id !== 'root' && (
          <button
            type="button"
            onClick={handleRename}
            disabled={renaming}
            className="flex shrink-0 items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-[9.5px] font-bold text-blue-700 hover:bg-blue-100 disabled:text-blue-300 shadow-sm transition-all"
            title="Đổi tên thư mục Drive đang mở"
          >
            {renaming ? <RefreshCw size={10} className="animate-spin" /> : <Pencil size={10} />}
            Đổi tên
          </button>
        )}
        {!overview && (
          <button
            type="button"
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[9.5px] font-bold text-red-600 hover:bg-red-100 disabled:text-red-300 shadow-sm transition-all"
            title="Xóa vĩnh viễn thư mục hiện tại và dọn sạch thùng rác"
          >
            {cleaning ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />}
            Xóa sạch
          </button>
        )}
        <button
          type="button"
          onClick={() => (overview ? loadOverview() : load(current.id))}
          className="rounded-md p-1 text-blue-500/70 hover:bg-white/80 hover:text-blue-700 transition-all"
          title="Làm mới thư mục Drive"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {/* Breadcrumb */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-black/[0.06] bg-gray-50/80 px-2.5 py-1.5">
        <button
          type="button"
          onClick={showOverview}
          className={`rounded px-1.5 py-0.5 text-[11.5px] font-medium hover:bg-white hover:text-gray-900 ${overview ? 'text-blue-700' : 'text-gray-600'}`}
        >
          Tất cả Drive
        </button>
        {!overview && (
          <button
            type="button"
            onClick={() => canGoParent && setStack(s => s.slice(0, -1))}
            disabled={!canGoParent}
            className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-500 hover:bg-white hover:text-gray-800 disabled:text-gray-300"
            title="Trở về thư mục mẹ"
          >
            ..
          </button>
        )}
        {!overview && stack.map((s, i) => (
          <span key={s.id} className="flex items-center">
            <ChevronRight size={11} className="text-gray-300" />
            <button onClick={() => goto(i)}
              className="max-w-[110px] truncate rounded px-1.5 py-0.5 text-[11.5px] font-medium text-gray-600 hover:bg-white hover:text-gray-900">
              {s.name}
            </button>
          </span>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-black/[0.06] bg-white px-2.5 py-2">
        <input
          value={driveQuery}
          onChange={e => setDriveQuery(e.target.value)}
          placeholder="Tìm file, thư mục, Gmail..."
          className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 py-1.5 text-[11.5px] text-gray-700 outline-none focus:border-blue-500 focus:bg-white" style={{ minWidth: '120px' }}
        />
        <select
          value={driveSort}
          onChange={e => setDriveSort(e.target.value)}
          className="h-8 rounded-lg border border-black/[0.08] bg-white px-2 text-[10.5px] font-medium text-gray-500 outline-none"
          title="Sắp xếp"
        >
          <option value="name">Tên</option>
          <option value="type">Loại</option>
          <option value="size">Kích thước</option>
          <option value="modified">Ngày sửa</option>
        </select>
        {selectedDriveList.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-1.5 py-1">
            <span className="px-1 text-[10px] font-semibold text-blue-700">{selectedDriveList.length} chọn</span>
            <button type="button" onClick={downloadSelectedDriveItems} disabled={bulkMoving}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-white disabled:text-blue-300">
              Tải
            </button>
            <button type="button" onClick={openSelectedCrossAccountMove} disabled={bulkMoving || accounts.length < 1}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-white disabled:text-blue-300">
              Di chuyển
            </button>
            <button type="button" onClick={deleteSelectedDriveItems} disabled={bulkMoving}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-white disabled:text-red-300">
              Xóa
            </button>
            <button type="button" onClick={() => setSelectedDriveItems({})}
              className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-gray-400 hover:bg-white hover:text-gray-700">
              Bỏ chọn
            </button>
          </div>
        )}
      </div>
      {/* Folder list — vùng thả (drop zone) */}
      <div
        className={`overflow-y-auto transition-colors ${tall ? 'min-h-0 flex-1 bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_29px,#f7f7f8_29px,#f7f7f8_58px)]' : 'max-h-44'} ${dropTarget === '__here__' ? 'bg-blue-50/60' : ''}`}
        onContextMenu={ev => openDriveMenu(ev)}
        onDragOver={ev => { ev.preventDefault(); if (!overview) setDropTarget(t => t || '__here__') }}
        onDragLeave={() => setDropTarget('')}
        onDrop={handleDropHere}
      >
        {tall && (
          <div className="sticky top-0 z-10 grid w-full grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Tên</span>
            <span className="text-right">Kích thước</span>
            <span className="text-right">Ngày sửa</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-gray-400">
            <RefreshCw size={13} className="animate-spin" /> Đang tải...
          </div>
        ) : overview ? (
          visibleOverviewGroups.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray-400">Không có Drive để hiển thị</div>
          ) : visibleOverviewGroups.flatMap(group => {
            const quota = accountQuota(group)
            return [
              <button
                key={`account-${group.id}`}
                type="button"
                onClick={() => openAccount(group)}
                onContextMenu={ev => openDriveMenu(ev, null, group)}
                onDragOver={ev => { ev.preventDefault(); ev.stopPropagation(); setDropTarget(`account-${group.id}`) }}
                onDragLeave={() => setDropTarget('')}
                onDrop={ev => handleDropOnOverview(ev, group)}
                className={`grid min-h-[42px] w-full min-w-0 grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 border-t border-black/[0.06] bg-blue-50/60 px-3 py-1.5 text-left transition-colors hover:bg-blue-100/70 ${
                  dropTarget === `account-${group.id}` ? 'ring-1 ring-inset ring-blue-400' : ''
                }`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <ChevronDown size={12} className="mt-0.5 shrink-0 text-blue-400" />
                  <Cloud size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11.5px] font-semibold text-blue-800">{group.email}</span>
                      {group.error && <AlertCircle size={11} className="shrink-0 text-red-400" title={group.error} />}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] font-medium text-blue-500/80">
                      Còn trống {fmtBytes(quota.free)} / Tổng {fmtBytes(quota.limit)}
                      {group.shared_group ? ' · Gia đình' : ''}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true" />
                <span className="truncate text-right text-[10px] font-medium text-blue-500">Google Drive</span>
              </button>,
              ...group.folders.map((f, i) => {
                const selected = Boolean(selectedDriveItems[itemKey(group.id, f)])
                return (
              <button
                key={`${group.id}-${f.id}`}
                type="button"
                draggable
                onDragStart={ev => handleDriveDrag(ev, f, group.id, 'root')}
                onClick={() => (f.type === 'folder' ? openAccount(group, f) : previewDriveItem(f, group.id, group.email))}
                onContextMenu={ev => openDriveMenu(ev, f, group)}
                onDragOver={ev => {
                  if (f.type === 'folder') { ev.preventDefault(); ev.stopPropagation(); setDropTarget(`${group.id}-${f.id}`) }
                }}
                onDragLeave={() => setDropTarget('')}
                onDrop={ev => f.type === 'folder' && handleDropOnOverview(ev, group, f)}
                className={`grid min-h-[29px] w-full min-w-0 grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 px-3 py-1 text-left transition-colors ${
                  dropTarget === `${group.id}-${f.id}` ? 'bg-blue-100 ring-1 ring-inset ring-blue-400' : i % 2 ? 'bg-gray-50/80 hover:bg-blue-50/60' : 'bg-white hover:bg-blue-50/60'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 pl-5">
                  <span
                    onClick={ev => toggleDriveSelection(ev, f, group.id, group.email)}
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white text-transparent hover:border-blue-300'}`}
                    title={selected ? 'Bỏ chọn' : 'Chọn'}
                  >
                    <Check size={9} strokeWidth={3} />
                  </span>
                  {f.type === 'folder'
                    ? <FolderOpen size={15} className="shrink-0 text-blue-400" />
                    : <File size={15} className="shrink-0 text-gray-400" />}
                  <span className="truncate text-[12px] text-gray-700">{f.name}</span>
                  {moving === f.id && <RefreshCw size={11} className="shrink-0 animate-spin text-blue-500" />}
                </span>
                <span className="truncate text-right text-[10.5px] tabular-nums text-gray-400">{f.type === 'folder' ? '—' : fmtBytes(f.size)}</span>
                <span className="truncate text-right text-[10.5px] text-gray-400">{fmtDate(f.modifiedTime)}</span>
              </button>

                )
              }),
            ]
          })
        ) : folders.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-400">Kéo Local vào đây để upload ngay · Kéo Drive sang Local để tải xuống</div>
        ) : visibleFolders.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-400">Không có mục khớp tìm kiếm</div>
        ) : visibleFolders.map((f, i) => {
          const selected = Boolean(selectedDriveItems[itemKey(activeAccountId, f)])
          return (
          <button
            key={f.id}
            draggable
            onDragStart={ev => handleDriveDrag(ev, f, activeAccountId, current.id)}
            onClick={() => (f.type === 'folder' ? enter(f) : previewDriveItem(f, activeAccountId, activeAccount?.email))}
            onContextMenu={ev => openDriveMenu(ev, f)}
            onDragOver={ev => {
              if (f.type === 'folder') { ev.preventDefault(); ev.stopPropagation(); setDropTarget(f.id) }
            }}
            onDragLeave={() => setDropTarget('')}
            onDrop={ev => { if (f.type === 'folder') { ev.stopPropagation(); handleDropOnFolder(ev, f) } }}
            className={`${tall
              ? 'grid min-h-[29px] w-full min-w-0 grid-cols-[minmax(0,1fr)_6rem_7rem] items-center gap-2 px-3 py-1'
              : 'flex w-full items-center gap-2.5 px-3 py-2'
            } text-left transition-colors ${
              dropTarget === f.id ? 'bg-blue-100 ring-1 ring-inset ring-blue-400' : tall && i % 2 ? 'bg-gray-50/80 hover:bg-blue-50/60' : 'bg-white hover:bg-blue-50/60'
            }`}
          >
            <span className={`flex min-w-0 items-center gap-2 ${tall ? '' : 'flex-1'}`}>
              <span
                onClick={ev => toggleDriveSelection(ev, f, activeAccountId, activeAccount?.email)}
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white text-transparent hover:border-blue-300'}`}
                title={selected ? 'Bỏ chọn' : 'Chọn'}
              >
                <Check size={9} strokeWidth={3} />
              </span>
              {f.type === 'folder'
                ? <FolderOpen size={15} className="shrink-0 text-blue-400" />
                : <File size={15} className="shrink-0 text-gray-400" />}
              <span className="truncate text-[12px] text-gray-700">{f.name}</span>
              {moving === f.id && <RefreshCw size={11} className="shrink-0 animate-spin text-blue-500" />}
            </span>
            {tall ? (
              <>
                <span className="truncate text-right text-[10.5px] tabular-nums text-gray-400">{f.type === 'folder' ? '—' : fmtBytes(f.size)}</span>
                <span className="truncate text-right text-[10.5px] text-gray-400">{fmtDate(f.modifiedTime)}</span>
              </>
            ) : (
              f.type === 'folder' ? <ChevronRight size={13} className="text-gray-300" /> : <Download size={13} className="text-gray-300" />
            )}
          </button>
          )
        })}
      </div>
      {/* Tạo folder mới */}
      {overview ? (
        <div className="shrink-0 border-t border-black/[0.06] bg-gray-50/70 px-3 py-2 text-center text-[10.5px] text-gray-400">
          Kéo giữa các Gmail để di chuyển · Kéo sang Local để tải xuống
        </div>
      ) : (
        <div className="flex shrink-0 gap-1.5 border-t border-black/[0.06] px-2.5 py-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Tạo thư mục mới..."
            className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
          />
          <button onClick={handleCreate} disabled={!newName.trim() || creating}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[12px] font-medium text-white hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400">
            {creating ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
          </button>
        </div>
      )}
      {/* Đích hiện tại */}
      <div className={`flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-3 py-2 ${overview ? 'bg-gray-50' : 'bg-emerald-50/60'}`}>
        {overview ? <Cloud size={14} className="shrink-0 text-gray-400" /> : <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />}
        <span className={`flex-1 truncate text-[11.5px] font-medium ${overview ? 'text-gray-400' : 'text-emerald-700'}`}>
          {overview ? 'Tổng quan tất cả Google Drive' : `${activeAccount?.email} · ${destPath || 'My Drive (gốc)'}`}
        </span>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      <DrivePreviewModal token={token} request={previewRequest} onClose={() => setPreviewRequest(null)} />
      <RenameModal
        open={!!renameDialog}
        title="Đổi tên trên Google Drive"
        label={renameDialog ? `Tên mới cho "${renameDialog.item?.name}"` : ''}
        defaultValue={renameDialog?.item?.name || ''}
        onConfirm={doDriveRename}
        onCancel={() => setRenameDialog(null)}
      />
      {movePicker && (
        <DriveMovePicker
          token={token}
          accounts={accounts}
          sourceItem={movePicker.item}
          sourceItems={movePicker.items}
          sourceAccountId={movePicker.sourceAccountId}
          onMove={moveDriveItem}
          onClose={() => setMovePicker(null)}
        />
      )}
      {shareModal && (
        <ShareDriveModal
          token={token}
          accounts={accounts}
          item={shareModal.item}
          accountId={shareModal.accountId}
          onClose={() => setShareModal(null)}
        />
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────
export default function DriveSync({ token }) {
  const [accounts, setAccounts] = useState([])
  const [jobs, setJobs] = useState([])
  const [loadingQuota, setLoadingQuota] = useState(false)
  const [tab, setTab] = useState(() => {
    try {
      const saved = window.localStorage.getItem(DRIVE_SYNC_TAB_KEY)
      return DRIVE_SYNC_TABS.has(saved) ? saved : 'dashboard'
    } catch {
      return 'dashboard'
    }
  }) // dashboard | maps | history
  const [mapsMounted, setMapsMounted] = useState(tab === 'maps')
  const pollRef = useRef(null)

  const loadQuota = useCallback(async () => {
    setLoadingQuota(true)
    try {
      const r = await fetch(`${API}/drive/sync/accounts-quota`, { headers: auth(token) })
      const d = await r.json()
      const accs = d.accounts || []
      setAccounts(accs)
    } catch { /* ignore */ } finally { setLoadingQuota(false) }
  }, [token])

  const loadJobs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/drive/sync/jobs`, { headers: auth(token) })
      const d = await r.json()
      setJobs((d.jobs || []).slice().reverse())
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { loadQuota(); loadJobs() }, [loadQuota, loadJobs])

  useEffect(() => {
    try { window.localStorage.setItem(DRIVE_SYNC_TAB_KEY, tab) } catch { /* ignore */ }
    if (tab === 'maps') setMapsMounted(true)
  }, [tab])

  useEffect(() => {
    const active = jobs.some(j => j.status === 'running' || j.status === 'pending')
    if (active && !pollRef.current) pollRef.current = setInterval(loadJobs, 1500)
    else if (!active && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [jobs, loadJobs])

  const lastActiveJobsRef = useRef(false)
  useEffect(() => {
    const active = jobs.some(j => j.status === 'running' || j.status === 'pending')
    if (lastActiveJobsRef.current && !active) {
      loadQuota()
    }
    lastActiveJobsRef.current = active
  }, [jobs, loadQuota])

  const handleCancel = async id => {
    await fetch(`${API}/drive/sync/jobs/${id}/cancel`, { method: 'POST', headers: auth(token) })
    loadJobs()
  }

  const handleDeleteRun = async job => {
    const runId = job.run_id || (job.id.startsWith('run-') ? job.id.slice(4) : job.id)
    const r = await fetch(`${API}/drive/sync/runs/${encodeURIComponent(runId)}`, { method: 'DELETE', headers: auth(token) })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      window.alert(d.detail || 'Không xoá được lượt sao lưu')
    }
    loadJobs()
  }

  const handleRerun = async job => {
    if (!job.map_id) return
    const r = await fetch(`${API}/drive/sync/maps/${encodeURIComponent(job.map_id)}/run`, { method: 'POST', headers: auth(token) })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      window.alert(d.detail || 'Không chạy lại được lượt sao lưu')
      return
    }
    await loadJobs()
  }

  const handleDeleteAllHistory = async () => {
    const r = await fetch(`${API}/drive/sync/runs`, { method: 'DELETE', headers: auth(token) })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      window.alert(d.detail || 'Không xoá được lịch sử')
    }
    loadJobs()
  }

  const activeCount = jobs.filter(j => j.status === 'running' || j.status === 'pending').length

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-3 py-2.5 shadow-md sm:px-4 sm:py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 sm:h-9 sm:w-9">
            <Cloud size={16} className="text-white sm:hidden" />
            <Cloud size={18} className="text-white hidden sm:block" />
          </div>
          <div>
            <h2 className="text-[13px] font-bold leading-tight text-white sm:text-[14px]">Sao lưu lên Drive</h2>
            <p className="hidden text-[10px] font-medium text-slate-300 sm:block">Đồng bộ ổ di động lên nhiều tài khoản Gmail</p>
          </div>
        </div>
        <button
          onClick={loadQuota}
          disabled={loadingQuota}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition-all"
          title="Làm mới"
        >
          <RefreshCw size={14} className={loadingQuota ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-gray-200/60 bg-white shadow-sm">
        <div className="flex w-full gap-0.5 overflow-x-auto px-2 py-1.5 sm:gap-1 sm:px-3 sm:py-2 no-scrollbar">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'maps', label: 'Mapping' },
            { id: 'history', label: `Lịch sử${jobs.length ? ` (${jobs.length})` : ''}` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition-all sm:flex-none sm:px-3.5 sm:text-[12px] ${
                tab === t.id
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {t.label}
              {t.id === 'history' && activeCount > 0 && (
                <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                  tab === t.id ? 'bg-white/25 text-white' : 'bg-blue-500 text-white'
                }`}>{activeCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thanh tiến độ nổi — hiện trực tiếp khi đang upload, không cần vào Lịch sử */}
      {activeCount > 0 && (() => {
        const job = jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'pending')
        if (job) {
          const uploaded = Number(job.files_done || 0)
          const skippedCount = Number(job.skipped || 0)
          const processed = Number(job.files_processed || 0)
          const total = Number(job.files_total || 0)
          const curBytesDone = Math.max(0, Number(job.current_bytes_done || 0))
          const curBytesTotal = Math.max(0, Number(job.current_bytes_total || 0))
          const curFilePct = curBytesTotal > 0 ? Math.min(100, Math.round((curBytesDone / curBytesTotal) * 100)) : 0
          const processedWithCur = Math.min(total, processed + (curBytesTotal > 0 ? curBytesDone / curBytesTotal : 0))
          const pct = total ? Math.min(100, Math.round((processedWithCur / total) * 100)) : null
          const totalBytesDone = Math.max(0, Number(job.bytes_done || 0)) + curBytesDone
          const label = job.title || job.map_name || (job.source || '').split('/').filter(Boolean).pop() || 'Đang sao lưu'
          const curFileName = job.current_file?.split('/').filter(Boolean).pop() || job.current_file || ''
          const fmtB = b => { if (!b) return '0 B'; const u = ['B','KB','MB','GB','TB']; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ } return `${b.toFixed(b >= 100 || i === 0 ? 0 : 1)} ${u[i]}` }
          const actionLabel = job.type === 'move'
            ? (job.phase === 'download' ? 'tải xuống' : 'tải lên')
            : (job.type === 'download' ? 'tải xuống' : 'tải lên')
          return (
            <div className="shrink-0 border-b border-blue-100 bg-blue-50/70 px-4 py-2.5">
              <div className="mx-auto max-w-5xl">
                <div className="flex items-center gap-3">
                  <RefreshCw size={13} className="shrink-0 animate-spin text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold text-blue-800">{label}{activeCount > 1 ? ` · +${activeCount - 1}` : ''}</span>
                      <span className="shrink-0 font-bold tabular-nums text-blue-700">{pct != null ? `${pct}%` : ''}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
                      <span className={`block h-full rounded-full bg-blue-500 transition-all ${pct == null ? 'w-1/3 animate-pulse' : ''}`} style={pct != null ? { width: `${pct}%` } : undefined} />
                    </div>
                  </div>
                  {tab !== 'history' && (
                    <button onClick={() => setTab('history')} className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100">Chi tiết</button>
                  )}
                </div>
                {/* Chi tiết: file con + số liệu */}
                <div className="mt-1.5 flex items-center gap-3 text-[10px] tabular-nums text-blue-600/80">
                  <span>{uploaded} {actionLabel}</span>
                  {skippedCount > 0 && <span>{skippedCount} bỏ qua</span>}
                  <span>{processed}/{total} xử lý</span>
                  <span>{fmtB(totalBytesDone)}</span>
                </div>
                {curFileName && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="shrink-0 text-[9.5px] text-blue-400">▸</span>
                    <span className="min-w-0 truncate text-[10px] font-medium text-blue-700">{curFileName}</span>
                    {curBytesTotal > 0 && (
                      <>
                        <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-blue-200">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-200" style={{ width: `${curFilePct}%` }} />
                        </div>
                        <span className="shrink-0 text-[9.5px] font-semibold text-blue-600">{curFilePct}%</span>
                        <span className="shrink-0 text-[9.5px] text-blue-400">{fmtB(curBytesDone)}/{fmtB(curBytesTotal)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        }

        return null
      })()}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto p-3 sm:p-4 ${tab === 'maps' ? 'max-w-[96rem]' : tab === 'dashboard' ? 'max-w-5xl' : 'max-w-2xl'}`}>
          {tab === 'dashboard' && <GmailInventory token={token} accounts={accounts} onConnected={loadQuota} />}

          {mapsMounted && (
            <div className={tab === 'maps' ? '' : 'hidden'}>
              <MapManager
                token={token}
                accounts={accounts}
                onRan={() => { loadJobs() }}
                FileBrowser={FileBrowser}
                DriveBrowser={DriveBrowser}
                RenameModal={RenameModal}
              />
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2.5">
              {jobs.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-black/[0.08] bg-white px-3 py-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">{jobs.length} lượt sao lưu</p>
                  <button
                    onClick={handleDeleteAllHistory}
                    className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-red-600 hover:bg-red-100"
                    title="Xoá toàn bộ lịch sử sao lưu (giữ nguyên các mapping)"
                  >
                    <Trash2 size={12} />
                    Xoá tất cả
                  </button>
                </div>
              )}
              {jobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/[0.12] bg-white/50 p-10 text-center">
                  <Clock size={24} className="mx-auto text-gray-300" />
                  <p className="mt-2 text-[12.5px] font-medium text-gray-500">Chưa có lượt sao lưu nào</p>
                </div>
              ) : jobs.map(j => (
                <BackupJobCard
                  key={j.id}
                  job={j}
                  onCancel={handleCancel}
                  onDelete={handleDeleteRun}
                  onRerun={handleRerun}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
