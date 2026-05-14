'use client';
import { useState, useEffect, useCallback } from 'react';

interface Task { id:string; label:string; week:number; difficulty:'easy'|'medium'|'hard'; }
const TASKS:Task[] = [
  {id:'html-basic',label:'HTML5 semantic tags, forms, tables',week:1,difficulty:'easy'},
  {id:'css-basic',label:'CSS3, Flexbox, Grid, Responsive design',week:1,difficulty:'easy'},
  {id:'css-adv',label:'CSS animations, variables, mobile-first',week:1,difficulty:'medium'},
  {id:'js-es6',label:'JavaScript ES6+: let/const, arrow fn, destructure',week:2,difficulty:'medium'},
  {id:'js-dom',label:'DOM manipulation, events',week:2,difficulty:'medium'},
  {id:'js-async',label:'Fetch API, async/await, Promises',week:2,difficulty:'hard'},
  {id:'react-basic',label:'React: JSX, components, props',week:3,difficulty:'medium'},
  {id:'react-hooks',label:'useState, useEffect, useCallback, useMemo',week:3,difficulty:'hard'},
  {id:'react-router',label:'React Router, navigation, params',week:3,difficulty:'medium'},
  {id:'nextjs-basic',label:'Next.js: App Router, pages, layouts',week:4,difficulty:'medium'},
  {id:'nextjs-ssr',label:'Server components, SSR vs SSG vs ISR',week:4,difficulty:'hard'},
  {id:'nextjs-api',label:'Next.js API routes, middleware',week:4,difficulty:'hard'},
  {id:'project1',label:'🏆 PROJECT: Clone 1 trang web thật',week:4,difficulty:'hard'},
  {id:'nodejs-basic',label:'Node.js: modules, fs, http, npm',week:5,difficulty:'medium'},
  {id:'express-basic',label:'Express: routing, middleware, error handling',week:5,difficulty:'medium'},
  {id:'rest-api',label:'REST API design: CRUD, status codes, Postman',week:5,difficulty:'medium'},
  {id:'sql-basic',label:'SQL: SELECT, JOIN, WHERE, GROUP BY',week:6,difficulty:'medium'},
  {id:'postgres',label:'PostgreSQL + pgAdmin setup & queries',week:6,difficulty:'medium'},
  {id:'prisma',label:'Prisma ORM: schema, migrations, relations',week:6,difficulty:'hard'},
  {id:'auth',label:'Authentication: JWT, bcrypt, sessions',week:6,difficulty:'hard'},
  {id:'git-adv',label:'Git: branching, PR, merge conflicts, rebase',week:7,difficulty:'medium'},
  {id:'deploy-vercel',label:'Deploy Next.js → Vercel',week:7,difficulty:'easy'},
  {id:'deploy-railway',label:'Deploy Node.js + PostgreSQL → Railway',week:7,difficulty:'medium'},
  {id:'cicd',label:'GitHub Actions CI/CD basics',week:7,difficulty:'hard'},
  {id:'project2',label:'🏆 PROJECT: Full-stack app (Next.js + Node + PostgreSQL)',week:8,difficulty:'hard'},
  {id:'portfolio',label:'Portfolio website + GitHub profile',week:8,difficulty:'medium'},
  {id:'cv',label:'CV tiếng Anh + LinkedIn profile',week:8,difficulty:'easy'},
  {id:'apply',label:'Apply 10 công ty/ngày + mock interview',week:8,difficulty:'medium'},
  {id:'en-a2',label:'A2→B1: 20 từ/ngày, 30 phút nghe',week:1,difficulty:'easy'},
  {id:'en-tech',label:'Technical reading: MDN, dev.to',week:3,difficulty:'medium'},
  {id:'en-speak',label:'Speaking với AI hàng ngày',week:3,difficulty:'medium'},
  {id:'en-b1',label:'B1→B2: Dev podcasts, YouTube tiếng Anh',week:5,difficulty:'medium'},
  {id:'en-interview',label:'Mock interview tiếng Anh với AI',week:7,difficulty:'hard'},
  {id:'en-write',label:'Viết CV + Cover letter tiếng Anh',week:8,difficulty:'hard'},
];

const DC = {easy:'var(--green)',medium:'var(--orange)',hard:'var(--red)'};
const DL = {easy:'Dễ',medium:'Vừa',hard:'Khó'};

export default function RoadmapPage() {
  const [checked, setChecked] = useState<string[]>([]);
  const [curWeek, setCurWeek] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cRes, mRes] = await Promise.all([fetch('/api/roadmap'), fetch('/api/mission')]);
    setChecked(await cRes.json());
    const { startDate } = await mRes.json();
    setCurWeek(Math.min(8, Math.max(1, Math.ceil((Date.now()-startDate)/(7*24*3600000)))));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(id:string) {
    const done = !checked.includes(id);
    setChecked(prev => done ? [...prev,id] : prev.filter(x=>x!==id));
    await fetch('/api/roadmap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,completed:done})});
  }

  const m1 = TASKS.filter(t=>t.week<=4&&!t.id.startsWith('en-'));
  const m2 = TASKS.filter(t=>t.week>=5&&!t.id.startsWith('en-'));
  const en = TASKS.filter(t=>t.id.startsWith('en-'));

  function TaskItem({t}:{t:Task}) {
    const done = checked.includes(t.id), cur = t.week===curWeek;
    return (
      <div onClick={()=>toggle(t.id)} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:10, marginBottom:4, cursor:'pointer', background:cur&&!done?'#1a1f2e':done?'#0a1a0a':'transparent', border:'1px solid', borderColor:cur&&!done?'#58a6ff33':done?'#3fb95022':'transparent', transition:'all 0.15s' }}
        onMouseEnter={e=>{if(!cur&&!done)(e.currentTarget as HTMLElement).style.background='var(--surface2)'}}
        onMouseLeave={e=>{if(!cur&&!done)(e.currentTarget as HTMLElement).style.background='transparent'}}>
        <div style={{ width:20, height:20, borderRadius:5, border:'2px solid', borderColor:done?'var(--green)':cur?'var(--accent)':'var(--border)', background:done?'var(--green)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1, transition:'all 0.15s' }}>
          {done && <span style={{ color:'#000', fontSize:11, fontWeight:900, lineHeight:1 }}>✓</span>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, color:done?'var(--muted)':'var(--text)', textDecoration:done?'line-through':'none', lineHeight:1.5 }}>{t.label}</div>
          <div style={{ display:'flex', gap:5, marginTop:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, color:DC[t.difficulty], background:DC[t.difficulty].replace(')',',0.15)').replace('var(','rgba(').replace('--green','60,185,80').replace('--orange','210,153,34').replace('--red','248,81,73'), padding:'2px 7px', borderRadius:99 }}>{DL[t.difficulty]}</span>
            {cur&&!done&&<span style={{ fontSize:10, color:'var(--accent)', background:'var(--accent)', padding:'2px 7px', borderRadius:99, opacity:0.15 }}>Tuần này</span>}
            {cur&&!done&&<span style={{ fontSize:10, color:'var(--accent)', position:'absolute', marginLeft:60 }}>← Tuần này</span>}
          </div>
        </div>
      </div>
    );
  }

  function Section({title,tasks,color,icon}:{title:string;tasks:Task[];color:string;icon:string}) {
    const done = tasks.filter(t=>checked.includes(t.id)).length;
    const pct = Math.round((done/tasks.length)*100);
    const weeks = [...new Set(tasks.map(t=>t.week))].sort();
    return (
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{icon} {title}</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:13, color, fontWeight:700 }}>{done}/{tasks.length}</span>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{pct}%</span>
          </div>
        </div>
        <div className="progress-bar" style={{ marginBottom:16, height:8 }}>
          <div className="progress-fill" style={{ width:`${pct}%`, background:color }}/>
        </div>
        {weeks.map(w => (
          <div key={w}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', letterSpacing:1, margin:'12px 0 6px', display:'flex', alignItems:'center', gap:8 }}>
              TUẦN {w}
              {w===curWeek && <span style={{ background:'var(--red)', color:'#fff', fontSize:9, padding:'2px 7px', borderRadius:99, fontWeight:700 }}>HIỆN TẠI</span>}
            </div>
            {tasks.filter(t=>t.week===w).map(t=><TaskItem key={t.id} t={t}/>)}
          </div>
        ))}
      </div>
    );
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Đang tải...</div>;

  const total = TASKS.length, done = checked.length, pct = Math.round((done/total)*100);

  return (
    <div className="fade-in">
      <div style={{ marginBottom:24 }}>
        <h1 className="page-title" style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>🗺 Lộ Trình 60 Ngày</h1>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Tuần hiện tại: <span style={{ color:'var(--red)', fontWeight:700 }}>{curWeek}/8</span></div>
      </div>

      {/* Overall */}
      <div className="card" style={{ marginBottom:20, display:'flex', alignItems:'center', gap:24 }}>
        <div style={{ textAlign:'center', minWidth:80 }}>
          <div style={{ fontSize:42, fontWeight:900, color:'var(--accent)', lineHeight:1 }}>{pct}%</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>hoàn thành</div>
        </div>
        <div style={{ flex:1 }}>
          <div className="progress-bar" style={{ height:12, marginBottom:8 }}>
            <div className="progress-fill" style={{ width:`${pct}%`, background:'linear-gradient(90deg,var(--accent),var(--green))' }}/>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>{done}/{total} nhiệm vụ · Tuần {curWeek}/8</div>
        </div>
      </div>

      <div className="desktop-2col">
        <div>
          <Section title="Tháng 1 — Frontend + Next.js" tasks={m1} color="var(--accent)" icon="📱"/>
          <Section title="Tiếng Anh" tasks={en} color="var(--purple)" icon="🇬🇧"/>
        </div>
        <div>
          <Section title="Tháng 2 — Backend + Deploy" tasks={m2} color="var(--green)" icon="⚙️"/>
        </div>
      </div>
    </div>
  );
}
