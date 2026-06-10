import { useState, useEffect, useMemo, useRef } from 'react'
import {
  HardDrive,
  Home,
  Server,
  Folder,
  File,
  FileText,
  Trash2,
  Save,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
  Plus,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  AlertTriangle,
  MoreHorizontal,
  FileCode2,
  Image,
  Music,
  Video,
  Archive,
  Code2,
  Upload,
  RefreshCw,
  Pin,
  PinOff,
  Cloud,
} from 'lucide-react'
import CodeEditor from './CodeEditor'

const PINNED_FOLDERS_KEY = 'hagent_pinned_folders'
const IMAGE_EXTS = ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.tiff','.tif','.heic','.heif']
const VIDEO_EXTS = ['.mp4','.mov','.webm','.mkv','.avi','.wmv','.flv','.m4v','.3gp','.ogv','.mts','.m2ts','.ts']
const AUDIO_EXTS = ['.mp3','.wav','.flac','.aac','.m4a','.ogg','.opus','.wma']
const OFFICE_PREVIEW_EXTS = ['.doc', '.docx', '.pptx', '.xlsx', '.xlsm']
const PDF_EXTS = ['.pdf']
const BROWSER_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatGb(value) {
  if (value == null) return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n >= 1024) return `${(n / 1024).toFixed(1)} TB`
  return `${n.toFixed(n >= 100 ? 0 : 1)} GB`
}

function volumeCapacityLabel(vol) {
  if (vol?.total_gb == null || vol?.free_gb == null) return ''
  const used = Math.max(0, Number(vol.total_gb) - Number(vol.free_gb))
  return `${formatGb(vol.free_gb)} trống / ${formatGb(vol.total_gb)}`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'Vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày`
  return d.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fileIcon(entry) {
  if (entry.type === 'directory') return <Folder className="file-type-icon file-type-folder h-4 w-4 text-amber-400" />
  if (entry.type === 'symlink') return <ExternalLink className="file-type-icon file-type-link h-4 w-4 text-cyan-400" />
  const ext = entry.extension?.toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.tif', '.heic', '.heif'].includes(ext)) return <Image className="file-type-icon file-type-image h-4 w-4 text-pink-400" />
  if (['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'].includes(ext)) return <Music className="file-type-icon file-type-audio h-4 w-4 text-purple-400" />
  if (['.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv', '.flv', '.m4v'].includes(ext)) return <Video className="file-type-icon file-type-video h-4 w-4 text-blue-400" />
  if (['.zip', '.gz', '.tar', '.rar', '.7z', '.bz2', '.xz'].includes(ext)) return <Archive className="file-type-icon file-type-archive h-4 w-4 text-orange-400" />
  if (['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.xlsm', '.pdf'].includes(ext)) return <FileText className="file-type-icon file-type-office h-4 w-4 text-rose-400" />
  if (['.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.c', '.cpp', '.swift', '.kt', '.dart', '.lua'].includes(ext)) return <FileCode2 className="file-type-icon file-type-code h-4 w-4 text-emerald-400" />
  if (['.txt', '.md', '.json', '.yml', '.yaml', '.toml', '.csv', '.xml'].includes(ext)) return <FileText className="file-type-icon file-type-text h-4 w-4 text-sky-400" />
  return <File className="file-type-icon file-type-file h-4 w-4 text-slate-400" />
}

function fileNameClass(entry) {
  if (entry.type === 'directory') return `file-name file-name-folder ${folderNameClass(entry.name)}`
  if (entry.type === 'symlink') return 'file-name file-name-link'
  const ext = entry.extension?.toLowerCase()
  if (IMAGE_EXTS.includes(ext)) return 'file-name file-name-image'
  if (AUDIO_EXTS.includes(ext)) return 'file-name file-name-audio'
  if (VIDEO_EXTS.includes(ext)) return 'file-name file-name-video'
  if (['.zip', '.gz', '.tar', '.rar', '.7z', '.bz2', '.xz'].includes(ext)) return 'file-name file-name-archive'
  if (['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.xlsm', '.pdf'].includes(ext)) return 'file-name file-name-office'
  if (['.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.c', '.cpp', '.swift', '.kt', '.dart', '.lua'].includes(ext)) return 'file-name file-name-code'
  if (['.txt', '.md', '.json', '.yml', '.yaml', '.toml', '.csv', '.xml'].includes(ext)) return 'file-name file-name-text'
  return 'file-name file-name-file'
}

function folderNameClass(name = '') {
  const key = name.toLowerCase()
  if (key === 'applications') return 'file-name-folder-apps'
  if (key === 'desktop') return 'file-name-folder-desktop'
  if (key === 'documents') return 'file-name-folder-documents'
  if (key === 'downloads') return 'file-name-folder-downloads'
  if (key === 'hagent') return 'file-name-folder-project'
  if (key === 'library') return 'file-name-folder-library'
  if (key === 'movies') return 'file-name-folder-movies'
  if (key === 'music') return 'file-name-folder-music'
  if (key === 'pictures') return 'file-name-folder-pictures'
  if (key === 'public') return 'file-name-folder-public'
  if (key === 'mnt') return 'file-name-folder-mount'
  return ''
}

function volumeColorClass(volume = {}) {
  const name = (volume.name || '').toLowerCase()
  if (volume.type === 'home') return 'volume-home'
  if (name.includes('macintosh') || name.includes('systemdisk')) return 'volume-system'
if (volume.type === 'remote') return 'volume-remote'
  return 'volume-disk'
}

function shareColorClass(share = {}) {
  if (share.mounted) return 'share-mounted'
  return 'share-unmounted'
}

function breadcrumbParts(path) {
  if (!path) return []
  const parts = path.split('/').filter(Boolean)
  let acc = ''
  return parts.map(p => {
    acc += '/' + p
    return { name: p, path: acc }
  })
}

function folderLabel(path) {
  if (!path) return 'Folder'
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function loadPinnedFolders() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_FOLDERS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(item => item && typeof item.path === 'string')
      .map(item => ({
        name: item.name || folderLabel(item.path),
        path: item.path,
        type: item.type === 'file' ? 'file' : 'directory',
      }))
  } catch {
    return []
  }
}

function DriveFilesPanel({ token }) {
  const [config, setConfig] = useState(null)
  const [items, setItems] = useState([])
  const [folderStack, setFolderStack] = useState([{ id: '', name: 'My Drive' }])
  const [driveMode, setDriveMode] = useState('my')
  const [newFolder, setNewFolder] = useState('')
  const [scope, setScope] = useState('data')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const jsonHeaders = { ...authHeaders(token), 'Content-Type': 'application/json' }
  const currentFolder = folderStack[folderStack.length - 1] || { id: '', name: 'My Drive' }

  async function readJson(res) {
    const text = await res.text()
    try { return text ? JSON.parse(text) : {} } catch { return { detail: text || 'Lỗi không rõ' } }
  }

  async function loadDrive(folderId = currentFolder.id, mode = driveMode) {
    setBusy('load'); setError('')
    try {
      const cfgRes = await fetch('/api/drive/config', { headers: authHeaders(token) })
      const cfgData = await readJson(cfgRes)
      if (!cfgRes.ok) throw new Error(cfgData.detail || 'Không tải được Google Drive')
      setConfig(cfgData.config || {})
      if (cfgData.ready) await loadItems(folderId, mode)
      else setItems([])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function loadItems(parentId = currentFolder.id, mode = driveMode) {
    setBusy('items'); setError('')
    try {
      const params = new URLSearchParams()
      if (parentId) params.set('parent_id', parentId)
      if (mode === 'shared' && !parentId) params.set('shared', 'true')
      const qs = params.toString() ? '?' + params.toString() : ''
      const r = await fetch('/api/drive/items' + qs, { headers: authHeaders(token) })
      const data = await readJson(r)
      if (!r.ok) throw new Error(data.detail || 'Không tải được Drive')
      setItems(data.items || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => { loadDrive('', 'my') }, [token])

  function switchDriveMode(mode) {
    setDriveMode(mode)
    const root = { id: '', name: mode === 'shared' ? 'Được chia sẻ' : 'My Drive' }
    setFolderStack([root])
    loadDrive('', mode)
  }

  function openFolder(item) {
    const targetId = item.shortcutDetails?.targetId || item.id
    setFolderStack(prev => [...prev, { id: targetId, name: item.name }])
    loadItems(targetId)
  }

  function goToFolder(index) {
    const next = folderStack.slice(0, index + 1)
    setFolderStack(next)
    loadItems(next[next.length - 1]?.id || '')
  }

  async function createFolder() {
    if (!newFolder.trim()) return
    setBusy('create'); setError(''); setMessage('')
    try {
      const r = await fetch('/api/drive/folders', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: newFolder.trim(), parent_id: currentFolder.id })
      })
      const data = await readJson(r)
      if (!r.ok) throw new Error(data.detail || 'Không tạo được thư mục')
      setNewFolder('')
      setMessage('Đã tạo thư mục')
      await loadItems(currentFolder.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function renameItem(item) {
    const name = window.prompt('Tên mới', item.name)
    if (!name || name.trim() === item.name) return
    setBusy('rename-' + item.id); setError(''); setMessage('')
    try {
      const r = await fetch('/api/drive/items', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ id: item.id, name: name.trim() })
      })
      const data = await readJson(r)
      if (!r.ok) throw new Error(data.detail || 'Không đổi tên được')
      setMessage('Đã đổi tên')
      await loadItems(currentFolder.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function deleteItem(item) {
    const hideShared = driveMode === 'shared'
    const confirmText = hideShared
      ? 'Ẩn "' + item.name + '" khỏi mục Được chia sẻ?'
      : 'Xóa "' + item.name + '" trên Google Drive?'
    if (!window.confirm(confirmText)) return
    setBusy('delete-' + item.id); setError(''); setMessage('')
    try {
      const r = await fetch('/api/drive/items', {
        method: 'DELETE',
        headers: jsonHeaders,
        body: JSON.stringify({ id: item.id, hide_shared: hideShared })
      })
      const data = await readJson(r)
      if (!r.ok) throw new Error(data.detail || (hideShared ? 'Không ẩn được' : 'Không xóa được'))
      setMessage(hideShared ? 'Đã ẩn khỏi Được chia sẻ' : 'Đã xóa')
      await loadItems(currentFolder.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function backup() {
    setBusy('backup'); setError(''); setMessage('')
    try {
      const r = await fetch('/api/drive/backup', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ folder_id: currentFolder.id, scope })
      })
      const data = await readJson(r)
      if (!r.ok) throw new Error(data.detail || 'Backup thất bại')
      setMessage('Đã backup: ' + (data.file?.name || 'hagent-backup.zip'))
      await loadItems(currentFolder.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const ready = Boolean(config?.has_refresh_token || config?.has_access_token)
  const isScopeError = /scope|quyền Google Drive|insufficient/i.test(error || '')
  const isFolder = item => item.mimeType === 'application/vnd.google-apps.folder'
  const isShortcut = item => item.mimeType === 'application/vnd.google-apps.shortcut'
  const isFolderLike = item => isFolder(item) || (isShortcut(item) && item.shortcutDetails?.targetMimeType === 'application/vnd.google-apps.folder')

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f1320]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#121728] px-3">
        <Cloud className="h-4 w-4 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-slate-100">Google Drive</div>
          <div className="truncate text-[9px] text-slate-500">{ready ? 'Đã kết nối' : 'Chưa có token Drive'}</div>
        </div>
        <a href="/api/drive/auth/login" target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-md bg-cyan-600 px-2 text-[10px] font-semibold text-white hover:bg-cyan-500">
          <ExternalLink className="h-3.5 w-3.5" />
          Kết nối
        </a>
        <button onClick={() => loadDrive(currentFolder.id)} disabled={!!busy} className="flex h-7 items-center gap-1.5 rounded-md border border-slate-700 px-2 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <RefreshCw className={'h-3.5 w-3.5 ' + ((busy === 'load' || busy === 'items') ? 'animate-spin' : '')} />
          Làm mới
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-[#0b1020] px-3">
        <button onClick={() => switchDriveMode('my')} className={'mr-1 rounded px-2 py-1 text-[10px] font-semibold ' + (driveMode === 'my' ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200')}>
          My Drive
        </button>
        <button onClick={() => switchDriveMode('shared')} className={'mr-2 rounded px-2 py-1 text-[10px] font-semibold ' + (driveMode === 'shared' ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200')}>
          Được chia sẻ
        </button>
        <div className="mx-1 h-4 w-px bg-slate-800" />
        {folderStack.map((folder, index) => (
          <span key={folder.id + '-' + index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
            <button onClick={() => goToFolder(index)} className={'rounded px-1.5 py-1 text-[10px] ' + (index === folderStack.length - 1 ? 'text-cyan-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#121728] px-3">
        <input value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createFolder() }} placeholder="Tên thư mục mới" className="h-7 min-w-0 flex-1 rounded-md border border-slate-700 bg-[#0b1020] px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-600" />
        <button onClick={createFolder} disabled={!ready || !!busy || !newFolder.trim()} className="h-7 rounded-md border border-slate-700 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Tạo thư mục</button>
        <select value={scope} onChange={e => setScope(e.target.value)} className="hidden h-7 rounded-md border border-slate-700 bg-[#0b1020] px-2 text-[10px] text-slate-200 outline-none sm:block">
          <option value="data">Dữ liệu + config</option>
          <option value="config">Config</option>
          <option value="workspace">Workspace nhẹ</option>
        </select>
        <button onClick={backup} disabled={!ready || !!busy} className="h-7 rounded-md bg-emerald-600 px-2.5 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">Backup</button>
      </div>

      {isScopeError && <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">Token hiện thiếu quyền Drive. Bấm Kết nối để cấp quyền đầy đủ rồi bấm Làm mới.</div>}
      {message && <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">{message}</div>}
      {error && !isScopeError && <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>}

      <div className="flex h-7 shrink-0 items-center border-b border-slate-800 bg-[#121728] px-3 text-[9px] font-medium uppercase tracking-wider text-slate-500">
        <span className="min-w-0 flex-1">Tên</span>
        <span className="w-20 shrink-0 text-right">Cỡ</span>
        <span className="w-28 shrink-0 text-right">Sửa lúc</span>
        <span className="w-24 shrink-0 text-right">Thao tác</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {(busy === 'items' || busy === 'load') ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Đang tải Drive...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center"><Cloud className="mb-2 h-8 w-8 text-slate-700" /><p className="text-[11px] text-slate-500">Thư mục Drive này đang trống</p></div>
        ) : items.map(item => (
          <div key={item.id} className="group/drive flex h-9 items-center border-b border-slate-800/60 px-3 text-[11px] hover:bg-slate-800/50">
            <button onClick={() => isFolderLike(item) ? openFolder(item) : window.open(item.webViewLink, '_blank')} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {isFolderLike(item) ? <Folder className="h-4 w-4 shrink-0 text-amber-400" /> : <File className="h-4 w-4 shrink-0 text-sky-400" />}
              <span className="truncate font-medium text-slate-200">{item.name}</span>
              {isShortcut(item) && <span className="shrink-0 rounded bg-slate-800 px-1 text-[9px] font-semibold text-cyan-200">link</span>}
            </button>
            <span className="w-20 shrink-0 text-right text-[10px] text-slate-500">{item.size ? formatSize(Number(item.size)) : '-'}</span>
            <span className="w-28 shrink-0 text-right text-[10px] text-slate-500">{item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString('vi-VN') : ''}</span>
            <div className="flex w-24 shrink-0 justify-end gap-1 opacity-100 md:opacity-0 md:group-hover/drive:opacity-100">
              {!isFolderLike(item) && item.webViewLink && <a href={item.webViewLink} target="_blank" rel="noreferrer" className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-100">Mở</a>}
              <button onClick={() => renameItem(item)} className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-100">Sửa</button>
              <button onClick={() => deleteItem(item)} className="rounded px-1.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10">{driveMode === 'shared' ? 'Ẩn' : 'Xóa'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


export default function FileManager({ token }) {
  const [activeTab, setActiveTab] = useState('local')
  const [volumes, setVolumes] = useState([])
  const [remoteShares, setRemoteShares] = useState([])
  const [activeVolume, setActiveVolume] = useState(null)
  const [currentPath, setCurrentPath] = useState('')
  const [parentPath, setParentPath] = useState(null)
  const [entries, setEntries] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'files' | 'folders'
  const [pinnedFolders, setPinnedFolders] = useState(loadPinnedFolders)
  const [loadingVolumes, setLoadingVolumes] = useState(true)
  const [loadingDir, setLoadingDir] = useState(false)
  const [mountingShare, setMountingShare] = useState('')
  const [error, setError] = useState(null)
  const [selectedPaths, setSelectedPaths] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // File preview / edit state
  const [preview, setPreview] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [uploadingDrive, setUploadingDrive] = useState(false)
  const [imageFallback, setImageFallback] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // New file
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState(null) // { x, y, entry }
  const touchStartRef = useRef(null)
  const touchTimerRef = useRef(null)

  // Rename
  const [renaming, setRenaming] = useState(null) // entry being renamed
  const [renameValue, setRenameValue] = useState('')

  // Move / copy
  const [transferDialog, setTransferDialog] = useState(null) // { mode, entry, path, parent, entries }
  const [loadingTransferDir, setLoadingTransferDir] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState(null)

  const dirty = fileContent !== savedContent
  const previewExt = (preview?.path || preview?.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
  const previewIsVideo = ['.mp4','.mov','.webm','.mkv','.avi','.wmv','.flv','.m4v','.3gp','.ogv','.mts','.m2ts','.ts'].includes(previewExt)
  const currentFolderPinned = pinnedFolders.some(folder => folder.path === currentPath)

  const filteredEntries = useMemo(() => {
    let result = entries
    if (!showHidden) {
      result = result.filter(e => !e.name.startsWith('.'))
    }
    if (filterMode === 'files') {
      result = result.filter(e => e.type === 'file')
    } else if (filterMode === 'folders') {
      result = result.filter(e => e.type === 'directory')
    }
    if (!searchQuery) return result
    const q = searchQuery.toLowerCase()
    return result.filter(e => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery, filterMode, showHidden])
  const selectedEntries = useMemo(
    () => entries.filter(entry => selectedPaths.includes(entry.path)),
    [entries, selectedPaths],
  )
  const visibleSelectablePaths = filteredEntries.map(entry => entry.path)
  const allVisibleSelected = visibleSelectablePaths.length > 0 && visibleSelectablePaths.every(path => selectedPaths.includes(path))

  useEffect(() => { loadVolumes(); loadRemoteShares() }, [])
  useEffect(() => { if (currentPath) loadDirectory(currentPath) }, [currentPath, showHidden])

  // Load pinned folders from backend
  useEffect(() => {
    fetch('/api/files/files/pinned', { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setPinnedFolders(data.map(item => ({
            name: item.name || folderLabel(item.path || ''),
            path: item.path,
            type: item.type === 'file' ? 'file' : 'directory',
          })).filter(item => item.path))
        }
      })
      .catch(() => {})
  }, [token])

  // Sync pinned folders to backend on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PINNED_FOLDERS_KEY, JSON.stringify(pinnedFolders))
    }
    fetch('/api/files/files/pinned', {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ folders: pinnedFolders }),
    }).catch(() => {})
  }, [pinnedFolders])

  function showToast(message, type = 'info') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadVolumes() {
    setLoadingVolumes(true)
    try {
      const r = await fetch('/api/files/files/volumes', { headers: authHeaders(token) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot load volumes')
      setVolumes(data)
      if (data.length > 0) {
        const vol = data[0]
        setActiveVolume(vol)
        setCurrentPath(vol.path)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingVolumes(false)
    }
  }

  async function loadRemoteShares() {
    try {
      const r = await fetch('/api/files/files/remote-shares', { headers: authHeaders(token) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot load remote shares')
      setRemoteShares(data || [])
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function mountRemoteShare(share) {
    if (!share?.id || mountingShare) return
    setMountingShare(share.id)
    try {
      const r = await fetch('/api/files/files/mount', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: share.id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || 'Mount failed')
      showToast(data.message || `Đã mount ${share.name}`, 'ok')
      await loadRemoteShares()
      await loadVolumes()
      if (data.path) navigateTo(data.path)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setMountingShare('')
    }
  }

  async function loadDirectory(path) {
    setLoadingDir(true)
    setError(null)
    setPreview(null)
    try {
      const r = await fetch(`/api/files/files/list?path=${encodeURIComponent(path)}&showHidden=${showHidden}`, {
        headers: authHeaders(token),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot list directory')
      setEntries(data.entries || [])
      setParentPath(data.parent)
      setSelectedPaths([])
    } catch (err) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoadingDir(false)
    }
  }

  function navigateTo(path) {
    const matchingVolume = volumes
      .filter(vol => path === vol.path || path.startsWith(`${vol.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]
    if (matchingVolume) setActiveVolume(matchingVolume)
    setPreview(null)
    setFileContent('')
    setSavedContent('')
    setMediaError('')
    setImageFallback(false)
    setSelectedPaths([])
    setCurrentPath(path)
  }

  function toggleSelectEntry(entry, event) {
    event.stopPropagation()
    setSelectedPaths(paths => (
      paths.includes(entry.path)
        ? paths.filter(path => path !== entry.path)
        : [...paths, entry.path]
    ))
  }

  function toggleSelectAllVisible() {
    setSelectedPaths(paths => {
      if (allVisibleSelected) return paths.filter(path => !visibleSelectablePaths.includes(path))
      return Array.from(new Set([...paths, ...visibleSelectablePaths]))
    })
  }

  function clearSelection() {
    setSelectedPaths([])
  }

  function navigateBreadcrumb(path) {
    navigateTo(path)
  }

  function togglePinnedFolder() {
    if (!currentPath) return
    if (currentFolderPinned) {
      setPinnedFolders(items => items.filter(item => item.path !== currentPath))
      showToast('Đã bỏ ghim thư mục', 'info')
      return
    }
    setPinnedFolders(items => [{ name: folderLabel(currentPath), path: currentPath, type: 'directory' }, ...items.filter(item => item.path !== currentPath)].slice(0, 24))
    showToast('Đã ghim thư mục', 'ok')
  }

  function isEntryPinned(entry) {
    return pinnedFolders.some(item => item.path === entry.path)
  }

  function togglePinEntry(entry) {
    if (!entry?.path) return
    if (isEntryPinned(entry)) {
      setPinnedFolders(items => items.filter(item => item.path !== entry.path))
      showToast(entry.type === 'directory' ? 'Đã bỏ ghim thư mục' : 'Đã bỏ ghim file', 'info')
      return
    }
    setPinnedFolders(items => [
      { name: entry.name || folderLabel(entry.path), path: entry.path, type: entry.type === 'directory' ? 'directory' : 'file' },
      ...items.filter(item => item.path !== entry.path),
    ].slice(0, 24))
    showToast(entry.type === 'directory' ? 'Đã ghim thư mục' : 'Đã ghim file', 'ok')
  }

  function openPinnedItem(item) {
    if (item.type === 'directory') {
      navigateTo(item.path)
      return
    }
    const ext = item.name?.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
    openFile({
      path: item.path,
      name: item.name,
      type: 'file',
      extension: ext,
      readable: true,
      size: 0,
    })
  }

  function removePinnedFolder(path, event) {
    event.stopPropagation()
    setPinnedFolders(items => items.filter(item => item.path !== path))
  }

  async function openFile(entry) {
    if (entry.type === 'directory') {
      navigateTo(entry.path)
      return
    }

    const ext = (entry.extension || entry.name?.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
    if (IMAGE_EXTS.includes(ext) || VIDEO_EXTS.includes(ext) || AUDIO_EXTS.includes(ext) || PDF_EXTS.includes(ext)) {
      setPreview({
        path: entry.path,
        name: entry.name,
        size: entry.size,
        is_binary: true,
        language: ext.replace('.', ''),
      })
      setFileContent('')
      setSavedContent('')
      setMediaError('')
      setImageFallback(false)
      return
    }

    if (OFFICE_PREVIEW_EXTS.includes(ext)) {
      setLoadingFile(true)
      setPreview(null)
      setMediaError('')
      try {
        const r = await fetch(`/api/files/files/office-preview?path=${encodeURIComponent(entry.path)}`, {
          headers: authHeaders(token),
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || 'Cannot preview office file')
        setPreview({
          ...data,
          is_binary: true,
          language: ext.replace('.', ''),
        })
        setFileContent('')
        setSavedContent('')
        setMediaError('')
        setImageFallback(false)
      } catch (err) {
        showToast(err.message, 'error')
      } finally {
        setLoadingFile(false)
      }
      return
    }

    if (!entry.readable) {
      showToast('File cannot be read', 'error')
      return
    }

    setLoadingFile(true)
    setPreview(null)
    setMediaError('')
    try {
      const r = await fetch(`/api/files/files/file?path=${encodeURIComponent(entry.path)}`, {
        headers: authHeaders(token),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot open file')
      setPreview(data)
      setFileContent(data.content || '')
      setSavedContent(data.content || '')
      setImageFallback(false)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingFile(false)
    }
  }

  async function saveFile() {
    if (!preview || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/files/files/file', {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: preview.path, content: fileContent }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot save file')
      setSavedContent(fileContent)
      showToast('File saved', 'ok')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function exportPdf() {
    if (!preview || exportingPdf) return
    const downloadWindow = window.open('about:blank', '_blank')
    setExportingPdf(true)
    try {
      const r = await fetch('/api/files/files/export-pdf', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: preview.path,
          content: preview.is_binary ? undefined : fileContent,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || 'Cannot export PDF')
      showToast('Đã lưu PDF', 'ok')
      if (currentPath) {
        const listRes = await fetch(`/api/files/files/list?path=${encodeURIComponent(currentPath)}&showHidden=${showHidden}`, {
          headers: authHeaders(token),
        })
        const listData = await listRes.json().catch(() => ({}))
        if (listRes.ok) setEntries(listData.entries || [])
      }
      if (data.path) {
        const downloadUrl = `/api/files/files/download?path=${encodeURIComponent(data.path)}${token ? `&t=${encodeURIComponent(token)}` : ''}`
        if (downloadWindow) {
          downloadWindow.location.href = downloadUrl
        } else {
          await downloadFile(data.path, data.path.split('/').pop() || 'file.pdf')
        }
      } else if (downloadWindow) {
        downloadWindow.close()
      }
    } catch (err) {
      if (downloadWindow) downloadWindow.close()
      showToast(err.message, 'error')
    } finally {
      setExportingPdf(false)
    }
  }

  function confirmDelete(entry) {
    setDeleteConfirm(entry)
  }

  async function executeDelete() {
    if (!deleteConfirm || deleting) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/files/files/file?path=${encodeURIComponent(deleteConfirm.path)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot delete')
      showToast(`Moved to Trash: ${deleteConfirm.name}`, 'ok')
      const deletedPath = deleteConfirm.path
      setDeleteConfirm(null)
      setEntries(items => items.filter(item => item.path !== deletedPath))
      if (preview?.path === deletedPath) {
        setPreview(null)
        setFileContent('')
        setSavedContent('')
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function createFolder() {
    if (!newFolderName.trim() || creatingFolder) return
    setCreatingFolder(true)
    try {
      const folderPath = currentPath + '/' + newFolderName.trim()
      const r = await fetch('/api/files/files/mkdir', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot create folder')
      showToast(`Created: ${newFolderName.trim()}`, 'ok')
      setShowNewFolder(false)
      setNewFolderName('')
      loadDirectory(currentPath)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCreatingFolder(false)
    }
  }

  async function createFile() {
    if (!newFileName.trim() || creatingFile) return
    setCreatingFile(true)
    try {
      const filePath = currentPath + '/' + newFileName.trim()
      const r = await fetch('/api/files/files/file', {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '' }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot create file')
      showToast(`Created: ${newFileName.trim()}`, 'ok')
      setShowNewFile(false)
      setNewFileName('')
      loadDirectory(currentPath)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCreatingFile(false)
    }
  }

  function closePreview() {
    setPreview(null)
    setFileContent('')
    setSavedContent('')
  }

  async function downloadFile(filePath, fileName) {
    try {
      const r = await fetch(`/api/files/files/download?path=${encodeURIComponent(filePath)}`, {
        headers: authHeaders(token),
      })
      if (!r.ok) throw new Error('Download failed')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(`Downloaded: ${fileName}`, 'ok')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function downloadSelectedFiles() {
    const files = selectedEntries.filter(entry => entry.type === 'file')
    if (files.length === 0) {
      showToast('Chọn ít nhất 1 file để tải', 'info')
      return
    }
    for (const entry of files) {
      await downloadFile(entry.path, entry.name)
    }
  }

  async function uploadSelectedToDrive() {
    if (selectedEntries.length === 0 || uploadingDrive) return
    setUploadingDrive(true)
    try {
      let okCount = 0
      for (const entry of selectedEntries) {
        const r = await fetch('/api/drive/upload-path', {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: entry.path }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.detail || `Upload thất bại: ${entry.name}`)
        okCount += 1
      }
      showToast(`Đã upload Drive ${okCount} mục`, 'ok')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setUploadingDrive(false)
    }
  }

  async function deleteSelectedEntries() {
    if (selectedEntries.length === 0 || bulkDeleting) return
    const ok = window.confirm(`Chuyển ${selectedEntries.length} mục đã chọn vào thùng rác?`)
    if (!ok) return
    setBulkDeleting(true)
    try {
      const deleted = []
      const failed = []
      for (const entry of selectedEntries) {
        try {
          const r = await fetch(`/api/files/files/file?path=${encodeURIComponent(entry.path)}`, {
            method: 'DELETE',
            headers: authHeaders(token),
          })
          const data = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(data.detail || `Không xóa được: ${entry.name}`)
          deleted.push(entry.path)
        } catch (err) {
          failed.push(`${entry.name}: ${err.message}`)
        }
      }
      setEntries(items => items.filter(item => !deleted.includes(item.path)))
      setSelectedPaths(paths => paths.filter(path => !deleted.includes(path)))
      if (preview?.path && deleted.includes(preview.path)) {
        setPreview(null)
        setFileContent('')
        setSavedContent('')
      }
      if (failed.length) {
        showToast(`Đã xóa ${deleted.length} mục, lỗi ${failed.length}: ${failed[0]}`, deleted.length ? 'info' : 'error')
      } else {
        showToast(`Đã chuyển ${deleted.length} mục vào thùng rác`, 'ok')
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBulkDeleting(false)
    }
  }

  function getContextMenuPosition(e, entry) {
    const menuWidth = 292
    const menuHeight = entry ? 360 : 96
    const margin = 10
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0
    const x = Math.min(e.clientX, Math.max(margin, viewportWidth - menuWidth - margin))
    const y = Math.min(e.clientY, Math.max(margin, viewportHeight - menuHeight - margin))
    return { x, y, entry }
  }

  function handleContextMenu(e, entry) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(getContextMenuPosition(e, entry))
  }

  function handleTouchStart(e, entry) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    touchTimerRef.current = setTimeout(() => {
      const touchEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
      })
      setContextMenu(getContextMenuPosition(touchEvent, entry))
    }, 500)
  }

  function handleTouchEnd() {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
    touchStartRef.current = null
  }

  function handleTouchMove(e) {
    if (!touchStartRef.current || !touchTimerRef.current) return
    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y)
    if (dx > 10 || dy > 10) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  // Close context menu on click outside, scroll, or navigate
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    window.addEventListener('click', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [contextMenu])

  async function renameFile(entry, newName) {
    if (!newName.trim() || newName === entry.name) {
      setRenaming(null)
      return
    }
    try {
      const r = await fetch('/api/files/files/rename', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, new_name: newName.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot rename')
      showToast(`Renamed to: ${newName.trim()}`, 'ok')
      setRenaming(null)
      setContextMenu(null)
      loadDirectory(currentPath)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function openTransferDialog(mode, entry) {
    const initialPath = currentPath || activeVolume?.path || volumes[0]?.path || ''
    setTransferDialog({ mode, entry, path: initialPath, parent: null, entries: [] })
    if (initialPath) await loadTransferDirectory(initialPath, mode, entry)
  }

  async function loadTransferDirectory(path, mode = transferDialog?.mode, entry = transferDialog?.entry) {
    if (!path) return
    setLoadingTransferDir(true)
    try {
      const r = await fetch(`/api/files/files/list?path=${encodeURIComponent(path)}&showHidden=false`, {
        headers: authHeaders(token),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Cannot list directory')
      setTransferDialog({
        mode,
        entry,
        path,
        parent: data.parent,
        entries: (data.entries || []).filter(item => item.type === 'directory'),
      })
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingTransferDir(false)
    }
  }

  async function runTransfer() {
    if (!transferDialog?.entry || !transferDialog?.path || transferring) return
    const { mode, entry, path } = transferDialog
    const destination = `${path.replace(/\/$/, '')}/${entry.name}`
    setTransferring(true)
    setTransferProgress({ progress: 0, copied_bytes: 0, total_bytes: entry.size || 0, status: 'queued' })
    try {
      const r = await fetch('/api/files/files/transfer', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, source: entry.path, destination }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || `Cannot ${mode}`)
      const jobId = data.id
      if (!jobId) throw new Error('Transfer did not start')
      while (true) {
        const statusRes = await fetch(`/api/files/files/transfer/${jobId}`, {
          headers: authHeaders(token),
        })
        const status = await statusRes.json()
        if (!statusRes.ok) throw new Error(status.detail || 'Cannot read transfer progress')
        setTransferProgress(status)
        if (status.status === 'completed') break
        if (status.status === 'failed') throw new Error(status.error || 'Transfer failed')
        await new Promise(resolve => setTimeout(resolve, 350))
      }
      showToast(mode === 'move' ? `Đã di chuyển: ${entry.name}` : `Đã sao chép: ${entry.name}`, 'ok')
      setTransferDialog(null)
      if (mode === 'move' && preview?.path === entry.path) closePreview()
      loadDirectory(currentPath)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setTransferring(false)
      setTransferProgress(null)
    }
  }

  async function uploadPathToDrive(path) {
    if (!path || uploadingDrive) return
    setUploadingDrive(true)
    try {
      const r = await fetch('/api/drive/upload-path', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || 'Upload Google Drive thất bại')
      if (data.type === 'folder') {
        showToast(`Đã upload Drive: ${data.folder?.name || folderLabel(path)} (${data.file_count || 0} file, ${data.folder_count || 0} thư mục)`, 'ok')
      } else {
        showToast(`Đã upload Drive: ${data.file?.name || folderLabel(path)}`, 'ok')
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setUploadingDrive(false)
    }
  }

  return (
    <div className="hagent-files-light flex h-full min-h-0 bg-white text-gray-950">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-2 text-[12px] font-medium shadow-lg ${
          toast.type === 'error' ? 'bg-red-600 text-white' :
          toast.type === 'ok' ? 'bg-emerald-600 text-white' :
          'bg-slate-700 text-slate-100'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-lg border border-slate-700 bg-[#1a1f33] p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-slate-100">Chuyển vào thùng rác</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">"{deleteConfirm.name}" sẽ được chuyển vào thùng rác.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="h-8 rounded-lg border border-slate-600 px-3 text-[11px] text-slate-300 hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Chuyển
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[150px] rounded-md border border-slate-700 bg-[#1a1f33] py-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {!contextMenu.entry ? (
            /* Empty area — create new */
            <>
              <button
                onClick={() => { closeContextMenu(); setShowNewFile(true); setShowNewFolder(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <FileText className="h-3.5 w-3.5 text-sky-400" />
                File mới
              </button>
              <button
                onClick={() => { closeContextMenu(); setShowNewFolder(true); setShowNewFile(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Folder className="h-3.5 w-3.5 text-amber-400" />
                Thư mục mới
              </button>
            </>
          ) : contextMenu.entry.type === 'directory' ? (
            <>
              <button
                onClick={() => { closeContextMenu(); navigateTo(contextMenu.entry.path) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Folder className="h-3.5 w-3.5 text-amber-400" />
                Mở thư mục
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { closeContextMenu(); openFile(contextMenu.entry) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <FileText className="h-3.5 w-3.5 text-sky-400" />
                Mở file
              </button>
              {['.mp4','.mov','.webm','.mkv','.avi','.wmv','.flv','.m4v','.3gp','.ogv','.mts','.m2ts','.ts'].includes(contextMenu.entry.extension) && (
                <button
                  onClick={() => {
                    const entry = contextMenu.entry
                    closeContextMenu()
                    const url = `/api/files/files/media?path=${encodeURIComponent(entry.path)}&t=${encodeURIComponent(token || '')}`
                    window.open(url, '_blank')
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
                >
                  <Video className="h-3.5 w-3.5 text-blue-400" />
                  Mở video
                </button>
              )}
              <button
                onClick={() => { closeContextMenu(); downloadFile(contextMenu.entry.path, contextMenu.entry.name) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Download className="h-3.5 w-3.5 text-cyan-400" />
                Tải xuống
              </button>
            </>
          )}
          {contextMenu.entry && (
            <>
              <div className="mx-2 my-1 border-t border-slate-700" />
              <button
                onClick={() => {
                  const entry = contextMenu.entry
                  closeContextMenu()
                  togglePinEntry(entry)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                {isEntryPinned(contextMenu.entry) ? (
                  <PinOff className="h-3.5 w-3.5 text-amber-300" />
                ) : (
                  <Pin className="h-3.5 w-3.5 text-cyan-300" />
                )}
                {isEntryPinned(contextMenu.entry) ? 'Bỏ ghim' : 'Ghim'}
              </button>
              <button
                onClick={() => {
                  const entry = contextMenu.entry
                  closeContextMenu()
                  setRenaming(entry)
                  setRenameValue(entry.name)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Đổi tên
              </button>
              <button
                onClick={() => {
                  const entry = contextMenu.entry
                  closeContextMenu()
                  openTransferDialog('move', entry)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <ChevronRight className="h-3.5 w-3.5 text-amber-300" />
                Di chuyển...
              </button>
              <button
                onClick={() => {
                  const entry = contextMenu.entry
                  closeContextMenu()
                  openTransferDialog('copy', entry)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Copy className="h-3.5 w-3.5 text-cyan-300" />
                Sao chép...
              </button>
              <button
                onClick={() => { const e = contextMenu.entry; closeContextMenu(); confirmDelete(e) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-red-300 hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Chuyển vào thùng rác
              </button>
              <div className="mx-2 my-1 border-t border-slate-700" />
              <button
                onClick={() => { uploadPathToDrive(contextMenu.entry.path); closeContextMenu() }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Upload className="h-3.5 w-3.5 text-emerald-400" />
                Up Google Drive
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.entry.path)
                  closeContextMenu()
                  showToast('Path copied', 'ok')
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700/60"
              >
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                Sao chép đường dẫn
              </button>
            </>
          )}
        </div>
      )}

      {/* Move / copy destination picker */}
      {transferDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => !transferring && setTransferDialog(null)}>
          <div className="w-[min(720px,calc(100vw-2rem))] max-w-full overflow-hidden rounded-xl border border-slate-700 bg-[#121728] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="min-w-0 pr-3">
                <div className="truncate text-sm font-medium text-slate-100">
                  {transferDialog.mode === 'move' ? 'Di chuyển' : 'Sao chép'} “{transferDialog.entry.name}”
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{transferDialog.path}</div>
              </div>
              <button onClick={() => setTransferDialog(null)} disabled={transferring} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-w-0 grid-cols-[180px_minmax(0,1fr)]">
              <div className="border-r border-slate-800 p-2">
                <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Ổ đĩa</div>
                <div className="space-y-0.5">
                  {volumes.map(volume => (
                    <button
                      key={volume.path}
                      onClick={() => loadTransferDirectory(volume.path)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${
                        transferDialog.path === volume.path
                          ? 'bg-cyan-500/15 text-cyan-200'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <HardDrive className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{volume.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-[280px] min-w-0">
                <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                  <button
                    onClick={() => transferDialog.parent && loadTransferDirectory(transferDialog.parent)}
                    disabled={!transferDialog.parent || loadingTransferDir}
                    className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Lên
                  </button>
                  <div className="truncate text-[11px] text-slate-500">{transferDialog.path}</div>
                </div>

                <div className="max-h-[240px] overflow-y-auto p-2">
                  {loadingTransferDir ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang tải...
                    </div>
                  ) : transferDialog.entries.length === 0 ? (
                    <div className="py-10 text-center text-[11px] text-slate-500">Không có thư mục con</div>
                  ) : (
                    transferDialog.entries.map(entry => (
                      <button
                        key={entry.path}
                        onClick={() => loadTransferDirectory(entry.path)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
              {transferring && transferProgress && (
                <div className="mr-auto min-w-0">
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span>{transferProgress.progress ?? 0}%</span>
                    <span className="text-slate-500">
                      {formatSize(transferProgress.copied_bytes || 0)} / {formatSize(transferProgress.total_bytes || 0)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${transferProgress.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}
              <button onClick={() => setTransferDialog(null)} disabled={transferring} className="rounded-md px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40">
                Hủy
              </button>
              <button
                onClick={runTransfer}
                disabled={transferring || !transferDialog.path}
                className="flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                {transferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {transferDialog.mode === 'move' ? 'Di chuyển vào đây' : 'Sao chép vào đây'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar — Volumes */}
      <aside onContextMenu={e => { e.preventDefault(); closeContextMenu() }} className="hidden w-48 shrink-0 select-none border-r border-slate-800 bg-[#121728] md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-3">
          <HardDrive className="h-4 w-4 text-cyan-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-100">Ổ đĩa</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          {loadingVolumes ? (
            <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tải ổ đĩa...
            </div>
          ) : (
            <>
              {volumes.map(vol => (
                <button
                  key={vol.path}
                  onClick={() => { setActiveVolume(vol); navigateTo(vol.path) }}
                  className={`volume-item ${volumeColorClass(vol)} flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all ${
                    activeVolume?.path === vol.path
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'text-slate-100 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  {vol.type === 'home' ? (
                    <Home className="volume-icon h-4 w-4 shrink-0 text-cyan-400" />
                  ) : vol.type === 'remote' ? (
                    <Server className="volume-icon h-4 w-4 shrink-0 text-purple-400" />
                  ) : (
                    <HardDrive className="volume-icon h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="volume-name truncate font-semibold">{vol.name}</div>
                    <div className="volume-meta mt-0.5 text-[9px] text-slate-400">
                      {vol.type === 'remote' && vol.remote_info ? (
                        <span title={`${vol.remote_info.fstype}://${vol.remote_info.host}/${vol.remote_info.share}`}>
                          {vol.remote_info.host}
                        </span>
                      ) : null}
                    </div>
                    {volumeCapacityLabel(vol) && (
                      <div className="volume-capacity mt-0.5 truncate text-[9px] text-slate-400">
                        {volumeCapacityLabel(vol)}
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {remoteShares.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                      <Server className="h-3 w-3" />
                      Kết nối
                    </div>
                    <button
                      onClick={loadRemoteShares}
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      title="Làm mới trạng thái mount"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {remoteShares.map(share => (
                      <button
                        key={share.id}
                        onClick={() => share.mounted ? navigateTo(share.mount_path) : mountRemoteShare(share)}
                        disabled={!!mountingShare && mountingShare !== share.id}
                        className={`share-item ${shareColorClass(share)} flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all disabled:opacity-50 ${
                          currentPath === share.mount_path || currentPath.startsWith(`${share.mount_path}/`)
                            ? 'bg-cyan-500/15 text-cyan-100'
                            : share.mounted
                              ? 'text-emerald-100 hover:bg-slate-800/70'
                              : 'text-slate-100 hover:bg-slate-800/70 hover:text-white'
                        }`}
                        title={`${share.host}/${share.share}`}
                      >
                        {mountingShare === share.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" />
                        ) : (
                          <Server className={`share-icon h-4 w-4 shrink-0 ${share.mounted ? 'text-emerald-400' : 'text-purple-400'}`} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="share-name truncate font-semibold">{share.name}</div>
                          <div className="share-meta mt-0.5 truncate text-[9px] text-slate-400">
                            {share.mounted ? share.mount_path : 'Bấm để mount'}
                          </div>
                        </div>
                        {share.mounted ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pinnedFolders.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    <Pin className="h-3 w-3" />
                    Đã ghim
                  </div>
                  <div className="space-y-1">
                    {pinnedFolders.map(item => {
                      const isFile = item.type === 'file'
                      const ext = isFile ? (item.name?.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '') : ''
                      const active = isFile ? preview?.path === item.path : currentPath === item.path
                      return (
                      <button
                        key={item.path}
                        onClick={() => openPinnedItem(item)}
                        className={`group/pin flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all ${
                          active
                            ? 'bg-cyan-500/15 text-cyan-100'
                            : 'text-slate-100 hover:bg-slate-800/70 hover:text-white'
                        }`}
                        title={item.path}
                      >
                        {isFile
                          ? fileIcon({ type: 'file', extension: ext })
                          : <Folder className="h-4 w-4 shrink-0 text-amber-400" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{item.name}</div>
                          <div className="mt-0.5 truncate text-[9px] text-slate-400">{item.path}</div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={event => removePinnedFolder(item.path, event)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') removePinnedFolder(item.path, event)
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition-all hover:bg-slate-800 hover:text-slate-100 group-hover/pin:opacity-100"
                          title="Bỏ ghim"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main area */}
      <main onContextMenu={e => { e.preventDefault(); closeContextMenu() }} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-[#0b1020] px-3">
          <button
            onClick={() => setActiveTab('local')}
            className={`file-source-tab file-source-local flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-all ${activeTab === 'local' ? 'is-active' : ''}`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            Mac mini
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`file-source-tab file-source-drive flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-all ${activeTab === 'drive' ? 'is-active' : ''}`}
          >
            <Cloud className="h-3.5 w-3.5" />
            Google Drive
          </button>
        </div>
        {activeTab === 'drive' ? (
          <DriveFilesPanel token={token} />
        ) : (
        <>
        {/* Mobile volume selector */}
        <div className="flex flex-col border-b border-slate-800 bg-[#121728] md:hidden">
          <div className="flex h-9 items-center gap-2 px-3">
            <HardDrive className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <select
              value={activeVolume?.path || ''}
              onChange={e => {
                const vol = volumes.find(v => v.path === e.target.value)
                if (vol) { setActiveVolume(vol); navigateTo(vol.path) }
              }}
              className="h-7 flex-1 rounded-lg border border-slate-700 bg-[#0b1020] px-2 text-[10px] text-slate-200 outline-none"
            >
              {volumes.map(vol => (
                <option key={vol.path} value={vol.path}>{vol.name}</option>
              ))}
            </select>
          </div>
          {remoteShares.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
              <button
                onClick={loadRemoteShares}
                className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                title="Làm mới trạng thái mount"
              >
                <RefreshCw className="h-3 w-3" />
                Kết nối
              </button>
              {remoteShares.map(share => {
                const isActiveShare = !!share.mount_path && (currentPath === share.mount_path || currentPath.startsWith(`${share.mount_path}/`))
                return (
                  <button
                    key={share.id}
                    onClick={() => share.mounted ? navigateTo(share.mount_path) : mountRemoteShare(share)}
                    disabled={!!mountingShare && mountingShare !== share.id}
                    className={`flex h-6 max-w-[150px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[10px] transition-all disabled:opacity-50 ${
                      isActiveShare
                        ? 'bg-cyan-500/15 text-cyan-200'
                        : share.mounted
                          ? 'text-emerald-200 hover:bg-slate-800'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                    title={share.mounted ? share.mount_path : `${share.host}/${share.share}`}
                  >
                    {mountingShare === share.id ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    ) : share.mounted ? (
                      <Check className="h-3 w-3 shrink-0" />
                    ) : (
                      <Plus className="h-3 w-3 shrink-0" />
                    )}
                    <Server className="h-3 w-3 shrink-0" />
                    <span className="truncate">{share.name}</span>
                  </button>
                )
              })}
            </div>
          )}
          {pinnedFolders.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
              <Pin className="h-3 w-3 shrink-0 text-cyan-400" />
              {pinnedFolders.map(item => {
                const isFile = item.type === 'file'
                const active = isFile ? preview?.path === item.path : currentPath === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => openPinnedItem(item)}
                    className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] transition-all ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-200'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                    title={item.path}
                  >
                    {isFile ? <FileText className="h-3 w-3 shrink-0 text-sky-400" /> : <Folder className="h-3 w-3 shrink-0 text-amber-400" />}
                    {item.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#121728] px-3">
          {/* Nav buttons */}
          <button
            onClick={() => parentPath && navigateTo(parentPath)}
            disabled={!parentPath}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-800 disabled:opacity-30"
            title="Thư mục cha"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-800"
            title="Làm mới"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDir ? 'animate-spin' : ''}`} />
          </button>
          {activeVolume && (
            <span className={`current-volume-pill ${volumeColorClass(activeVolume)} flex h-7 max-w-[150px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold`}>
              {activeVolume.type === 'home' ? <Home className="volume-icon h-3.5 w-3.5 shrink-0" /> : activeVolume.type === 'remote' ? <Server className="volume-icon h-3.5 w-3.5 shrink-0" /> : <HardDrive className="volume-icon h-3.5 w-3.5 shrink-0" />}
              <span className="volume-name truncate">{activeVolume.name}</span>
            </span>
          )}

          {/* Breadcrumb */}
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
            {breadcrumbParts(currentPath).map((part, i, arr) => (
              <span key={part.path} className="flex shrink-0 items-center gap-0.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
                <button
                  onClick={() => navigateBreadcrumb(part.path)}
                  className={`rounded px-1.5 py-0.5 text-[10px] leading-4 transition-all ${
                    i === arr.length - 1
                      ? 'text-cyan-200'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {part.name}
                </button>
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={togglePinnedFolder}
              disabled={!currentPath}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all disabled:opacity-30 ${
                currentFolderPinned
                  ? 'bg-cyan-500/15 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
              title={currentFolderPinned ? 'Bỏ ghim thư mục này' : 'Ghim thư mục này'}
            >
              {currentFolderPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <div className="mx-1 h-5 w-px bg-slate-700" />
            {(['all', 'files', 'folders']).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-medium uppercase tracking-wider transition-all ${
                  filterMode === mode
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              title={mode === 'all' ? 'Hiện tất cả' : mode === 'files' ? 'Chỉ file' : 'Chỉ thư mục'}
              >
                {mode === 'all' ? <span className="text-[10px] font-bold">A</span> : mode === 'files' ? <File className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-slate-700" />
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold hover:bg-slate-800 ${
                showHidden ? 'text-cyan-300 bg-cyan-500/10' : 'text-slate-400'
              }`}
              title={showHidden ? 'Ẩn file ẩn' : 'Hiện file ẩn'}
            >
              {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showHidden ? 'File ẩn: Bật' : 'File ẩn: Tắt'}</span>
            </button>
            <button
              onClick={() => { setShowNewFolder(true); setShowNewFile(false) }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              title="Thư mục mới"
            >
              <Folder className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setShowNewFile(true); setShowNewFolder(false) }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              title="File mới"
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => uploadPathToDrive(currentPath)}
              disabled={!currentPath || uploadingDrive}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
              title="Up thư mục hiện tại lên Google Drive"
            >
              {uploadingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {selectedEntries.length > 0 && (
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#fff7ed] px-3 text-[11px]">
            <span className="font-semibold text-orange-700">{selectedEntries.length} mục đã chọn</span>
            <button
              onClick={downloadSelectedFiles}
              className="flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 font-medium text-blue-700 hover:bg-blue-100"
            >
              <Download className="h-3.5 w-3.5" />
              Tải file
            </button>
            <button
              onClick={uploadSelectedToDrive}
              disabled={uploadingDrive}
              className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {uploadingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Up Drive
            </button>
            <button
              onClick={deleteSelectedEntries}
              disabled={bulkDeleting}
              className="flex h-7 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Xóa
            </button>
            <button onClick={clearSelection} className="ml-auto h-7 rounded-md px-2 font-medium text-slate-500 hover:bg-white hover:text-slate-900">
              Bỏ chọn
            </button>
          </div>
        )}

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 border-b border-slate-800 bg-[#1a1f33] px-3 py-2">
            <Folder className="h-4 w-4 shrink-0 text-amber-400" />
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
              placeholder="Tên thư mục..."
              className="h-7 flex-1 rounded-lg border border-slate-600 bg-[#0b1020] px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-500"
            />
            <button
              onClick={createFolder}
              disabled={!newFolderName.trim() || creatingFolder}
              className="flex h-7 items-center gap-1 rounded-lg bg-cyan-600 px-2 text-[10px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Tạo
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* New file input */}
        {showNewFile && (
          <div className="flex items-center gap-2 border-b border-slate-800 bg-[#1a1f33] px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-sky-400" />
            <input
              autoFocus
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFile(); if (e.key === 'Escape') { setShowNewFile(false); setNewFileName('') } }}
              placeholder="Tên file (ví dụ notes.md)..."
              className="h-7 flex-1 rounded-lg border border-slate-600 bg-[#0b1020] px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-500"
            />
            <button
              onClick={createFile}
              disabled={!newFileName.trim() || creatingFile}
              className="flex h-7 items-center gap-1 rounded-lg bg-cyan-600 px-2 text-[10px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              {creatingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Tạo
            </button>
            <button
              onClick={() => { setShowNewFile(false); setNewFileName('') }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Search bar */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0f1320] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Lọc file..."
            className="h-full flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 border-b border-red-800 bg-red-900/30 px-3 py-1.5 text-[11px] text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => { loadDirectory(currentPath); setError(null) }} className="text-red-300 underline hover:text-red-200">Thử lại</button>
          </div>
        )}

        {/* Content area */}
        <div
          className={`min-h-0 flex-1 overflow-hidden ${preview ? 'flex md:grid' : 'flex'}`}
          style={preview ? {
            gridTemplateColumns: preview.is_binary
              ? 'minmax(240px, 18%) minmax(0, 82%)'
              : 'minmax(180px, 12%) minmax(0, 88%)'
          } : undefined}
        >
          {/* File grid */}
          <div className={`min-h-0 min-w-0 select-none flex-col border-slate-800 ${preview ? 'hidden border-r md:flex' : 'flex flex-1'}`}>
            {/* Column headers */}
            <div className="flex h-7 shrink-0 items-center border-b border-slate-800 bg-[#121728] px-3 text-[9px] font-medium uppercase tracking-wider text-slate-500">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="mr-2 h-3.5 w-3.5 shrink-0 accent-orange-600"
                title={allVisibleSelected ? 'Bỏ chọn các mục đang thấy' : 'Chọn các mục đang thấy'}
              />
              <span className="min-w-0 flex-1">Tên</span>
              {!preview && <span className="w-20 shrink-0 text-right">Cỡ</span>}
              {!preview && <span className="w-24 shrink-0 text-right">Sửa lúc</span>}
            </div>

            {/* Files */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar"
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu(getContextMenuPosition(e, null))
              }}
            >
              {loadingDir ? (
                <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải...
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Folder className="mb-2 h-8 w-8 text-slate-700" />
                  <p className="text-[11px] text-slate-500">
                    {searchQuery ? 'Không có file phù hợp' : 'Thư mục này đang trống'}
                  </p>
                </div>
              ) : (
                filteredEntries.map(entry => (
                  <div
                    key={entry.path}
                    className={`group/row flex h-8 min-w-0 cursor-pointer items-center border-b border-slate-800/50 px-3 text-[11px] transition-all hover:bg-slate-800/50 ${entry.is_gitignored ? 'opacity-40' : ''} ${
                      selectedPaths.includes(entry.path) ? 'bg-orange-500/10' : preview?.path === entry.path ? 'bg-cyan-500/10' : ''
                    }`}
                    onClick={() => { closeContextMenu(); openFile(entry) }}
                    onContextMenu={e => handleContextMenu(e, entry)}
                    onTouchStart={e => handleTouchStart(e, entry)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPaths.includes(entry.path)}
                        onChange={event => toggleSelectEntry(entry, event)}
                        onClick={event => event.stopPropagation()}
                        className="h-3.5 w-3.5 shrink-0 accent-orange-600"
                        title="Chọn mục này"
                      />
                      {fileIcon(entry)}
                      {renaming?.path === entry.path ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => renameFile(entry, renameValue)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameFile(entry, renameValue)
                            if (e.key === 'Escape') { setRenaming(null); setRenameValue('') }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="h-6 flex-1 rounded border border-cyan-600 bg-[#0b1020] px-1.5 text-[11px] text-slate-200 outline-none"
                        />
                      ) : (
                        <span className={`truncate text-slate-200 ${fileNameClass(entry)}`} title={entry.name}>{entry.name}</span>
                      )}
                      {entry.type === 'symlink' && <span className="text-[8px] text-cyan-500">↗</span>}
                    </div>
                    {!preview && (
                      <span className="w-20 shrink-0 text-right text-[10px] text-slate-500">
                        {entry.type === 'directory' ? '—' : formatSize(entry.size)}
                      </span>
                    )}
                    {!preview && (
                      <span className="w-24 shrink-0 text-right text-[10px] text-slate-500">
                        {formatDate(entry.mtime)}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); confirmDelete(entry) }}
                      className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-600 opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover/row:opacity-100"
                      title="Move to Trash"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Status bar */}
            <div className="flex h-6 shrink-0 items-center border-t border-slate-800 bg-[#121728] px-3 text-[9px] text-slate-500">
              <span>{filteredEntries.length} mục</span>
              {filterMode !== 'all' && (
                <span className="ml-2 text-[9px] text-cyan-500/70">{filterMode === 'files' ? '📄' : '📁'} {filterMode}</span>
              )}
              {searchQuery && filteredEntries.length !== entries.length && (
                <span className="ml-2">(lọc từ {entries.length})</span>
              )}
            </div>
          </div>

          {/* Preview / Editor pane */}
          {preview && (
            <div className="flex min-h-0 min-w-0 flex-1 select-text flex-col overflow-hidden">
              <div className="flex h-9 shrink-0 select-none items-center justify-between border-b border-slate-800 bg-[#121728] px-3">
                <div className="flex min-w-0 items-center gap-2">
                  {preview.is_binary ? (
                    fileIcon({ type: 'file', extension: '.' + (preview.language || '') })
                  ) : (
                    <FileCode2 className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="truncate text-[12px] font-medium text-slate-200">{preview.name}</span>
                  <span className="shrink-0 text-[9px] text-slate-500">
                    {(preview.language || 'txt').toUpperCase()} · {formatSize(preview.size)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => downloadFile(preview.path, preview.name)}
                    className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    title="Download file"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button
                    onClick={exportPdf}
                    disabled={exportingPdf || (preview.is_binary && !['doc', 'docx'].includes(preview.language || ''))}
                    className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
                    title="Lưu thành PDF"
                  >
                    {exportingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    PDF
                  </button>
                  {!preview.is_binary && (
                    <button
                      onClick={saveFile}
                      disabled={!dirty || saving}
                      className={`flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-all ${
                        dirty
                          ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                          : 'text-slate-500'
                      } disabled:opacity-40`}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Lưu
                    </button>
                  )}
                  <button
                    onClick={closePreview}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
                {loadingFile ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang mở file...
                  </div>
                ) : preview.is_binary ? (
                  (() => {
                    const ext = (preview.path || preview.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
                    const mediaUrl = `/api/files/files/media?path=${encodeURIComponent(preview.path)}${token ? `&t=${encodeURIComponent(token)}` : ''}`
                    const imagePreviewUrl = `/api/files/files/image-preview?path=${encodeURIComponent(preview.path)}${token ? `&t=${encodeURIComponent(token)}` : ''}`
                    if (IMAGE_EXTS.includes(ext)) {
                      const imageUrl = BROWSER_IMAGE_EXTS.includes(ext) ? mediaUrl : imagePreviewUrl
                      return (
                        <div className="file-media-preview flex h-full items-center justify-center bg-[#0a0e1a] p-2 md:p-4">
                          {imageFallback ? (
                            <div className="flex flex-col items-center justify-center gap-3 text-center">
                              <Image className="h-10 w-10 text-slate-600" />
                              <p className="text-[12px] text-slate-400">Không hiển thị được ảnh trong panel.</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => window.open(imagePreviewUrl, '_blank', 'noopener,noreferrer')}
                                  className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-200 hover:bg-slate-800"
                                >
                                  Mở preview
                                </button>
                                <button
                                  onClick={() => window.open(mediaUrl, '_blank', 'noopener,noreferrer')}
                                  className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-200 hover:bg-slate-800"
                                >
                                  Mở file gốc
                                </button>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={imageUrl}
                              alt={preview.name}
                              className="block h-auto max-h-full w-auto max-w-full rounded-md object-contain md:rounded-lg"
                              onError={() => {
                                setMediaError('Không tải được ảnh preview.')
                                setImageFallback(true)
                              }}
                            />
                          )}
                        </div>
                      )
                    } else if (PDF_EXTS.includes(ext)) {
                      return (
                        <div className="h-full w-full bg-[#0a0e1a] p-2">
                          <iframe
                            src={mediaUrl}
                            title={preview.name}
                            className="h-full w-full rounded-lg border border-slate-800 bg-white"
                          />
                        </div>
                      )
                    } else if (VIDEO_EXTS.includes(ext)) {
                      return (
                        <div className="relative flex h-full w-full items-center justify-center bg-black p-3">
                          {mediaError ? (
                            <div className="max-w-sm rounded-xl border border-slate-700 bg-slate-950/90 p-4 text-center">
                              <Video className="mx-auto mb-3 h-10 w-10 text-blue-300" />
                              <p className="text-[12px] font-medium text-slate-100">Chrome không phát được video này trong preview.</p>
                              <p className="mt-1 text-[10px] leading-4 text-slate-400">Một số file MOV dùng codec iPhone/QuickTime mà trình duyệt không decode trực tiếp.</p>
                              <div className="mt-4 flex justify-center gap-2">
                                <a href={mediaUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-700">
                                  Mở tab
                                </a>
                                <button onClick={() => downloadFile(preview.path, preview.name)} className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-700">
                                  Tải
                                </button>
                              </div>
                            </div>
                          ) : (
                            <video
                              src={mediaUrl}
                              controls
                              autoPlay
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full rounded-lg object-contain"
                              onError={() => setMediaError('Không phát được video trong preview.')}
                            />
                          )}
                          {!mediaError && <div className="absolute bottom-4 right-4 flex gap-2">
                            <a href={mediaUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-800">
                              Mở
                            </a>
                            <button onClick={() => downloadFile(preview.path, preview.name)} className="rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-800">
                              Tải
                            </button>
                          </div>}
                        </div>
                      )
                    } else if (AUDIO_EXTS.includes(ext)) {
                      return (
                        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                          <Music className="mb-1 h-16 w-16 text-slate-600" />
                          <p className="text-[13px] font-medium text-slate-400">{preview.name}</p>
                          <audio src={mediaUrl} controls className="w-4/5 max-w-sm" />
                          <p className="text-[10px] text-slate-500">{formatSize(preview.size)}</p>
                        </div>
                      )
                    } else if (preview.kind === 'docx') {
                      return (
                        <div className="h-full overflow-auto overscroll-contain bg-[#0b1020] p-5 custom-scrollbar">
                          <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                            {(preview.paragraphs || []).length === 0 ? (
                              <p className="text-[12px] text-slate-500">Không có nội dung văn bản để hiển thị.</p>
                            ) : (
                              (preview.paragraphs || []).map((paragraph, index) => (
                                <p key={index} className="text-[13px] leading-6 text-slate-200">
                                  {paragraph}
                                </p>
                              ))
                            )}
                            {preview.truncated && (
                              <p className="border-t border-slate-800 pt-3 text-[11px] text-amber-300">Đã rút gọn nội dung để xem nhanh.</p>
                            )}
                          </div>
                        </div>
                      )
                    } else if (preview.kind === 'pptx') {
                      return (
                        <div className="h-full overflow-auto overscroll-contain bg-[#0b1020] p-5 custom-scrollbar">
                          <div className="mx-auto max-w-4xl space-y-4">
                            {(preview.slides || []).map((slide) => (
                              <section key={slide.index} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">Slide {slide.index}</div>
                                <div className="space-y-2">
                                  {(slide.texts || []).length === 0 ? (
                                    <p className="text-[12px] text-slate-500">Không có text trong slide này.</p>
                                  ) : (
                                    (slide.texts || []).map((text, index) => (
                                      <p key={index} className="text-[13px] leading-6 text-slate-200">{text}</p>
                                    ))
                                  )}
                                </div>
                              </section>
                            ))}
                            {preview.truncated && (
                              <p className="text-[11px] text-amber-300">Đã rút gọn số slide để xem nhanh.</p>
                            )}
                          </div>
                        </div>
                      )
                    } else if (preview.kind === 'xlsx') {
                      return (
                        <div className="h-full overflow-auto overscroll-contain bg-[#0b1020] p-4 custom-scrollbar">
                          <div className="space-y-4">
                            {(preview.sheets || []).map((sheet) => (
                              <section key={sheet.name} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
                                <div className="border-b border-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                                  {sheet.name}
                                </div>
                                <div className="overflow-auto">
                                  <table className="min-w-full text-left text-[12px] text-slate-200">
                                    <tbody>
                                      {(sheet.rows || []).map((row, rowIndex) => (
                                        <tr key={rowIndex} className="border-b border-slate-900 last:border-b-0">
                                          {row.map((cell, cellIndex) => (
                                            <td key={cellIndex} className="max-w-[260px] border-r border-slate-900 px-3 py-2 align-top text-slate-300 last:border-r-0">
                                              <div className="whitespace-pre-wrap break-words">{cell || '\u00A0'}</div>
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </section>
                            ))}
                            {preview.truncated && (
                              <p className="text-[11px] text-amber-300">Đã rút gọn số sheet hoặc số dòng để xem nhanh.</p>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <File className="mb-3 h-12 w-12 text-slate-700" />
                        <p className="text-[12px] font-medium text-slate-400">Không xem trước được file này</p>
                        <p className="mt-1 text-[10px] text-slate-500">Trình duyệt không hiển thị được file nhị phân.</p>
                        <button
                          onClick={() => downloadFile(preview.path, preview.name)}
                          className="mt-4 flex h-8 items-center gap-1.5 rounded-lg border border-slate-600 px-4 text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Tải file
                        </button>
                      </div>
                    )
                  })()
                ) : (
                  <CodeEditor
                    value={fileContent}
                    onChange={value => setFileContent(value)}
                    filename={preview.name}
                  />
                )}
              </div>

              {dirty && !preview.is_binary && (
                <div className="flex h-6 shrink-0 items-center border-t border-cyan-800 bg-cyan-900/30 px-3 text-[9px] text-cyan-300">
                  Chưa lưu
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </main>
    </div>
  )
}
