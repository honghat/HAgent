import { useState, useEffect, useMemo } from 'react'
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

const PINNED_FOLDERS_KEY = 'hagent_pinned_folders'

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
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
  if (entry.type === 'directory') return <Folder className="h-4 w-4 text-amber-400" />
  if (entry.type === 'symlink') return <ExternalLink className="h-4 w-4 text-cyan-400" />
  const ext = entry.extension?.toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext)) return <Image className="h-4 w-4 text-pink-400" />
  if (['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg'].includes(ext)) return <Music className="h-4 w-4 text-purple-400" />
  if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) return <Video className="h-4 w-4 text-blue-400" />
  if (['.zip', '.gz', '.tar', '.rar', '.7z', '.bz2'].includes(ext)) return <Archive className="h-4 w-4 text-orange-400" />
  if (['.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.c', '.cpp'].includes(ext)) return <FileCode2 className="h-4 w-4 text-emerald-400" />
  if (['.txt', '.md', '.json', '.yml', '.yaml', '.toml', '.csv', '.xml'].includes(ext)) return <FileText className="h-4 w-4 text-sky-400" />
  return <File className="h-4 w-4 text-slate-400" />
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
      .map(item => ({ name: item.name || folderLabel(item.path), path: item.path }))
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

  // File preview / edit state
  const [preview, setPreview] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [uploadingDrive, setUploadingDrive] = useState(false)

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

  useEffect(() => { loadVolumes(); loadRemoteShares() }, [])
  useEffect(() => { if (currentPath) loadDirectory(currentPath) }, [currentPath, showHidden])

  // Load pinned folders from backend
  useEffect(() => {
    fetch('/api/files/files/pinned', { headers: authHeaders(token) })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setPinnedFolders(data)
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
    setCurrentPath(path)
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
    setPinnedFolders(items => [{ name: folderLabel(currentPath), path: currentPath }, ...items.filter(item => item.path !== currentPath)].slice(0, 24))
    showToast('Đã ghim thư mục', 'ok')
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
    if (!entry.readable) {
      showToast('File cannot be read', 'error')
      return
    }
    // Video files — open in new tab (inline preview not working)
    const vidExts = ['.mp4','.mov','.webm','.mkv','.avi','.wmv','.flv','.m4v','.3gp','.ogv','.mts','.m2ts','.ts']
    if (vidExts.includes(entry.extension)) {
      const url = `/api/files/files/media?path=${encodeURIComponent(entry.path)}&t=${encodeURIComponent(token || '')}`
      window.open(url, '_blank')
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
      setDeleteConfirm(null)
      setPreview(null)
      loadDirectory(currentPath)
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

  function handleContextMenu(e, entry) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
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
    <div className="flex h-full min-h-0 bg-[#0f1320] text-slate-100 select-none">
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
      <aside onContextMenu={e => { e.preventDefault(); closeContextMenu() }} className="hidden w-48 shrink-0 border-r border-slate-800 bg-[#121728] md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-3">
          <HardDrive className="h-4 w-4 text-cyan-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Ổ đĩa</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          {loadingVolumes ? (
            <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tải ổ đĩa...
            </div>
          ) : (
            <>
              {volumes.map(vol => (
                <button
                  key={vol.path}
                  onClick={() => { setActiveVolume(vol); navigateTo(vol.path) }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all ${
                    activeVolume?.path === vol.path
                      ? 'bg-cyan-500/15 text-cyan-200'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  {vol.type === 'home' ? (
                    <Home className="h-4 w-4 shrink-0 text-cyan-400" />
                  ) : vol.type === 'remote' ? (
                    <Server className="h-4 w-4 shrink-0 text-purple-400" />
                  ) : (
                    <HardDrive className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{vol.name}</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">
                      {vol.type === 'remote' && vol.remote_info ? (
                        <span title={`${vol.remote_info.fstype}://${vol.remote_info.host}/${vol.remote_info.share}`}>
                          {vol.remote_info.host}
                        </span>
                      ) : vol.total_gb != null ? (
                        <span>{vol.free_gb} GB / {vol.total_gb} GB trống</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}

              {remoteShares.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                      <Server className="h-3 w-3" />
                      Kết nối
                    </div>
                    <button
                      onClick={loadRemoteShares}
                      className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
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
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all disabled:opacity-50 ${
                          currentPath === share.mount_path || currentPath.startsWith(`${share.mount_path}/`)
                            ? 'bg-cyan-500/15 text-cyan-200'
                            : share.mounted
                              ? 'text-emerald-200 hover:bg-slate-800/70'
                              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                        }`}
                        title={`${share.host}/${share.share}`}
                      >
                        {mountingShare === share.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" />
                        ) : (
                          <Server className={`h-4 w-4 shrink-0 ${share.mounted ? 'text-emerald-400' : 'text-purple-400'}`} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{share.name}</div>
                          <div className="mt-0.5 truncate text-[9px] text-slate-500">
                            {share.mounted ? share.mount_path : 'Bấm để mount'}
                          </div>
                        </div>
                        {share.mounted ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pinnedFolders.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                    <Pin className="h-3 w-3" />
                    Đã ghim
                  </div>
                  <div className="space-y-1">
                    {pinnedFolders.map(folder => (
                      <button
                        key={folder.path}
                        onClick={() => navigateTo(folder.path)}
                        className={`group/pin flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] leading-4 transition-all ${
                          currentPath === folder.path
                            ? 'bg-cyan-500/15 text-cyan-200'
                            : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                        }`}
                        title={folder.path}
                      >
                        <Pin className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{folder.name}</div>
                          <div className="mt-0.5 truncate text-[9px] text-slate-500">{folder.path}</div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={event => removePinnedFolder(folder.path, event)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') removePinnedFolder(folder.path, event)
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-600 opacity-0 transition-all hover:bg-slate-700 hover:text-slate-200 group-hover/pin:opacity-100"
                          title="Bỏ ghim"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main area */}
      <main onContextMenu={e => { e.preventDefault(); closeContextMenu() }} className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-[#0b1020] px-3">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-all ${activeTab === 'local' ? 'bg-slate-800 text-cyan-200' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            Mac mini
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-all ${activeTab === 'drive' ? 'bg-slate-800 text-cyan-200' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'}`}
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
          {pinnedFolders.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
              <Pin className="h-3 w-3 shrink-0 text-cyan-400" />
              {pinnedFolders.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => navigateTo(folder.path)}
                  className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] transition-all ${
                    currentPath === folder.path
                      ? 'bg-cyan-500/15 text-cyan-200'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {folder.name}
                </button>
              ))}
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
          className={`min-h-0 flex-1 ${preview ? 'grid' : 'flex'}`}
          style={preview ? { gridTemplateColumns: 'minmax(260px, 18%) minmax(0, 82%)' } : undefined}
        >
          {/* File grid */}
          <div className={`flex min-w-0 flex-col border-slate-800 ${preview ? 'border-r' : 'flex-1'}`}>
            {/* Column headers */}
            <div className="flex h-7 shrink-0 items-center border-b border-slate-800 bg-[#121728] px-3 text-[9px] font-medium uppercase tracking-wider text-slate-500">
              <span className="min-w-0 flex-1">Tên</span>
              {!preview && <span className="w-20 shrink-0 text-right">Cỡ</span>}
              {!preview && <span className="w-24 shrink-0 text-right">Sửa lúc</span>}
            </div>

            {/* Files */}
            <div
              className="min-h-0 flex-1 overflow-y-auto custom-scrollbar"
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ x: e.clientX, y: e.clientY, entry: null })
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
                    className={`group/row flex h-8 min-w-0 cursor-pointer items-center border-b border-slate-800/50 px-3 text-[11px] transition-all hover:bg-slate-800/50 ${
                      preview?.path === entry.path ? 'bg-cyan-500/10' : ''
                    }`}
                    onClick={() => { closeContextMenu(); openFile(entry) }}
                    onContextMenu={e => handleContextMenu(e, entry)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
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
                        <span className="truncate text-slate-200" title={entry.name}>{entry.name}</span>
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
            <div className="flex min-w-0 flex-col">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-[#121728] px-3">
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

              <div className="min-h-0 flex-1 overflow-hidden">
                {loadingFile ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang mở file...
                  </div>
                ) : preview.is_binary ? (
                  (() => {
                    const ext = (preview.path || preview.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
                    const imgExts = ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.tiff','.tif','.heic','.heif']
                    const vidExts = ['.mp4','.mov','.webm','.mkv','.avi','.wmv','.flv','.m4v','.3gp','.ogv','.mts','.m2ts','.ts']
                    const audExts = ['.mp3','.wav','.flac','.aac','.m4a','.ogg','.opus','.wma']
                    const mediaUrl = `/api/files/files/media?path=${encodeURIComponent(preview.path)}&t=${encodeURIComponent(token)}`
                    if (imgExts.includes(ext)) {
                      return (
                        <div className="flex h-full items-center justify-center bg-[#0a0e1a] p-4">
                          <img src={mediaUrl} alt={preview.name} className="max-h-full max-w-full rounded-lg object-contain" />
                        </div>
                      )
                    } else if (vidExts.includes(ext)) {
                      return (
                        <div className="relative flex h-full w-full items-center justify-center bg-black p-3">
                          <video
                            src={mediaUrl}
                            controls
                            autoPlay
                            muted
                            playsInline
                            preload="auto"
                            className="h-full w-full rounded-lg object-contain"
                            onError={(e) => console.error('Video error:', e.target.error)}
                          />
                          <div className="absolute bottom-4 right-4 flex gap-2">
                            <a href={mediaUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-800">
                              Mở
                            </a>
                            <button onClick={() => downloadFile(preview.path, preview.name)} className="rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] font-medium text-slate-100 hover:bg-slate-800">
                              Tải
                            </button>
                          </div>
                        </div>
                      )
                    } else if (audExts.includes(ext)) {
                      return (
                        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                          <Music className="mb-1 h-16 w-16 text-slate-600" />
                          <p className="text-[13px] font-medium text-slate-400">{preview.name}</p>
                          <audio src={mediaUrl} controls className="w-4/5 max-w-sm" />
                          <p className="text-[10px] text-slate-500">{formatSize(preview.size)}</p>
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
                  <textarea
                    value={fileContent}
                    onChange={e => setFileContent(e.target.value)}
                    spellCheck={false}
                    className="h-full w-full resize-none bg-[#0b1020] p-3 font-mono text-[12px] leading-6 text-slate-100 outline-none selection:bg-cyan-400/20"
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
