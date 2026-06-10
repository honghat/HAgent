import { useEffect, useState, useCallback } from 'react'
import { Loader2, Power, PowerOff, RefreshCw, RotateCw, Zap } from 'lucide-react'

const REFRESH_MS = 5000

const STATUS_STYLE = {
  online: 'bg-emerald-100 text-emerald-700',
  stopped: 'bg-gray-200 text-gray-600',
  stopping: 'bg-amber-100 text-amber-700',
  launching: 'bg-blue-100 text-blue-700',
  'waiting restart': 'bg-amber-100 text-amber-700',
  errored: 'bg-red-100 text-red-700',
  'one-launch-status': 'bg-blue-100 text-blue-700',
}

function fmtMem(b) {
  if (!b) return '—'
  const mb = b / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb.toFixed(0)}M`
}

function fmtUptime(ms) {
  if (!ms) return '—'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function ServicesPanel({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState({})

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/services/pm2', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const services = d.services || []
      setItems(services)
      setError('')
      return services
    } catch (e) {
      setError(e.message || 'Lỗi tải')
      return null
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    refresh()
    const t = setInterval(() => { if (!document.hidden) refresh() }, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const act = async (name, verb) => {
    if (verb === 'force-stop') {
      const ok = window.confirm(`Tắt mạnh ${name}? PM2 sẽ stop rồi kill PID còn sót.`)
      if (!ok) return
    }
    setBusy(b => ({ ...b, [name]: verb }))
    try {
      setNotice('')
      const r = await fetch(`/api/services/pm2/${verb}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.ok === false) throw new Error(d.message || d.detail || `HTTP ${r.status}`)
      const services = await refresh()
      const latest = services?.find(item => item.name === name)
      if (verb === 'stop' && latest && latest.status !== 'stopped') {
        setError(`${name} chưa tắt hẳn (${latest.status}). Dùng Tắt mạnh nếu cần.`)
      } else if (verb === 'force-stop') {
        setNotice(d.message || `Đã tắt mạnh ${name}`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(b => { const n = { ...b }; delete n[name]; return n })
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Đang tải...</div>

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Dịch vụ PM2</h3>
          <p className="text-xs text-gray-500">Bật/tắt các service nền. Tắt cái không cần để tiết kiệm RAM.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Tải lại
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-red-50 text-xs text-red-700">{error}</div>
      )}
      {notice && (
        <div className="p-2 rounded bg-emerald-50 text-xs text-emerald-700">{notice}</div>
      )}

      <ul className="divide-y divide-gray-100 rounded border border-gray-200">
        {items.map(s => {
          const isStopped = s.status === 'stopped' || s.status === 'errored'
          const isBusy = !!busy[s.name]
          const busyVerb = busy[s.name]
          const style = STATUS_STYLE[s.status] || 'bg-gray-100 text-gray-600'
          return (
            <li key={s.name} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style}`}>
                    {s.status}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 flex gap-3">
                  <span>{fmtMem(s.memory)}</span>
                  <span>{s.cpu}% CPU</span>
                  <span>up {fmtUptime(s.uptime)}</span>
                  {s.restarts > 0 && <span className="text-amber-600">↺ {s.restarts}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => act(s.name, 'restart')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                  title="Restart"
                >
                  {busyVerb === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                </button>
                {!isStopped && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => act(s.name, 'force-stop')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                    title="Tắt mạnh: stop PM2 rồi kill PID còn sót"
                    aria-label={`Tắt mạnh ${s.name}`}
                  >
                    {busyVerb === 'force-stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => act(s.name, isStopped ? 'start' : 'stop')}
                  className={`inline-flex h-8 min-w-[64px] items-center justify-center gap-1.5 rounded px-2.5 text-[11px] font-medium disabled:opacity-50 ${
                    isStopped
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  {isBusy && busyVerb !== 'force-stop' && busyVerb !== 'restart' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isStopped ? (
                    <Power className="h-3.5 w-3.5" />
                  ) : (
                    <PowerOff className="h-3.5 w-3.5" />
                  )}
                  {isBusy && busyVerb !== 'force-stop' && busyVerb !== 'restart' ? '...' : isStopped ? 'Bật' : 'Tắt'}
                </button>
              </div>
            </li>
          )
        })}
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">Không có service nào</li>
        )}
      </ul>
    </section>
  )
}
