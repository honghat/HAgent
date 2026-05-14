'use client';
import { useState, useEffect } from 'react';
import { useTimer } from '@/context/TimerContext';

const DAILY_GOAL = 16;
const WORK_MIN = 50, BREAK_MIN = 10;
const QUOTES = ["Tắt điện thoại. Code là ưu tiên.","50 phút focus = 1 kỹ năng tiến bộ.","Mỗi Pomodoro = 1 bước đến việc làm.","Nghỉ 10 phút, không phải 10 tiếng.","Bạn không cần mood. Bạn cần timer.","Senior dev cũng bắt đầu từ Pomodoro đầu tiên."];

export default function TimerPage() {
  const { isWork, secs, running, session, todaySessions, toggle, reset, switchMode, setTime } = useTimer();
  const [qi, setQi] = useState(0);
  const [focus, setFocus] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const total = isWork ? WORK_MIN*60 : BREAK_MIN*60;
  const pct = ((total - secs) / total) * 100;
  const R = 110, circ = 2*Math.PI*R;
  const color = isWork ? '#f85149' : '#3fb950';
  const mm = String(Math.floor(secs/60)).padStart(2,'0');
  const ss = String(secs%60).padStart(2,'0');
  const todayH = ((todaySessions * WORK_MIN) / 60).toFixed(1);

  function handleToggle() {
    if (!running) setQi(q => (q+1) % QUOTES.length);
    toggle();
  }

  const TimerRing = ({ size = 280 }: { size?: number }) => {
    const cx = size/2, r = size*0.39;
    const c2 = 2*Math.PI*r;
    return (
      <div style={{ position:'relative', width:size, height:size }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)', display:'block' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface2)" strokeWidth={14}/>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={14}
            strokeDasharray={c2} strokeDashoffset={c2*(1-pct/100)}
            strokeLinecap="round" style={{ transition:'stroke-dashoffset 1s linear', filter:`drop-shadow(0 0 8px ${color}66)` }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontSize: size > 200 ? 56 : 44, fontWeight:900, color, fontVariantNumeric:'tabular-nums', letterSpacing:-2, lineHeight:1 }}>{mm}:{ss}</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:6 }}>{isWork ? `Phiên ${session+1}` : 'Nghỉ ngơi'}</div>
        </div>
      </div>
    );
  };

  const Controls = () => (
    <div style={{ display:'flex', gap:12, alignItems:'center', justifyContent:'center' }}>
      <button onClick={reset} disabled={!running && secs === (isWork ? WORK_MIN*60 : BREAK_MIN*60)} style={{ width:52, height:52, borderRadius:99, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:20, cursor:'pointer', transition:'all 0.15s', opacity: (!running && secs === (isWork ? WORK_MIN*60 : BREAK_MIN*60)) ? 0.3 : 1 }}>↺</button>
      <button onClick={handleToggle} style={{ width:72, height:72, borderRadius:99, background:color, border:'none', color:'#000', fontSize:26, fontWeight:900, cursor:'pointer', boxShadow:`0 0 20px ${color}44`, transition:'all 0.15s' }}>
        {running ? '⏸' : '▶'}
      </button>
      <button onClick={()=>setFocus(f=>!f)} style={{ width:52, height:52, borderRadius:99, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>
        {focus ? '⊡' : '⛶'}
      </button>
    </div>
  );

  const Dots = () => (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', maxWidth:240 }}>
      {Array.from({length:DAILY_GOAL}).map((_,i) => (
        <div key={i} style={{ width:13, height:13, borderRadius:99, background:i<todaySessions?'var(--green)':'var(--surface2)', border:'1px solid', borderColor:i<todaySessions?'var(--green)':'var(--border)', transition:'all 0.3s' }}/>
      ))}
    </div>
  );

  if (focus) return (
    <div style={{ position:'fixed', inset:0, background:'#060810', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:100, gap:32 }}>
      <TimerRing size={320}/>
      <Controls/>
      <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>"{QUOTES[qi]}"</div>
      <button onClick={()=>setFocus(false)} style={{ position:'absolute', top:20, right:20, background:'none', border:'none', color:'var(--muted)', fontSize:24, cursor:'pointer' }}>✕</button>
    </div>
  );

  return (
    <div className="fade-in" style={{ paddingTop:'12px' }}>
      <div style={{ marginBottom:'32px' }}>
        <h1 className="page-title" style={{ fontSize:'24px', fontWeight:900, marginBottom:'8px' }}>⏱ Pomodoro Timer</h1>
        {mounted && running && <span className="pill" style={{ borderColor:color, color, background:color+'11', fontSize:11 }}>{isWork?'🔴 Đang học':'🟢 Đang nghỉ'}</span>}
      </div>

      <div className="desktop-2col">
        {/* Left: Timer */}
        <div className="card" style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:32, gap:32, marginBottom: 24 }}>
          {/* Mode tabs */}
          <div style={{ display:'flex', gap:8 }}>
            {[{l:'🔴 Tập Trung',w:true},{l:'🟢 Nghỉ',w:false}].map(({l,w}) => (
              <button key={l} onClick={()=>switchMode(w)} style={{ padding:'8px 20px', borderRadius:99, border:'1px solid', borderColor:isWork===w?color:'var(--border)', background:isWork===w?color+'15':'transparent', color:isWork===w?color:'var(--muted)', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.2s' }}>{l}</button>
            ))}
          </div>
          <TimerRing size={280}/>
          <Controls/>
          {/* Time slider - luôn hiển thị, disable khi đang chạy */}
          <div style={{ width: '100%', maxWidth: 280, opacity: running ? 0.5 : 1, pointerEvents: running ? 'none' : 'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginBottom:6 }}>
              <span>Kéo để điều chỉnh</span>
              <span>{Math.floor(secs/60)} phút</span>
            </div>
            <input
              type="range"
              min={1}
              max={isWork ? WORK_MIN*60 : BREAK_MIN*60}
              step={60}
              value={secs}
              onChange={e => setTime(parseInt(e.target.value))}
              disabled={running}
              style={{ width:'100%', accentColor:color, cursor: running ? 'not-allowed' : 'pointer', height:6 }}
            />
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap', justifyContent:'center' }}>
              {(isWork ? [10, 25, 35, 50] : [5, 10]).map(min => (
                <button key={min} onClick={() => setTime(min * 60)} disabled={running}
                  style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background: Math.floor(secs/60) === min ? color+'22' : 'var(--surface2)', color: Math.floor(secs/60) === min ? color : 'var(--muted)', fontSize:11, fontWeight:600, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.5 : 1 }}>
                  {min}m
                </button>
              ))}
            </div>
          </div>
          <div style={{ textAlign:'center', fontSize:12, color:'var(--muted)' }}>
            {todaySessions} / {DAILY_GOAL} phiên hôm nay ({todayH}h)
          </div>
          <Dots/>
        </div>

        {/* Right: Stats + quote */}
        <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
            {[
              { label:'Phiên hôm nay', val:todaySessions, color:'var(--accent)' },
              { label:'Giờ học hôm nay', val:todayH+'h', color:'var(--green)' },
              { label:'Còn lại', val:`${DAILY_GOAL-todaySessions} phiên`, color:'var(--orange)' },
              { label:'Thời gian', val:isWork?`${WORK_MIN} phút`:`${BREAK_MIN} phút`, color:color },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign:'center', padding:'24px 16px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:28, fontWeight:900, color:s.color, marginBottom:6 }}>{s.val}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Daily goal bar */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Mục tiêu ngày</span>
              <span style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>{Math.round((todaySessions/DAILY_GOAL)*100)}%</span>
            </div>
            <div className="progress-bar" style={{ height:10 }}>
              <div className="progress-fill" style={{ width:`${Math.min(100,(todaySessions/DAILY_GOAL)*100)}%`, background:'linear-gradient(90deg,var(--green),#56d364)' }}/>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>{todaySessions}/{DAILY_GOAL} Pomodoro = {todayH}h / 14.1h mục tiêu</div>
          </div>

          {/* Quote card */}
          <div className="card" style={{ borderLeft:'3px solid var(--orange)' }}>
            <div style={{ fontSize:13, fontStyle:'italic', lineHeight:1.7, color:'var(--text)' }}>"{QUOTES[qi]}"</div>
            <button onClick={()=>setQi(q=>(q+1)%QUOTES.length)} style={{ marginTop:8, fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer' }}>→ Tiếp</button>
          </div>

          {/* Tips */}
          <div className="card" style={{ background:'var(--surface2)' }}>
            <div className="section-title">Kỹ thuật Pomodoro</div>
            {['🎯 Làm 1 việc duy nhất trong 50 phút','📵 Tắt notification hoàn toàn','🧠 Không ngừng giữa chừng','☕ Nghỉ 10 phút thật sự không code'].map(t=>(
              <div key={t} style={{ fontSize:12, color:'var(--muted)', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>{t}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
