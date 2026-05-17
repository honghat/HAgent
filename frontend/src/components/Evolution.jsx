import { useEffect, useMemo, useState } from 'react'
import {
  applyEvolutionEvent,
  fetchEvolutionEvents,
  fetchEvolutionSummary,
  runEvolutionDailyReview,
  updateEvolutionEventStatus,
} from '../api.js'

const typeLabels = {
  user_preference: 'Sở thích',
  project_memory: 'Dự án',
  knowledge_fact: 'Tri thức',
  successful_workflow: 'Workflow tốt',
  agent_failure: 'Lỗi agent',
  tool_issue: 'Tool issue',
  new_skill_candidate: 'Ứng viên skill',
  daily_review: 'Tổng kết',
}

const statusLabels = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  applied: 'Đã áp dụng',
  rejected: 'Bỏ qua',
}

export default function Evolution({ token }) {
  const [summary, setSummary] = useState(null)
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('pending')
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const stats = useMemo(() => summary || { total: 0, pending: 0, applied: 0, by_type: {} }, [summary])

  async function load() {
    setLoading(true)
    try {
      const [s, e] = await Promise.all([
        fetchEvolutionSummary(token),
        fetchEvolutionEvents(token, { status, event_type: eventType, limit: 120 }),
      ])
      setSummary(s)
      setEvents(Array.isArray(e) ? e : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, status, eventType])

  async function setEventStatus(id, nextStatus) {
    await updateEvolutionEventStatus(token, id, nextStatus)
    await load()
  }

  async function applyEvent(id) {
    const result = await applyEvolutionEvent(token, id)
    setNotice(result?.applied_to ? `Đã áp dụng vào ${result.applied_to}` : 'Đã áp dụng')
    await load()
    setTimeout(() => setNotice(''), 2500)
  }

  async function reviewNow() {
    const result = await runEvolutionDailyReview(token)
    setNotice(result?.skipped ? 'Không có tổng kết mới' : 'Đã tạo tổng kết tự học')
    await load()
    setTimeout(() => setNotice(''), 2500)
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f4]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-black/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-950">Agent Learning</h1>
            <p className="mt-1 text-sm text-gray-500">Duyệt bài học, feedback và lỗi lặp lại trước khi đưa vào memory/wiki.</p>
          </div>
          <button
            onClick={reviewNow}
            disabled={loading}
            className="h-10 rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            Tổng kết hôm nay
          </button>
        </div>

        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Tổng bài học" value={stats.total} />
          <Metric label="Chờ duyệt" value={stats.pending} />
          <Metric label="Đã áp dụng" value={stats.applied} />
          <Metric label="Lỗi/tool issue" value={(stats.by_type?.agent_failure || 0) + (stats.by_type?.tool_issue || 0)} />
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {['pending', 'approved', 'applied', 'rejected'].map((item) => (
            <button
              key={item}
              onClick={() => setStatus(item)}
              className={`h-9 rounded-lg px-3 text-sm transition ${status === item ? 'bg-gray-950 text-white' : 'bg-white text-gray-600 ring-1 ring-black/[0.06] hover:text-gray-950'}`}
            >
              {statusLabels[item]}
            </button>
          ))}
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-sm text-gray-700 outline-none"
          >
            <option value="">Tất cả loại</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">{typeLabels[event.event_type] || event.event_type}</span>
                    <span className="text-xs text-gray-400">{statusLabels[event.status] || event.status}</span>
                    <span className="text-xs text-gray-400">confidence {Math.round((event.confidence || 0) * 100)}%</span>
                  </div>
                  <h2 className="text-sm font-semibold text-gray-950">{event.title}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{event.lesson}</p>
                  {event.evidence && <p className="mt-3 whitespace-pre-wrap border-l-2 border-gray-100 pl-3 text-xs leading-5 text-gray-500">{event.evidence}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {event.status === 'pending' && (
                    <>
                      <button onClick={() => setEventStatus(event.id, 'approved')} className="h-8 rounded-md bg-gray-950 px-3 text-xs font-medium text-white">Duyệt</button>
                      <button onClick={() => setEventStatus(event.id, 'rejected')} className="h-8 rounded-md bg-gray-100 px-3 text-xs font-medium text-gray-600">Bỏ qua</button>
                    </>
                  )}
                  {event.status !== 'applied' && event.status !== 'rejected' && (
                    <button onClick={() => applyEvent(event.id)} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white">Áp dụng</button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!loading && events.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white/70 px-4 py-10 text-center text-sm text-gray-500">Chưa có bài học trong bộ lọc này.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">{value || 0}</div>
    </div>
  )
}
