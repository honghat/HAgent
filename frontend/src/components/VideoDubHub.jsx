import { useState, useEffect, useRef, useCallback } from 'react'

const API = '/api/video-dub'

const STATUS = {
  queued: { icon: '⏳', text: 'Chờ', cls: 'bg-amber-900/30 text-amber-400 border border-amber-700/40' },
  running: { icon: '⚙️', text: 'Đang chạy', cls: 'bg-blue-900/30 text-blue-400 border border-blue-700/40' },
  done: { icon: '✅', text: 'Hoàn tất', cls: 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40' },
  error: { icon: '❌', text: 'Lỗi', cls: 'bg-red-900/30 text-red-400 border border-red-700/40' },
}

const CONTENT_TYPES = [
  ['teaching', '🎓 Dạy đàn tranh cổ'],
  ['drama', '🎭 Phim / Drama'],
  ['cooking', '🍳 Nấu ăn'],
  ['vlog', '📹 Vlog / Đời thường'],
  ['general', '🌐 Tổng quát'],
]

const SOURCE_LANGS = [
  ['zh', '中文 — Tiếng Trung'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
]

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.queued
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.icon} {s.text}</span>
}

const wrap = 'min-h-full bg-[#0e0b08] px-4 py-5 sm:px-8 sm:py-7'
const card = 'rounded-2xl border border-[#3a2e1e] bg-[#16110c] p-5'
const inputCls = 'w-full rounded-xl border border-[#3a2e1e] bg-[#2a2118] px-3 py-2.5 text-[13px] text-[#e8dfc8] outline-none focus:border-[#c9a44a] placeholder:text-[#8a7a60]'
const goldBtn = 'w-full rounded-xl bg-[#c9a44a] py-2.5 text-[13px] font-semibold text-[#241a08] transition hover:brightness-110 disabled:opacity-40 disabled:cursor-default'
const ghostBtn = 'rounded-lg bg-[#2a2118] px-3 py-1.5 text-[12px] text-[#e8dfc8] transition hover:bg-[#3a2e1e]'

export default function VideoDubHub({ token, user }) {
  const [view, setView] = useState('list')
  const [activeId, setActiveId] = useState(null)

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token])

  if (view === 'new') return <NewTask headers={headers} onCreated={(id) => { setActiveId(id); setView('detail') }} onBack={() => setView('list')} />
  if (view === 'detail') return <TaskDetail id={activeId} token={token} headers={headers} onBack={() => setView('list')} />
  return <TaskList headers={headers} user={user} onOpen={(id) => { setActiveId(id); setView('detail') }} onNew={() => setView('new')} />
}

/* ── Task List ─────────────────────────────────────────────────────────── */
function TaskList({ headers, user, onOpen, onNew }) {
  const [tasks, setTasks] = useState([])
  const [queue, setQueue] = useState({ pending: 0 })

  const load = useCallback(() => {
    fetch(`${API}/tasks`, { headers: headers() })
      .then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setQueue(d.queue || { pending: 0 }) })
      .catch(() => {})
  }, [headers])

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])

  const remove = (e, id) => {
    e.stopPropagation()
    if (!confirm('Xoá task này?')) return
    fetch(`${API}/tasks/${id}`, { method: 'DELETE', headers: headers() }).then(load)
  }

  const fmtDur = (s) => s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '—'

  return (
    <div className={wrap}>
      <div className="mx-auto max-w-3xl">
        {/* Brand header */}
        <div className="mb-1 flex items-center justify-between border-b border-[#3a2e1e] pb-4">
          <div>
            <div className="text-[15px] font-semibold text-[#c9a44a]">🎵 Video đàn tranh</div>
            <div className="text-[11px] text-[#8a7a60]">Lồng tiếng đàn tranh cổ · Trung → Việt</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#8a7a60]">{user?.displayName || user?.username}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 mb-4 flex items-center justify-between">
          <div className="text-[15px] font-semibold text-[#e8dfc8]">Lịch sử</div>
          <button onClick={onNew} className="rounded-xl bg-[#c9a44a] px-4 py-2 text-[13px] font-semibold text-[#241a08] transition hover:brightness-110">＋ Dịch mới</button>
        </div>

        {queue.pending > 0 && (
          <div className="mb-3 rounded-xl border border-blue-700/40 bg-blue-900/30 px-3 py-2 text-[12px] text-blue-400">⚙️ Đang xử lý — {queue.pending} task đang chờ</div>
        )}

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#3a2e1e] py-16 text-center text-[13px] text-[#8a7a60]">Chưa có video nào. Bấm <b className="text-[#c9a44a]">＋ Dịch mới</b> để bắt đầu.</div>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} onClick={() => onOpen(t.id)} className="group flex cursor-pointer items-center gap-3 rounded-xl border border-[#3a2e1e] bg-[#16110c] px-4 py-3 transition hover:border-[#c9a44a]/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-[#e8dfc8]">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#8a7a60]">
                    {t.progress || (t.source_type === 'youtube' ? '▶ YouTube' : '📁 Upload')}
                    {t.duration ? ` · ${fmtDur(t.duration)}` : ''}
                    {t.segments_count ? ` · ${t.segments_count} câu` : ''}
                  </p>
                </div>
                <button onClick={(e) => remove(e, t.id)} className="opacity-0 transition group-hover:opacity-100 text-[#8a7a60] hover:text-red-400 text-[14px]" title="Xoá">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── New Task ──────────────────────────────────────────────────────────── */
function NewTask({ headers, onCreated, onBack }) {
  const [tab, setTab] = useState('youtube')
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [voice, setVoice] = useState('hoaimy')
  const [sourceLang, setSourceLang] = useState('zh')
  const [contentType, setContentType] = useState('teaching')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const [fetchingTitle, setFetchingTitle] = useState(false)
  const ytFetchRef = useRef(null)

  const fetchYtTitle = (u) => {
    if (!/^https?:\/\//.test(u)) return
    clearTimeout(ytFetchRef.current)
    ytFetchRef.current = setTimeout(() => {
      setFetchingTitle(true)
      fetch(`${API}/yt-info?url=${encodeURIComponent(u)}`, { headers: headers() })
        .then(r => r.json()).then(d => { if (d.title && !title) setTitle(d.title) }).catch(() => {})
        .finally(() => setFetchingTitle(false))
    }, 800)
  }

  const CHUNK_SIZE = 8 * 1024 * 1024

  const submit = async () => {
    setErr(''); setBusy(true); setProgress(0)
    try {
      let res
      if (tab === 'upload') {
        if (!file) { setErr('Chọn file video'); setBusy(false); return }
        const fd = new FormData()
        fd.append('video', file)
        fd.append('title', title || file.name)
        fd.append('voice', voice)
        fd.append('sourceLang', sourceLang)
        res = await fetch(`${API}/upload`, { method: 'POST', headers: headers(), body: fd })
      } else {
        if (!url) { setErr('Nhập URL YouTube'); setBusy(false); return }
        res = await fetch(`${API}/youtube`, {
          method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title: title || url, voice, sourceLang }),
        })
      }
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || 'Lỗi tạo task')
      onCreated(d.id)
    } catch (e) {
      setErr(e.message); setBusy(false)
    }
  }

  return (
    <div className={wrap}>
      <div className="mx-auto max-w-xl">
        <button onClick={onBack} className="mb-4 text-[13px] text-[#8a7a60] hover:text-[#c9a44a]">← Lịch sử</button>
        <h1 className="mb-4 text-[15px] font-semibold text-[#e8dfc8]">Dịch video mới</h1>

        {/* Tabs */}
        <div className="mb-4 flex gap-1.5 rounded-xl bg-[#1e1710] p-1">
          {[['youtube', '▶️ YouTube'], ['upload', '📁 Upload']].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition ${tab === k ? 'bg-[#16110c] text-[#c9a44a] font-semibold shadow-sm' : 'text-[#8a7a60]'}`}>{lbl}</button>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-[#3a2e1e] bg-[#16110c] p-5">
          {tab === 'upload' ? (
            <label className="block cursor-pointer rounded-xl border border-dashed border-[#3a2e1e] px-4 py-6 text-center text-[13px] text-[#8a7a60] hover:border-[#c9a44a]/60 transition">
              <input type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files[0]; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')) }} />
              {file ? `📹 ${file.name} (${(file.size / 1048576).toFixed(1)} MB)` : 'Bấm chọn file video'}
            </label>
          ) : (
            <div>
              <label className="label mb-1 block text-[12px] text-[#8a7a60]">YouTube URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} onBlur={e => fetchYtTitle(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className={inputCls} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] text-[#8a7a60]">Tiêu đề{fetchingTitle ? ' ⏳' : ''}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tự động lấy từ YouTube hoặc tên file" className={inputCls} />
          </div>

          {/* Source language + Content type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] text-[#8a7a60]">Ngôn ngữ gốc</label>
              <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
                className={`${inputCls} appearance-none`}>
                {SOURCE_LANGS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-[#8a7a60]">Loại nội dung</label>
              <select value={contentType} onChange={e => setContentType(e.target.value)}
                className={`${inputCls} appearance-none`}>
                {CONTENT_TYPES.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
          </div>

          {/* Voice */}
          <div>
            <label className="mb-2 block text-[12px] text-[#8a7a60]">🎙️ Giọng đọc: Lồng tiếng Google (vi)</label>
            <div className="flex gap-2">
              {[['hoaimy', '👩 Hoài My'], ['namminh', '👨 Nam Minh']].map(([k, lbl]) => (
                <button key={k} onClick={() => setVoice(k)}
                  className={`rounded-lg px-4 py-1.5 text-[12px] font-medium transition ${voice === k ? 'bg-[#c9a44a] text-[#241a08]' : 'bg-[#2a2118] text-[#e8dfc8] hover:bg-[#3a2e1e]'}`}>{lbl}</button>
              ))}
            </div>
          </div>

          {busy && tab === 'upload' && progress > 0 && progress < 100 && (
            <div className="text-[12px] text-[#8a7a60]">Đang upload: {progress}%</div>
          )}

          {err && <p className="text-[12px] text-red-400">{err}</p>}

          <button onClick={submit} disabled={busy} className={goldBtn}>
            {busy ? '⏳ Đang gửi...' : '🚀 Tạo task & bắt đầu'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Task Detail ───────────────────────────────────────────────────────── */
function TaskDetail({ id, token, headers, onBack }) {
  const [task, setTask] = useState(null)
  const [logs, setLogs] = useState([])
  const logRef = useRef(null)
  const videoRef = useRef(null)
  const seenCount = useRef(0)
  const scrolledToVideo = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tasks/${id}`, { headers: headers() })
      const data = await r.json()
      setTask(data)
      const isDone = data.status === 'done'
      const history = (data.logs || [])
        .filter(entry => !(isDone && /^❌|^Lỗi:|Error:/.test(entry.m || '')))
        .map(entry => entry.m)
      if (history.length > seenCount.current) {
        setLogs(history)
        seenCount.current = history.length
      }
    } catch {}
  }, [id, headers])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!task || task.status === 'done' || task.status === 'error') return
    const t = setInterval(load, 1500)
    return () => clearInterval(t)
  }, [task?.status, load])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs.length])

  useEffect(() => {
    if (task?.status === 'done' && !scrolledToVideo.current) {
      scrolledToVideo.current = true
      setTimeout(() => videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    }
  }, [task?.status])

  const retry = async () => {
    if (task?.status === 'running' || task?.status === 'queued') {
      if (!confirm('Task đang chạy. Dừng và chạy lại từ đầu?')) return
    }
    setLogs([]); seenCount.current = 0
    try { await fetch(`${API}/tasks/${id}/retry`, { method: 'POST', headers: headers() }) } catch {}
    load()
  }

  if (!task) return <div className={wrap}><div className="mx-auto max-w-2xl text-center py-20 text-[13px] text-[#8a7a60]">Đang tải…</div></div>

  const fileUrl = (name) => `${API}/file/${encodeURIComponent(name)}?t=${encodeURIComponent(token)}`
  const isDone = task.status === 'done'
  const isRunning = task.status === 'running' || task.status === 'queued'

  return (
    <div className={wrap}>
      <div className="mx-auto max-w-2xl">
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onBack} className="text-[13px] text-[#8a7a60] hover:text-[#c9a44a]">← Lịch sử</button>
          {!isDone && (
            <button onClick={retry} className={ghostBtn}>🔁 Thử lại</button>
          )}
        </div>

        {/* Title */}
        <div className="mb-3 flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-[#e8dfc8]">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>

        {/* Status card */}
        <div className={`${card} mb-4`}>
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <StatusBadge status={task.status} />
            <span className="text-[#8a7a60]">{task.source_type === 'youtube' ? '▶ YouTube' : '📁 Upload'}</span>
            {task.duration ? <span className="text-[#8a7a60]">{Math.floor(task.duration / 60)}:{String(Math.floor(task.duration % 60)).padStart(2, '0')}</span> : null}
            {task.segments_count ? <span className="text-[#8a7a60]">{task.segments_count} câu</span> : null}
          </div>
          {task.error && task.status !== 'done' && <div className="mt-2 text-[12px] text-red-400">{task.error}</div>}
        </div>

        {/* Video player */}
        {isDone && task.video_file && (
          <div className={`${card} mb-4`}>
            <div className="mb-3 text-[13px] font-semibold text-emerald-400">
              ✅ Hoàn tất — {task.segments_count} câu thoại
            </div>
            <video
              ref={videoRef}
              controls playsInline preload="metadata"
              src={fileUrl(task.video_file)}
              className="w-full rounded-xl bg-black" style={{ maxHeight: '60vh' }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={fileUrl(task.video_file)} download className={ghostBtn}>⬇️ Tải video MP4</a>
              {task.srt_file && <a href={fileUrl(task.srt_file)} download className={ghostBtn}>⬇️ Tải phụ đề SRT</a>}
            </div>
          </div>
        )}

        {/* Log */}
        <div className="rounded-xl border border-[#3a2e1e] bg-[#090705] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#e8dfc8]">Tiến trình</span>
            {isRunning && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#c9a44a]" />}
            {logs.length > 0 && <span className="text-[11px] text-[#8a7a60]">{logs.length} dòng</span>}
          </div>
          <div ref={logRef} className="max-h-[360px] overflow-y-auto font-mono text-[11px] leading-5 text-[#bdae8e]">
            {logs.length === 0 ? (
              <div className="text-[#8a7a60]">{isRunning ? '⏳ Đang chờ log...' : 'Chưa có log.'}</div>
            ) : logs.map((l, i) => (
              <div key={i} style={{ color: l.startsWith('❌') ? '#cc6060' : l.startsWith('✅') || l.startsWith('✓') ? '#6dba7f' : undefined }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
