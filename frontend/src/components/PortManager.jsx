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

const isSystemPort = (item) =>
  SYSTEM_PORTS.has(Number(item.port)) ||
  SYSTEM_USERS.has(item.user) ||
  SYSTEM_COMMANDS.has(item.command)

export default function PortManager({ token }) {
  const [ports, setPorts] = useState([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [killingPid, setKillingPid] = useState(null)
  const [scannedAt, setScannedAt] = useState(null)

  const fetchPorts = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/services/ports', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không tải được danh sách port')
      setPorts(Array.isArray(data.ports) ? data.ports : [])
      setScannedAt(data.scannedAt)
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
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không dừng được process')
      await fetchPorts()
    } catch (err) {
      setError(err.message)
    } finally {
      setKillingPid(null)
    }
  }

  const tabs = [
    { key: 'all', label: 'Tất cả', count: ports.length },
    { key: 'system', label: 'Hệ thống', count: groupedPorts.system.length },
    { key: 'apps', label: 'Ứng dụng', count: groupedPorts.apps.length },
  ]

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-8 sm:py-6 pb-safe">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Ports Mac Mini</h1>
                <p className="text-xs font-bold text-gray-500">
                  {ports.length} port đang listen
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
                placeholder="Tìm port..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-gray-400 sm:w-72"
              />
            </div>
            <button
              onClick={fetchPorts}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-[11px] font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Tabs: Hệ thống / Ứng dụng */}
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:flex-none sm:px-4 ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              {label}
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-[88px_92px_minmax(0,1fr)_minmax(0,1.7fr)_112px] border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-[10px] font-semibold text-gray-500 max-lg:hidden">
            <div>Port</div>
            <div>PID</div>
            <div>Chương trình</div>
            <div>Thư mục</div>
            <div className="text-right">Action</div>
          </div>

          {loading && ports.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm font-bold text-gray-500">
              Đang quét port...
            </div>
          ) : displayPorts.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm font-bold text-gray-500">
              Không có port phù hợp.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayPorts.map((item) => (
                <div
                  key={`${item.pid}-${item.fd}-${item.port}`}
                  className="grid gap-3 px-3 py-4 transition hover:bg-gray-50 sm:px-4 lg:grid-cols-[88px_92px_minmax(0,1fr)_minmax(0,1.7fr)_112px] lg:items-center"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-14 items-center justify-center rounded-md bg-emerald-50 px-2 text-xs font-semibold text-emerald-700">
                      :{item.port}
                    </span>
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
                      className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-red-100 bg-red-50 px-1.5 text-[8px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Dừng process bằng SIGTERM"
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
