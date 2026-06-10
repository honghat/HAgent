import { useEffect, useMemo, useState } from 'react'
import { Check, Folder, LayoutGrid, Pencil, RefreshCw, Search, Server, Square, Terminal, Trash2, X, Zap } from 'lucide-react'

const SYSTEM_PORTS = new Set([
  22, 53, 80, 88, 123, 137, 138, 139, 445, 500,
  514, 548, 631, 4500, 5000, 5353, 5900, 7000, 3283,
])

const SYSTEM_USERS = new Set([
  '_apple_remot', '_mdnsresponder', '_timed', '_netstatistics',
  '_assetcache', '_ard', '_screensharing', '_devicemanager',
  '_appleevents', '_applepay', '_analyticsd', '_reportmemoryexception',
])

const SYSTEM_COMMANDS = new Set([
  'rapportd', 'sharingd', 'airportd', 'mDNSResponder',
  'mDNSResponderHelper', 'configd', 'nsurlsessiond',
  'sandboxd', 'sysmond', 'usbd',
])

const PORT_PROJECT = {
  3004: { project: 'HAgent', label: 'Frontend' },
  3011: { project: 'HAgent', label: 'ChatGPT2API' },
  8004: { project: 'HAgent', label: 'Google OAuth' },
  8006: { project: 'HAgent', label: 'Learn' },
  8010: { project: 'HAgent', label: 'FastAPI' },
  8888: { project: 'HAgent', label: 'SearXNG' },
  8899: { project: 'HAgent', label: 'TTV Proxy' },
  3000: { project: 'HatAI', label: 'Backend' },
  3012: { project: 'HatAI', label: 'Frontend' },
  8001: { project: 'HatAI', label: 'TTS' },
  3007: { project: 'HatTranslated', label: 'Server' },
  8007: { project: 'HatTranslated', label: 'API' },
  3014: { project: 'XiaoZhi MCPHub', label: 'Backend' },
  3015: { project: 'XiaoZhi MCPHub', label: 'Frontend' },
  5432: { project: 'Database', label: 'PostgreSQL' },
  8000: { project: 'HatAI', label: 'Vite' },
  21115: { project: 'RustDesk', label: 'HBBS' },
  21116: { project: 'RustDesk', label: 'HBBS UDP' },
  21117: { project: 'RustDesk', label: 'HBBR' },
  21118: { project: 'RustDesk', label: 'HBBR WS' },
  21119: { project: 'RustDesk', label: 'HBBR WSS' },
  5001: { project: 'TTS', label: 'Piper TTS' },
  5002: { project: 'TTS', label: 'Edge TTS' },
  20128: { project: '9Router', label: '9Router' },
  1234: { project: 'LM Studio', label: 'LM Studio' },
}

const PROJECT_COLORS = {
  HAgent:     'bg-blue-50 text-blue-700 border-blue-200',
  HatAI:      'bg-violet-50 text-violet-700 border-violet-200',
  Database:   'bg-amber-50 text-amber-700 border-amber-200',
  RustDesk:   'bg-rose-50 text-rose-700 border-rose-200',
  TTS:        'bg-teal-50 text-teal-700 border-teal-200',
  '9Router':  'bg-orange-50 text-orange-700 border-orange-200',
  'LM Studio':     'bg-emerald-50 text-emerald-700 border-emerald-200',
  HatTranslated:   'bg-pink-50 text-pink-700 border-pink-200',
  'XiaoZhi MCPHub':'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Tùy chỉnh':     'bg-slate-100 text-slate-700 border-slate-200',
}

const isSystemPort = (item) =>
  SYSTEM_PORTS.has(Number(item.port)) ||
  SYSTEM_USERS.has(item.user) ||
  SYSTEM_COMMANDS.has(item.command)

const getPortMeta = (item) => {
  if (item?.customLabel) {
    return {
      project: item.customProject || 'Tùy chỉnh',
      label: item.customLabel,
      custom: true,
    }
  }
  return PORT_PROJECT[Number(item.port)] || null
}

const getCommandPort = (item) => {
  const command = String(item?.fullCommand || item?.command || '')
  const match = command.match(/(?:--(?:listen-)?port(?:=|\s+)|-p\s+)(\d{2,5})\b/)
  if (!match) return null
  const port = Number(match[1])
  return Number.isFinite(port) ? port : null
}

const getCommandPortHint = (item) => {
  const commandPort = getCommandPort(item)
  const socketPort = Number(item?.port)
  if (!commandPort || !socketPort || commandPort === socketPort) return ''
  return `Cổng phụ cùng PID · command chính :${commandPort}`
}

function CategoryBadge({ item, size = 'md' }) {
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
  if (isSystemPort(item)) {
    return (
      <span
        className={`inline-flex items-center gap-1 truncate rounded border border-gray-300 bg-gray-100 font-medium text-gray-700 ${padding}`}
        title="Cổng hệ thống"
      >
        <span className="truncate font-bold">Hệ thống</span>
      </span>
    )
  }
  const meta = getPortMeta(item)
  if (meta) {
    const color = PROJECT_COLORS[meta.project] || 'bg-slate-100 text-slate-700'
    return (
      <span
        className={`inline-flex items-center gap-1 truncate rounded border font-medium ${padding} ${color}`}
        title={`${meta.project} · ${meta.label}`}
      >
        <span className="truncate font-bold">{meta.project}</span>
        <span className="opacity-60">·</span>
        <span className="truncate">{meta.label}</span>
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 truncate rounded border border-dashed border-gray-300 bg-white font-medium text-gray-500 ${padding}`}
      title="Không thuộc dự án đã biết"
    >
      <span className="truncate font-bold">Khác</span>
    </span>
  )
}

function PortCommandHint({ item }) {
  const hint = getCommandPortHint(item)
  if (!hint) return null
  return (
    <div className="mt-1 text-[10px] font-semibold text-amber-600">
      {hint}
    </div>
  )
}

export default function PortManager({ token }) {
  const [ports, setPorts] = useState([])
  const [remotePorts, setRemotePorts] = useState([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('apps')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [killingPid, setKillingPid] = useState(null)
  const [killingRemote, setKillingRemote] = useState(null) // { host, user, pid }
  const [scannedAt, setScannedAt] = useState(null)
  const [editingLabel, setEditingLabel] = useState(null)
  const [savingLabel, setSavingLabel] = useState(false)

  const fetchPorts = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [localRes, remoteRes] = await Promise.all([
        fetch('/api/services/ports', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/services/ports/remote', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const localData = await localRes.json()
      if (!localRes.ok || !localData.ok) throw new Error(localData.error || 'Không tải được danh sách cổng')
      setPorts(Array.isArray(localData.ports) ? localData.ports : [])
      setScannedAt(localData.scannedAt)

      const remoteData = await remoteRes.json()
      if (remoteData.ok && Array.isArray(remoteData.hosts)) {
        setRemotePorts(remoteData.hosts)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPorts()
  }, [token])

  const startEditPortLabel = (item) => {
    const meta = getPortMeta(item)
    setEditingLabel({
      port: Number(item.port),
      project: meta?.project || '',
      label: meta?.label || '',
    })
  }

  const savePortLabel = async () => {
    if (!editingLabel?.port) return
    const label = editingLabel.label.trim()
    if (!label) {
      setError('Nhập nhãn port trước khi lưu')
      return
    }
    setSavingLabel(true)
    setError('')
    try {
      const res = await fetch(`/api/services/ports/labels/${editingLabel.port}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project: editingLabel.project.trim() || 'Tùy chỉnh',
          label,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Không lưu được nhãn port')
      setEditingLabel(null)
      await fetchPorts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLabel(false)
    }
  }

  const deletePortLabel = async () => {
    if (!editingLabel?.port) return
    setSavingLabel(true)
    setError('')
    try {
      const res = await fetch(`/api/services/ports/labels/${editingLabel.port}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Không xoá được nhãn port')
      setEditingLabel(null)
      await fetchPorts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLabel(false)
    }
  }

  function PortBadge({ item, size = 'md' }) {
    const iconSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <CategoryBadge item={item} size={size} />
        <button
          type="button"
          onClick={() => startEditPortLabel(item)}
          className={`inline-flex shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-400 transition hover:border-gray-300 hover:text-gray-700 ${iconSize}`}
          title="Sửa nhãn port"
          aria-label="Sửa nhãn port"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    )
  }

  const searchPorts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return null
    return (list) =>
      list.filter(item =>
        String(item.port).includes(needle) ||
        String(item.pid).includes(needle) ||
        item.command?.toLowerCase().includes(needle) ||
        item.fullCommand?.toLowerCase().includes(needle) ||
        item.cwd?.toLowerCase().includes(needle) ||
        item.name?.toLowerCase().includes(needle) ||
        item.user?.toLowerCase().includes(needle),
      )
  }, [query])

  const groupedPorts = useMemo(() => {
    const system = []
    const apps = []
    const byProject = {}
    const other = []
    for (const p of ports) {
      if (isSystemPort(p)) { system.push(p); continue }
      apps.push(p)
      const meta = getPortMeta(p)
      if (meta) {
        if (!byProject[meta.project]) byProject[meta.project] = []
        byProject[meta.project].push({ ...p, _label: meta.label })
      } else {
        other.push(p)
      }
    }
    return { system, apps, byProject, other }
  }, [ports])

  const displayPorts = useMemo(() => {
    let source
    if (tab === 'system') source = groupedPorts.system
    else if (tab === 'apps') source = groupedPorts.apps
    else source = ports

    return searchPorts ? searchPorts(source) : source
  }, [ports, tab, groupedPorts, searchPorts])

  const displayGroups = useMemo(() => {
    if (tab === 'system') return null
    const map = new Map()
    const other = []
    for (const item of displayPorts) {
      const meta = getPortMeta(item)
      if (meta) {
        if (!map.has(meta.project)) map.set(meta.project, [])
        map.get(meta.project).push(item)
      } else {
        other.push(item)
      }
    }
    const groups = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([project, items]) => ({ project, items }))
    if (other.length) groups.push({ project: 'Khác', items: other })
    return groups
  }, [displayPorts, tab])

  const killProcess = async (item, signal = 'SIGTERM') => {
    setKillingPid(item.pid)
    setError('')
    try {
      const res = await fetch('/api/services/ports/kill', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pid: item.pid, signal }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không dừng được tiến trình')
      await fetchPorts()
    } catch (err) {
      setError(err.message)
    } finally {
      setKillingPid(null)
    }
  }

  const killRemoteProcess = async (host, user, item, signal = 'SIGTERM') => {
    setKillingRemote({ host, user, pid: item.pid })
    setError('')
    try {
      const res = await fetch('/api/services/ports/remote/kill', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ host, user, pid: item.pid, signal }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || 'Không dừng được')
      await fetchPorts()
    } catch (err) {
      setError(err.message)
    } finally {
      setKillingRemote(null)
    }
  }

  const tabs = [
    { key: 'all', label: 'Tất cả', count: ports.length },
    { key: 'system', label: 'Hệ thống', count: groupedPorts.system.length },
    { key: 'apps', label: 'Ứng dụng', count: groupedPorts.apps.length },
  ]

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5 sm:py-4 pb-safe">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-700 text-white">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900">Cổng Mac Mini</h1>
                <p className="text-[11px] font-medium text-gray-500">
                  {ports.length} cổng đang lắng nghe
                  {scannedAt ? ` · cập nhật ${new Date(scannedAt).toLocaleTimeString()}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm cổng..."
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs font-medium outline-none focus:border-gray-400 sm:w-64"
              />
            </div>
            <button
              onClick={fetchPorts}
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-slate-700 px-2.5 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-gray-100 p-1 sm:flex">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium transition sm:min-h-0 sm:flex-none sm:flex-row sm:gap-1 sm:px-3 ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="hidden h-4 w-4 sm:block" />
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold sm:ml-1 ${
                  tab === key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {editingLabel && (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-7 min-w-14 items-center justify-center rounded bg-emerald-50 px-2 text-xs font-semibold text-emerald-700">
                :{editingLabel.port}
              </span>
              <span className="text-[11px] font-semibold text-gray-500">Nhãn port</span>
            </div>
            <input
              value={editingLabel.project}
              onChange={(event) => setEditingLabel(value => ({ ...value, project: event.target.value }))}
              placeholder="Dự án"
              className="h-8 rounded-md border border-gray-200 px-2 text-xs font-medium outline-none focus:border-gray-400 sm:w-40"
            />
            <input
              value={editingLabel.label}
              onChange={(event) => setEditingLabel(value => ({ ...value, label: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePortLabel()
                if (event.key === 'Escape') setEditingLabel(null)
              }}
              placeholder="Nhãn hiển thị"
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-xs font-medium outline-none focus:border-gray-400"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={savePortLabel}
                disabled={savingLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-700 text-white transition hover:bg-slate-800 disabled:opacity-50"
                title="Lưu nhãn"
                aria-label="Lưu nhãn"
              >
                {savingLabel ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={deletePortLabel}
                disabled={savingLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                title="Xoá nhãn custom"
                aria-label="Xoá nhãn custom"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditingLabel(null)}
                disabled={savingLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
                title="Huỷ"
                aria-label="Huỷ"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className={`space-y-2 lg:hidden`}>
          {loading && ports.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-500">
              Đang quét cổng...
            </div>
          ) : displayPorts.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-500">
              Không có cổng phù hợp.
            </div>
          ) : displayGroups ? (
            displayGroups.map(({ project, items }) => (
              <div key={project} className="space-y-2">
                <div className="flex items-center gap-2 px-1 pt-1">
                  <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold ${PROJECT_COLORS[project] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {project}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400">{items.length} cổng</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                {items.map((item) => (
                  <div key={`${item.pid}-${item.fd}-${item.port}`} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">
                        :{item.port}
                      </span>
                      <PortBadge item={item} />
                      <span className="text-[10px] font-medium text-gray-400">PID {item.pid}</span>
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <Zap className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate text-xs font-semibold text-gray-800">{item.command}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => killProcess(item)}
                    disabled={killingPid === item.pid}
                    className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 text-[9px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Dừng tiến trình bằng SIGTERM"
                  >
                    <Square className="h-3 w-3" />
                    Dừng
                  </button>
                </div>

                <div className="mt-2 space-y-1">
                  <div className="flex min-w-0 items-start gap-2 font-mono text-[10px] leading-4 text-gray-500">
                    <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
                    <span className="min-w-0 break-all">{item.fullCommand || item.command}</span>
                  </div>
                  <PortCommandHint item={item} />
                </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            displayPorts.map((item) => (
              <div key={`${item.pid}-${item.fd}-${item.port}`} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">
                        :{item.port}
                      </span>
                      <PortBadge item={item} />
                      <span className="text-[10px] font-medium text-gray-400">PID {item.pid}</span>
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <Zap className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate text-xs font-semibold text-gray-800">{item.command}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => killProcess(item)}
                    disabled={killingPid === item.pid}
                    className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 text-[9px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Dừng tiến trình bằng SIGTERM"
                  >
                    <Square className="h-3 w-3" />
                    Dừng
                  </button>
                </div>
                <div className="mt-2 flex min-w-0 items-start gap-2 font-mono text-[10px] leading-4 text-gray-500">
                  <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
                  <span className="min-w-0 break-all">{item.fullCommand || item.command}</span>
                </div>
                <PortCommandHint item={item} />
              </div>
            ))
          )}
        </div>

        <div className={`overflow-hidden rounded-md border border-gray-200 bg-white hidden lg:block`}>
          <div className="grid grid-cols-[200px_72px_minmax(0,1fr)_90px] border-b border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-medium text-gray-500 max-lg:hidden">
            <div>Port · Dự án</div>
            <div>PID</div>
            <div>Chương trình</div>
            <div className="text-right">Thao tác</div>
          </div>

          {loading && ports.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm font-bold text-gray-500">
              Đang quét cổng...
            </div>
          ) : displayPorts.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm font-bold text-gray-500">
              Không có cổng phù hợp.
            </div>
          ) : (
            (displayGroups || [{ project: null, items: displayPorts }]).map(({ project, items }) => (
              <div key={project || '_flat'}>
                {project && (
                  <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-3 py-1.5">
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold ${PROJECT_COLORS[project] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {project}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400">{items.length} cổng</span>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <div
                      key={`${item.pid}-${item.fd}-${item.port}`}
                      className="grid gap-2 px-3 py-2.5 transition hover:bg-gray-50 lg:grid-cols-[200px_72px_minmax(0,1fr)_90px] lg:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">
                          :{item.port}
                        </span>
                        <PortBadge item={item} size="sm" />
                      </div>
                      <div className="hidden text-xs font-semibold text-gray-700 lg:block">{item.pid}</div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Zap className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate text-xs font-semibold text-gray-800">{item.command}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-xs text-gray-500">
                          <Terminal className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                          <span className="truncate" title={item.fullCommand}>{item.fullCommand || item.command}</span>
                        </div>
                        <PortCommandHint item={item} />
                      </div>
                      <div className="flex justify-start lg:justify-end">
                        <button
                          onClick={() => killProcess(item)}
                          disabled={killingPid === item.pid}
                          className="inline-flex h-6 items-center justify-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 text-[9px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Dừng tiến trình bằng SIGTERM"
                        >
                          <Square className="h-3 w-3" />
                          Dừng
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {remotePorts.map((remote) => (
          <div key={remote.host} className="mt-3 rounded-md border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-2.5 py-2">
              <span className="text-[11px] font-semibold text-gray-600">
                {remote.name} — {remote.host}
              </span>
              <span className="text-[10px] font-medium text-gray-400">
                {remote.ports.length} cổng
              </span>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2">
              {remote.ports.length === 0 ? (
                <div className="col-span-full rounded-md bg-gray-50 px-2.5 py-3 text-center text-[11px] font-medium text-gray-400">
                  Không quét được hoặc máy đang tắt.
                </div>
              ) : (
                remote.ports.map((item) => (
                  <div key={`${remote.host}-${item.port}-${item.pid}`} className="rounded-md bg-gray-50 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-gray-900">{item.command}</div>
                        <div className="truncate text-[10px] font-medium text-gray-500">
                          PID {item.pid}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => killRemoteProcess(remote.host, remote.user, item)}
                          disabled={killingRemote?.pid === item.pid && killingRemote?.host === remote.host}
                          className="inline-flex h-5 items-center justify-center rounded border border-red-100 bg-red-50 px-1 text-[8px] font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-40"
                        >
                          <Square className="h-2.5 w-2.5" />
                        </button>
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                          :{item.port}
                        </span>
                      </div>
                    </div>
                    {item.cwd && (
                      <div className="mt-1.5 flex items-start gap-1.5 font-mono text-[10px] text-gray-500">
                        <Folder className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                        <span className="min-w-0 break-all" title={item.cwd}>{item.cwd}</span>
                      </div>
                    )}
                    {item.fullCommand && (
                      <div className="mt-1 flex items-start gap-1.5 font-mono text-[10px] text-gray-400">
                        <Terminal className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="min-w-0 break-all" title={item.fullCommand}>{item.fullCommand}</span>
                      </div>
                    )}
                    <PortCommandHint item={item} />
                    <div className="mt-1.5 truncate font-mono text-[10px] font-medium text-gray-500">
                      {remote.host}:{item.port}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
