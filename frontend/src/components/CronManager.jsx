import { useEffect, useState } from 'react'
import { Clock, Play, Pause, Trash2, Plus, RefreshCw, ChevronDown, ChevronRight, AlertCircle, Pencil } from 'lucide-react'

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function statusBadge(job) {
  if (job.state === 'paused' || !job.enabled) {
    return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Tạm dừng</span>
  }
  if (job.last_status === 'error') {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Lỗi</span>
  }
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Hoạt động</span>
}

function sourceBadge(job) {
  if (job.source === 'system') {
    return <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">Crontab</span>
  }
  if (job.source === 'workflow') {
    return <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">Workflow</span>
  }
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">HAgent</span>
}

function formatInterval(seconds) {
  const value = Number(seconds || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value % 86400 === 0) return `${value / 86400} ngày`
  if (value % 3600 === 0) return `${value / 3600} giờ`
  if (value % 60 === 0) return `${value / 60} phút`
  return `${value} giây`
}

function normalizeCronJob(job) {
  return { ...job, source: 'cron', rowId: `cron:${job.id}` }
}

function normalizeSystemJob(job) {
  return {
    ...job,
    id: `system:${job.id}`,
    rowId: `system:${job.id}`,
    source: 'system',
    prompt: job.command || '',
    state: 'active',
    enabled: true,
  }
}

const PRESETS = [
  { label: 'Mỗi 5 phút', value: '*/5 * * * *' },
  { label: 'Mỗi 15 phút', value: '*/15 * * * *' },
  { label: 'Mỗi 30 phút', value: '*/30 * * * *' },
  { label: 'Mỗi giờ', value: '0 * * * *' },
  { label: 'Mỗi 2 giờ', value: '0 */2 * * *' },
  { label: 'Mỗi 6 giờ', value: '0 */6 * * *' },
  { label: 'Hằng ngày 7h sáng', value: '0 7 * * *' },
  { label: 'Hằng ngày 9h sáng', value: '0 9 * * *' },
  { label: 'Hằng ngày 21h tối', value: '0 21 * * *' },
  { label: 'Thứ 2-6 9h sáng', value: '0 9 * * 1-5' },
  { label: 'Mỗi tuần (CN 8h)', value: '0 8 * * 0' },
  { label: 'Mỗi tháng (ngày 1)', value: '0 0 1 * *' },
]

function describeCron(expr) {
  if (!expr || typeof expr !== 'string') return ''
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return ''
  const [m, h, dom, mon, dow] = parts
  // Common patterns
  if (m === '*' && h === '*' && dom === '*' && mon === '*' && dow === '*') return 'Mỗi phút'
  const everyMin = m.match(/^\*\/(\d+)$/)
  if (everyMin && h === '*') return `Mỗi ${everyMin[1]} phút`
  const everyHour = h.match(/^\*\/(\d+)$/)
  if (m === '0' && everyHour && dom === '*' && mon === '*' && dow === '*') return `Mỗi ${everyHour[1]} giờ`
  if (m === '0' && h === '*' && dom === '*' && mon === '*' && dow === '*') return 'Mỗi giờ'
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && dow === '*') return `Mỗi ngày ${h.padStart(2,'0')}:${m.padStart(2,'0')}`
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && /^\d+(-\d+)?$/.test(dow)) {
    const days = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' }
    const label = dow.includes('-')
      ? dow.split('-').map(d => days[d] || d).join('→')
      : days[dow] || dow
    return `${label} ${h.padStart(2,'0')}:${m.padStart(2,'0')}`
  }
  return ''
}

function ScheduleBuilder({ value, onChange }) {
  const [mode, setMode] = useState(() => {
    if (!value) return 'preset'
    return PRESETS.some(p => p.value === value) ? 'preset' : 'cron'
  })
  const [daily, setDaily] = useState({ hour: '9', minute: '0' })
  const [every, setEvery] = useState({ value: '30', unit: 'm' })
  const hint = describeCron(value)

  return (
    <div className="space-y-1.5 rounded-md border border-gray-200 bg-gray-50/50 p-2">
      <div className="flex items-center gap-1 text-[11px]">
        {[['preset', 'Nhanh'], ['daily', 'Hằng ngày'], ['interval', 'Mỗi N'], ['cron', 'Cron text']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded px-2 py-0.5 font-semibold transition-colors ${mode === id ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
        {hint && <span className="ml-auto truncate text-[10px] text-emerald-700">→ {hint}</span>}
      </div>

      {mode === 'preset' && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                value === p.value
                  ? 'border-gray-950 bg-gray-950 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {p.label}
              <span className="ml-1 text-[9px] opacity-60">{p.value}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'daily' && (
        <div className="flex items-center gap-2 text-[11px] text-gray-700">
          <span>Hằng ngày lúc</span>
          <select
            value={daily.hour}
            onChange={e => { const next = { ...daily, hour: e.target.value }; setDaily(next); onChange(`${next.minute} ${next.hour} * * *`) }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
          >
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}h</option>)}
          </select>
          <span>:</span>
          <select
            value={daily.minute}
            onChange={e => { const next = { ...daily, minute: e.target.value }; setDaily(next); onChange(`${next.minute} ${next.hour} * * *`) }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
          >
            {[0, 15, 30, 45].map(i => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
          </select>
          <button
            type="button"
            onClick={() => onChange(`${daily.minute} ${daily.hour} * * *`)}
            className="ml-auto rounded-md bg-gray-950 px-2 py-1 text-[10px] font-semibold text-white"
          >
            Dùng
          </button>
        </div>
      )}

      {mode === 'interval' && (
        <div className="flex items-center gap-2 text-[11px] text-gray-700">
          <span>Cứ mỗi</span>
          <input
            type="number"
            min="1"
            value={every.value}
            onChange={e => {
              const next = { ...every, value: e.target.value }
              setEvery(next)
              const n = Number(next.value) || 1
              const expr = next.unit === 'm' ? `*/${n} * * * *` : `0 */${n} * * *`
              onChange(expr)
            }}
            className="w-16 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
          />
          <select
            value={every.unit}
            onChange={e => {
              const next = { ...every, unit: e.target.value }
              setEvery(next)
              const n = Number(next.value) || 1
              const expr = next.unit === 'm' ? `*/${n} * * * *` : `0 */${n} * * *`
              onChange(expr)
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
          >
            <option value="m">phút</option>
            <option value="h">giờ</option>
          </select>
          <span className="text-gray-500">→ <code className="rounded bg-gray-100 px-1">{value || '...'}</code></span>
        </div>
      )}

      {mode === 'cron' && (
        <div className="space-y-1">
          <input
            placeholder="0 9 * * *   (phút giờ ngày tháng thứ)"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-gray-400"
          />
          <div className="text-[10px] text-gray-500">
            5 trường: <code>phút</code> <code>giờ</code> <code>ngày</code> <code>tháng</code> <code>thứ</code> — dùng <code>*</code>, <code>*/N</code>, <code>1-5</code>, <code>1,3,5</code>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CronManager({ token, provider: _provider }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({ name: '', prompt: '', schedule: '', deliver: 'origin' })
  const [editingId, setEditingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    setError('')
    try {
      const headers = authHeaders(token)
      const [cronResult, systemResult] = await Promise.allSettled([
        fetch('/api/cron/jobs', { headers }),
        fetch('/api/cron/system-jobs', { headers }),
      ])
      if (cronResult.status === 'rejected') throw cronResult.reason
      const cronData = await cronResult.value.json()
      if (!cronResult.value.ok) throw new Error(cronData.detail || `HTTP ${cronResult.value.status}`)

      const merged = Array.isArray(cronData) ? cronData.map(normalizeCronJob) : []
      if (systemResult.status === 'fulfilled') {
        const systemData = await systemResult.value.json()
        if (systemResult.value.ok && Array.isArray(systemData)) {
          merged.push(...systemData.map(normalizeSystemJob))
        }
      }
      setJobs(merged)
    } catch (e) {
      setError(`Không tải được cron jobs: ${e.message}`)
    } finally { setLoading(false) }
  }

  async function submitJob() {
    if (!form.schedule.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const isEdit = Boolean(editingId)
      const isSystem = isEdit && editingId.startsWith('system:')
      let url, method, body
      if (isSystem) {
        url = `/api/cron/system-jobs/${editingId.slice(7)}`
        method = 'PUT'
        body = { name: form.name, command: form.prompt, schedule: form.schedule }
      } else if (isEdit) {
        url = `/api/cron/jobs/${editingId}`
        method = 'PUT'
        body = { name: form.name, prompt: form.prompt, schedule: form.schedule }
      } else {
        url = '/api/cron/jobs'
        method = 'POST'
        body = form
      }
      const res = await fetch(url, {
        method,
        headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', prompt: '', schedule: '', deliver: 'origin' })
      await loadJobs()
    } catch (e) {
      setError(`${editingId ? 'Cập nhật' : 'Tạo'} job thất bại: ${e.message}`)
    } finally { setSubmitting(false) }
  }

  function openEdit(job) {
    if (job.source === 'system') {
      setEditingId(`system:${job.id.replace(/^system:/, '')}`)
      setForm({
        name: job.name || '',
        prompt: job.command || '',
        schedule: job.schedule || job.schedule_display || '',
        deliver: 'origin',
      })
      setShowForm(true)
      setError('')
      return
    }
    if (job.source !== 'cron') {
      setError('Chỉ sửa được HAgent cron hoặc system cron ở đây.')
      return
    }
    setEditingId(job.id)
    setForm({
      name: job.name || '',
      prompt: job.prompt || '',
      schedule: job.schedule || job.schedule_display || '',
      deliver: job.deliver || 'origin',
    })
    setShowForm(true)
    setError('')
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ name: '', prompt: '', schedule: '', deliver: 'origin' })
  }

  async function deleteJob(job) {
    if (job.source === 'system') {
      if (!confirm('Xoá dòng crontab hệ thống này?')) return
      try {
        const res = await fetch(`/api/cron/system-jobs/${job.id.replace(/^system:/, '')}`, {
          method: 'DELETE', headers: authHeaders(token),
        })
        if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
        await loadJobs()
      } catch (e) {
        setError(`Xoá system cron thất bại: ${e.message}`)
      }
      return
    }
    if (job.source !== 'cron') {
      setError('Job này không xoá được trực tiếp ở đây.')
      return
    }
    if (!confirm('Xoá cron job này?')) return
    try {
      const res = await fetch(`/api/cron/jobs/${job.id}`, { method: 'DELETE', headers: authHeaders(token) })
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
      await loadJobs()
    } catch (e) {
      setError(`Xoá thất bại: ${e.message}`)
    }
  }

  async function togglePause(job) {
    if (job.source === 'workflow') {
      try {
        const res = await fetch(`/api/workflows/${job.workflow_id}/schedule`, { method: 'PATCH', headers: authHeaders(token) })
        if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
        await loadJobs()
      } catch (e) {
        setError(`${job.state === 'paused' ? 'Tiếp tục' : 'Tạm dừng'} workflow thất bại: ${e.message}`)
      }
      return
    }
    if (job.source !== 'cron') {
      setError('Job crontab hệ điều hành chỉ hiển thị ở đây; sửa lịch trong crontab.')
      return
    }
    const endpoint = job.state === 'paused' ? 'resume' : 'pause'
    try {
      const res = await fetch(`/api/cron/jobs/${job.id}/${endpoint}`, { method: 'POST', headers: authHeaders(token) })
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
      await loadJobs()
    } catch (e) {
      setError(`${endpoint === 'resume' ? 'Tiếp tục' : 'Tạm dừng'} thất bại: ${e.message}`)
    }
  }

  async function triggerJob(job) {
    if (job.source === 'workflow') {
      try {
        const res = await fetch(`/api/workflows/${job.workflow_id}/run`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ input: {} }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
        setError('')
        await loadJobs()
      } catch (e) {
        setError(`Chạy workflow thất bại: ${e.message}`)
      }
      return
    }
    if (job.source === 'system') {
      try {
        const res = await fetch(`/api/cron/system-jobs/${job.id.replace(/^system:/, '')}/trigger`, {
          method: 'POST', headers: authHeaders(token),
        })
        if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
        setError('')
      } catch (e) {
        setError(`Chạy system cron thất bại: ${e.message}`)
      }
      return
    }
    if (job.source !== 'cron') {
      setError('Job này không chạy được trực tiếp ở đây.')
      return
    }
    try {
      const res = await fetch(`/api/cron/jobs/${job.id}/trigger`, { method: 'POST', headers: authHeaders(token) })
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
      setError('')
      await loadJobs()
    } catch (e) {
      setError(`Chạy job thất bại: ${e.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Đang tải...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">Cron Jobs</span>
          {jobs.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{jobs.length}</span>
          )}
        </div>
        <button
          onClick={() => {
            if (showForm) {
              cancelForm()
            } else {
              setShowForm(true)
              setEditingId(null)
              setError('')
            }
          }}
          className="flex h-7 items-center gap-1 rounded-md bg-gray-950 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {showForm ? 'Đóng' : 'Tạo cron'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Create / edit form */}
      {showForm && (
        <div className="shrink-0 border-b border-black/[0.06] bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600">
              {editingId ? `Sửa cron · ${editingId}` : 'Tạo cron mới'}
            </span>
            {editingId && (
              <button onClick={cancelForm} className="text-[11px] text-gray-400 hover:text-gray-700">Hủy</button>
            )}
          </div>
          <div className="space-y-2">
            <input
              placeholder="Tên job (tuỳ chọn)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-gray-400"
            />
            <ScheduleBuilder
              value={form.schedule}
              onChange={(s) => setForm({ ...form, schedule: s })}
            />
            <textarea
              placeholder="Prompt cho job (nội dung công việc)"
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-gray-400 resize-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={form.deliver}
                onChange={(e) => setForm({ ...form, deliver: e.target.value })}
                disabled={Boolean(editingId)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400 disabled:opacity-50"
              >
                <option value="origin">Gửi về đây</option>
                <option value="local">Chỉ lưu local</option>
                <option value="all">Gửi tất cả nơi</option>
              </select>
              <button
                onClick={submitJob}
                disabled={submitting || !form.schedule.trim()}
                className="ml-auto flex h-7 items-center gap-1 rounded-md bg-gray-950 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? (editingId ? 'Đang lưu...' : 'Đang tạo...') : (editingId ? 'Lưu' : 'Tạo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
            <Clock className="h-8 w-8" />
            <p className="text-xs">Chưa có cron job nào</p>
            <p className="text-[11px]">Bấm "Tạo cron" để bắt đầu</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {jobs.map((job) => (
              <div key={job.rowId || job.id}>
                {/* Row */}
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/60"
                  onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                >
                  <button className="shrink-0 text-gray-400 hover:text-gray-600">
                    {expandedId === job.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-gray-900">{job.name || job.id}</span>
                      {sourceBadge(job)}
                      {statusBadge(job)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-500">
                      <span>🕐 {job.schedule_display || '?'}</span>
                      {job.next_run_at && <span>⏭ {formatDate(job.next_run_at)}</span>}
                      {job.last_run_at && <span>⏮ {formatDate(job.last_run_at)}</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {(job.source === 'cron' || job.source === 'workflow' || job.source === 'system') && (
                      <>
                        <button
                          onClick={() => triggerJob(job)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-emerald-600"
                          title="Chạy ngay"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                        {job.source !== 'system' && (
                          <button
                            onClick={() => togglePause(job)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-amber-600"
                            title={job.state === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
                          >
                            {job.state === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </>
                    )}
                    {(job.source === 'cron' || job.source === 'system') && (
                      <>
                        <button
                          onClick={() => openEdit(job)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-sky-600"
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteJob(job)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
                          title="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Expanded details */}
                {expandedId === job.id && (
                  <div className="border-t border-black/[0.04] bg-gray-50/50 px-11 py-3">
                    <div className="space-y-2 text-[11px] text-gray-600">
                      <div><span className="font-medium text-gray-800">ID:</span> {job.id}</div>
                      <div><span className="font-medium text-gray-800">Nguồn:</span> {job.source === 'system' ? 'System crontab' : job.source === 'workflow' ? 'Workflow schedule' : 'HAgent cron'}</div>
                      {job.prompt && (
                        <div>
                          <span className="font-medium text-gray-800">{job.source === 'system' ? 'Command:' : 'Prompt:'}</span>
                          <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[11px] text-gray-600">{job.prompt}</pre>
                        </div>
                      )}
                      {job.skills && job.skills.length > 0 && (
                        <div><span className="font-medium text-gray-800">Skills:</span> {job.skills.join(', ')}</div>
                      )}
                      {job.model && <div><span className="font-medium text-gray-800">Model:</span> {job.model}</div>}
                      {job.last_error && (
                        <div>
                          <span className="font-medium text-red-600">Lỗi gần nhất:</span>
                          <pre className="mt-1 whitespace-pre-wrap rounded bg-red-50 p-2 text-[11px] text-red-600">{job.last_error}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
