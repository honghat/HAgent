import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Cloud, FolderOpen, RefreshCw, X } from 'lucide-react'

const API = '/api'
const auth = token => (token ? { Authorization: `Bearer ${token}` } : {})
const notify = (message, type, duration) => {
  if (typeof window !== 'undefined' && typeof window.__hagentToast === 'function') {
    window.__hagentToast(String(message ?? ''), type, duration)
    return
  }
  window.alert(message)
}

export default function DriveMovePicker({ token, accounts, sourceItem, sourceItems = [], onMove, onClose }) {
  const sources = sourceItems.length ? sourceItems : (sourceItem ? [sourceItem] : [])
  const targetAccounts = accounts
  const [targetAccountId, setTargetAccountId] = useState(targetAccounts[0]?.id || '')
  const [stack, setStack] = useState([{ id: 'root', name: 'My Drive' }])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)
  const current = stack[stack.length - 1]
  const targetAccount = accounts.find(account => account.id === targetAccountId)

  const load = useCallback(async () => {
    if (!targetAccountId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ account_id: targetAccountId, parent_id: current.id })
      const response = await fetch(`${API}/drive/sync/drive-folders?${params}`, { headers: auth(token) })
      const data = await response.json()
      setItems(response.ok ? (data.items || []) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [token, targetAccountId, current.id])

  useEffect(() => { load() }, [load])

  const changeAccount = id => {
    setTargetAccountId(id)
    setStack([{ id: 'root', name: 'My Drive' }])
  }

  const enterFolder = folder => {
    setStack(value => [...value, { id: folder.id, name: folder.name }])
  }

  const moveHere = async () => {
    if (!targetAccountId || sources.length === 0) return
    setMoving(true)
    try {
      await onMove?.(sources, targetAccountId, current.id, current.name)
      onClose()
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="flex h-[min(680px,82vh)] w-[min(720px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border border-black/[0.12] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-500 shadow-sm">
            <ArrowRight size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-gray-900">Di chuyển mục Drive</p>
            <p className="truncate text-[10.5px] text-gray-400">
              {sources.length > 1 ? `${sources.length} mục đã chọn` : sources[0]?.name || 'Drive item'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-700">
            <X size={14} />
          </button>
        </div>

        <div className="grid shrink-0 gap-3 border-b border-black/[0.06] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Gmail đích</span>
            <select
              value={targetAccountId}
              onChange={event => changeAccount(event.target.value)}
              className="h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] font-medium text-gray-700 outline-none focus:border-blue-500"
            >
              {targetAccounts.length === 0 ? (
                <option value="">Không có Gmail khác</option>
              ) : targetAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.email}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={moveHere}
            disabled={!targetAccountId || moving}
            className="flex h-9 items-center justify-center gap-1.5 self-end rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {moving ? <RefreshCw size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Di chuyển vào đây
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-black/[0.06] bg-gray-50 px-3 py-2">
          <Cloud size={12} className="mr-1 text-blue-500" />
          <span className="max-w-[220px] truncate text-[11.5px] font-semibold text-blue-700">{targetAccount?.email || 'Chưa chọn Gmail'}</span>
          <button
            type="button"
            onClick={() => setStack(value => value.length > 1 ? value.slice(0, -1) : value)}
            disabled={stack.length <= 1}
            className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-500 hover:bg-white hover:text-gray-800 disabled:text-gray-300"
            title="Trở về thư mục mẹ"
          >
            ..
          </button>
          {stack.map((entry, index) => (
            <span key={`${entry.id}-${index}`} className="flex items-center">
              <ChevronRight size={11} className="text-gray-300" />
              <button
                type="button"
                onClick={() => setStack(value => value.slice(0, index + 1))}
                className="max-w-[130px] truncate rounded px-1.5 py-0.5 text-[11.5px] font-medium text-gray-600 hover:bg-white hover:text-gray-900"
              >
                {entry.name}
              </button>
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_31px,#f7f7f8_31px,#f7f7f8_62px)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-gray-400">
              <RefreshCw size={13} className="animate-spin" /> Đang tải thư mục...
            </div>
          ) : targetAccounts.length === 0 ? (
            <div className="px-6 py-12 text-center text-[12px] text-gray-400">Cần ít nhất hai Gmail đã OAuth để chuyển sang Gmail khác.</div>
          ) : items.filter(item => item.type === 'folder').length === 0 ? (
            <div className="px-6 py-12 text-center text-[12px] text-gray-400">Thư mục này chưa có folder con. Có thể bấm “Chuyển vào đây”.</div>
          ) : items.filter(item => item.type === 'folder').map((folder, index) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => enterFolder(folder)}
              className={`grid min-h-[31px] w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 px-3 py-1 text-left transition-colors ${index % 2 ? 'bg-gray-50/80 hover:bg-blue-50/60' : 'bg-white hover:bg-blue-50/60'}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderOpen size={15} className="shrink-0 text-blue-400" />
                <span className="truncate text-[12px] text-gray-700">{folder.name}</span>
              </span>
              <ChevronRight size={13} className="ml-auto text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
