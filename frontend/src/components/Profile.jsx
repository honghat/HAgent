import { useState } from 'react'

export default function Profile({ token }) {
  const auth = (h) => ({ ...h, Authorization: `Bearer ${token}` })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function changePassword() {
    setMsg(''); setError('')
    if (!newPassword || newPassword.length < 4) {
      setError('Mật khẩu phải có ít nhất 4 ký tự'); return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu không khớp'); return
    }
    try {
      const r = await fetch('/api/auth/me', {
        method: 'PUT', headers: auth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ password: newPassword }),
      })
      if (r.ok) {
        setMsg('✅ Đã đổi mật khẩu thành công')
        setNewPassword(''); setConfirmPassword('')
      } else {
        const d = await r.json()
        setError(d.detail || 'Lỗi')
      }
    } catch {
      setError('Lỗi kết nối')
    }
    setTimeout(() => { setMsg(''); setError('') }, 3000)
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-lg font-black mb-1">👤 Hồ sơ</h1>
      <p className="text-[10px] text-gray-400 mb-6">Đổi mật khẩu</p>

      {msg && <div className="text-xs text-center mb-4 p-2 rounded-lg bg-[#3fb950]/10 text-[#3fb950] font-semibold">{msg}</div>}
      {error && <div className="text-xs text-center mb-4 p-2 rounded-lg bg-red-500/10 text-red-500 font-semibold">{error}</div>}

      <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06] space-y-3">
        <div>
          <label className="text-xs font-bold text-gray-400 block mb-1">Mật khẩu mới</label>
          <input type="password" className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
            placeholder="Nhập mật khẩu mới" value={newPassword}
            onChange={e => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 block mb-1">Xác nhận mật khẩu</label>
          <input type="password" className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
            placeholder="Nhập lại mật khẩu" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} />
        </div>
        <button onClick={changePassword}
          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-bold border-none cursor-pointer hover:bg-gray-700">
          🔑 Đổi mật khẩu
        </button>
      </div>
    </div>
  )
}
