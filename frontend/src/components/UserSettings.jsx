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

const PROVIDERS = ['gemini', 'deepseek', 'cx', 'openai', 'anthropic', 'ollama', 'lmstudio', 'llamacpp', 'lmstudio_local']
const PROVIDER_LABELS = {
  gemini: 'Gemini', deepseek: 'DeepSeek', cx: 'CX GPT-5.5',
  openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Ollama',
  lmstudio: 'LM Studio', llamacpp: 'Llama.cpp', lmstudio_local: 'LM Studio Local'
}

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
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [agentConfig, setAgentConfig] = useState({})
  const [configYaml, setConfigYaml] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [configMode, setConfigMode] = useState('form')
  const [message, setMessage] = useState({ text: '', type: '' })

  const booleanFields = useMemo(() => new Set(configFields.filter(f => f.type === 'boolean').map(f => f.path)), [])

  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      const res = await fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được cấu hình')
      setAgentConfig(data.config || {})
      setConfigYaml(data.yaml || '')
      setConfigPath(data.path || '')
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
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

  const handleSaveAll = async () => {
    setLoading(true)
    setMessage({ text: '', type: '' })
    try {
      // 1. Lưu thông tin tài khoản
      const userRes = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ displayName, username, password: password || undefined })
      })
      const userData = await userRes.json()
      if (!userRes.ok) throw new Error(userData.error || 'Lỗi lưu tài khoản')

      // 2. Đồng bộ provider lên backend
      await fetch('/api/auth/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ provider })
      })

      // 3. Lưu cấu hình agent (ghép provider vào config)
      const updatedAgentConfig = setPath(agentConfig, 'model.provider', provider)
      const body = configMode === 'yaml'
        ? { yaml_text: configYaml }
        : { config: updatedAgentConfig }

      const configRes = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const configData = await configRes.json()
      if (!configRes.ok) throw new Error(configData.detail || configData.error || 'Lỗi lưu cấu hình')

      setAgentConfig(configData.config || {})
      setConfigYaml(configData.yaml || '')
      setConfigPath(configData.path || configPath)

      setMessage({ text: 'Đã lưu tất cả thay đổi!', type: 'success' })
      setPassword('')
      onUpdate()
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
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Cài đặt hệ thống</h1>
          <p className="mt-1 text-[11px] text-gray-400">Quản lý tài khoản và cấu hình Agent tập trung</p>
        </div>

        <div className="bg-white border border-black/[0.04] rounded-[2rem] p-6 sm:p-10 shadow-sm space-y-12 animate-in fade-in zoom-in-95 duration-300">

          {/* ── Thông tin tài khoản ── */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-950 flex items-center justify-center text-white shadow-lg shadow-black/10">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Thông tin tài khoản</h2>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Cá nhân & Bảo mật</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Tên hiển thị">
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} />
              </Field>
              <Field label="Tên đăng nhập">
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className={inputCls} />
              </Field>
              <Field label="Mật khẩu mới" className="md:col-span-2">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Để trống nếu không đổi" className={inputCls} />
              </Field>
            </div>
          </section>

          <Divider />

          {/* ── Cấu hình Agent ── */}
          <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Cấu hình Agent</h2>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{configPath || 'config.yaml'}</p>
                </div>
              </div>
              {/* Toggle Form / YAML */}
              <div className="flex rounded-2xl bg-gray-100 p-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <button type="button" onClick={() => setConfigMode('form')} className={`rounded-xl px-5 py-2.5 transition-all ${configMode === 'form' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>Form</button>
                <button type="button" onClick={() => setConfigMode('yaml')} className={`rounded-xl px-5 py-2.5 transition-all ${configMode === 'yaml' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>YAML</button>
              </div>
            </div>

            {/* Provider + CX Model – luôn hiển thị dù form hay yaml */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Provider mặc định">
                <select value={provider} onChange={e => onProviderChange(e.target.value)} className={`${inputCls} appearance-none`}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                </select>
              </Field>
              {provider === 'cx' && (
                <Field label="CX Model">
                  <input value={cxModel || ''} onChange={e => onCxModelChange?.(e.target.value)} placeholder="cx/gpt-5.5" className={inputCls} />
                </Field>
              )}
            </div>

            {/* Form hoặc YAML editor */}
            {configLoading ? (
              <div className="rounded-[2rem] bg-gray-50 p-12 text-center text-xs font-bold text-gray-400 animate-pulse">Đang tải cấu hình hệ thống...</div>
            ) : configMode === 'form' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {configFields.map(field => {
                  const value = getPath(agentConfig, field.path)
                  if (field.type === 'boolean') {
                    return (
                      <label key={field.path} className="flex items-center justify-between rounded-[1.5rem] bg-gray-50/50 border border-transparent hover:border-black/[0.04] transition-all px-5 py-4 cursor-pointer group shadow-inner">
                        <div className="flex flex-col">
                          <span className="text-[12.5px] font-bold text-gray-700 group-hover:text-gray-900">{field.label}</span>
                          <span className="text-[9px] text-gray-400 font-mono mt-0.5">{field.path}</span>
                        </div>
                        <input type="checkbox" checked={Boolean(value)} onChange={e => updateConfigField(field.path, e.target.checked)} className="h-5 w-5 accent-gray-900 rounded-md" />
                      </label>
                    )
                  }
                  return (
                    <div key={field.path} className="space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{field.label}</label>
                        <span className="text-[9px] text-gray-300 font-mono">{field.path}</span>
                      </div>
                      <input
                        type={field.type === 'password' ? 'password' : field.type}
                        value={value ?? ''}
                        onChange={e => updateConfigField(field.path, e.target.value)}
                        placeholder={field.placeholder}
                        className={inputCls}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="relative">
                <textarea
                  value={configYaml}
                  onChange={e => setConfigYaml(e.target.value)}
                  spellCheck={false}
                  className="min-h-[500px] w-full resize-y rounded-[2rem] border border-gray-100 bg-gray-950 p-8 font-mono text-[12.5px] leading-relaxed text-gray-100 outline-none transition-all focus:border-gray-600 shadow-2xl custom-scrollbar"
                />
                <div className="absolute top-6 right-8 text-[10px] font-bold text-gray-600 opacity-50 uppercase tracking-widest">YAML Editor</div>
              </div>
            )}
          </section>

          {/* ── Thông báo ── */}
          {message.text && (
            <div className={`p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center animate-fade-in ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {message.text}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={loading}
              className="w-full bg-gray-950 text-white py-4 rounded-[1.25rem] text-[11px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-black/10 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : 'Lưu tất cả thay đổi'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-full bg-red-50 text-red-600 py-4 rounded-[1.25rem] text-[11px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all active:scale-[0.98]"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
const inputCls = 'w-full bg-gray-50/50 border border-transparent focus:border-gray-900 rounded-2xl px-5 py-3.5 text-[13.5px] outline-none transition-all font-medium text-gray-700 shadow-inner'

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-black/[0.04]" />
}
