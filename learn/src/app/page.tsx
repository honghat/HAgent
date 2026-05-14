'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const QUOTES = [
  "960 giờ. Không có thời gian để lướt mạng xã hội.",
  "Code không biết bạn mệt. Gõ tiếp.",
  "Mỗi giờ bạn lãng phí = 1 giờ kém hơn ứng viên khác.",
  "Junior dev lương 10-15tr đang chờ bạn ở ngày 61.",
  "Sau 60 ngày, bạn sẽ có việc làm hoặc có lý do.",
  "Không ai quan tâm bạn mệt. Họ chỉ xem portfolio.",
  "Bạn không học vì tiện. Bạn học vì cần.",
  "Mỗi bug bạn fix là 1 kỹ năng HR tìm kiếm.",
];

interface DayLog { id: number; date: string; hours: number; topic: string; notes: string; }
interface AIReport { id: number; date: string; content: string; createdAt: string; }
function fmtMs(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, mins: 0 };
  return { days: Math.floor(ms/86400000), hours: Math.floor((ms%86400000)/3600000), mins: Math.floor((ms%3600000)/60000) };
}

function parseMarkdown(text: string) {
  if (!text) return '';

  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--surface2);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const headStyle: Record<number, string> = {
    1: 'font-size:18px;margin:14px 0 8px;font-weight:900',
    2: 'font-size:16px;margin:12px 0 6px;font-weight:800',
    3: 'font-size:14px;margin:10px 0 4px;font-weight:700',
    4: 'font-size:13px;margin:10px 0 4px;font-weight:700;color:var(--accent)',
    5: 'font-size:12px;margin:8px 0 3px;font-weight:700;color:var(--accent)',
    6: 'font-size:12px;margin:8px 0 3px;font-weight:600;color:var(--muted)',
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block ```
    if (/^```/.test(trimmed)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="background:var(--surface2);padding:10px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0;border:1px solid var(--border)"><code>${buf.join('\n').replace(/</g, '&lt;')}</code></pre>`);
      continue;
    }

    // Table — current line starts with |, next is |---|
    if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const cells = (r: string) => r.trim().split('|').slice(1, -1).map(c => inline(c.trim()));
      const heads = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(cells(lines[i])); i++; }
      const th = heads.map(h => `<th style="border:1px solid var(--border);padding:6px 8px;background:var(--surface2);text-align:left;font-size:12px">${h}</th>`).join('');
      const tb = rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid var(--border);padding:6px 8px;font-size:12px">${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table style="border-collapse:collapse;margin:10px 0;width:100%"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} style="${headStyle[level]}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s+/.test(trimmed)) {
      out.push(`<blockquote style="border-left:3px solid var(--muted);padding-left:12px;margin:10px 0;font-style:italic;color:var(--muted)">${inline(trimmed.replace(/^>\s+/, ''))}</blockquote>`);
      i++;
      continue;
    }

    // List item
    if (/^[-*]\s+/.test(trimmed)) {
      out.push(`<div style="padding-left:14px;margin:3px 0">•&nbsp;${inline(trimmed.replace(/^[-*]\s+/, ''))}</div>`);
      i++;
      continue;
    }

    // Empty line — small gap
    if (trimmed === '') {
      out.push('<div style="height:6px"></div>');
      i++;
      continue;
    }

    // Plain paragraph
    out.push(`<div style="margin:2px 0">${inline(line)}</div>`);
    i++;
  }

  return out.join('');
}

export default function HomePage() {
  const router = useRouter();
  const [cd, setCd] = useState({ days: 60, hours: 0, mins: 0 });
  const [missionStart, setMissionStart] = useState(0);
  const [totalH, setTotalH] = useState(0);
  const [streak, setStreak] = useState(0);
  const [todayH, setTodayH] = useState(0);
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [form, setForm] = useState({ hours: 4, topic: '', notes: '' });
  const [qi, setQi] = useState(0);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const [aiReport, setAiReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<AIReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState('default');
  const [isMounted, setIsMounted] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsMounted(true);
    const savedModel = localStorage.getItem('eng_model');
    if (savedModel) setAiModel(savedModel);
  }, []);

  useEffect(() => {
    if (isMounted) localStorage.setItem('eng_model', aiModel);
  }, [aiModel, isMounted]);

  const loadReports = useCallback(async () => {
    try {
      const r = await fetch('/api/ai-reports');
      if (r.ok) setSavedReports(await r.json());
    } catch {}
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function deleteReport(id: number) {
    await fetch(`/api/ai-reports?id=${id}`, { method: 'DELETE' });
    if (selectedReportId === id) { setSelectedReportId(null); setAiReport(''); }
    loadReports();
  }

  function viewReport(r: AIReport) {
    setAiReport(r.content);
    setSelectedReportId(r.id);
  }

  const [aiInfo, setAiInfo] = useState<{server:string, provider:string}>({server:'', provider:''});

  useEffect(() => {
    // Immediate local sync
    const cachedProv = localStorage.getItem('eng_provider');
    const cachedServer = localStorage.getItem('eng_server');
    if (cachedProv && cachedServer) {
      setAiInfo({ server: cachedServer, provider: cachedProv });
    }

    fetch('/api/settings').then(r => r.json()).then(d => {
      setAiInfo({ server: d.aiServer, provider: d.aiProvider });
      if (d.aiModel) {
        setAiModel(d.aiModel);
        localStorage.setItem('eng_model', d.aiModel);
      }
      // Keep local store in sync with database truth
      localStorage.setItem('eng_provider', d.aiProvider);
      localStorage.setItem('eng_server', d.aiServer);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const [mRes, lRes] = await Promise.all([fetch('/api/mission'), fetch('/api/logs')]);
    const mData = mRes.ok ? await mRes.json().catch(() => ({})) : {};
    const { startDate } = mData;
    const allLogs: DayLog[] = lRes.ok ? await lRes.json().catch(() => []) : [];
    setMissionStart(startDate);
    setLogs(allLogs.slice(0, 30));
    setTotalH(allLogs.reduce((s, l) => s + l.hours, 0));
    setTodayH(parseFloat((allLogs.find(l => l.date === today)?.hours ?? 0).toFixed(1)));
    let s = 0; const cur = new Date(); cur.setHours(0,0,0,0);
    let curTs = cur.getTime();
    for (const l of allLogs) {
      const d = new Date(l.date); d.setHours(0,0,0,0);
      if ((curTs - d.getTime()) / 86400000 <= 1 && l.hours > 0) { s++; curTs = d.getTime(); } else break;
    }
    setStreak(s);
    const tl = allLogs.find(l => l.date === today);
    if (tl) setForm({ hours: parseFloat(tl.hours.toFixed(1)), topic: tl.topic, notes: tl.notes });
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); setQi(new Date().getDay() % QUOTES.length); }, [load]);

  useEffect(() => {
    if (!missionStart) return;
    const end = missionStart + 60*24*3600000;
    const tick = () => setCd(fmtMs(end - Date.now()));
    tick(); const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [missionStart]);

  async function save() {
    await fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: today, ...form }) });
    await load(); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function generateAIReport() {
    if (logs.length === 0) return;
    setReportLoading(true);
    const logSummary = logs.slice(0, 7).map(l => `- Ngày ${l.date}: ${l.hours}h (${l.topic})`).join('\n');
    const prompt = `Bạn là một chuyên gia tư vấn lộ trình học tập (Learning Coach). Dưới đây là nhật ký học tập trong 7 ngày qua của học viên:
${logSummary}
Tổng giờ tích lũy hiện tại: ${totalH}h / mục tiêu 960h. Streak: ${streak} ngày.

Hãy phân tích và đưa ra nhận xét chuyên nghiệp theo định dạng Markdown:
# 📊 Đánh giá tiến độ học tập
## 1. Phân tích cường độ
(Nhận xét về sự ổn định và số giờ học)
## 2. Lộ trình & Nội dung
(Đánh giá các chủ đề đã học và gợi ý hướng đi tiếp theo)
## 3. Lời khuyên & Động lực
(Lời khuyên để tối ưu hóa việc học)

Trả lời bằng tiếng Việt, chuyên sâu và cá nhân hóa.`;

    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '⚠️ AI không phản hồi';
    setAiReport(content);
    setSelectedReportId(null);
    if (data.choices?.[0]?.message?.content) {
      try {
        const r = await fetch('/api/ai-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
        if (r.ok) { const saved = await r.json(); setSelectedReportId(saved.id); loadReports(); }
      } catch {}
    }
    setReportLoading(false);
  }

  const elapsed = 60 - cd.days;
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Đang tải...</div>;

  const stats = [
    { label:'Còn lại', val: cd.days, unit:'ngày', color:'#f85149', pct:(cd.days/60)*100 },
    { label:'Tổng giờ', val: Math.round(totalH), unit:'/960h', color:'#58a6ff', pct:(totalH/960)*100 },
    { label:'Streak 🔥', val: streak, unit:'ngày', color:'#d29922', pct:(streak/60)*100 },
    { label:'Hôm nay', val: todayH, unit:'/16h', color:'#3fb950', pct:(todayH/16)*100 },
  ];

  // Tính toán nhiệm vụ hôm nay dựa trên nhật ký
  const todayLog = logs.find(l => l.date === today);
  const topics = todayLog?.topic || '';
  const missionTasks = [
    { id: 'code', label: 'Bài học Code mới', icon: '💻', done: topics.includes('💻'), link: '/learn' },
    { id: 'listen', label: 'Luyện nghe Tiếng Anh', icon: '🎧', done: topics.includes('🎧'), link: '/english' },
    { id: 'speak', label: 'Luyện nói Tiếng Anh', icon: '🗣️', done: topics.includes('🗣️'), link: '/english' },
    { id: 'mindmap', label: 'Hệ thống Mindmap', icon: '🧠', done: topics.includes('🧠'), link: '/mindmap' },
  ];
  const missionsDone = missionTasks.filter(t => t.done).length;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 14, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <h1 className="page-title" style={{ fontSize:20, fontWeight:900, marginBottom:2, background:'linear-gradient(135deg, #f85149, #ff8c69)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', whiteSpace:'nowrap' }}>Trang Chủ</h1>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit' })}</div>
            {aiInfo.provider && (
              <div style={{ fontSize:9, color:'rgba(63,185,80,0.8)', fontWeight:800, background:'rgba(63,185,80,0.05)', padding:'1px 6px', borderRadius:4, border:'1px solid rgba(63,185,80,0.2)' }}>
                🧠 {aiModel} · 🌐 {aiInfo.provider.toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ color:'#f85149', fontWeight:800, fontSize:16, lineHeight:1 }}>{Math.round((elapsed/60)*100)}%</div>
          <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginTop:2 }}>HOÀN THÀNH</div>
        </div>
      </div>

      <div className="desktop-main-side" style={{ gap: 16, marginBottom: 12 }}>
        {/* LEFT COLUMN */}
        <div>
          {/* Daily Missions - NEW */}
          <div className="card" style={{ marginBottom: 12, background: 'linear-gradient(135deg, var(--surface), #1a1f2e)', border: '1px solid var(--accent)33' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontWeight:800, fontSize:14, color:'var(--accent)', letterSpacing:0.5 }}>🎯 NHIỆM VỤ HÔM NAY</div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', background:'var(--surface2)', padding:'2px 8px', borderRadius:99 }}>{missionsDone}/4</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {missionTasks.map(t => (
                <div key={t.id} onClick={() => router.push(t.link)} style={{ 
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, 
                  background: t.done ? 'rgba(63,185,80,0.05)' : 'var(--surface2)', 
                  border: `1px solid ${t.done ? 'var(--green)44' : 'var(--border)'}`,
                  cursor:'pointer', transition:'all 0.2s'
                }} className="mission-item">
                  <div style={{ fontSize:16 }}>{t.icon}</div>
                  <div style={{ flex:1, fontSize:13, fontWeight:600, color: t.done ? 'var(--green)' : 'var(--text)' }}>{t.label}</div>
                  <div style={{ 
                    width:20, height:20, borderRadius:'50%', 
                    border: `2px solid ${t.done ? 'var(--green)' : 'var(--muted)'}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color: 'var(--green)', fontSize:12, fontWeight:900
                  }}>
                    {t.done ? '✓' : ''}
                  </div>
                </div>
              ))}
            </div>
            {missionsDone === 4 && (
              <div style={{ marginTop:12, textAlign:'center', fontSize:11, color:'var(--green)', fontWeight:800 }}>🔥 TUYỆT VỜI! BẠN ĐÃ HOÀN THÀNH TẤT CẢ</div>
            )}
          </div>

          {/* Stats — compact horizontal pills */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
            {stats.map(s => (
              <div key={s.label} className="stat-card" style={{ textAlign:'left', position:'relative', overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div className="stat-label" style={{ margin:0 }}>{s.label}</div>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:s.color, boxShadow:`0 0 8px ${s.color}` }} />
                </div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--muted)' }}>{s.unit}</div>
                </div>
                <div className="progress-bar" style={{ marginTop:8, height:3 }}>
                  <div className="progress-fill" style={{ width:`${Math.min(100,s.pct)}%`, background:s.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Countdown */}
          <div className="countdown-banner" style={{ marginBottom: 12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:10, color:'#f85149', fontWeight:800, letterSpacing:2 }}>⚡ TIẾN ĐỘ 60 NGÀY</div>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>{elapsed}/60</div>
            </div>
            <div className="progress-bar" style={{ height:6, marginBottom:8 }}>
              <div className="progress-fill" style={{ width:`${(elapsed/60)*100}%`, background:'linear-gradient(90deg, #f85149, #ff6b6b)' }} />
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center' }}>Còn {cd.days} ngày, {cd.hours} giờ nữa để về đích</div>
          </div>

          {/* Quote — minimal */}
          <div className="card" style={{ borderLeft:'3px solid var(--accent)', marginBottom:12, padding:12 }}>
            <div style={{ fontSize:12, fontStyle:'italic', lineHeight:1.6, color:'var(--text)' }}>"{QUOTES[qi]}"</div>
            <button onClick={()=>setQi((qi+1)%QUOTES.length)} style={{ marginTop:6, fontSize:10, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', padding:0 }}>→ Câu tiếp</button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Daily Log Form */}
          <div className="card" style={{ marginBottom:20 }}>
            <button
              onClick={() => setNotesExpanded(!notesExpanded)}
              style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom: notesExpanded ? 14 : 0 }}
            >
              <div style={{ fontWeight:700, fontSize:15 }}>📝 Nhật Ký Hôm Nay</div>
              <span style={{ fontSize:18, color:'var(--muted)', transition:'transform 0.2s', transform: notesExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
            </button>

            {notesExpanded && (
              <>
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                    <span style={{ color:'var(--muted)' }}>Giờ học</span>
                    <span style={{ color:'var(--green)', fontWeight:700, fontSize:16 }}>{form.hours}h <span style={{ color:'var(--muted)', fontWeight:400, fontSize:12 }}>/ 16h</span></span>
                  </div>
                  <input type="range" min={0} max={16} step={0.5} value={form.hours}
                    onChange={e=>setForm(f=>({...f,hours:parseFloat(e.target.value)}))}
                    style={{ width:'100%', accentColor:'var(--green)', cursor:'pointer', height: 8 }} />
                  <div className="progress-bar" style={{ marginTop:6 }}>
                    <div className="progress-fill" style={{ width:`${(form.hours/16)*100}%`, background:'var(--green)' }} />
                  </div>
                  {/* Quick time buttons */}
                  <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                    {[0.5, 1, 2, 4, 6, 8].map(h => (
                      <button key={h} onClick={() => setForm(f => ({...f, hours: h}))}
                        style={{ flex:1, minWidth:50, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', background: form.hours === h ? 'var(--green)22' : 'var(--surface2)', color: form.hours === h ? 'var(--green)' : 'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <textarea className="input" placeholder="Ghi chú, vướng mắc, điều cần nhớ..." value={form.notes} rows={3}
                  onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ marginBottom:12 }} />
                <button className="btn btn-green" style={{ width:'100%' }} onClick={save}>
                  {saved ? '✅ Đã lưu vào PostgreSQL' : '💾 Lưu nhật ký'}
                </button>
              </>
            )}
          </div>

          {/* Saved AI Reports */}
          {savedReports.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color:'var(--muted)', marginBottom: 8, letterSpacing: 1 }}>📚 ĐÁNH GIÁ TRƯỚC ĐÂY ({savedReports.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight: 200, overflowY:'auto' }}>
                {savedReports.map(r => {
                  const active = selectedReportId === r.id;
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:6, background: active ? 'var(--surface2)' : 'transparent', border:`1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>
                      <button onClick={() => viewReport(r)} style={{ flex:1, textAlign:'left', background:'none', border:'none', color: active ? 'var(--accent)' : 'var(--text)', cursor:'pointer', fontSize:12, padding:0 }}>
                        <div style={{ fontWeight:600 }}>{new Date(r.createdAt).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
                        <div style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.content.replace(/[#*`>|-]/g,'').slice(0,60)}...</div>
                      </button>
                      <button onClick={() => deleteReport(r.id)} title="Xoá" style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12, padding:'2px 6px' }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Report Card */}
          {aiReport && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)', background: 'var(--surface2)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color:'var(--muted)', fontWeight:600 }}>{selectedReportId ? '📖 Đang xem báo cáo đã lưu' : '✨ Báo cáo mới'}</div>
                <button onClick={() => { setAiReport(''); setSelectedReportId(null); }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 }}>✕</button>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)' }}
                   dangerouslySetInnerHTML={{ __html: parseMarkdown(aiReport) }}></div>
            </div>
          )}

          {/* History */}
          {logs.length > 0 && (
            <div className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div className="section-title" style={{ margin:0 }}>Lịch sử học</div>
                <button className="btn btn-ghost" style={{ padding:'4px 10px', fontSize:11, height:28 }} onClick={generateAIReport} disabled={reportLoading}>
                  {reportLoading ? '⏳ Đang phân tích...' : '🤖 AI đánh giá tiến độ'}
                </button>
              </div>
              {logs.slice(0,8).map(l => {
                const isExpanded = expandedDays.has(l.date);
                const toggleDay = () => {
                  setExpandedDays(prev => {
                    const next = new Set(prev);
                    if (next.has(l.date)) next.delete(l.date);
                    else next.add(l.date);
                    return next;
                  });
                };

                return (
                  <div key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <button
                      onClick={toggleDay}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 0', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                    >
                      <div style={{ width:48, height:48, borderRadius:12, background: l.hours >= 8 ? 'rgba(63,185,80,0.1)' : 'rgba(125,133,144,0.05)', border: `1px solid ${l.hours >= 8 ? 'var(--green)' : 'var(--border)'}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <div style={{ fontSize:14, fontWeight:900, color: l.hours >= 8 ? 'var(--green)' : 'var(--text)' }}>{parseFloat(l.hours.toFixed(1))}</div>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700 }}>GIỜ</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
                          {new Date(l.date).toLocaleDateString('vi-VN', { weekday:'short', day:'2-digit', month:'2-digit' })}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {l.topic ? l.topic.split(', ').length + ' hoạt động' : 'Không có ghi chú'}
                        </div>
                      </div>
                      <span style={{ fontSize:16, color:'var(--muted)', transition:'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                    </button>

                    {isExpanded && l.topic && (
                      <div style={{ paddingLeft:62, paddingBottom:12, display:'flex', flexDirection:'column', gap:6 }}>
                        {l.topic.split(', ').map((t, idx) => {
                          const isCode = t.includes('💻');
                          const isListen = t.includes('🎧');
                          const isRead = t.includes('📖');
                          const isSpeak = t.includes('🗣️');
                          const isWrite = t.includes('✍️');
                          const isVocab = t.includes('🗂️');

                          let color = 'var(--accent)';
                          if (isListen) color = '#58a6ff';
                          if (isRead) color = '#d2a8ff';
                          if (isSpeak) color = '#3fb950';
                          if (isWrite) color = '#ff7b72';
                          if (isVocab) color = '#d29922';
                          if (isCode) color = '#f78166';

                          return (
                            <div key={idx} style={{ fontSize:12, color, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', padding:'4px 8px', background:'rgba(125,133,144,0.05)', borderRadius:6, border:`1px solid ${color}22` }}>
                              {t}
                            </div>
                          );
                        })}
                        {l.hours >= 8 && <span style={{ fontSize:9, color:'var(--green)', background:'rgba(63,185,80,0.1)', padding:'1px 6px', borderRadius:99, border:'1px solid #3fb95044', fontWeight:800, alignSelf:'flex-start' }}>🔥 ĐÃ ĐẠT KPI</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* AI Info & Management link */}
          <div style={{ textAlign: 'center', marginTop: 24, padding: '16px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Đang kết nối: <strong style={{color:'var(--accent)'}}>{aiInfo.server}</strong>
            </div>
            <button onClick={() => router.push('/admin')} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 16px' }}>
              ⚙️ Quản lý AI & Máy chủ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
