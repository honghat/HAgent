import { useEffect, useMemo, useState } from 'react'
import { Folder, LayoutGrid, RefreshCw, Search, Server, Square, Terminal, Zap } from 'lucide-react'

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

const PROJECT_PORTS = {
  3004: { name: 'Giao diện', service: 'hagent-frontend' },
  8006: { name: 'Học tập', service: 'hagent-learn' },
  8010: { name: 'FastAPI', service: 'hagent-fastapi' },
  20128: { name: '9Router', service: 'cx/gpt-5.5' },
}

const isSystemPort = (item) =>
  SYSTEM_PORTS.has(Number(item.port)) ||
  SYSTEM_USERS.has(item.user) ||
  SYSTEM_COMMANDS.has(item.command)

const isProjectPort = (item) => Boolean(PROJECT_PORTS[Number(item.port)])

export default function PortManager({ token }) {
  const [ports, setPorts] = useState([])
  const [remotePorts, setRemotePorts] = useState([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [killingPid, setKillingPid] = useState(null)
  const [killingRemote, setKillingRemote] = useState(null) // { host, user, pid }
  const [scannedAt, setScannedAt] = useState(null)

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
    for (const p of ports) {
      if (isSystemPort(p)) system.push(p)
      else apps.push(p)
    }
    return { system, apps }
  }, [ports])

  const displayPorts = useMemo(() => {
    let source
    if (tab === 'system') source = groupedPorts.system
    else if (tab === 'apps') source = groupedPorts.apps
    else source = ports

    return searchPorts ? searchPorts(source) : source
  }, [ports, tab, groupedPorts, searchPorts])

  const killProcess = async (item, signal = 'SIGTERM') => {
    const label = `${item.command} (PID ${item.pid}, port ${item.port})`
    if (!window.confirm(`Dừng ${label}?`)) return

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
    const label = `${item.command} (PID ${item.pid}, ${host})`
    if (!window.confirm(`Dừng ${label}?`)) return

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

  const projectPortList = Object.entries(PROJECT_PORTS).map(([port, meta]) => {
    const match = ports.find(item => Number(item.port) === Number(port))
    return { port: Number(port), ...meta, match }
  })

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

        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {projectPortList.map(({ port, name, service, match }) => (
            <div key={port} className="rounded-md border border-gray-200 bg-white px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-gray-900">{name}</div>
                  <div className="truncate text-[10px] font-semibold text-gray-400">{service}</div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${match ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  :{port}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] font-medium text-gray-500">
                {match ? `Đang chạy: ${match.command} · PID ${match.pid}` : 'Chưa lắng nghe'}
              </div>
            </div>
          ))}
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

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2 lg:hidden">
          {loading && ports.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-500">
              Đang quét cổng...
            </div>
          ) : displayPorts.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-500">
              Không có cổng phù hợp.
            </div>
          ) : (
            displayPorts.map((item) => (
              <div key={`${item.pid}-${item.fd}-${item.port}`} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">
                        :{item.port}
                      </span>
                      {isProjectPort(item) && (
                        <span className="inline-flex h-6 items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-700">
                          {PROJECT_PORTS[Number(item.port)].name}
                        </span>
                      )}
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
                  <div className="flex min-w-0 items-start gap-2 font-mono text-[10px] leading-4 text-gray-500">
                    <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="min-w-0 break-all">{item.cwd || 'Không đọc được'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-hidden rounded-md border border-gray-200 bg-white lg:block">
          <div className="grid grid-cols-[124px_72px_minmax(0,1fr)_minmax(0,1.7fr)_90px] border-b border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-medium text-gray-500 max-lg:hidden">
            <div>Port</div>
            <div>PID</div>
            <div>Chương trình</div>
            <div>Thư mục</div>
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
            <div className="divide-y divide-gray-100">
              {displayPorts.map((item) => (
                <div
                  key={`${item.pid}-${item.fd}-${item.port}`}
                  className="grid gap-2 px-3 py-2.5 transition hover:bg-gray-50 lg:grid-cols-[124px_72px_minmax(0,1fr)_minmax(0,1.7fr)_90px] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">
                      :{item.port}
                    </span>
                    {isProjectPort(item) && (
                      <span className="inline-flex h-6 min-w-0 items-center justify-center truncate rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-700" title={PROJECT_PORTS[Number(item.port)].name}>
                        {PROJECT_PORTS[Number(item.port)].name}
                      </span>
                    )}
                    <span className="text-xs font-bold text-gray-400 lg:hidden">PID {item.pid}</span>
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
                    <div className="mt-1 truncate font-mono text-xs text-gray-500">{item.name}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start gap-2 font-mono text-[10px] leading-4 font-semibold text-gray-600">
                      <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0 break-all" title={item.cwd || 'Không đọc được thư mục'}>
                        {item.cwd || 'Không đọc được'}
                      </span>
                    </div>
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
