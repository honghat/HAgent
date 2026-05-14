import { useEffect, useMemo, useState } from 'react'
import { Folder, RefreshCw, Search, Server, Square, Terminal, Zap } from 'lucide-react'

export default function PortManager({ token }) {
  const [ports, setPorts] = useState([])
  const [query, setQuery] = useState('')
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

  const filteredPorts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return ports
    return ports.filter(item => (
      String(item.port).includes(needle) ||
      String(item.pid).includes(needle) ||
      item.command?.toLowerCase().includes(needle) ||
      item.fullCommand?.toLowerCase().includes(needle) ||
      item.cwd?.toLowerCase().includes(needle) ||
      item.name?.toLowerCase().includes(needle) ||
      item.user?.toLowerCase().includes(needle)
    ))
  }, [ports, query])

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
          ) : filteredPorts.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm font-bold text-gray-500">
              Không có port phù hợp.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredPorts.map((item) => (
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
