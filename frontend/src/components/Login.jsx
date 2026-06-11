import { useState, useEffect } from 'react'
import { getOrCreateDeviceCredentials, saveDeviceCredentials, setSignedOut } from '../lib/deviceAuth.js'

function PendingScreen({ token, onApproved }) {
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/auth/device-status?t=${token}`)
        if (r.ok) {
          const d = await r.json()
          if (d.status === 'approved') {
            setStatus('approved')
            clearInterval(interval)
            const me = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            if (me.ok) {
              const user = await me.json()
              onApproved(token, user)
            }
          }
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [token, onApproved])

  return (
    <div className="h-full bg-slate-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center text-xl font-bold mx-auto mb-6">H</div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200 space-y-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Chờ duyệt thiết bị</h2>
            <p className="text-sm text-gray-500 mt-1">Thiết bị của bạn chưa được xác nhận. Vui lòng liên hệ quản trị viên để duyệt qua tab <strong>Thiết bị</strong>.</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
            {status === 'approved' ? 'Đã duyệt, đang vào hệ thống...' : 'Đang chờ phê duyệt...'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('hat')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [pendingToken, setPendingToken] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setErr('')
    try {
      const device = getOrCreateDeviceCredentials()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...device }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      if (!res.ok) return setErr(data.detail || data.error || 'Đăng nhập thất bại')
      saveDeviceCredentials({ deviceId: data.deviceId, deviceSecret: data.deviceSecret })
      setSignedOut(false)
      if (data.status === 'pending') return setPendingToken(data.token)
      onLogin(data.token, data.user)
    } catch (e) {
      if (e.name === 'AbortError') setErr('Máy chủ không phản hồi, vui lòng thử lại sau')
      else if (e.message === 'Failed to fetch') setErr('Không thể kết nối đến máy chủ. Backend có đang chạy không?')
      else setErr('Lỗi kết nối: ' + e.message)
    }
  }

  if (pendingToken) return <PendingScreen token={pendingToken} onApproved={onLogin} />

  return (
    <div className="h-full bg-slate-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center text-xl font-bold mx-auto mb-3">H</div>
          <h1 className="text-2xl font-semibold text-gray-800">HAgent</h1>
          <p className="text-sm text-gray-500 mt-1">Your AI second brain</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-4">
          {err && <div className="bg-red-50 text-red-500 text-sm p-3 rounded-xl border border-red-100">{err}</div>}
          <div>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400" required />
          </div>
          <div>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400" required />
          </div>
          <button type="submit"
            className="w-full bg-black hover:bg-gray-800 text-white py-2.5 rounded-xl font-medium transition-colors">
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
