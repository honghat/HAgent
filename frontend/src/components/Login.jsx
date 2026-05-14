import { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('hat')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault(); setErr('')
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await res.json()
      if (!res.ok) return setErr(data.error)
      onLogin(data.token, data.user)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center p-4">
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
