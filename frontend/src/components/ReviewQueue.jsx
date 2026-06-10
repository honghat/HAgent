import { useEffect, useMemo, useState } from 'react'
import { Clock, Mic, Code2, Languages, RefreshCw, BookOpen, Brain, Filter } from 'lucide-react'
import { fetchLessonReviewQueue, fetchEnglishReviewQueue, relativeReviewLabel, strengthColor } from '../lib/recallApi.js'

const TYPE_FILTERS = [
  { id: 'all', label: 'Tất cả', icon: <Brain size={13} /> },
  { id: 'code', label: 'Code', icon: <Code2 size={13} /> },
  { id: 'english', label: 'Tiếng Anh', icon: <Languages size={13} /> },
]

export default function ReviewQueue({ token, onOpenRecall, onRefreshCount }) {
  const [type, setType] = useState('all')
  const [lessons, setLessons] = useState([])
  const [english, setEnglish] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [code, eng] = await Promise.all([
        fetchLessonReviewQueue(token).catch(() => []),
        fetchEnglishReviewQueue(token).catch(() => []),
      ])
      setLessons(Array.isArray(code) ? code : [])
      setEnglish(Array.isArray(eng) ? eng : [])
    } catch (err) {
      setError(err.message || 'Không tải được hàng đợi.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load() }, [token])

  const items = useMemo(() => {
    const code = lessons.map(item => ({ ...item, _kind: 'lesson' }))
    const eng = english.map(item => ({ ...item, _kind: 'english' }))
    if (type === 'code') return code
    if (type === 'english') return eng
    return [...code, ...eng]
  }, [lessons, english, type])

  useEffect(() => {
    onRefreshCount?.({ code: lessons.length, english: english.length, total: lessons.length + english.length })
  }, [lessons.length, english.length, onRefreshCount])

  function isOverdue(nextReviewAt) {
    if (!nextReviewAt) return true
    return new Date(nextReviewAt).getTime() <= Date.now()
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#f4f4f1] text-gray-950">
      <header className="flex flex-col gap-2 border-b border-black/[0.06] bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-indigo-500" />
            <h2 className="truncate text-sm font-semibold">Cần ôn hôm nay</h2>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-gray-500">
            Spaced repetition · bấm Mic để giảng lại. Tổng {items.length} mục ({lessons.length} code, {english.length} tiếng Anh).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 p-0.5">
            {TYPE_FILTERS.map(filter => (
              <button
                key={filter.id}
                onClick={() => setType(filter.id)}
                className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition ${
                  type === filter.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {filter.icon}
                {filter.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={busy}
            className="rounded-md border border-black/[0.08] bg-white p-1.5 text-gray-500 hover:bg-gray-50"
            title="Tải lại"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {error && <div className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <BookOpen className="mx-auto mb-2 text-gray-300" size={32} />
              <div className="text-sm font-semibold text-gray-500">Tuyệt vời! Không có mục cần ôn.</div>
              <p className="mt-1 text-[11px] text-gray-400">Hãy học bài mới hoặc tạo bài bằng nút "Tạo bài".</p>
            </div>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-4xl gap-2">
            {items.map(item => {
              const isEnglish = item._kind === 'english'
              const isDue = isOverdue(item.nextReviewAt)
              const titleText = isEnglish ? (item.title || item.content || '(không tên)') : (item.topic || '(không tên)')
              const meta = isEnglish ? (() => { try { return JSON.parse(item.metadata || '{}') } catch (e) { return {} } })() : {}
              const kindLabel = isEnglish ? `Tiếng Anh · ${item.type || ''}` : `Code · ${item.track || ''}`
              const colorClass = strengthColor(item.strength)
              return (
                <li
                  key={`${item._kind}-${item.id}`}
                  className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition ${
                    isDue ? 'border-indigo-200 shadow-sm' : 'border-black/[0.06]'
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${colorClass}`}>
                    {isEnglish ? <Languages size={15} /> : <Code2 size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-gray-900">{titleText}</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${colorClass}`}>
                        {item.strength || 0}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-gray-500">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-gray-600">
                        {kindLabel}
                      </span>
                      {meta?.level && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">{meta.level}</span>}
                      {meta?.topic && <span>{meta.topic}</span>}
                      <span className={isDue ? 'font-semibold text-rose-600' : 'text-gray-400'}>
                        {relativeReviewLabel(item.nextReviewAt)}
                      </span>
                      {item.reviewCount > 0 && <span>· {item.reviewCount} lần ôn</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenRecall?.(isEnglish ? 'english' : 'lesson', item)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    title="Bấm Mic để giảng lại"
                  >
                    <Mic size={13} />
                    Giảng lại
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
