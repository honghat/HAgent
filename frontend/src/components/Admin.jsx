import { useState, useEffect } from 'react'

export default function Admin({ token, user }) {
  const auth = (h) => ({ ...h, Authorization: `Bearer ${token}` })
  const [users, setUsers] = useState([])
  const [settings, setSettings] = useState({ aiServer: '', aiHost: '', aiProvider: 'local', aiModel: 'default', aiKey: '' })
  const [luxttsRunning, setLuxttsRunning] = useState(false)
  const [whisperAvailable, setWhisperAvailable] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('users')

  useEffect(() => {
    fetchUsers()
    fetchSettings()
    fetch('/api/learn/admin/luxtts', { headers: auth({}) })
      .then(r => r.json()).then(d => setLuxttsRunning(d.running)).catch(() => {})
    fetch('/api/learn/admin/whisper', { headers: auth({}) })
      .then(r => r.json()).then(d => setWhisperAvailable(d.available)).catch(() => {})
  }, [])

  async function fetchUsers() {
    try {
      const r = await fetch('/api/learn/admin/users', { headers: auth({}) })
      if (r.ok) setUsers(await r.json())
    } catch {}
  }

  async function fetchSettings() {
    try {
      const r = await fetch('/api/learn/settings', { headers: auth({}) })
      if (r.ok) setSettings(await r.json())
    } catch {}
  }

  async function updateUser(id, data) {
    await fetch('/api/learn/admin/users', {
      method: 'PATCH', headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, ...data }),
    })
    fetchUsers()
  }

  async function deleteUser(id) {
    if (!confirm('Xoá người dùng này?')) return
    await fetch(`/api/learn/admin/users?id=${id}`, { method: 'DELETE', headers: auth({}) })
    fetchUsers()
  }

  async function saveSettings() {
    const r = await fetch('/api/learn/settings', {
      method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    })
    setMsg(r.ok ? '✅ Đã lưu' : '❌ Lỗi')
    setTimeout(() => setMsg(''), 2000)
  }

  async function controlService(endpoint, action) {
    const r = await fetch(`/api/learn/admin/${endpoint}?action=${action}`, {
      method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    })
    const d = await r.json()
    setMsg(d.message || 'Done')
    setTimeout(() => setMsg(''), 3000)
  }

  const tabs = [
    { id: 'users', label: '👥 Người dùng' },
    { id: 'settings', label: '⚙️ AI Settings' },
    { id: 'services', label: '🛠️ Services' },
  ]

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-lg font-black mb-4">⚙️ Quản trị</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all ${
              tab === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-transparent text-gray-400 border-black/[0.08]'
            }`}>{t.label}</button>
        ))}
      </div>

      {msg && <div className="text-xs text-center mb-3 text-[#3fb950] font-semibold">{msg}</div>}

      {tab === 'users' && (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-[var(--color-bg-2)] rounded-xl p-3 border border-black/[0.06] flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{u.display_name || u.username}</div>
                <div className="text-[10px] text-gray-400">Role: {u.role} · {u.id.slice(0, 8)}...</div>
              </div>
              <select value={u.role} onChange={e => updateUser(u.id, { role: e.target.value })}
                className="text-xs px-2 py-1 rounded-lg border border-black/[0.08] bg-[var(--color-bg)]">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <button onClick={() => deleteUser(u.id)}
                className="text-xs text-red-500 bg-transparent border border-red-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-red-50">Xoá</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06] space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">AI Server URL</label>
            <input className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              value={settings.aiServer} onChange={e => setSettings(s => ({ ...s, aiServer: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">AI Host</label>
            <input className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              value={settings.aiHost} onChange={e => setSettings(s => ({ ...s, aiHost: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">Provider</label>
            <select className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              value={settings.aiProvider} onChange={e => setSettings(s => ({ ...s, aiProvider: e.target.value }))}>
              <option value="local">Local</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">Model</label>
            <input className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              value={settings.aiModel} onChange={e => setSettings(s => ({ ...s, aiModel: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">API Key</label>
            <input type="password" className="w-full px-3 py-2 rounded-lg border border-black/[0.08] text-xs bg-[var(--color-bg)]"
              value={settings.aiKey} onChange={e => setSettings(s => ({ ...s, aiKey: e.target.value }))} />
          </div>
          <button onClick={saveSettings}
            className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-bold border-none cursor-pointer hover:bg-gray-700">💾 Lưu cài đặt</button>
        </div>
      )}

      {tab === 'services' && (
        <div className="space-y-3">
          <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06]">
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="text-sm font-bold">🎤 Whisper (STT)</div>
                <div className="text-[10px] text-gray-400">Port 9000 · {whisperAvailable ? '✅ Online' : '❌ Offline'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => controlService('whisper', 'start')}
                  className="px-3 py-1.5 rounded-lg bg-[#3fb950] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#3fb950]/80">Bật</button>
                <button onClick={() => controlService('whisper', 'stop')}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold border-none cursor-pointer hover:bg-red-600">Tắt</button>
              </div>
            </div>
          </div>
          <div className="bg-[var(--color-bg-2)] rounded-xl p-4 border border-black/[0.06]">
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="text-sm font-bold">🔊 LuxTTS</div>
                <div className="text-[10px] text-gray-400">Port 8880 · {luxttsRunning ? '✅ Online' : '❌ Offline'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => controlService('luxtts', 'start')}
                  className="px-3 py-1.5 rounded-lg bg-[#3fb950] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#3fb950]/80">Bật</button>
                <button onClick={() => controlService('luxtts', 'stop')}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold border-none cursor-pointer hover:bg-red-600">Tắt</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
