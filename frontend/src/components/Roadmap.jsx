import { useState, useEffect } from 'react'

const ROADMAP = [
  { week: 1, tasks: [
    { id: 'r1', label: 'HTML/CSS cơ bản: semantic HTML, flexbox, grid' },
    { id: 'r2', label: 'JavaScript cơ bản: biến, hàm, loop, array, object' },
    { id: 'r3', label: 'Git & GitHub: clone, commit, push, pull, branch' },
    { id: 'r4', label: 'React: component, props, state cơ bản' },
    { id: 'r5', label: 'Dựng Landing Page đầu tiên (portfolio tĩnh)' },
  ]},
  { week: 2, tasks: [
    { id: 'r6', label: 'Node.js & Express: REST API cơ bản' },
    { id: 'r7', label: 'PostgreSQL: SELECT, INSERT, JOIN cơ bản' },
    { id: 'r8', label: 'Fullstack CRUD: React + Express + PostgreSQL' },
    { id: 'r9', label: 'TypeScript cơ bản: type, interface, generics' },
    { id: 'r10', label: 'Deploy lên VPS: PM2, Nginx, SSL' },
  ]},
  { week: 3, tasks: [
    { id: 'r11', label: 'Next.js: pages, routing, SSR, ISR' },
    { id: 'r12', label: 'Prisma ORM: schema, migration, query' },
    { id: 'r13', label: 'Authentication: JWT, session, OAuth' },
    { id: 'r14', label: 'Docker: Dockerfile, docker-compose cơ bản' },
    { id: 'r15', label: 'Build & deploy fullstack app hoàn chỉnh' },
  ]},
  { week: 4, tasks: [
    { id: 'r16', label: 'Data Structures: array, linked list, stack, queue' },
    { id: 'r17', label: 'Algorithms: sorting, searching, recursion' },
    { id: 'r18', label: 'LeetCode Easy: 20 bài cơ bản' },
    { id: 'r19', label: 'System Design: client-server, REST, caching' },
    { id: 'r20', label: 'OOP & SOLID: class, inheritance, design patterns' },
  ]},
  { week: 5, tasks: [
    { id: 'r21', label: 'Python: FastAPI, Pydantic, SQLAlchemy' },
    { id: 'r22', label: 'Testing: unit test, integration test (Jest/Pytest)' },
    { id: 'r23', label: 'CI/CD: GitHub Actions, tự động deploy' },
    { id: 'r24', label: 'Message queue: Redis, BullMQ cơ bản' },
    { id: 'r25', label: 'WebSocket: real-time chat ứng dụng' },
  ]},
  { week: 6, tasks: [
    { id: 'r26', label: 'Database nâng cao: index, transaction, migration' },
    { id: 'r27', label: 'Security: XSS, CSRF, SQL injection, CORS' },
    { id: 'r28', label: 'Performance: lazy load, caching, CDN' },
    { id: 'r29', label: 'LeetCode Medium: 15 bài' },
    { id: 'r30', label: 'System Design: thiết kế URL shortener' },
  ]},
  { week: 7, tasks: [
    { id: 'r31', label: 'AI/ML cơ bản: API calls, prompt engineering' },
    { id: 'r32', label: 'Build AI-powered app: chatbot, RAG' },
    { id: 'r33', label: 'Microservices: kiến trúc, message broker' },
    { id: 'r34', label: 'Kubernetes: pod, service, deployment cơ bản' },
    { id: 'r35', label: 'LeetCode Medium+: 15 bài' },
  ]},
  { week: 8, tasks: [
    { id: 'r36', label: 'Resume & Portfolio: hoàn thiện CV, GitHub' },
    { id: 'r37', label: 'Mock interview: technical + behavioral' },
    { id: 'r38', label: 'Job search: LinkedIn, TopDev, ITViec' },
    { id: 'r39', label: 'Negotiation: đàm phán lương, offer' },
    { id: 'r40', label: '📦 HOÀN THÀNH: 60 NGÀY - SẴN SÀNG ĐI LÀM' },
  ]},
]

export default function Roadmap({ token }) {
  const auth = (h) => ({ ...h, Authorization: `Bearer ${token}` })
  const [completed, setCompleted] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/learn/roadmap', { headers: auth({}) })
      .then((r) => r.json())
      .then((ids) => setCompleted(new Set(ids)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggleTask(id) {
    const next = new Set(completed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCompleted(next)
    await fetch('/api/learn/roadmap', {
      method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, completed: next.has(id) }),
    })
  }

  const allIds = ROADMAP.flatMap((w) => w.tasks.map((t) => t.id))
  const done = allIds.filter((id) => completed.has(id)).length
  const total = allIds.length
  const currentWeek = ROADMAP.findIndex((w) => w.tasks.some((t) => !completed.has(t.id)))
  const activeWeek = currentWeek === -1 ? ROADMAP.length - 1 : currentWeek

  if (loading) return <div className="flex items-center justify-center h-[60vh] text-gray-400 text-xs">Đang tải...</div>

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-lg font-black mb-1">🗺️ Lộ Trình 60 Ngày</h1>
      <p className="text-[10px] text-gray-400 mb-4">Từ Fresher đến Junior Developer</p>

      <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06] mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold">Tiến độ tổng</span>
          <span className="text-sm font-black">{done}/{total}</span>
        </div>
        <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div className={`h-full rounded-full transition-all ${done === total ? 'bg-[#3fb950]' : 'bg-blue-500'}`}
            style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="text-[10px] text-gray-400 mt-1 text-center">
          {done === total ? '🎉 HOÀN THÀNH! Bạn đã sẵn sàng!' : `Còn ${total - done} nhiệm vụ`}
        </div>
      </div>

      <div className="space-y-3">
        {ROADMAP.map((week, wi) => {
          const wkDone = week.tasks.filter((t) => completed.has(t.id)).length
          const active = wi === activeWeek
          return (
            <details key={wi} open={active} className="bg-[var(--color-bg-2)] rounded-xl border border-black/[0.06] overflow-hidden">
              <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-black/[0.02]">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${wkDone === week.tasks.length ? 'bg-[#3fb950] text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                  {wkDone}/{week.tasks.length}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold">Tuần {week.week}</div>
                  <div className="text-[10px] text-gray-400">{week.tasks.length} nhiệm vụ</div>
                </div>
                {active && <span className="text-[10px] text-blue-500 font-bold bg-blue-500/10 px-2 py-0.5 rounded-full">Đang ở đây</span>}
              </summary>
              <div className="px-3 pb-3 space-y-1">
                {week.tasks.map((task) => {
                  const done = completed.has(task.id)
                  return (
                    <label key={task.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-black/[0.02] cursor-pointer">
                      <input type="checkbox" checked={done} onChange={() => toggleTask(task.id)}
                        className="w-4 h-4 accent-[#3fb950] cursor-pointer" />
                      <span className={`text-xs ${done ? 'line-through text-gray-400' : ''}`}>{task.label}</span>
                    </label>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
