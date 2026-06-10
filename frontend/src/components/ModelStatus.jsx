import { useCallback, useEffect, useState } from 'react'

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function statusColor(status) {
  if (status === 'ok') return 'bg-emerald-500'
  if (status === 'error') return 'bg-red-500'
  return 'bg-slate-400'
}

function QuotaBar({ used }) {
  if (used === null || used === undefined) return <span className="text-[10px] text-slate-400">—</span>
  const pct = Math.min(used, 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-slate-500">{Math.round(100 - pct)}%</span>
    </div>
  )
}

function extractErrorMessage(raw) {
  if (!raw) return ''
  try {
    const j = JSON.parse(raw)
    return j.error?.message || j.message || j.error || raw
  } catch {
    return raw
  }
}

function ProviderCard({ prov, testResult, testing, onTest }) {
  const [expanded, setExpanded] = useState(false)
  const hasUsage = prov.usage?.windows?.length > 0 || prov.usage?.details?.length > 0
  const isLocal = ['ollama', 'lmstudio', 'lmstudio_local', 'llamacpp', 'cx'].includes(prov.name)

  const errMsg = testResult ? extractErrorMessage(testResult.error) : ''
  const statusText = testResult?.ok ? `OK ${testResult.status}` : `Lỗi ${testResult?.status || ''}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-2">
        <span className={`inline-block mt-0.5 h-2 w-2 shrink-0 rounded-full ${statusColor(prov.health.status)}`} title={`Health: ${prov.health.status}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-5 text-slate-900" title={prov.label}>{prov.label}</div>
              <div className="truncate text-[10px] font-medium text-slate-400">{prov.name}</div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {!isLocal && (
                <span className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold ${prov.authenticated ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {prov.authenticated ? 'Có key' : 'Chưa có key'}
                </span>
              )}
              {isLocal && (
                <span className="whitespace-nowrap rounded-md bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">Local</span>
              )}
              {testResult && !testing && (
                <span className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold ${testResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {statusText}
                </span>
              )}
              {testing && (
                <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Đang test</span>
              )}
            </div>
          </div>

          {testResult && !testResult.ok && errMsg && (
            <div className="mt-1.5 truncate rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[10px] text-red-600" title={errMsg}>
              {errMsg}
            </div>
          )}

          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => onTest(prov.name)}
              disabled={testing}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-white disabled:opacity-50"
            >
              Test
            </button>
            {(hasUsage || prov.health.status !== 'unknown' || testResult) && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                Chi tiết
                <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 text-[10px] text-slate-500">
          {testResult && (
            <>
              <div className="flex items-center gap-2">
                <span className="font-medium">Endpoint:</span>
                <code className="truncate text-[9px] text-slate-400">{testResult.endpoint || '—'}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">HTTP:</span>
                <span className={testResult.ok ? 'text-emerald-600' : 'text-red-600'}>{testResult.status}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="font-medium">Base URL:</span>
            <code className="truncate text-[9px] text-slate-400">{prov.base_url || '—'}</code>
          </div>
          {prov.usage?.title && <div className="font-medium text-slate-500">{prov.usage.title}</div>}
          {prov.usage?.windows?.map((w, i) => (
            <div key={i} className="flex items-center justify-between">
              <span>{w.label}:</span>
              <QuotaBar used={w.used_percent} />
            </div>
          ))}
          {prov.usage?.details?.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  )
}

async function runTest(token, name, signal) {
  try {
    const res = await fetch('/api/auth/models/test', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal,
    })
    return await res.json()
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

export default function ModelStatus({ token }) {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [testResults, setTestResults] = useState({})
  const [testingSet, setTestingSet] = useState(new Set())
  const [autoRan, setAutoRan] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/auth/models/status', { headers: authHeaders(token) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProviders(data.providers || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  const testProvider = useCallback(async (name) => {
    setTestingSet(prev => new Set(prev).add(name))
    const result = await runTest(token, name)
    setTestResults(prev => ({ ...prev, [name]: result }))
    setTestingSet(prev => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }, [token])

  const testAll = useCallback(async () => {
    if (!providers.length) return
    const ac = new AbortController()
    const CONCURRENCY = 4
    const queue = providers.map(p => p.name)
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const name = queue.shift()
        if (!name) break
        await testProvider(name)
      }
    })
    await Promise.all(workers)
  }, [providers, testProvider])

  useEffect(() => {
    fetchStatus()
    const int = setInterval(() => { if (!document.hidden) fetchStatus() }, 30000)
    return () => clearInterval(int)
  }, [fetchStatus])

  useEffect(() => {
    if (providers.length > 0 && !autoRan) {
      setAutoRan(true)
      testAll()
    }
  }, [providers, autoRan, testAll])

  const filtered = providers.filter(p => {
    if (filter === 'authenticated') return p.authenticated
    if (filter === 'unauthenticated') return !p.authenticated
    if (filter === 'healthy') return p.health.status === 'ok'
    if (filter === 'error') return p.health.status === 'error'
    return true
  })

  const testSummary = (() => {
    const tested = Object.keys(testResults).length
    const ok = Object.values(testResults).filter(r => r?.ok).length
    const fail = tested - ok
    return { tested, ok, fail }
  })()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">Model providers</div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {providers.length} providers · health tự làm mới mỗi 30s
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={testAll}
              disabled={testingSet.size > 0}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm hover:border-slate-300 disabled:opacity-50"
            >
              {testingSet.size > 0 ? `Test ${testingSet.size}` : 'Test all'}
            </button>
            <button
              onClick={fetchStatus}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:border-slate-300"
              title="Làm mới"
            >
              <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'authenticated', label: 'Có key' },
            { key: 'unauthenticated', label: 'Chưa có key' },
            { key: 'healthy', label: 'OK' },
            { key: 'error', label: 'Lỗi' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                filter === f.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
          {testSummary.tested > 0 && (
            <span className="ml-auto shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
              <span className="text-emerald-600">{testSummary.ok} OK</span>
              {testSummary.fail > 0 && <> · <span className="text-red-600">{testSummary.fail} lỗi</span></>}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {loading && providers.length === 0 ? (
          <Skeleton />
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-semibold text-red-500">Lỗi</p>
              <p className="mt-1 text-[11px] text-slate-500">{error}</p>
              <button
                onClick={fetchStatus}
                className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-white"
              >
                Thử lại
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-slate-400">Không có provider nào phù hợp</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(prov => (
              <ProviderCard
                key={prov.name}
                prov={prov}
                testResult={testResults[prov.name]}
                testing={testingSet.has(prov.name)}
                onTest={testProvider}
              />
            ))}
          </div>
        )}
      </div>

      <div className="hidden shrink-0 border-t border-slate-200 px-4 py-1.5 text-[10px] text-slate-400 sm:block">
        {providers.length} providers · tự động test khi mở tab · làm mới health mỗi 30s
      </div>
    </div>
  )
}
