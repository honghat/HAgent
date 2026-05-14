'use client';
import { useState } from 'react';

export default function ProfilePage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) { setMsg({ type: 'err', text: 'Mật khẩu xác nhận không khớp' }); return; }
    if (newPassword.length < 6) { setMsg({ type: 'err', text: 'Mật khẩu tối thiểu 6 ký tự' }); return; }
    setLoading(true); setMsg(null);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) {
      setMsg({ type: 'ok', text: 'Đổi mật khẩu thành công!' });
      setNewPassword(''); setConfirm('');
    } else {
      setMsg({ type: 'err', text: data.error || 'Có lỗi xảy ra' });
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '40px auto' }}>
      <div className="card">
        <div className="section-title" style={{ marginBottom: 20 }}>🔑 Đổi mật khẩu</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Mật khẩu mới</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Xác nhận mật khẩu mới</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.type === 'ok' ? '#0d1a0e' : '#1a0a0a', border: `1px solid ${msg.type === 'ok' ? '#3fb950' : '#f85149'}`, color: msg.type === 'ok' ? '#3fb950' : '#f85149' }}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn btn-green" style={{ height: 44 }}>
            {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
}
