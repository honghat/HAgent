'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: number; name: string; email: string; role: string; status: string; createdAt: string; }

const STATUS_COLOR: Record<string, string> = {
  pending: '#d29922', approved: '#3fb950', rejected: '#f85149',
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<{ id: number; name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'rejected'>('all');
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });

  // AI & Hardware States
  const [aiHost, setAiHost] = useState('100.69.50.64');
  const [aiServer, setAiServer] = useState('http://100.69.50.64:8080/v1');
  const [aiProvider, setAiProvider] = useState('local');
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('default');
  const [saveStatus, setSaveStatus] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [wolStatus, setWolStatus] = useState('');
  const [shutdownPwd, setShutdownPwd] = useState('');
  const [shutdownStatus, setShutdownStatus] = useState('');
  const [shutdownLoading, setShutdownLoading] = useState(false);
  const [shutdownConfirm, setShutdownConfirm] = useState(false);
  const [luxRunning, setLuxRunning] = useState(false);
  const [luxLoading, setLuxLoading] = useState(false);
  const [luxMsg, setLuxMsg] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [targetUserName, setTargetUserName] = useState('');
  const [toUserLoading, setToUserLoading] = useState(false);
  const [toUserStatus, setToUserStatus] = useState('');
  // Sync filter options
  const [syncIncludeCode, setSyncIncludeCode] = useState(true);
  const [syncIncludeEnglish, setSyncIncludeEnglish] = useState(true);
  const [syncTracks, setSyncTracks] = useState<string[]>([]);   // empty = all tracks
  const [syncEngTypes, setSyncEngTypes] = useState<string[]>([]); // empty = all types

  const load = useCallback(async () => {
    // ... load logic unchanged ...
    const [meRes, usersRes, settingsRes] = await Promise.all([
      fetch('/api/auth'), 
      fetch('/api/users'),
      fetch('/api/settings')
    ]);
    const meData = await meRes.json();
    if (!meData.user || meData.user.role !== 'admin') { router.push('/'); return; }
    setMe(meData.user);
    if (usersRes.ok) setUsers(await usersRes.json());
    
    if (settingsRes.ok) {
      const d = await settingsRes.json();
      if (d.aiHost) setAiHost(d.aiHost);
      if (d.aiServer) setAiServer(d.aiServer);
      if (d.aiProvider) setAiProvider(d.aiProvider);
      if (d.aiModel) setAiModel(d.aiModel);
      if (d.aiKey) setAiKey(d.aiKey);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
    checkLux();
    checkWhisper();
    const timer = setInterval(() => {
      checkLux();
      checkWhisper();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function saveAISettings(override?: any) {
    const data = {
      aiHost: override?.aiHost ?? aiHost,
      aiServer: override?.aiServer ?? aiServer,
      aiProvider: override?.aiProvider ?? aiProvider,
      aiModel: override?.aiModel ?? aiModel,
      aiKey: override?.aiKey ?? aiKey
    };
    setSaveStatus('⏳ Đang lưu...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        // Sync local storage for compatibility with legacy components
        if (updated.aiModel) localStorage.setItem('eng_model', updated.aiModel);
        if (updated.aiProvider) localStorage.setItem('eng_provider', updated.aiProvider);
        if (updated.aiServer) localStorage.setItem('eng_server', updated.aiServer);
        
        setSaveStatus('✅ ĐÃ LƯU THÀNH CÔNG!');
        setSettingsSaved(true);
      } else {
        const err = await res.json();
        setSaveStatus('❌ LỖI: ' + (err.error || 'Không xác định'));
      }
    } catch (e: any) {
      setSaveStatus('❌ LỖI KẾT NỐI: ' + e.message);
    }
    setTimeout(() => { setSaveStatus(''); setSettingsSaved(false); }, 3000);
  }

  async function wakeAI() {
    setWolStatus('⏳ Đang gửi...');
    try {
      const res = await fetch('/api/wol', { method: 'POST' });
      const d = await res.json();
      setWolStatus(d.ok ? '✅ Đã gửi magic packet!' : '❌ ' + d.error);
    } catch { setWolStatus('❌ Lỗi kết nối'); }
    setTimeout(() => setWolStatus(''), 4000);
  }

  async function syncEnglish() {
    if (!confirm('Bạn có muốn đồng bộ dữ liệu Tiếng Anh từ tất cả người dùng sang Admin không? (Chỉ copy những nội dung mới)')) return;
    setSyncLoading(true);
    try {
      const res = await fetch('/api/admin/sync/english', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSaveStatus(`✅ Đã đồng bộ ${data.count} mục mới!`);
      } else {
        setSaveStatus(`❌ Lỗi: ${data.error || 'Không xác định'}`);
      }
    } catch (e) {
      setSaveStatus('❌ Lỗi kết nối đồng bộ');
    }
    setSyncLoading(false);
    setTimeout(() => setSaveStatus(''), 5000);
  }

  async function syncToUser() {
    if (!targetUserName) return;
    if (!syncIncludeCode && !syncIncludeEnglish) {
      setToUserStatus('❌ Chọn ít nhất 1 loại nội dung để truyền');
      return;
    }
    const types = [];
    if (syncIncludeCode) types.push('code');
    if (syncIncludeEnglish) types.push('english');
    if (!confirm(`Truyền dữ liệu cho "${targetUserName}"?\n${syncIncludeCode ? `• Lập trình${syncTracks.length ? ': ' + syncTracks.join(', ') : ': tất cả ngôn ngữ'}` : ''}\n${syncIncludeEnglish ? `• Tiếng Anh${syncEngTypes.length ? ': ' + syncEngTypes.join(', ') : ': tất cả kỹ năng'}` : ''}`)) return;
    setToUserLoading(true);
    setToUserStatus('⏳ Đang xử lý...');
    try {
      const res = await fetch('/api/admin/sync-to-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetName: targetUserName,
          includeCode: syncIncludeCode,
          includeEnglish: syncIncludeEnglish,
          tracks: syncTracks,
          engTypes: syncEngTypes,
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToUserStatus(`✅ ${data.message}`);
        setTargetUserName('');
      } else {
        setToUserStatus(`❌ LỖI: ${data.error}`);
      }
    } catch {
      setToUserStatus('❌ Lỗi kết nối server');
    }
    setToUserLoading(false);
    setTimeout(() => setToUserStatus(''), 6000);
  }

  async function checkLux() {
    try {
      const res = await fetch('/api/admin/luxtts');
      const d = await res.json();
      setLuxRunning(d.running);
    } catch (e) {}
  }

  async function controlLux(action: 'start' | 'stop') {
    setLuxLoading(true);
    setLuxMsg(`⏳ Đang thực hiện ${action === 'start' ? 'Bật' : 'Tắt'}...`);
    try {
      const res = await fetch('/api/admin/luxtts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      setLuxMsg(d.message || d.error);
      setTimeout(checkLux, 2000);
    } catch (e: any) {
      setLuxMsg('❌ Lỗi: ' + e.message);
    } finally {
      setLuxLoading(false);
      setTimeout(() => setLuxMsg(''), 4000);
    }
  }

  const [whisperRunning, setWhisperRunning] = useState(false);
  const [whisperEngine, setWhisperEngine] = useState('');
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [whisperMsg, setWhisperMsg] = useState('');

  async function checkWhisper() {
    try {
      const res = await fetch('/api/admin/whisper');
      const d = await res.json();
      setWhisperRunning(d.running);
      if (d.running) {
        try {
          const hRes = await fetch('http://localhost:9000/health');
          if (hRes.ok) {
            const h = await hRes.json();
            setWhisperEngine(h.primary);
          }
        } catch {}
      } else {
        setWhisperEngine('');
      }
    } catch (e) {}
  }

  async function controlWhisper(action: 'start' | 'stop') {
    setWhisperLoading(true);
    setWhisperMsg(`⏳ Đang thực hiện ${action === 'start' ? 'Bật' : 'Tắt'}...`);
    try {
      const res = await fetch('/api/admin/whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      setWhisperMsg(d.message || d.error);
      setTimeout(checkWhisper, 2000);
    } catch (e: any) {
      setWhisperMsg('❌ Lỗi: ' + e.message);
    } finally {
      setWhisperLoading(false);
      setTimeout(() => setWhisperMsg(''), 4000);
    }
  }

  async function shutdownAI() {
    if (!shutdownPwd) return;
    setShutdownLoading(true); setShutdownStatus('');
    try {
      const res = await fetch('/api/shutdown', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ password: shutdownPwd, host: aiHost }) 
      });
      const d = await res.json();
      setShutdownStatus(d.ok ? '✅ Đã gửi lệnh tắt máy' : '❌ ' + d.error);
      if (d.ok) setShutdownPwd('');
    } catch { setShutdownStatus('❌ Lỗi kết nối'); }
    setShutdownLoading(false);
    setTimeout(() => setShutdownStatus(''), 5000);
  }

  useEffect(() => { load(); }, [load]);

  async function updateUser(id: number, patch: { status?: string; role?: string }) {
    await fetch('/api/users', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, ...patch }) });
    load();
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Xóa người dùng "${name}"?`)) return;
    await fetch('/api/users', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    load();
  }

  async function logout() {
    await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) });
    router.push('/login');
    router.refresh();
  }

  function openEdit(user: User) {
    setEditId(user.id);
    setEditForm({ name: user.name, email: user.email, password: '' });
  }

  async function saveEdit() {
    if (!editId) return;
    const patch: any = {};
    if (editForm.name) patch.name = editForm.name;
    if (editForm.email) patch.email = editForm.email;
    if (editForm.password) patch.password = editForm.password;
    if (Object.keys(patch).length === 0) { setEditId(null); return; }
    await fetch('/api/users', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: editId, ...patch }) });
    setEditId(null);
    load();
  }


  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Đang tải...</div>;

  const filtered = filter === 'all' ? users : users.filter(u => u.status === filter);

  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div>
          <h1 className="page-title" style={{ fontSize:20, fontWeight:900 }}>👥 Quản lý người dùng</h1>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Xin chào, {me?.name}</div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={()=>router.push('/')} className="btn btn-ghost" style={{ fontSize:13 }}>← App</button>
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize:13, color:'var(--red)', borderColor:'var(--red)' }}>Đăng xuất</button>
        </div>
      </div>

      {/* USER STATS ROW - ULTRA COMPACT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Tổng số', count: users.length, color: 'var(--accent)', filter: 'all' },
          { label: 'Chờ duyệt', count: users.filter(u => u.status === 'pending').length, color: '#d29922', filter: 'pending' },
          { label: 'Đã duyệt', count: users.filter(u => u.status === 'approved').length, color: '#3fb950', filter: 'approved' },
          { label: 'Từ chối', count: users.filter(u => u.status === 'rejected').length, color: '#f85149', filter: 'rejected' }
        ].map(s => (
          <div key={s.label} onClick={() => setFilter(s.filter as any)} className="card" 
            style={{ padding: '8px 10px', textAlign: 'center', cursor: 'pointer', border: filter === s.filter ? `1px solid ${s.color}` : '1px solid var(--border)', background: filter === s.filter ? `${s.color}05` : 'var(--surface)', transition: 'all 0.1s' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card">
        {filtered.length === 0 && <div style={{ color:'var(--muted)', padding:'24px', textAlign:'center' }}>Không có người dùng</div>}
        {filtered.map(u => (
          <div key={u.id} 
            onClick={() => {
              if (u.role !== 'admin') {
                // Đã gỡ bỏ logic đồng bộ cũ
              }
            }}
            style={{ padding:'10px 0', borderBottom:'1px solid var(--surface2)', cursor: u.role === 'admin' ? 'default' : 'pointer', transition: 'background 0.2s' }}
            onMouseEnter={(e) => u.role !== 'admin' && (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {/* Row 1: Avatar + Info + Status */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <div style={{ width:38, height:38, borderRadius:99, background: u.role==='admin'?'#58a6ff22':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color: u.role==='admin'?'var(--accent)':'var(--muted)', flexShrink:0, border:`1px solid ${u.role==='admin'?'var(--accent)':'var(--border)'}` }}>
                {u.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{u.name}</span>
                  {u.role==='admin' && <span className="pill" style={{ borderColor:'var(--accent)', color:'var(--accent)', fontSize:10, flexShrink:0 }}>ADMIN</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{new Date(u.createdAt).toLocaleString('vi')}</div>
              </div>
              <div className="pill" style={{ borderColor: STATUS_COLOR[u.status], color: STATUS_COLOR[u.status], flexShrink:0, fontSize:11 }}>
                {u.status==='pending'?'⏳ Chờ':u.status==='approved'?'✅ Duyệt':'❌ Từ chối'}
              </div>
            </div>
            {/* Row 2: Actions */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {u.status!=='approved' && (
                <button onClick={()=>updateUser(u.id,{status:'approved'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid #3fb950', background:'#3fb95011', color:'#3fb950', fontSize:12, cursor:'pointer', fontWeight:600 }}>✓ Duyệt</button>
              )}
              {u.status!=='rejected' && (
                <button onClick={()=>updateUser(u.id,{status:'rejected'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid #f85149', background:'#f8514911', color:'#f85149', fontSize:12, cursor:'pointer', fontWeight:600 }}>✕ Từ chối</button>
              )}
              {u.role!=='admin' && (
                <button onClick={()=>updateUser(u.id,{role:'admin'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid var(--accent)', background:'#58a6ff11', color:'var(--accent)', fontSize:12, cursor:'pointer', fontWeight:600 }}>↑ Admin</button>
              )}
              <button onClick={()=>openEdit(u)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', fontSize:12, cursor:'pointer' }}>✏️</button>
              <button onClick={()=>deleteUser(u.id, u.name)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editId !== null && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:24, maxWidth:400, width:'90%', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize:16, fontWeight:900, marginBottom:16 }}>Sửa tài khoản</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Tên</label>
              <input type="text" value={editForm.name} onChange={(e)=>setEditForm({...editForm, name:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Email</label>
              <input type="email" value={editForm.email} onChange={(e)=>setEditForm({...editForm, email:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Mật khẩu (để trống nếu không đổi)</label>
              <input type="password" value={editForm.password} onChange={(e)=>setEditForm({...editForm, password:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setEditId(null)} style={{ flex:1, padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:12, cursor:'pointer', fontWeight:600 }}>Hủy</button>
              <button onClick={saveEdit} style={{ flex:1, padding:'8px 12px', borderRadius:6, border:'1px solid var(--accent)', background:'var(--accent)', color:'#000', fontSize:12, cursor:'pointer', fontWeight:600 }}>Lưu</button>
            </div>
          </div>
        </div>
      )}


      {/* AI & SERVER MANAGEMENT SECTION */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12, marginBottom:8 }}>
        <h1 className="page-title" style={{ fontSize:16, fontWeight:900, margin:0 }}>⚙️ Quản trị Bộ não AI</h1>
        <div style={{ height:1, flex:1, background:'var(--surface2)' }} />
      </div>

      <div className="desktop-2col" style={{ gap: 12, marginBottom: 60 }}>
        {/* CARD 1: AI BRAIN SETTINGS */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>Phần mềm</span>
              <span style={{ fontSize: 10, color: '#00d4ff', fontWeight: 900, background:'rgba(0,212,255,0.1)', padding:'1px 8px', borderRadius:20, border:'1px solid rgba(0,212,255,0.3)' }}>✅ {aiProvider.toUpperCase()}</span>
            </div>
            {settingsSaved && <span style={{ fontSize: 9, color: '#3fb950', fontWeight: 800 }}>ĐÃ LƯU ✓</span>}
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {['local', 'openai', 'deepseek', 'openrouter', 'custom'].map(p => (
              <button key={p} 
                onClick={() => { 
                  const newProv = p;
                  let newServer = aiServer;
                  if (newProv === 'openai') newServer = 'https://api.openai.com/v1';
                  else if (newProv === 'deepseek') newServer = 'https://api.deepseek.com/v1';
                  else if (newProv === 'openrouter') newServer = 'https://openrouter.ai/api/v1';
                  else if (newProv === 'local') {
                    const host = aiHost.trim() || '100.69.50.64';
                    newServer = `http://${host}:8080/v1`;
                  }
                  setAiProvider(newProv); setAiServer(newServer);
                  saveAISettings({ aiProvider: newProv, aiServer: newServer, aiModel });
                  localStorage.setItem('eng_provider', newProv);
                  localStorage.setItem('eng_server', newServer);
                }}
                style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer', background: aiProvider === p ? 'var(--accent)' : 'var(--surface2)', color: aiProvider === p ? '#000' : 'var(--muted)', border: aiProvider === p ? '1px solid var(--accent)' : '1px solid var(--border)', transition:'all 0.1s' }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10, marginBottom:8 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, display: 'block' }}>🧠 MODEL CHÍNH:</label>
              <input value={aiModel} onChange={e => setAiModel(e.target.value)} onBlur={() => saveAISettings()} placeholder="Model ID..." style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 13, width: '100%', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, display: 'block' }}>GỢI Ý:</label>
              <select onChange={e => { setAiModel(e.target.value); if(e.target.value) saveAISettings({ aiModel: e.target.value }); }} style={{ width:'100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                <option value="">Chọn...</option>
                <option value="deepseek/deepseek-chat">deepseek-chat</option>
                <option value="google/gemini-flash-1.5">gemini-flash</option>
                <option value="openai/gpt-4o-mini">gpt-4o-mini</option>
                <option value="default">default</option>
              </select>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns: aiProvider === 'local' ? '1fr' : '1fr 1fr', gap:10, marginBottom: 12 }}>
            {aiProvider !== 'local' && (
              <div>
                <label style={{ color:'var(--muted)', fontWeight: 700, fontSize: 10, display:'block', marginBottom:4 }}>🔑 MÃ API:</label>
                <input type="password" value={aiKey} onChange={e=>setAiKey(e.target.value)} onBlur={() => saveAISettings()} placeholder="sk-..." style={{ width:'100%', fontSize:12, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', outline: 'none' }} />
              </div>
            )}
            <div>
              <label style={{ color:'var(--muted)', fontWeight: 700, fontSize: 10, display:'block', marginBottom:4 }}>🌐 ĐỊA CHỈ GATEWAY:</label>
              <input value={aiServer} onChange={e=>setAiServer(e.target.value)} onBlur={() => saveAISettings()} placeholder="https://api..." style={{ width:'100%', fontSize:12, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', outline: 'none' }} />
            </div>
          </div>

          <button onClick={async () => {
            setSaveStatus('⏳ Đang kiểm tra kết nối...');
            try {
              const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: 'Say "OK" if you hear me.' }] })
              });
              const data = await res.json();
              if (res.ok && data.choices?.[0]?.message?.content) {
                setSaveStatus('✅ KẾT NỐI THÀNH CÔNG! AI phản hồi: ' + data.choices[0].message.content.slice(0, 30));
              } else {
                setSaveStatus('❌ THẤT BẠI: ' + (data.error || 'Phản hồi trống'));
              }
            } catch (e) {
              setSaveStatus('❌ LỖI KẾT NỐI: ' + (e instanceof Error ? e.message : String(e)));
            }
            setTimeout(() => setSaveStatus(''), 5000);
          }} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1px solid var(--accent)', background:'var(--accent)11', color:'var(--accent)', fontSize:12, fontWeight:800, cursor:'pointer' }}>
            ⚡ TEST KẾT NỐI AI
          </button>
        </div>

        {/* CARD 2: HARDWARE POWER MANAGEMENT */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text-main)', marginBottom:8 }}>Phần cứng</div>
          
          <div style={{ display:'grid', gridTemplateColumns:'1fr 140px', gap:10, marginBottom:10 }}>
            <div>
              <label style={{ color:'var(--muted)', fontWeight: 700, fontSize: 10, display:'block', marginBottom:4 }}>📍 ĐỊA CHỈ IP:</label>
              <input value={aiHost} onChange={e=>setAiHost(e.target.value)} onBlur={() => saveAISettings()} placeholder="100.69.50.64" style={{ width:'100%', fontSize:13, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', outline: 'none' }} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end' }}>
              <button onClick={wakeAI} className="btn btn-green" style={{ width: '100%', height: 38, fontSize: 11, fontWeight: 800 }}>
                ⚡ WAKE ON LAN
              </button>
            </div>
          </div>
          {wolStatus && <div style={{ fontSize: 10, color: wolStatus.startsWith('✅') ? '#3fb950' : '#f85149', marginBottom: 10, textAlign: 'center' }}>{wolStatus}</div>}
          
          <div style={{ borderTop: '1px solid var(--surface2)', paddingTop: 12, display:'flex', gap:10, alignItems:'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color:'var(--muted)', fontWeight: 700, fontSize: 10, display:'block', marginBottom:4 }}>🔒 LỆNH TẮT MÁY:</label>
              <input type="password" placeholder="Nhập mật khẩu..." value={shutdownPwd}
                onChange={e => setShutdownPwd(e.target.value)} onKeyDown={e => e.key === 'Enter' && setShutdownConfirm(true)}
                style={{ width:'100%', height: 38, fontSize: 13, background:'var(--surface2)', border:'1px solid var(--border)', padding:'0 12px', borderRadius:8, outline:'none', color:'var(--text)' }} />
            </div>
            <button onClick={() => shutdownPwd && setShutdownConfirm(true)} disabled={shutdownLoading || !shutdownPwd}
              style={{ padding: '0 20px', height: 38, borderRadius: 8, border: '1px solid #f85149', background: '#f8514911', color: '#f85149', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              TẮT MÁY
            </button>
          </div>
          {shutdownStatus && <div style={{ fontSize: 10, marginTop: 8, color: shutdownStatus.startsWith('✅') ? '#3fb950' : '#f85149', textAlign: 'center' }}>{shutdownStatus}</div>}

          {/* LuxTTS Resource Control */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>💎 Quản lý LuxTTS (Dùng RAM)</div>
              <div style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: luxRunning ? '#3fb95022' : '#f8514922', color: luxRunning ? '#3fb950' : '#f85149', border: `1px solid ${luxRunning ? '#3fb95044' : '#f8514944'}` }}>
                {luxRunning ? '● ĐANG CHẠY' : '○ ĐANG TẮT'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Bật LuxTTS sẽ chiếm khoảng 1.3GB RAM. Nên tắt khi không sử dụng để máy mượt hơn.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!luxRunning ? (
                <button onClick={() => controlLux('start')} disabled={luxLoading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  {luxLoading ? '⏳...' : '▶ KHỞI ĐỘNG LUXTTS'}
                </button>
              ) : (
                <button onClick={() => controlLux('stop')} disabled={luxLoading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  {luxLoading ? '⏳...' : '⏹ TẮT LUXTTS (GIẢI PHÓNG RAM)'}
                </button>
              )}
            </div>
            {luxMsg && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 10, textAlign: 'center', fontWeight: 600 }}>{luxMsg}</div>}
          </div>

          {/* Whisper Resource Control */}
          <div style={{ marginTop: 16, padding: 16, background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>🎙️ Quản lý Whisper (STT)</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {whisperEngine && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 800, background: 'var(--accent)11', padding: '2px 8px', borderRadius: 4 }}>{whisperEngine}</span>}
                <div style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: whisperRunning ? '#3fb95022' : '#f8514922', color: whisperRunning ? '#3fb950' : '#f85149', border: `1px solid ${whisperRunning ? '#3fb95044' : '#f8514944'}` }}>
                  {whisperRunning ? '● ĐANG CHẠY' : '○ ĐANG TẮT'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Whisper Proxy cho phép chuyển giọng nói thành văn bản. Khi dùng local sẽ tốn khoảng 1.5GB RAM.
              <br/>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>💡 Groq Cloud đang được kích hoạt trực tiếp (không tốn RAM).</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!whisperRunning ? (
                <button onClick={() => controlWhisper('start')} disabled={whisperLoading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  {whisperLoading ? '⏳...' : '▶ BẬT WHISPER'}
                </button>
              ) : (
                <button onClick={() => controlWhisper('stop')} disabled={whisperLoading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  {whisperLoading ? '⏳...' : '⏹ TẮT WHISPER'}
                </button>
              )}
            </div>
            {whisperMsg && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 10, textAlign: 'center', fontWeight: 600 }}>{whisperMsg}</div>}
          </div>

          {/* CARD 3: DATA SYNC */}
          <div className="card" style={{ padding: '16px', marginTop: 24, border: '1px solid var(--accent)33', background: 'var(--accent)05' }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔄 Đồng bộ dữ liệu (Sync)
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Chức năng này sẽ quét tất cả bài học Tiếng Anh của người dùng khác và sao chép những nội dung <strong>mới</strong> (chưa có trong thư viện) vào tài khoản của bạn.
            </p>
            <button 
              onClick={syncEnglish} 
              disabled={syncLoading}
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: 12, 
                border: 'none', 
                background: 'var(--accent)', 
                color: '#000', 
                fontWeight: 900, 
                fontSize: 13, 
                cursor: syncLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(88,166,255,0.2)',
                transition: 'all 0.2s'
              }}
            >
              {syncLoading ? '⏳ ĐANG QUÉT & ĐỒNG BỘ...' : '🚀 BẮT ĐẦU ĐỒNG BỘ NGAY'}
            </button>
          </div>

          {/* CARD 4: SYNC ADMIN TO USER */}
          <div className="card" style={{ padding: '16px', marginTop: 24, border: '1px solid var(--green)33', background: 'rgba(63,185,80,0.05)' }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>📤 Gửi dữ liệu cho User</div>

            {/* Loại nội dung */}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 700 }}>Loại nội dung:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ key: 'code', label: '💻 Lập trình', val: syncIncludeCode, set: setSyncIncludeCode },
                { key: 'english', label: '🇬🇧 Tiếng Anh', val: syncIncludeEnglish, set: setSyncIncludeEnglish }
              ].map(item => (
                <button key={item.key} onClick={() => item.set(!item.val)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    borderColor: item.val ? 'var(--green)' : 'var(--border)',
                    background: item.val ? 'rgba(63,185,80,0.15)' : 'var(--surface2)',
                    color: item.val ? 'var(--green)' : 'var(--muted)' }}>
                  {item.val ? '✓ ' : ''}{item.label}
                </button>
              ))}
            </div>

            {/* Chọn ngôn ngữ lập trình */}
            {syncIncludeCode && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>Ngôn ngữ (bỏ trống = tất cả):</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['javascript','typescript','python','react','nextjs','nodejs','java','csharp','go','rust','cpp','php','dart','postgresql','git','docker','linux','dsa','system-design','oop','design-patterns','leetcode'].map(t => {
                    const on = syncTracks.includes(t);
                    return (
                      <button key={t} onClick={() => setSyncTracks(on ? syncTracks.filter(x => x !== t) : [...syncTracks, t])}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          borderColor: on ? 'var(--accent)' : 'var(--border)',
                          background: on ? '#58a6ff22' : 'transparent',
                          color: on ? 'var(--accent)' : 'var(--muted)' }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chọn kỹ năng tiếng Anh */}
            {syncIncludeEnglish && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>Kỹ năng (bỏ trống = tất cả):</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'listen', label: '🎧 Nghe' }, { id: 'speak', label: '🎤 Nói' },
                    { id: 'writing', label: '✍️ Viết' }, { id: 'reading', label: '📖 Đọc' },
                    { id: 'grammar', label: '📐 Ngữ pháp' }, { id: 'dict', label: '🔎 Từ điển' },
                  ].map(item => {
                    const on = syncEngTypes.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => setSyncEngTypes(on ? syncEngTypes.filter(x => x !== item.id) : [...syncEngTypes, item.id])}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          borderColor: on ? '#d29922' : 'var(--border)',
                          background: on ? '#d2992222' : 'transparent',
                          color: on ? '#d29922' : 'var(--muted)' }}>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tên user + nút gửi */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <select 
                value={targetUserName} 
                onChange={(e) => setTargetUserName(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none', fontSize: 12, cursor: 'pointer' }}
              >
                <option value="">Chọn người dùng nhận...</option>
                {users
                  .filter(u => u.role !== 'admin')
                  .map(u => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.status})
                    </option>
                  ))
                }
              </select>
              <button onClick={syncToUser} disabled={toUserLoading || !targetUserName}
                style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 800, fontSize: 12, cursor: toUserLoading || !targetUserName ? 'not-allowed' : 'pointer', opacity: toUserLoading || !targetUserName ? 0.6 : 1 }}>
                {toUserLoading ? '⏳' : '📤 GỬI'}
              </button>
            </div>
            {toUserStatus && <div style={{ fontSize: 11, color: toUserStatus.includes('✅') ? '#3fb950' : '#f85149', marginTop: 10, fontWeight: 600 }}>{toUserStatus}</div>}
          </div>

          {/* Confirm dialog */}
          {shutdownConfirm && (
            <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid #f85149', borderRadius: 20, padding: 32, maxWidth: 360, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, color: '#f85149', textAlign:'center' }}>⏻ XÁC NHẬN TẮT MÁY</div>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.6, textAlign:'center' }}>Máy chủ <strong>{aiHost}</strong> sẽ bị tắt ngay lập tức.</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setShutdownConfirm(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>Hủy</button>
                  <button onClick={() => { setShutdownConfirm(false); shutdownAI(); }} disabled={shutdownLoading}
                    style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#f85149', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>
                    XÁC NHẬN
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FLOATING NOTIFICATION */}
      {saveStatus && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: saveStatus.includes('✅') ? '#3fb950' : '#f85149', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 900, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown 0.3s ease' }}>
          {saveStatus}
        </div>
      )}

      <style jsx>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
