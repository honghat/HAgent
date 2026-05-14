import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Loader2, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'

const TRACKS = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'html-css', label: 'HTML/CSS' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'react', label: 'React' },
  { id: 'nextjs', label: 'Next.js' },
  { id: 'nodejs', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'fastapi', label: 'FastAPI' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'git', label: 'Git' },
  { id: 'api', label: 'REST API' },
  { id: 'docker', label: 'Docker' },
  { id: 'linux', label: 'Linux/Bash' },
  { id: 'fullstack', label: 'Fullstack Web' },
  { id: 'dsa', label: 'Giải thuật & CTDL' },
  { id: 'system-design', label: 'System Design' },
  { id: 'oop', label: 'OOP & SOLID' },
  { id: 'leetcode', label: 'LeetCode Top' },
  { id: 'behavioral', label: 'Phỏng vấn HR' },
]

const TRACK_META = {
  javascript: 'DOM, async, event và logic frontend.',
  'html-css': 'HTML, layout, responsive và animation.',
  typescript: 'Type an toàn cho dự án JavaScript lớn.',
  react: 'Component, state, hooks và UI.',
  nextjs: 'App Router, API, server/client component.',
  nodejs: 'Runtime JavaScript cho backend và tools.',
  python: 'Automation, backend và AI.',
  fastapi: 'API Python nhanh, có schema rõ.',
  postgresql: 'SQL, index, transaction và quan hệ dữ liệu.',
  git: 'Version, branch, merge và workflow.',
  api: 'HTTP, REST, JSON và auth.',
  docker: 'Container, image, compose và deploy.',
  linux: 'Terminal, process, permission và SSH.',
  fullstack: 'Từ UI tới backend, database và deploy.',
  dsa: 'Big-O, cấu trúc dữ liệu và thuật toán.',
  'system-design': 'Scale, cache, queue và database.',
  oop: 'Class, object, SOLID và maintainability.',
  leetcode: 'Pattern coding interview thường gặp.',
  behavioral: 'STAR, HR interview và deal offer.',
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function inlineMarkdown(value = '') {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderMarkdown(markdown = '') {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html = []
  let inCode = false
  let code = []

  const flushCode = () => {
    if (!code.length) return
    html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
    code = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      if (inCode) flushCode()
      inCode = !inCode
      continue
    }
    if (inCode) {
      code.push(line)
      continue
    }
    if (!trimmed) {
      html.push('<div class="learn-gap"></div>')
      continue
    }
    if (trimmed.startsWith('# ')) html.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`)
    else if (trimmed.startsWith('## ')) html.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`)
    else if (trimmed.startsWith('### ')) html.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`)
    else if (/^[-*]\s+/.test(trimmed)) html.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}</li>`)
    else html.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  if (inCode) flushCode()
  return html.join('')
}

function lessonNumber(lesson) {
  const match = lesson?.topic?.match(/B[àa]i\s*(\d+)/i)
  return match ? Number(match[1]) : lesson?.order || lesson?.id || 0
}

function modelForProvider(provider) {
  if (!provider || provider === 'lmstudio_local') return 'lmstudio'
  return provider
}

async function callHAgentAi({ token, provider, prompt }) {
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({
      model: modelForProvider(provider),
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error('AI không phản hồi')
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('AI trả về rỗng')
  return content
}

function Button({ children, active, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'bg-gray-950 text-white' : 'border border-black/[0.08] bg-white text-gray-700 hover:bg-gray-50'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export default function Learn({ token, provider }) {
  const [track, setTrack] = useState('javascript')
  const [lessons, setLessons] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const trackLessons = useMemo(() => {
    return lessons
      .filter(lesson => lesson.track === track)
      .filter(lesson => !query.trim() || `${lesson.topic} ${lesson.content}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => lessonNumber(a) - lessonNumber(b))
  }, [lessons, query, track])

  const current = useMemo(() => {
    return lessons.find(lesson => lesson.id === currentId) || trackLessons.find(lesson => !lesson.completed) || trackLessons[0] || null
  }, [currentId, lessons, trackLessons])

  const progress = useMemo(() => {
    const total = trackLessons.length
    const done = trackLessons.filter(lesson => lesson.completed).length
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 }
  }, [trackLessons])

  async function loadLessons() {
    setBusy('lessons')
    try {
      const res = await fetch('/api/lessons', { headers: authHeaders(token) })
      const data = res.ok ? await res.json() : []
      setLessons(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(`Không tải được bài học: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => { loadLessons() }, [token])
  useEffect(() => { setCurrentId(null) }, [track])

  async function markComplete(lesson, completed = true) {
    if (!lesson) return
    setBusy(`complete-${lesson.id}`)
    try {
      const res = await fetch('/api/lessons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ id: lesson.id, completed, incrementLearnCount: completed }),
      })
      if (!res.ok) throw new Error('PATCH /api/lessons failed')
      await loadLessons()
      setError('')
    } catch (err) {
      setError(`Không cập nhật được bài học: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  async function deleteLesson(lesson) {
    if (!lesson) return
    setBusy(`delete-${lesson.id}`)
    try {
      const res = await fetch('/api/lessons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ id: lesson.id }),
      })
      if (!res.ok) throw new Error('DELETE /api/lessons failed')
      setCurrentId(null)
      await loadLessons()
    } catch (err) {
      setError(`Không xóa được bài học: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  async function generateLesson() {
    setBusy('generate')
    setError('')
    const trackLabel = TRACKS.find(item => item.id === track)?.label || track
    const existing = trackLessons.map((lesson, index) => `${index + 1}. ${lesson.topic}`).join('\n')
    const prompt = `Tạo một bài học lập trình ngắn, dễ hiểu bằng tiếng Việt cho lộ trình ${trackLabel}.

Các bài đã có:
${existing || 'Chưa có bài nào.'}

Hãy tạo bài tiếp theo, không trùng chủ đề. Format:
# [Tên bài]
## Mục tiêu
## Khái niệm cốt lõi
## Cách dùng
## Ví dụ code
\`\`\`
[code ngắn có comment]
\`\`\`
## Thực hành
[bài tập nhỏ]`

    try {
      const content = await callHAgentAi({ token, provider, prompt })
      const topic = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${trackLabel} - bài mới`
      const saveRes = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ track, topic, content }),
      })
      if (!saveRes.ok) throw new Error('Không lưu được bài học')
      const saved = await saveRes.json()
      await loadLessons()
      setCurrentId(saved.id)
    } catch (err) {
      setError(`Không tạo được bài: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="flex h-full min-h-0 bg-[#f4f4f1] text-gray-950">
      <aside className="hidden h-full w-60 shrink-0 border-r border-black/[0.06] bg-white/80 p-3 xl:block">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Learn</h1>
            <p className="text-[11px] font-medium text-gray-400">Bài học lập trình</p>
          </div>
          <button onClick={loadLessons} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <RefreshCw size={15} className={busy === 'lessons' ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="h-[calc(100%-3.25rem)] space-y-1 overflow-y-auto pr-1">
          {TRACKS.map(item => {
            const list = lessons.filter(lesson => lesson.track === item.id)
            const done = list.filter(lesson => lesson.completed).length
            return (
              <button
                key={item.id}
                onClick={() => setTrack(item.id)}
                className={`w-full rounded-md px-2.5 py-1.5 text-left transition ${track === item.id ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{item.label}</span>
                  <span className={`text-[10px] ${track === item.id ? 'text-white/60' : 'text-gray-400'}`}>{done}/{list.length}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-black/[0.06] bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <select
                value={track}
                onChange={event => setTrack(event.target.value)}
                className="h-8 rounded-md border border-black/[0.08] bg-white px-2 text-xs font-semibold text-gray-800 outline-none"
              >
                {TRACKS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{TRACKS.find(item => item.id === track)?.label}</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{progress.percent}%</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-500">{TRACK_META[track] || 'Lộ trình học lập trình'}</p>
              </div>
            </div>

            <Button onClick={generateLesson} disabled={busy === 'generate'}>
              {busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Tạo bài
            </Button>
          </div>
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</div>}

        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
          <aside className="flex min-h-0 flex-col border-r border-black/[0.06] bg-white/70 p-2.5">
            <div className="mb-2 flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-2.5 py-1.5">
              <Search size={14} className="text-gray-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Tìm bài học"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {trackLessons.map(lesson => (
                <button
                  key={lesson.id}
                  onClick={() => setCurrentId(lesson.id)}
                  className={`w-full rounded-md border p-2.5 text-left transition ${current?.id === lesson.id ? 'border-gray-300 bg-white shadow-sm' : 'border-black/[0.06] bg-white/80 hover:bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[13px] font-semibold leading-5">{lesson.topic}</div>
                      <div className="mt-1 text-[11px] text-gray-400">Bài {lessonNumber(lesson)} · học {lesson.learnCount || 0} lần</div>
                    </div>
                    {lesson.completed && <Check size={15} className="shrink-0 text-emerald-600" />}
                  </div>
                </button>
              ))}
              {!trackLessons.length && (
                <div className="rounded-md border border-dashed border-black/[0.12] bg-white/60 p-4 text-center text-xs text-gray-400">
                  Chưa có bài trong track này.
                </div>
              )}
            </div>
          </aside>

          <article className="min-h-0 overflow-y-auto p-3">
            {current ? (
              <div className="mx-auto max-w-4xl">
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-2">
                  <div className="min-w-0">
                    <h1 className="truncate text-base font-semibold">{current.topic}</h1>
                    <p className="mt-1 text-xs text-gray-400">{current.completed ? 'Đã hoàn thành' : 'Đang học'} · {current.learnCount || 0} lượt học</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => markComplete(current, !current.completed)} disabled={busy === `complete-${current.id}`}>
                      {busy === `complete-${current.id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {current.completed ? 'Bỏ xong' : 'Hoàn thành'}
                    </Button>
                    <button onClick={() => deleteLesson(current)} className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div
                  className="learn-article rounded-md border border-black/[0.06] bg-white p-4"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(current.content) }}
                />
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <BookOpen className="mx-auto mb-3 text-gray-300" size={36} />
                  <div className="text-sm font-semibold text-gray-500">Chọn một bài học hoặc tạo bài mới</div>
                </div>
              </div>
            )}
          </article>
        </div>
      </main>
    </section>
  )
}
