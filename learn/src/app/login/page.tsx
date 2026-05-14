'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(''); setMsg(''); setLoading(true);
      const res = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, ...form }),
      });
      const data = await res.json();
      setLoading(false);
      
      if (!res.ok) { 
        setError(data.error || 'Lỗi đăng nhập'); 
        return; 
      }
      
      if (data.pending) {
        setMsg('✅ Đăng ký thành công! Chờ admin duyệt tài khoản.');
        setMode('login');
        return;
      }

      // Lưu cookie
      if (data.token) {
        document.cookie = `nh_token=${data.token}; path=/; max-age=${30 * 24 * 3600}; SameSite=None; Secure`;
      }

      window.location.replace('/');
    } catch (err: any) {
      setLoading(false);
      alert('Lỗi hệ thống: ' + err.message);
    }
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:32, fontWeight:900, letterSpacing:-1 }}>NewHat</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>60 Ngày Thay Đổi Cuộc Đời</div>
        </div>

        <div className="card" style={{ padding:28 }}>
          <div style={{ display:'flex', marginBottom:24, background:'var(--surface2)', borderRadius:8, padding:3 }}>
            {(['login','register'] as const).map(m => (
              <button key={m} onClick={()=>{setMode(m);setError('');setMsg('');}} style={{ flex:1, padding:'8px', borderRadius:6, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background:mode===m?'var(--accent)':'transparent', color:mode===m?'#000':'var(--muted)', transition:'all 0.15s' }}>
                {m==='login'?'Đăng nhập':'Đăng ký'}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Tên</label>
              <input className="input" placeholder="Nguyễn Văn A" required value={form.name}
                onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
            </div>
            {mode === 'register' && (
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Email</label>
                <input className="input" type="email" placeholder="example@gmail.com" required value={form.email}
                  onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
              </div>
            )}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Mật khẩu</label>
              <input className="input" type="password" placeholder="••••••••" required minLength={6} value={form.password}
                onChange={e=>setForm(f=>({...f,password:e.target.value}))} />
            </div>

            {error && <div style={{ fontSize:13, color:'var(--red)', marginBottom:12, padding:'8px 12px', background:'#f8514911', borderRadius:6 }}>{error}</div>}
            {msg && <div style={{ fontSize:13, color:'var(--green)', marginBottom:12, padding:'8px 12px', background:'#3fb95011', borderRadius:6 }}>{msg}</div>}

            <button className="btn btn-primary" style={{ width:'100%', height:44 }} type="submit" disabled={loading}>
              {loading ? '⏳ Đang xử lý...' : mode==='login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          </form>

          {mode==='login' && (
            <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'var(--muted)' }}>
              Chưa có tài khoản? <button onClick={()=>setMode('register')} style={{ color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontSize:12 }}>Đăng ký</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
