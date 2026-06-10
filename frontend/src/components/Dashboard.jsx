import { useState, useEffect, useCallback } from 'react'

const QUOTES = [
  "960 giờ. Không có thời gian để lướt mạng xã hội.",
  "Code không biết bạn mệt. Gõ tiếp.",
  "Mỗi giờ bạn lãng phí = 1 giờ kém hơn ứng viên khác.",
  "Junior dev lương 10-15tr đang chờ bạn ở ngày 61.",
  "Sau 60 ngày, bạn sẽ có việc làm hoặc có lý do.",
  "Không ai quan tâm bạn mệt. Họ chỉ xem portfolio.",
  "Bạn không học vì tiện. Bạn học vì cần.",
  "Mỗi bug bạn fix là 1 kỹ năng HR tìm kiếm.",
]

function fmtMs(ms) {
  if (ms <= 0) return { days: 0, hours: 0, mins: 0 }
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
  }
}

export default function Dashboard({ token }) {
  const auth = (h) => ({ ...h, Authorization: `Bearer ${token}` })
  const [cd, setCd] = useState({ days: 60, hours: 0, mins: 0 })
  const [missionStart, setMissionStart] = useState(0)
  const [totalH, setTotalH] = useState(0)
  const [streak, setStreak] = useState(0)
  const [todayH, setTodayH] = useState(0)
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState({ hours: 4, topic: '', notes: '' })
  const [qi, setQi] = useState(0)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        fetch('/api/learn/mission', { headers: auth({}) }),
        fetch('/api/learn/logs', { headers: auth({}) }),
      ])
      const mData = mRes.ok ? await mRes.json().catch(() => ({})) : {}
      const startDate = mData.startDate ? new Date(mData.startDate).getTime() : Date.now()
      const allLogs = lRes.ok ? await lRes.json().catch(() => []) : []
      setMissionStart(startDate)
      setLogs(allLogs.slice(0, 30))
      const total = allLogs.reduce((s, l) => s + (l.hours || 0), 0)
      setTotalH(total)
      const td = allLogs.find((l) => l.date === today)
      setTodayH(parseFloat((td?.hours ?? 0).toFixed(1)))
      let streakCount = 0
      const cur = new Date()
      cur.setHours(0, 0, 0, 0)
      let curTs = cur.getTime()
      for (const l of allLogs) {
        const d = new Date(l.date)
        d.setHours(0, 0, 0, 0)
        if ((curTs - d.getTime()) / 86400000 <= 1 && l.hours > 0) {
          streakCount++
          curTs = d.getTime()
        } else break
      }
      setStreak(streakCount)
      if (td) setForm({ hours: parseFloat(td.hours.toFixed(1)), topic: td.topic || '', notes: td.notes || '' })
    } catch (e) {
      console.error('Dashboard load error', e)
    } finally {
      setLoading(false)
    }
  }, [today, token])

  useEffect(() => { load(); setQi(new Date().getDay() % QUOTES.length) }, [load])

  useEffect(() => {
    if (!missionStart) return
    const end = missionStart + 60 * 24 * 3600000
    const tick = () => setCd(fmtMs(end - Date.now()))
    tick(); const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [missionStart])

  async function save() {
    await fetch('/api/learn/logs', {
      method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ date: today, ...form }),
    })
    await load(); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const elapsed = 60 - cd.days
  if (loading) return <div className="flex items-center justify-center h-[60vh] text-gray-400 text-xs">Đang tải...</div>

  const stats = [
    { label: 'Còn lại', val: cd.days, unit: 'ngày', color: '#f85149', pct: (cd.days / 60) * 100 },
    { label: 'Tổng giờ', val: Math.round(totalH), unit: '/960h', color: '#58a6ff', pct: (totalH / 960) * 100 },
    { label: 'Streak', val: streak, unit: 'ngày', color: '#d29922', pct: (streak / 60) * 100 },
    { label: 'Hôm nay', val: todayH, unit: '/16h', color: '#3fb950', pct: (todayH / 16) * 100 },
  ]

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-lg font-black" style={{ background: 'linear-gradient(135deg, #f85149, #ff8c69)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Trang Chủ</h1>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-[#f85149]">{Math.round((elapsed / 60) * 100)}%</div>
          <div className="text-[9px] text-gray-400 tracking-wider">HOÀN THÀNH</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="bg-[var(--color-bg-2)] rounded-xl p-3 border border-black/[0.06]">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-gray-400 font-semibold">{s.label}</span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black" style={{ color: s.color }}>{s.val}</span>
                  <span className="text-[11px] text-gray-400 font-medium">{s.unit}</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-black/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.pct)}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06] border-l-[3px]" style={{ borderLeftColor: '#f85149' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] text-[#f85149] font-black tracking-widest">TIẾN ĐỘ 60 NGÀY</span>
              <span className="text-[10px] text-gray-400">{elapsed}/60</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mb-2">
              <div className="h-full rounded-full" style={{ width: `${(elapsed / 60) * 100}%`, background: 'linear-gradient(90deg, #f85149, #ff6b6b)' }} />
            </div>
            <div className="text-[10px] text-gray-400 text-center">Còn {cd.days} ngày, {cd.hours} giờ nữa để về đích</div>
          </div>

          <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06] border-l-[3px]" style={{ borderLeftColor: 'var(--color-accent)' }}>
            <div className="text-xs italic leading-relaxed text-gray-600">"{QUOTES[qi]}"</div>
            <button onClick={() => setQi((qi + 1) % QUOTES.length)} className="mt-1 text-[10px] text-gray-400 bg-transparent border-none cursor-pointer p-0">→ Câu tiếp</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold">📝 Nhật Ký Hôm Nay</span>
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-gray-400">Giờ học</span>
                <span className="text-[#3fb950] font-bold">{form.hours}h <span className="text-gray-400 font-normal text-[11px]">/ 16h</span></span>
              </div>
              <input type="range" min={0} max={16} step={0.5} value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: parseFloat(e.target.value) }))}
                className="w-full accent-[#3fb950] cursor-pointer h-2" />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[0.5, 1, 2, 4, 6, 8].map((h) => (
                  <button key={h} onClick={() => setForm((f) => ({ ...f, hours: h }))}
                    className={`flex-1 min-w-[50px] px-2 py-1.5 rounded-md text-[11px] font-semibold border cursor-pointer transition-all ${
                      form.hours === h ? 'bg-[#3fb950]/10 border-[#3fb950] text-[#3fb950]' : 'bg-[var(--color-bg)] border-black/[0.08] text-gray-400'
                    }`}>{h}h</button>
                ))}
              </div>
            </div>
            <input className="w-full mb-3 px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              placeholder="Chủ đề hôm nay" value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} />
            <textarea className="w-full mb-3 px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)] resize-none"
              placeholder="Ghi chú, vướng mắc..." rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <button className="w-full py-2 rounded-lg bg-[#3fb950] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#3fb950]/80"
              onClick={save}>
              {saved ? '✅ Đã lưu' : '💾 Lưu nhật ký'}
            </button>
          </div>

          {logs.length > 0 && (
            <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06]">
              <h3 className="text-xs font-bold text-gray-400 mb-3 tracking-wider uppercase">Lịch sử học</h3>
              <div className="space-y-2">
                {logs.slice(0, 8).map((l) => (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-black/[0.04] last:border-0">
                    <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0"
                      style={{ background: l.hours >= 8 ? 'rgba(63,185,80,0.1)' : 'rgba(125,133,144,0.05)', border: `1px solid ${l.hours >= 8 ? '#3fb950' : 'var(--border)'}` }}>
                      <span className="text-sm font-black" style={{ color: l.hours >= 8 ? '#3fb950' : 'inherit' }}>{parseFloat(l.hours.toFixed(1))}</span>
                      <span className="text-[8px] text-gray-400 font-bold">GIỜ</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold">{new Date(l.date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>
                      <div className="text-[10px] text-gray-400">{l.topic ? l.topic.split(', ').length + ' hoạt động' : 'Không có ghi chú'}</div>
                    </div>
                    {l.hours >= 8 && <span className="text-[8px] text-[#3fb950] bg-[#3fb950]/10 px-1.5 py-0.5 rounded-full border border-[#3fb950]/30 font-bold">KPI</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
