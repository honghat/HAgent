import { useEffect, useMemo, useState } from 'react'

const configFields = [
  // Text / Number fields (đều nhau trong grid)
  { path: 'model.context_length', label: 'Context length', type: 'number', placeholder: '65536' },
  { path: 'agent.max_turns', label: 'Max turns', type: 'number', placeholder: '90' },
  { path: 'terminal.cwd', label: 'Terminal cwd', type: 'text', placeholder: '.' },
  { path: 'terminal.timeout', label: 'Terminal timeout', type: 'number', placeholder: '180' },
  { path: 'browser.engine', label: 'Browser engine', type: 'text', placeholder: 'lightpanda' },
  { path: 'browser.command_timeout', label: 'Browser timeout', type: 'number', placeholder: '30' },
  { path: 'display.language', label: 'Ngôn ngữ', type: 'text', placeholder: 'vi' },
  { path: 'file_read_max_chars', label: 'Giới hạn đọc file', type: 'number', placeholder: '100000' },
  { path: 'tool_output.max_bytes', label: 'Tool output bytes', type: 'number', placeholder: '50000' },
  { path: 'compression.threshold', label: 'Ngưỡng compact context', type: 'number', placeholder: '0.50' },
  { path: 'compression.target_ratio', label: 'Tỉ lệ summary compact', type: 'number', placeholder: '0.20' },
  { path: 'compression.protect_last_n', label: 'Giữ message gần nhất', type: 'number', placeholder: '20' },
  { path: 'compression.hygiene_hard_message_limit', label: 'Giới hạn message cứng', type: 'number', placeholder: '400' },
  // Boolean toggles (nhóm riêng, chiều cao đồng nhất)
  { path: 'display.show_reasoning', label: 'Hiện reasoning', type: 'boolean' },
  { path: 'display.streaming', label: 'Streaming display', type: 'boolean' },
  { path: 'compression.enabled', label: 'Automatically compacting context', type: 'boolean' },
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

const inputCls = 'w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] outline-none transition-all font-medium text-gray-700'

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}
function Divider() { return <div className="border-t border-gray-100" /> }

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(res.ok ? 'Phản hồi máy chủ không hợp lệ' : text)
  }
}

// ── Provider Manager ──────────────────────────────────────────────────────────
function ProviderManager({ token, providers, onProvidersChange }) {
  const [expanded, setExpanded] = useState(null)
  const [editData, setEditData] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [newP, setNewP] = useState({ name: '', label: '', type: 'openai', base_url: '', api_key: '', model: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const authFetch = (url, opts = {}) =>
    fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } })

  const toggle = (p) => {
    if (expanded === p.name) { setExpanded(null); return }
    setExpanded(p.name)
    setEditData({ label: p.label, base_url: p.baseURL || '', model: p.model || '', api_key: '', type: p.type || 'openai' })
    setErr('')
  }

  const saveProvider = async (name) => {
    if (!editData.label) { setErr('Tên hiển thị bắt buộc'); return }
    setBusy(true); setErr('')
    try {
      const res = await authFetch(`/api/auth/providers/${name}`, {
        method: 'PUT', body: JSON.stringify(editData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onProvidersChange(providers.map(p => p.name === name ? { ...p, label: editData.label, baseURL: editData.base_url, model: editData.model, type: editData.type } : p))
      setExpanded(null)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const deleteProvider = async (name) => {
    if (!confirm(`Xóa provider "${name}"?`)) return
    setBusy(true); setErr('')
    try {
      const res = await authFetch(`/api/auth/providers/${name}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onProvidersChange(providers.filter(p => p.name !== name))
      setExpanded(null)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const addProvider = async () => {
    if (!newP.name || !newP.label) { setErr('Cần nhập ID và tên hiển thị'); return }
    setBusy(true); setErr('')
    try {
      const res = await authFetch('/api/auth/providers', { method: 'POST', body: JSON.stringify(newP) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onProvidersChange([...providers, { name: newP.name, label: newP.label, baseURL: newP.base_url, model: newP.model, type: newP.type, custom: true }])
      setNewP({ name: '', label: '', type: 'openai', base_url: '', api_key: '', model: '' })
      setShowAdd(false)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const smInput = 'w-full bg-white border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] outline-none transition-all font-medium text-gray-700'

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Quản lý Provider</span>
        <button type="button" onClick={() => { setShowAdd(s => !s); setErr('') }}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-900 transition-colors px-2.5 py-1 rounded-md hover:bg-gray-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Thêm mới
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {providers.map(p => (
          <div key={p.name}>
            <div onClick={() => toggle(p)} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50/40 hover:bg-gray-50 transition-colors cursor-pointer group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-gray-800">{p.label}</span>
                  {!p.custom && <span className="text-[8px] font-bold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full uppercase">built-in</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] font-mono text-gray-400">{p.name}</span>
                  {p.baseURL && <span className="text-[10px] text-gray-300 truncate max-w-[200px]">{p.baseURL}</span>}
                  {p.model && <span className="text-[10px] text-gray-300">{p.model}</span>}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-gray-300 transition-transform ${expanded === p.name ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
            </div>

            {expanded === p.name && (
              <div className="px-3 py-3 bg-white space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tên hiển thị"><input value={editData.label} onChange={e => setEditData(d => ({ ...d, label: e.target.value }))} className={smInput} /></Field>
                  <Field label="Base URL"><input value={editData.base_url} onChange={e => setEditData(d => ({ ...d, base_url: e.target.value }))} placeholder="http://..." className={smInput} /></Field>
                  <Field label="Model"><input value={editData.model} onChange={e => setEditData(d => ({ ...d, model: e.target.value }))} placeholder="gpt-4o" className={smInput} /></Field>
                  <Field label="API Key"><input type="password" value={editData.api_key} onChange={e => setEditData(d => ({ ...d, api_key: e.target.value }))} placeholder="Để trống nếu không đổi" className={smInput} /></Field>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={() => saveProvider(p.name)} disabled={busy}
                    className="text-[10px] font-semibold text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900 px-3 py-1.5 rounded-md transition-all disabled:opacity-40">
                    {busy ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button type="button" onClick={() => setExpanded(null)} className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-md transition-all">Hủy</button>
                  {p.custom && (
                    <button type="button" onClick={() => deleteProvider(p.name)} disabled={busy}
                      className="ml-auto text-[10px] font-semibold text-gray-300 hover:text-red-500 px-2.5 py-1.5 rounded-md transition-all">Xóa</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Thêm provider mới</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ID (key)"><input value={newP.name} onChange={e => setNewP(s => ({ ...s, name: e.target.value.replace(/\s/g, '_').toLowerCase() }))} placeholder="my_provider" className={inputCls} /></Field>
            <Field label="Tên hiển thị"><input value={newP.label} onChange={e => setNewP(s => ({ ...s, label: e.target.value }))} placeholder="My Provider" className={inputCls} /></Field>
            <Field label="Base URL"><input value={newP.base_url} onChange={e => setNewP(s => ({ ...s, base_url: e.target.value }))} placeholder="http://localhost:1234/v1" className={inputCls} /></Field>
            <Field label="Model"><input value={newP.model} onChange={e => setNewP(s => ({ ...s, model: e.target.value }))} placeholder="gpt-4o" className={inputCls} /></Field>
            <Field label="API Key" className="sm:col-span-2"><input type="password" value={newP.api_key} onChange={e => setNewP(s => ({ ...s, api_key: e.target.value }))} placeholder="sk-..." className={inputCls} /></Field>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={addProvider} disabled={busy} className="flex-1 bg-gray-900 text-white py-2 rounded-md text-[11px] font-semibold uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50">
              {busy ? 'Đang lưu...' : 'Thêm provider'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setErr('') }} className="px-4 py-2 rounded-md text-[11px] font-semibold text-gray-500 hover:bg-gray-200 transition-all">Hủy</button>
          </div>
        </div>
      )}

      {err && <p className="text-[11px] text-red-500 font-medium px-1">{err}</p>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
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
  const [providers, setProviders] = useState([])

  const authHeaders = { Authorization: `Bearer ${token}` }

  // Load config.yaml + providers
  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      const [cfgRes, pvRes] = await Promise.all([
        fetch('/api/config', { headers: authHeaders }),
        fetch('/api/auth/providers', { headers: authHeaders })
      ])
      const cfg = await cfgRes.json()
      if (!cfgRes.ok) throw new Error(cfg.detail || cfg.error || 'Không tải được cấu hình')
      setAgentConfig(cfg.config || {})
      setConfigYaml(cfg.yaml || '')
      setConfigPath(cfg.path || '')
      if (pvRes.ok) setProviders(await pvRes.json())
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => { if (token) loadConfig() }, [token])

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
      // 1. Tài khoản
      const userRes = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ displayName, username, password: password || undefined })
      })
      const userData = await readJsonResponse(userRes)
      if (!userRes.ok) throw new Error(userData.error || 'Lỗi lưu tài khoản')

      // 2. Providers (Bulk save)
      const providersRes = await fetch('/api/auth/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ providers })
      })
      const providersData = await readJsonResponse(providersRes)
      if (!providersRes.ok) throw new Error(providersData.detail || providersData.error || 'Lỗi lưu provider')

      // 3. Default Provider
      const providerRes = await fetch('/api/auth/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ provider })
      })
      const providerData = await readJsonResponse(providerRes)
      if (!providerRes.ok) throw new Error(providerData.detail || providerData.error || 'Lỗi lưu provider mặc định')

      // 3. Agent config
      const updatedConfig = setPath(agentConfig, 'model.provider', provider)
      const body = configMode === 'yaml' ? { yaml_text: configYaml } : { config: updatedConfig }
      const configRes = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body)
      })
      const configData = await readJsonResponse(configRes)
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
    <div className="h-full bg-gray-50 flex flex-col p-3 md:p-5 overflow-y-auto pb-safe">
      <div className="max-w-5xl mx-auto w-full space-y-3">
        <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-base font-semibold text-gray-900 tracking-tight">Cài đặt hệ thống</h1>
            <p className="mt-1 text-[11px] text-gray-400">Quản lý tài khoản và cấu hình Agent tập trung</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={onLogout} title="Đăng xuất"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
            <button type="button" onClick={handleSaveAll} disabled={loading} title="Lưu thay đổi"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-30">
              {loading
                ? <svg width="16" height="16" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              }
            </button>
          </div>
        </div>

        {message.text && (
          <div className={`p-3 rounded-md text-[10px] font-bold uppercase tracking-widest text-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-5 animate-in fade-in zoom-in-95 duration-300">

          {/* ── Tài khoản ── */}
          <section className="space-y-4">
            <SectionHeader icon={<UserIcon />} color="bg-gray-950 shadow-black/10" title="Thông tin tài khoản" sub="Cá nhân & Bảo mật" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeader icon={<WrenchIcon />} color="bg-emerald-500 shadow-emerald-500/20" title="Cấu hình Agent" sub={configPath || 'config.yaml'} />
              <div className="flex rounded-md bg-gray-100 p-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <button type="button" onClick={() => setConfigMode('form')} className={`rounded px-3 py-1.5 transition-all ${configMode === 'form' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>Form</button>
                <button type="button" onClick={() => setConfigMode('yaml')} className={`rounded px-3 py-1.5 transition-all ${configMode === 'yaml' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>YAML</button>
              </div>
            </div>

            {/* Provider selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Provider mặc định" className="md:col-span-2">
                <select value={provider} onChange={e => onProviderChange(e.target.value)} className={`${inputCls} appearance-none`}>
                  {providers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            {/* Provider manager */}
            <ProviderManager token={token} providers={providers} onProvidersChange={setProviders} />

            {/* Form / YAML */}
            {configLoading ? (
              <div className="rounded-lg bg-gray-50 p-8 text-center text-xs font-semibold text-gray-400 animate-pulse">Đang tải cấu hình...</div>
            ) : configMode === 'form' ? (
              <div className="space-y-4">
                {/* Text & Number Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {configFields.filter(f => f.type !== 'boolean').map((field, idx, arr) => {
                    const value = getPath(agentConfig, field.path)
                    const isLastOdd = idx === arr.length - 1 && arr.length % 2 !== 0
                    return (
                      <div key={field.path} className={`space-y-1.5 ${isLastOdd ? 'md:col-span-2' : ''}`}>
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

                {/* Boolean Toggles Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {configFields.filter(f => f.type === 'boolean').map((field, idx, arr) => {
                    const value = getPath(agentConfig, field.path)
                    const isLastOdd = idx === arr.length - 1 && arr.length % 2 !== 0
                    return (
                      <label key={field.path} className={`flex items-center justify-between rounded-md bg-gray-50 border border-gray-200 hover:border-gray-300 transition-all px-3 py-2.5 cursor-pointer group ${isLastOdd ? 'md:col-span-2' : ''}`}>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-gray-600 group-hover:text-gray-900">{field.label}</span>
                          <span className="text-[9px] text-gray-300 font-mono mt-0.5">{field.path}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={e => updateConfigField(field.path, e.target.checked)}
                          className="h-4 w-4 accent-gray-950 rounded border-gray-300 transition-all cursor-pointer"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="relative">
                <textarea value={configYaml} onChange={e => setConfigYaml(e.target.value)} spellCheck={false}
                  className="min-h-[420px] w-full resize-y rounded-lg border border-gray-100 bg-gray-950 p-4 font-mono text-[12px] leading-relaxed text-gray-100 outline-none transition-all focus:border-gray-600 custom-scrollbar" />
                <div className="absolute top-3 right-4 text-[10px] font-bold text-gray-600 opacity-50 uppercase tracking-widest">YAML Editor</div>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}

function SectionHeader({ icon, color, title, sub }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-md ${color} flex items-center justify-center text-white`}>{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{sub}</p>
      </div>
    </div>
  )
}

function UserIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function WrenchIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
}
