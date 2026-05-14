import { useEffect, useMemo, useState } from 'react'

const configFields = [
  { path: 'model.model', label: 'Model agent', type: 'text', placeholder: 'google/gemma-4-e2b' },
  { path: 'model.base_url', label: 'Base URL', type: 'text', placeholder: 'http://localhost:1234/v1' },
  { path: 'model.api_key', label: 'API key', type: 'password', placeholder: 'sk-...' },
  { path: 'model.context_length', label: 'Context length', type: 'number', placeholder: '65536' },
  { path: 'agent.max_turns', label: 'Max turns', type: 'number', placeholder: '90' },
  { path: 'terminal.cwd', label: 'Terminal cwd', type: 'text', placeholder: '.' },
  { path: 'terminal.timeout', label: 'Terminal timeout', type: 'number', placeholder: '180' },
  { path: 'browser.engine', label: 'Browser engine', type: 'text', placeholder: 'lightpanda' },
  { path: 'browser.command_timeout', label: 'Browser timeout', type: 'number', placeholder: '30' },
  { path: 'display.language', label: 'Ngôn ngữ', type: 'text', placeholder: 'vi' },
  { path: 'display.show_reasoning', label: 'Hiện reasoning', type: 'boolean' },
  { path: 'display.streaming', label: 'Streaming display', type: 'boolean' },
  { path: 'compression.enabled', label: 'Nén ngữ cảnh', type: 'boolean' },
  { path: 'file_read_max_chars', label: 'Giới hạn đọc file', type: 'number', placeholder: '100000' },
  { path: 'tool_output.max_bytes', label: 'Tool output bytes', type: 'number', placeholder: '50000' },
]

function getPath(source, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), source)
}

function setPath(source, dotted, value) {
  const next = structuredClone(source || {})
  const keys = dotted.split('.')
  let cursor = next
  keys.slice(0, -1).forEach(key => {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {}
    cursor = cursor[key]
  })
  cursor[keys.at(-1)] = value
  return next
}

export default function UserSettings({ token, user, provider, cxModel, onCxModelChange, onProviderChange, onUpdate, onLogout }) {
  const providers = ['gemini', 'deepseek', 'cx', 'openai', 'anthropic', 'ollama', 'lmstudio', 'llamacpp', 'lmstudio_local']
  const providerLabels = {
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    cx: 'CX GPT-5.5',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama',
    lmstudio: 'LM Studio',
    llamacpp: 'Llama.cpp',
    lmstudio_local: 'LM Studio Local'
  }
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [agentConfig, setAgentConfig] = useState({})
  const [configYaml, setConfigYaml] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [configMode, setConfigMode] = useState('form')
  const [message, setMessage] = useState({ text: '', type: '' })
  const [configMessage, setConfigMessage] = useState({ text: '', type: '' })

  const booleanFields = useMemo(() => new Set(configFields.filter(f => f.type === 'boolean').map(f => f.path)), [])

  const loadConfig = async () => {
    setConfigLoading(true)
    setConfigMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được cấu hình')
      setAgentConfig(data.config || {})
      setConfigYaml(data.yaml || '')
      setConfigPath(data.path || '')
    } catch (err) {
      setConfigMessage({ text: err.message, type: 'error' })
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadConfig()
  }, [token])

  const updateConfigField = (path, rawValue) => {
    const field = configFields.find(f => f.path === path)
    let value = rawValue
    if (field?.type === 'number') value = rawValue === '' ? '' : Number(rawValue)
    if (field?.type === 'boolean') value = Boolean(rawValue)
    setAgentConfig(prev => setPath(prev, path, value))
  }

  const saveAgentConfig = async () => {
    setConfigSaving(true)
    setConfigMessage({ text: '', type: '' })
    try {
      const body = configMode === 'yaml'
        ? { yaml_text: configYaml }
        : { config: agentConfig }
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Không lưu được cấu hình')
      setAgentConfig(data.config || {})
      setConfigYaml(data.yaml || '')
      setConfigPath(data.path || configPath)
      setConfigMessage({ text: data.message || 'Đã lưu cấu hình', type: 'success' })
      const savedProvider = getPath(data.config || {}, 'model.provider')
      if (savedProvider && savedProvider !== provider) onProviderChange?.(savedProvider)
    } catch (err) {
      setConfigMessage({ text: err.message, type: 'error' })
    } finally {
      setConfigSaving(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName,
          username,
          password: password || undefined
        })
      })

      const data = await res.json()
      if (res.ok) {
        setMessage({ text: 'Cập nhật thành công!', type: 'success' })
        setPassword('')
        onUpdate()
      } else {
        setMessage({ text: data.error || 'Có lỗi xảy ra', type: 'error' })
      }
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full bg-white/30 flex flex-col p-4 md:p-8 overflow-y-auto pb-safe">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        <div className="mb-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Cài đặt tài khoản</h1>
          <p className="mt-1 text-[11px] text-gray-400">Thông tin cá nhân và bảo mật</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">Tên hiển thị</label>
                <input 
                  value={displayName} 
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Nguyễn Văn A"
                  className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">Tên đăng nhập</label>
                <input 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">Provider mặc định</label>
              <select
                value={provider}
                onChange={e => {
                  const p = e.target.value
                  onProviderChange(p)
                  setAgentConfig(prev => setPath(prev, 'model.provider', p))
                }}
                className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700 appearance-none"
              >
                {providers.map(p => <option key={p} value={p}>{providerLabels[p]}</option>)}
              </select>
            </div>

            {provider === 'cx' && (
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">CX model</label>
                <input
                  value={cxModel || ''}
                  onChange={e => onCxModelChange?.(e.target.value)}
                  placeholder="cx/gpt-5.5"
                  className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">Mật khẩu mới (Để trống nếu không đổi)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700"
              />
            </div>

            {message.text && (
              <div className={`p-4 rounded-2xl text-xs font-bold uppercase tracking-widest text-center animate-in fade-in slide-in-from-top-2 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
              }`}>
                {message.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-[11px] font-medium hover:bg-black transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Đang lưu...' : 'Cập nhật thông tin'}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full bg-red-50 text-red-600 py-2.5 rounded-xl text-[11px] font-medium hover:bg-red-100 transition-all active:scale-[0.98]"
              >
                Đăng xuất
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Cài đặt Agent</h2>
              <p className="mt-1 text-[11px] text-gray-400">{configPath || 'backend/agent/runtime/config.yaml'}</p>
            </div>
            <div className="flex rounded-2xl bg-gray-100 p-1 text-[11px] font-semibold text-gray-500">
              <button type="button" onClick={() => setConfigMode('form')} className={`rounded-xl px-3 py-2 ${configMode === 'form' ? 'bg-white text-gray-900 shadow-sm' : ''}`}>Form</button>
              <button type="button" onClick={() => setConfigMode('yaml')} className={`rounded-xl px-3 py-2 ${configMode === 'yaml' ? 'bg-white text-gray-900 shadow-sm' : ''}`}>YAML</button>
            </div>
          </div>

          {configLoading ? (
            <div className="rounded-2xl bg-gray-50 p-4 text-xs font-medium text-gray-500">Đang tải cấu hình...</div>
          ) : configMode === 'form' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configFields.map(field => {
                const value = getPath(agentConfig, field.path)
                if (field.type === 'boolean') {
                  return (
                    <label key={field.path} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                      <span className="text-[12px] font-semibold text-gray-600">{field.label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={e => updateConfigField(field.path, e.target.checked)}
                        className="h-4 w-4 accent-gray-900"
                      />
                    </label>
                  )
                }
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-1">{field.label}</label>
                    <input
                      type={field.type === 'password' ? 'password' : field.type}
                      value={value ?? ''}
                      onChange={e => updateConfigField(field.path, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-gray-50 border border-transparent focus:border-gray-900 rounded-2xl px-4 py-2.5 text-[13px] outline-none transition-all font-medium text-gray-700"
                    />
                    <div className="text-[10px] text-gray-300 ml-1">{field.path}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <textarea
              value={configYaml}
              onChange={e => setConfigYaml(e.target.value)}
              spellCheck={false}
              className="min-h-[520px] w-full resize-y rounded-2xl border border-gray-100 bg-gray-950 p-4 font-mono text-[12px] leading-5 text-gray-100 outline-none focus:border-gray-400"
            />
          )}

          {configMessage.text && (
            <div className={`mt-4 p-4 rounded-2xl text-xs font-bold uppercase tracking-widest text-center ${
              configMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {configMessage.text}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={saveAgentConfig}
              disabled={configSaving || configLoading}
              className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-[11px] font-medium hover:bg-black transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {configSaving ? 'Đang lưu...' : 'Lưu cấu hình agent'}
            </button>
            <button
              type="button"
              onClick={loadConfig}
              disabled={configSaving || configLoading}
              className="w-full bg-gray-50 text-gray-600 py-2.5 rounded-xl text-[11px] font-medium hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Tải lại từ file
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
