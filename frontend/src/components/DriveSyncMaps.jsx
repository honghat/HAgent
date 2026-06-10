import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HardDrive, Cloud, Play, X, RefreshCw, Check, CheckCircle2, Ban,
  ArrowRight, ArrowLeftRight, Trash2, CalendarClock, FolderInput, Pencil,
} from 'lucide-react'

const API = '/api'
const auth = t => (t ? { Authorization: `Bearer ${t}` } : {})
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

function normalizeSourcePaths(paths, fallback = '') {
  const items = Array.isArray(paths) ? paths : []
  const merged = items.length ? items : (fallback ? [fallback] : [])
  const seen = new Set()
  return merged
    .map(item => String(item || '').trim())
    .filter(item => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function sourceBasename(path) {
  return String(path || '').split('/').filter(Boolean).pop() || String(path || '')
}

function formatScheduleInterval(interval) {
  if (!interval) return 'Chưa cài đặt'
  if (interval === 'hourly') return 'Mỗi giờ'
  if (interval === 'every_2h') return 'Mỗi 2 giờ'
  if (interval === 'every_4h') return 'Mỗi 4 giờ'
  if (interval.startsWith('daily_')) {
    const hour = interval.split('_')[1]
    return `Mỗi ngày lúc ${hour}h`
  }
  if (interval.startsWith('weekly_')) {
    const parts = interval.split('_')
    const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
    const dayName = days[parseInt(parts[1], 10)] || 'Chủ nhật'
    const hour = parts[2] || '2'
    return `${dayName} lúc ${hour}h`
  }
  return interval
}

// ── Map card (1 mapping sao lưu) ─────────────────────────────────────────
function MapCard({ map, onRun, onToggle, onDelete, onRename, onEdit, onDeleteSourceToggle, running }) {
  const last = map.last_run_at ? new Date(map.last_run_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null
  const sourcePaths = normalizeSourcePaths(map.source_paths, map.source_path)
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-md ring-1 transition-all hover:shadow-lg ${
      map.enabled
        ? 'border-emerald-200/60 ring-emerald-100/50'
        : 'border-gray-200/80 ring-black/[0.03]'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${
            map.enabled
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
              : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-500'
          }`}>
            <FolderInput size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onRename(map)}
                className="min-w-0 truncate text-left text-[13.5px] font-bold text-gray-900 hover:text-blue-600 transition-colors"
                title="Bấm để đổi tên map"
              >
                {map.name}
              </button>
              <button
                type="button"
                onClick={() => onRename(map)}
                className="flex shrink-0 items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 hover:bg-blue-100 transition-all"
                title="Đổi tên map"
              >
                <Pencil size={9} />
                Đổi tên
              </button>
            </div>
            <p className="mt-0.5 truncate text-[10.5px] font-medium text-gray-400">{sourcePaths.length > 1 ? `${sourcePaths.length} thư mục nguồn` : (sourcePaths[0] || '')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            map.enabled
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {map.enabled ? '● Active' : '○ Off'}
          </span>
          <button onClick={() => onEdit(map)} className="rounded-lg p-1.5 text-gray-300 hover:bg-blue-50 hover:text-blue-600 transition-all" title="Sửa map">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(map)} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all" title="Xoá map">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Mapping nguồn → đích */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 px-3 py-2 text-[11px] border border-gray-100">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
            <HardDrive size={11} className="text-slate-600" />
          </div>
          <span className="truncate font-semibold text-gray-700">
            {sourcePaths.length > 1
              ? `${sourcePaths.length} thư mục`
              : sourceBasename(sourcePaths[0])}
          </span>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <ArrowRight size={11} className="text-blue-600" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <span className="truncate font-semibold text-gray-700">{map.dest_folder || `DiDong_Backup_${sourceBasename(sourcePaths[0]) || ''}`}</span>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-200/80">
            <Cloud size={11} className="text-blue-600" />
          </div>
        </div>
      </div>

      {sourcePaths.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {sourcePaths.map(path => {
            const mappedDest = (map.dest_folders || {})[path]
            return (
              <span key={path} className="max-w-full truncate rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 border border-slate-200/60" title={path}>
                {path} {mappedDest ? ` ➔ ${mappedDest}` : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* Gmail badges */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(map.account_emails || []).map((e, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
            <Cloud size={9} /> {e}
          </span>
        ))}
      </div>

      {/* Last run */}
      {last && (
        <div className={`mt-2.5 flex flex-wrap items-center gap-x-2 rounded-lg px-2.5 py-1.5 text-[10.5px] ${
          map.last_status === 'done' ? 'bg-emerald-50/70 text-emerald-700' : map.last_status === 'error' ? 'bg-red-50/70 text-red-600' : 'bg-gray-50 text-gray-500'
        }`}>
          <span className="font-bold">
            {map.last_status === 'done' ? '✓ Xong' : map.last_status === 'error' ? '✗ Lỗi' : map.last_status}
          </span>
          <span className="opacity-40">·</span>
          <span>{map.last_files} tải · {map.last_skipped} bỏ qua · {fmtBytes(map.last_bytes)}</span>
          <span className="opacity-40">·</span>
          <span className="opacity-70">{last}</span>
          <button
            type="button"
            onClick={() => onRun(map)}
            disabled={running}
            className="ml-auto flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm ring-1 ring-black/[0.06] hover:bg-white hover:text-blue-700 disabled:text-gray-300"
            title="Chạy lại mapping này"
          >
            <RefreshCw size={11} className={running ? 'animate-spin' : ''} />
            {running ? 'Đang chạy' : 'Chạy lại'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          onClick={() => onToggle(map)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all ${
            map.enabled
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200'
          }`}
          title={`Tự động sao lưu: ${formatScheduleInterval(map.schedule_interval)}`}
        >
          {map.enabled ? <CheckCircle2 size={13} /> : <Ban size={13} />}
          {map.enabled ? `Active · ${formatScheduleInterval(map.schedule_interval)}` : 'Ko active'}
        </button>
        <label
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all ${
            map.delete_source_after_sync
              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200'
          }`}
          title="Khi job upload thành công không lỗi, chuyển file gốc vào Trash. Nếu nguồn là thư mục thì giữ thư mục, chỉ chuyển các file bên trong."
        >
          <input
            type="checkbox"
            checked={Boolean(map.delete_source_after_sync)}
            onChange={e => onDeleteSourceToggle(map, e.target.checked)}
            className="h-3.5 w-3.5 accent-red-600"
          />
          File gốc vào Trash
        </label>
        <button
          onClick={() => onRun(map)}
          disabled={running}
          className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-800 to-gray-900 px-4 py-2 text-[11.5px] font-bold text-white hover:from-slate-700 hover:to-gray-800 disabled:from-gray-300 disabled:to-gray-300 shadow-md transition-all active:scale-95"
        >
          {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
          {running ? 'Đang chạy' : last ? 'Chạy lại' : 'Chạy ngay'}
        </button>
      </div>
    </div>
  )
}

// ── Map manager (tab Mapping) ────────────────────────────────────────────
export default function MapManager({ token, accounts, onRan, FileBrowser, DriveBrowser, RenameModal }) {
  const [maps, setMaps] = useState([])
  const [runningId, setRunningId] = useState('')
  const [editingMap, setEditingMap] = useState(null)
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [sourcePaths, setSourcePaths] = useState([])
  const [dest, setDest] = useState('')
  const [destFolders, setDestFolders] = useState({})
  const [accIds, setAccIds] = useState([])
  const [enabled, setEnabled] = useState(true)
  const [deleteSourceAfterSync, setDeleteSourceAfterSync] = useState(false)
  const [saving, setSaving] = useState(false)
  const [renameDialog, setRenameDialog] = useState(null) // { map }
  const formFlash = false
  const [uploadDropStatus, setUploadDropStatus] = useState('')
  const [scheduleInterval, setScheduleInterval] = useState('daily_2')
  const formRef = useRef(null)
  const availableAccounts = accounts.filter(account => account?.id && !account?.error)
  const mergedSourcePaths = normalizeSourcePaths(sourcePaths, source)

  const loadMaps = useCallback(async () => {
    try {
      const r = await fetch(`${API}/drive/sync/maps`, { headers: auth(token) })
      const d = await r.json()
      setMaps(d.maps || [])
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { loadMaps() }, [loadMaps])

  const resetForm = () => {
    setEditingMap(null)
    setName('')
    setSource('')
    setSourcePaths([])
    setDest('')
    setDestFolders({})
    setAccIds([])
    setEnabled(true)
    setDeleteSourceAfterSync(false)
    setScheduleInterval('daily_2')
  }

  const createMap = async ({
    sourcePath = source,
    nextSourcePaths = mergedSourcePaths,
    destFolder = dest,
    nextDestFolders = destFolders,
    accountIds = accIds,
    mapName = name,
    isEnabled = enabled,
    runNow = false,
    isTransient = false,
    schedInterval = scheduleInterval,
  } = {}) => {
    const r = await fetch(`${API}/drive/sync/maps`, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mapName,
        source_path: sourcePath,
        source_paths: nextSourcePaths,
        dest_folder: destFolder,
        dest_folders: nextDestFolders,
        account_ids: accountIds,
        enabled: isEnabled,
        delete_source_after_sync: deleteSourceAfterSync,
        run_now: runNow,
        is_transient: isTransient,
        schedule_interval: schedInterval,
      }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.detail || 'Lỗi')
    return d
  }

  const updateMap = async (mapId, {
    sourcePath = source,
    nextSourcePaths = mergedSourcePaths,
    destFolder = dest,
    nextDestFolders = destFolders,
    accountIds = accIds,
    mapName = name,
    isEnabled = enabled,
    schedInterval = scheduleInterval,
  } = {}) => {
    const r = await fetch(`${API}/drive/sync/maps/${mapId}`, {
      method: 'PUT',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mapName,
        source_path: sourcePath,
        source_paths: nextSourcePaths,
        dest_folder: destFolder,
        dest_folders: nextDestFolders,
        account_ids: accountIds,
        enabled: isEnabled,
        delete_source_after_sync: deleteSourceAfterSync,
        schedule_interval: schedInterval,
      }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.detail || 'Lỗi')
    return d
  }

  const handleSave = async () => {
    if (mergedSourcePaths.length === 0 || accIds.length === 0) return
    setSaving(true)
    try {
      if (editingMap?.id) await updateMap(editingMap.id)
      else await createMap()
      resetForm()
      await loadMaps()
    } catch (e) { alert(e.message || String(e)) } finally { setSaving(false) }
  }

  const handleLocalDropToDrive = async (localPath, target = {}) => {
    const sourcePath = String(localPath || '').trim()
    if (!sourcePath) return

    const primaryAccountId = target.accountId || accIds[0] || availableAccounts[0]?.id
    if (!primaryAccountId) return

    const srcName = sourcePath.replace(/\/+$/, '').split('/').filter(Boolean).pop() || ''

    // Điền form nháp ngầm — ko scroll, ko flash
    setSource(sourcePath)
    setSourcePaths(normalizeSourcePaths([...sourcePaths, sourcePath], source))
    setDest((target.dest !== undefined && target.dest !== null) ? target.dest : dest)
    setDestFolders(prev => ({ ...prev, [sourcePath]: (target.dest !== undefined && target.dest !== null) ? target.dest : dest }))
    setAccIds(primaryAccountId
      ? [primaryAccountId, ...accIds.filter(id => id !== primaryAccountId)]
      : accIds)

    // Tạo map transient rồi chạy ngầm → job sync hiện thanh tiến độ ở đầu trang
    setSaving(true)
    setUploadDropStatus(`Đang tải ${srcName} lên Drive...`)
    try {
      await createMap({
        sourcePath,
        nextSourcePaths: [sourcePath],
        destFolder: target.dest ?? dest,
        nextDestFolders: { [sourcePath]: target.dest ?? dest },
        accountIds: [primaryAccountId],
        mapName: `Kéo thả: ${srcName}`,
        isEnabled: true,
        runNow: true,
        isTransient: true,
      })
      onRan?.()
      setUploadDropStatus(`Đã upload ${srcName} ✓`)
      setTimeout(() => setUploadDropStatus(''), 3000)
    } catch (e) {
      setUploadDropStatus(`Upload thất bại: ${e.message}`)
      setTimeout(() => setUploadDropStatus(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  const handleRun = async (map) => {
    setRunningId(map.id)
    try {
      const r = await fetch(`${API}/drive/sync/maps/${map.id}/run`, { method: 'POST', headers: auth(token) })
      if (!r.ok) { const d = await r.json(); alert(d.detail || 'Lỗi'); return }
      onRan?.()
    } catch (e) { alert(String(e)) } finally { setRunningId('') }
  }

  const handleToggle = async (map) => {
    await fetch(`${API}/drive/sync/maps/${map.id}`, {
      method: 'PUT',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !map.enabled }),
    })
    loadMaps()
  }

  const handleDeleteSourceToggle = async (map, checked) => {
    const mapSources = normalizeSourcePaths(map.source_paths, map.source_path)
    if (checked && !window.confirm(`Sau khi map "${map.name}" tải lên Drive thành công, HAgent sẽ chuyển file gốc vào Trash cho ${mapSources.length} nguồn.\n\nBật tùy chọn này?`)) {
      return
    }
    const r = await fetch(`${API}/drive/sync/maps/${map.id}`, {
      method: 'PUT',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete_source_after_sync: checked }),
    })
    if (!r.ok) {
      const d = await r.json()
      alert(d.detail || 'Cập nhật tùy chọn Trash thất bại')
      return
    }
    loadMaps()
  }

  const handleRename = (map) => {
    setRenameDialog({ map })
  }

  const doMapRename = async (nextName) => {
    if (!renameDialog) return
    const { map } = renameDialog
    if (!nextName || nextName === map.name) { setRenameDialog(null); return }
    setRenameDialog(null)
    const r = await fetch(`${API}/drive/sync/maps/${map.id}`, {
      method: 'PUT',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName }),
    })
    if (!r.ok) {
      const d = await r.json()
      notify(d.detail || 'Đổi tên map thất bại', 'error')
      return
    }
    loadMaps()
  }

  const handleEdit = map => {
    const nextSourcePaths = normalizeSourcePaths(map.source_paths, map.source_path)
    setEditingMap(map)
    setName(map.name || '')
    setSource(nextSourcePaths[0] || '')
    setSourcePaths(nextSourcePaths)
    setDest(map.dest_folder || '')
    setDestFolders(map.dest_folders || {})
    setAccIds(Array.isArray(map.account_ids) ? map.account_ids : [])
    setEnabled(Boolean(map.enabled))
    setDeleteSourceAfterSync(Boolean(map.delete_source_after_sync))
    setScheduleInterval(map.schedule_interval || 'daily_2')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (map) => {
    await fetch(`${API}/drive/sync/maps/${map.id}`, { method: 'DELETE', headers: auth(token) })
    if (editingMap?.id === map.id) resetForm()
    loadMaps()
  }

  const setPrimaryAcc = id => setAccIds(p => [id, ...p.filter(x => x !== id)])
  const toggleAccount = id => {
    setAccIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }
  const addCurrentSource = () => {
    const next = normalizeSourcePaths([...sourcePaths, source], '')
    setSourcePaths(next)
  }
  const removeSourcePath = path => {
    setSourcePaths(prev => prev.filter(item => item !== path))
    setDestFolders(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    if (source === path) setSource('')
  }

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div ref={formRef} className={`space-y-4 rounded-2xl border p-4 shadow-md ring-1 transition-all duration-300 ${
        formFlash
          ? 'border-blue-400 bg-blue-50/60 ring-blue-300/40'
          : 'border-gray-200/80 bg-white ring-black/[0.03]'
      }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-gray-900 text-white shadow-sm">
                <FolderInput size={15} />
              </div>
              <div>
                <h3 className="text-[13px] font-bold text-gray-900">{editingMap ? 'Sửa mapping đã lưu' : 'Tạo mapping mới'}</h3>
                {editingMap && <p className="mt-0.5 text-[10px] font-semibold text-blue-600">Đang sửa: {editingMap.name}</p>}
              </div>
            </div>
            <button onClick={resetForm} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"><X size={15} /></button>
          </div>
          <div className="grid gap-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">Tên mapping</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tên gợi nhớ (vd: Ảnh gia đình)"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-[12px] text-gray-900 outline-none focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-400/20 transition-all"
              />
            </div>
          </div>

          {/* List of mapped paths with delete buttons */}
          {mergedSourcePaths.length > 0 && (
            <div className="grid gap-3">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">Các thư mục đang chọn để đồng bộ</p>
                <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200/60 bg-gray-50/30 p-2.5">
                  {mergedSourcePaths.map(path => {
                    const mappedDest = destFolders[path]
                    return (
                      <span key={path} className="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200/60 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                        <span className="truncate">
                          {path} {mappedDest ? `➔ Drive: ${mappedDest}` : ''}
                        </span>
                        <button type="button" onClick={() => removeSourcePath(path)} className="rounded text-slate-400 hover:text-red-500 transition-colors">
                          <X size={11} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ② 2 cửa sổ: Local | Drive — kéo trái thả phải để map */}
          <div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)]">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  <HardDrive size={12} /> Local
                </p>
                <FileBrowser token={token} value={source} onChange={setSource} dragEnabled tall onDownloadStarted={onRan} />
              </div>
              <div className="hidden items-start justify-center pt-8 md:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/[0.1] bg-white text-gray-500 shadow-sm" title="Local sang Drive · Drive tải về Local">
                  <ArrowLeftRight size={17} />
                </div>
              </div>
              {/* Mobile: arrow separator */}
              <div className="flex items-center justify-center gap-2 md:hidden">
                <div className="h-px flex-1 bg-gray-200" />
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[0.1] bg-white text-gray-400 shadow-sm">
                  <ArrowLeftRight size={13} />
                </div>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  <Cloud size={12} /> Drive
                </p>
                <DriveBrowser
                  token={token}
                  accounts={accounts}
                  accountId={accIds[0] || ''}
                  onAccountChange={setPrimaryAcc}
                  onChange={setDest}
                  onLocalDrop={handleLocalDropToDrive}
                  onDownloadStarted={onRan}
                  tall
                />
              </div>
            </div>
          </div>

          {/* Chu kỳ sao lưu tự động */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">Chu kỳ sao lưu tự động</p>
            <select
              value={scheduleInterval}
              onChange={e => setScheduleInterval(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-[12px] text-gray-900 outline-none focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-400/20 transition-all"
            >
              <option value="hourly">Mỗi giờ</option>
              <option value="every_2h">Mỗi 2 giờ</option>
              <option value="every_4h">Mỗi 4 giờ</option>
              {Array.from({ length: 24 }).map((_, i) => (
                <option key={i} value={`daily_${i}`}>{`Mỗi ngày lúc ${i}h`}</option>
              ))}
              {[
                { name: 'Thứ hai', val: 0 },
                { name: 'Thứ ba', val: 1 },
                { name: 'Thứ tư', val: 2 },
                { name: 'Thứ năm', val: 3 },
                { name: 'Thứ sáu', val: 4 },
                { name: 'Thứ bảy', val: 5 },
                { name: 'Chủ nhật', val: 6 },
              ].map(d => (
                <option key={d.val} value={`weekly_${d.val}_2`}>{`Mỗi tuần (${d.name} lúc 2h)`}</option>
              ))}
            </select>
          </div>

          <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] transition-colors ${
            enabled
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border-black/[0.08] bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
            />
            <span>
              <span className="font-bold">{enabled ? 'Map đang active' : 'Map đang ko active'}</span>
              <span className="mt-0.5 block text-[10.5px] opacity-80">Bật để map này tự chạy theo chu kỳ đã chọn. Tắt thì vẫn có thể bấm chạy tay.</span>
            </span>
          </label>

          {/* Preview mapping 2 cột */}
          {mergedSourcePaths.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-gray-900/[0.03] p-3 text-[11.5px]">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <HardDrive size={14} className="shrink-0 text-gray-400" />
                <span className="truncate font-medium text-gray-700">
                  {mergedSourcePaths.length > 1 ? `${mergedSourcePaths.length} thư mục nguồn` : sourceBasename(mergedSourcePaths[0])}
                </span>
              </div>
              <ArrowRight size={14} className="shrink-0 text-gray-400" />
              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                <Cloud size={14} className="shrink-0 text-gray-400" />
                <span className="truncate font-medium text-gray-700">
                  {dest || `DiDong_Backup_${sourceBasename(mergedSourcePaths[0]) || ''}`}
                </span>
              </div>
            </div>
          )}

          <label className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] transition-colors ${
            deleteSourceAfterSync
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-black/[0.08] bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}>
            <input
              type="checkbox"
              checked={deleteSourceAfterSync}
              onChange={e => setDeleteSourceAfterSync(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-red-600"
            />
            <span>
              <span className="font-bold">Tải lên Drive xong thì chuyển file gốc vào Trash</span>
              <span className="mt-0.5 block text-[10.5px] opacity-80">Chỉ chạy khi job hoàn tất không lỗi. Nếu nguồn là thư mục thì giữ thư mục, chỉ chuyển các file bên trong vào Trash.</span>
            </span>
          </label>

          {uploadDropStatus && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-[12px] font-semibold text-blue-700">
              <RefreshCw size={13} className="animate-spin shrink-0" />
              <span className="truncate">{uploadDropStatus}</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={mergedSourcePaths.length === 0 || accIds.length === 0 || saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-800 to-gray-900 py-2.5 text-[12.5px] font-bold text-white hover:from-slate-700 hover:to-gray-800 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-400 shadow-md transition-all active:scale-[0.99]"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {editingMap ? 'Lưu map đã sửa' : 'Lưu mapping'}
          </button>
      </div>

      {/* Maps list */}
      {maps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200">
            <CalendarClock size={26} className="text-gray-400" />
          </div>
          <p className="mt-3 text-[13px] font-bold text-gray-600">Chưa có mapping nào</p>
          <p className="mt-1 text-[11px] text-gray-400">Tạo mapping để gắn thư mục với Gmail, tự động sao lưu theo chu kỳ</p>
        </div>
      ) : maps.map(m => (
        <MapCard key={m.id} map={m} running={runningId === m.id}
          onRun={handleRun} onToggle={handleToggle} onDelete={handleDelete}
          onRename={handleRename} onEdit={handleEdit} onDeleteSourceToggle={handleDeleteSourceToggle} />
      ))}
      <RenameModal
        open={!!renameDialog}
        title="Đổi tên mapping"
        label={renameDialog ? `Tên mới cho mapping "${renameDialog.map?.name}"` : ''}
        defaultValue={renameDialog?.map?.name || ''}
        onConfirm={doMapRename}
        onCancel={() => setRenameDialog(null)}
      />
    </div>
  )
}
