import { useEffect, useState } from 'react'
import AgentManager from './AgentManager.jsx'
import ContextCompaction from './ContextCompaction.jsx'
import SkillManager from './SkillManager.jsx'
import ModelStatus from './ModelStatus.jsx'
import { canAccess } from '../lib/permissions.js'

const SETTINGS_TAB_IDS = ['user', 'system', 'models', 'connections', 'tools', 'skills', 'context']

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Robo',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=John',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Sassy'
]

const configFields = [
  // Text / Number fields (đều nhau trong grid)
  { path: 'agent.max_turns', label: 'Max turns', type: 'number', placeholder: '90' },
  { path: 'terminal.cwd', label: 'Terminal cwd', type: 'text', placeholder: '.' },
  { path: 'terminal.timeout', label: 'Terminal timeout', type: 'number', placeholder: '180' },
  { path: 'browser.engine', label: 'Browser engine', type: 'text', placeholder: 'lightpanda' },
  { path: 'browser.command_timeout', label: 'Browser timeout', type: 'number', placeholder: '30' },
  { path: 'display.language', label: 'Ngôn ngữ', type: 'text', placeholder: 'vi' },
  { path: 'file_read_max_chars', label: 'Giới hạn đọc file', type: 'number', placeholder: '100000' },
  { path: 'tool_output.max_bytes', label: 'Tool output bytes', type: 'number', placeholder: '50000' },
  // Boolean toggles (nhóm riêng, chiều cao đồng nhất)
  { path: 'display.show_reasoning', label: 'Hiện reasoning', type: 'boolean' },
  { path: 'display.streaming', label: 'Streaming display', type: 'boolean' },
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
const DEFAULT_SMALL_TOOLSETS = ['terminal', 'file', 'knowledge', 'finance', 'web', 'news', 'weather', 'memory', 'skills']
const PROVIDER_MODEL_SUGGESTIONS = {
  pekpik: ['smart-chat', 'deepseek-chat', 'gemini-2.5-flash', 'gemini-2.5-pro', 'claude-opus-4-7', 'kimi-k2.5', 'text-embedding-3-small'],
  chatgpt2api: ['gpt-5-mini', 'gpt-5-3-mini', 'auto'],
  alibaba: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-coder-plus', 'qwen3-vl-plus', 'qwen3-max'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
}
const MODEL_SUGGESTIONS_KEY = 'hagent_model_suggestions'
const MAX_MODEL_SUGGESTIONS_PER_PROVIDER = 12
const COMPACT_MODEL_SUGGESTION_COUNT = 8

function normalizeModelList(models) {
  const seen = new Set()
  return (Array.isArray(models) ? models : [])
    .map(item => String(item || '').trim())
    .filter(item => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .slice(0, MAX_MODEL_SUGGESTIONS_PER_PROVIDER)
}

function normalizeModelSuggestions(value, includeDefaults = true) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const keys = Array.from(new Set([...(includeDefaults ? Object.keys(PROVIDER_MODEL_SUGGESTIONS) : []), ...Object.keys(source)]))
  return keys.reduce((acc, key) => {
    const models = normalizeModelList([
      ...(source[key] || []),
      ...(includeDefaults ? (PROVIDER_MODEL_SUGGESTIONS[key] || []) : []),
    ])
    if (models.length) acc[key] = models
    return acc
  }, {})
}

function readModelSuggestions() {
  try {
    const saved = localStorage.getItem(MODEL_SUGGESTIONS_KEY)
    if (saved) return normalizeModelSuggestions(JSON.parse(saved), false)
    return normalizeModelSuggestions(PROVIDER_MODEL_SUGGESTIONS)
  } catch {
    return normalizeModelSuggestions(PROVIDER_MODEL_SUGGESTIONS)
  }
}

function writeModelSuggestions(next) {
  const cleaned = normalizeModelSuggestions(next, false)
  localStorage.setItem(MODEL_SUGGESTIONS_KEY, JSON.stringify(cleaned))
  window.dispatchEvent(new CustomEvent('hagent-model-suggestions-updated', { detail: cleaned }))
  return cleaned
}
const TOOL_GROUPS = [
  { id: 'terminal', label: 'Terminal', desc: 'Chạy lệnh, curl, kiểm tra hệ thống' },
  { id: 'file', label: 'File', desc: 'Đọc, ghi, tìm và vá file' },
  { id: 'knowledge', label: 'Wiki', desc: 'Lưu, đọc và tìm kiến thức nội bộ' },
  { id: 'memory', label: 'Memory', desc: 'Ghi nhớ thông tin người dùng và phiên làm việc' },
  { id: 'finance', label: 'Finance', desc: 'Giá vàng, bạc, tỷ giá và quy đổi tiền' },
  { id: 'web', label: 'Web search', desc: 'Tra cứu web công khai khi backend có tool' },
  { id: 'news', label: 'Tin tức', desc: 'VnExpress, Dân trí và nguồn tin nhanh' },
  { id: 'weather', label: 'Thời tiết', desc: 'Dự báo, nhiệt độ, mưa nắng' },
  { id: 'browser', label: 'Browser', desc: 'Điều khiển trình duyệt khi cần thao tác web' },
  { id: 'vision', label: 'Vision', desc: 'Đọc ảnh và nội dung thị giác' },
  { id: 'image_gen', label: 'Image', desc: 'Tạo hoặc chỉnh ảnh nếu tool khả dụng' },
  { id: 'skills', label: 'Skills', desc: 'Nạp skill chuyên biệt cho agent' },
  { id: 'delegation', label: 'Delegate', desc: 'Tách việc cho agent phụ nếu backend hỗ trợ' },
]

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}
function Divider() { return <div className="border-t border-gray-100" /> }

function cleanToolList(value) {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : []
}

function SettingsTabs({ value, onChange, user }) {
  const tabs = [
    { id: 'user', label: 'Tài khoản', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    { id: 'system', label: 'Agent', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { id: 'models', label: 'Models', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 16h12" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16" /></svg> },
    { id: 'connections', label: 'Kết nối', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5l4-4a4 4 0 115.66 5.66l-4 4M10.5 17.5l-4 4A4 4 0 01.84 15.84l4-4M8 12h8" /></svg> },
    { id: 'tools', label: 'Tool', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'skills', label: 'Skill', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-5M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg> },
    { id: 'context', label: 'Ngữ cảnh', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18.477 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
  ]
  const items = tabs.filter(t => canAccess(user, 'settings:' + t.id))
  return (
    <div className="flex w-full flex-nowrap gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 text-[12px] font-semibold text-gray-500 no-scrollbar sm:inline-flex sm:w-auto sm:rounded-md">
      {items.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          title={tab.label}
          aria-label={tab.label}
          className={`flex h-10 min-w-10 flex-none items-center justify-center gap-1.5 rounded-lg px-3 transition-all sm:h-auto sm:rounded sm:px-3 sm:py-1.5 ${value === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}
        >
          {tab.icon}
          <span className={`${value === tab.id ? 'inline' : 'hidden'} sm:inline`}>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

function AgentToolSkillNote() {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] leading-5 text-gray-500">
      <span className="font-semibold text-gray-800">Agent</span> là nhân sự/role chạy model.{' '}
      <span className="font-semibold text-gray-800">Tool</span> là nhóm khả năng agent được phép dùng như web, file, wiki, thời tiết.{' '}
      <span className="font-semibold text-gray-800">Skill</span> là quy trình hoặc kiến thức chuyên biệt để agent nạp khi nhiệm vụ cần.
    </div>
  )
}

function ToolPresetSection({ agentConfig, setAgentConfig }) {
  const smallTools = cleanToolList(getPath(agentConfig, 'tool_presets.small_model'))
  const largeTools = cleanToolList(getPath(agentConfig, 'tool_presets.large_model'))
  const activeSmallTools = smallTools.length ? smallTools : DEFAULT_SMALL_TOOLSETS
  const largeUsesAll = largeTools.length === 0

  const setPreset = (path, values) => {
    setAgentConfig(prev => setPath(prev, path, values))
  }

  const toggleTool = (path, current, id) => {
    const list = cleanToolList(current)
    const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id]
    setPreset(path, next)
  }

  const toolGrid = (path, selected, disabled = false) => (
    <div className={`grid grid-cols-1 gap-2 md:grid-cols-2 ${disabled ? 'opacity-45' : ''}`}>
      {TOOL_GROUPS.map(tool => {
        const checked = selected.includes(tool.id)
        return (
          <label key={`${path}-${tool.id}`} className="flex min-h-[72px] cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition-all hover:border-gray-300 hover:bg-white">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggleTool(path, selected, tool.id)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-gray-950 disabled:cursor-not-allowed"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-gray-800">{tool.label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-gray-400">{tool.desc}</span>
              <span className="mt-1 block font-mono text-[9px] text-gray-300">{tool.id}</span>
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <section className="space-y-5">
      <SectionHeader icon={<WrenchIcon />} color="bg-gray-950 shadow-black/10" title="Tool preset" sub="Chọn nhóm tool cho model nhỏ và model lớn" />

      <div className="rounded-md border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Model nhỏ</h3>
            <p className="mt-1 text-[12px] leading-5 text-gray-400">Dùng cho LM Studio local hoặc context dưới 64k. Preset này giữ tool gọn để không đầy context.</p>
          </div>
          <button
            type="button"
            onClick={() => setPreset('tool_presets.small_model', DEFAULT_SMALL_TOOLSETS)}
            className="rounded-md border border-gray-200 px-3 py-2 text-[10px] font-semibold text-gray-500 transition-all hover:border-gray-400 hover:text-gray-900"
          >
            Preset cơ bản
          </button>
        </div>
        {toolGrid('tool_presets.small_model', activeSmallTools)}
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Model lớn</h3>
            <p className="mt-1 text-[12px] leading-5 text-gray-400">Để trống nghĩa là bật tất cả tool backend. Chọn thủ công nếu muốn giới hạn cho model lớn.</p>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-[10px] font-semibold text-gray-500">
            <input
              type="checkbox"
              checked={largeUsesAll}
              onChange={e => setPreset('tool_presets.large_model', e.target.checked ? [] : DEFAULT_SMALL_TOOLSETS)}
              className="h-4 w-4 accent-gray-950"
            />
            Tất cả tool
          </label>
        </div>
        {largeUsesAll && (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
            Model lớn đang dùng toàn bộ tool khả dụng của backend.
          </div>
        )}
        {toolGrid('tool_presets.large_model', largeTools, largeUsesAll)}
      </div>
    </section>
  )
}

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(res.ok ? 'Phản hồi máy chủ không hợp lệ' : text)
  }
}

function SystemControlsPanel({ token, setMessage }) {
  const [rebooting, setRebooting] = useState(false)
  const [sudoPassword, setSudoPassword] = useState('')
  const [showSudoInput, setShowSudoInput] = useState(false)
  const [rustdeskAction, setRustdeskAction] = useState('')
  const [remotePowerAction, setRemotePowerAction] = useState('')
  const [hatDisplayAction, setHatDisplayAction] = useState(false)
  const [remoteServiceAction, setRemoteServiceAction] = useState('')
  const [cleaningSessions, setCleaningSessions] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState(null)
  const [remoteStatusLoading, setRemoteStatusLoading] = useState(false)
  const [lanIpData, setLanIpData] = useState(null)
  const [lanIpLoading, setLanIpLoading] = useState(false)

  async function refreshRemoteStatus({ silent = false } = {}) {
    if (!silent) setRemoteStatusLoading(true)
    try {
      const res = await fetch('/api/services/remote-machine/status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không kiểm tra được trạng thái remote')
      setRemoteStatus(data)
    } catch (err) {
      setRemoteStatus({
        state: 'unknown',
        online: false,
        sshReachable: false,
        detail: err.message,
      })
    } finally {
      setRemoteStatusLoading(false)
    }
  }

  useEffect(() => {
    let stopped = false
    const run = async (silent = false) => {
      if (!stopped) await refreshRemoteStatus({ silent })
    }
    run(false)
    const timer = window.setInterval(() => { if (!document.hidden) run(true) }, 30000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [token])

  async function forceReboot() {
    const ok = window.confirm('Force restart Mac mini ngay? Các tiến trình chưa lưu có thể mất dữ liệu.')
    if (!ok) return
    if (!sudoPassword) {
      setShowSudoInput(true)
      return
    }
    setRebooting(true)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/reboot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: 'force', sudo_password: sudoPassword })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không force restart được')
      setMessage({ text: data.content || 'Đã gửi lệnh force restart Mac mini', type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRebooting(false)
    }
  }

  async function runRustDesk(action) {
    setRustdeskAction(action)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/rustdesk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: action })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được RustDesk ${action}`)
      setMessage({ text: data.content || `Đã gửi lệnh RustDesk ${action}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRustdeskAction('')
    }
  }

  async function runHatDisplay() {
    setHatDisplayAction(true)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/quick-commands/hatdisplay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: 'on' })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không bật được HatDisplay')
      setMessage({ text: data.content || 'Đã gửi lệnh bật HatDisplay', type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setHatDisplayAction(false)
    }
  }

  async function runRemotePower(command) {
    if (command === 'tat') {
      const ok = window.confirm('Tắt máy remote ngay?')
      if (!ok) return
    }
    setRemotePowerAction(command)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch(`/api/quick-commands/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được /${command}`)
      setMessage({ text: data.content || `Đã gửi lệnh /${command}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRemotePowerAction('')
      refreshRemoteStatus({ silent: true })
    }
  }

  async function runRemoteService(command) {
    setRemoteServiceAction(command)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch(`/api/quick-commands/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được /${command}`)
      setMessage({ text: data.content || `Đã gửi lệnh /${command}`, type: 'success' })
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setRemoteServiceAction('')
      refreshRemoteStatus({ silent: true })
    }
  }

  function CopyButton({ text }) {
    const [copied, setCopied] = useState(false)
    return (
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation()
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {}
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-[11px] text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700"
      >
        {copied
          ? <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        }
        <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    )
  }

  async function scanLanIP() {
    setLanIpLoading(true)
    setLanIpData(null)
    setMessage({ text: '', type: '' })
    try {
      const res = await fetch('/api/services/remote-machine/lan-ip', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không dò được IP LAN')
      setLanIpData(data)
      if (data.lan_ip) {
        setMessage({ text: `Tìm thấy remote tại ${data.lan_ip}`, type: 'success' })
      } else {
        setMessage({ text: 'Không tìm thấy remote trong LAN', type: 'error' })
      }
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLanIpLoading(false)
    }
  }

  const statusTone = remoteStatus?.state === 'online'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : remoteStatus?.state === 'ssh_unavailable'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800'
  const statusDot = remoteStatus?.state === 'online'
    ? 'bg-emerald-500'
    : remoteStatus?.state === 'ssh_unavailable'
      ? 'bg-amber-500'
      : 'bg-red-500'
  const statusLabel = remoteStatusLoading && !remoteStatus
    ? 'Đang kiểm tra...'
    : remoteStatus?.state === 'online'
      ? 'Remote đang bật'
      : remoteStatus?.state === 'ssh_unavailable'
        ? 'Remote bật, SSH chưa sẵn sàng'
        : 'Remote offline hoặc không reachable'
  const statusSummary = remoteStatus?.detail || 'Đang kiểm tra SSH remote...'
  const controlGroups = [
    {
      title: 'Nguồn máy',
      sub: 'Wake, shutdown và trạng thái remote',
      actions: [
        {
          label: 'Bật máy remote',
          detail: 'Gửi lệnh bật máy từ host hiện tại',
          busyLabel: 'Đang bật...',
          busy: remotePowerAction === 'bat',
          disabled: !!remotePowerAction,
          onClick: () => runRemotePower('bat'),
          tone: 'emerald',
        },
        {
          label: 'Tắt máy remote',
          detail: 'Tắt remote sau khi xác nhận',
          busyLabel: 'Đang tắt...',
          busy: remotePowerAction === 'tat',
          disabled: !!remotePowerAction,
          onClick: () => runRemotePower('tat'),
          tone: 'orange',
        },
      ],
    },
    {
      title: 'Truy cập từ xa',
      sub: 'RustDesk, display và dịch vụ model',
      actions: [
        {
          label: 'Bật RustDesk',
          detail: 'Khởi động remote desktop',
          busyLabel: 'Đang bật...',
          busy: rustdeskAction === 'on',
          disabled: !!rustdeskAction,
          onClick: () => runRustDesk('on'),
          tone: 'emerald',
        },
        {
          label: 'Restart RustDesk',
          detail: 'Làm mới phiên RustDesk',
          busyLabel: 'Đang restart...',
          busy: rustdeskAction === 'restart',
          disabled: !!rustdeskAction,
          onClick: () => runRustDesk('restart'),
          tone: 'sky',
        },
        {
          label: 'Tắt RustDesk',
          detail: 'Dừng remote desktop',
          busyLabel: 'Đang tắt...',
          busy: rustdeskAction === 'off',
          disabled: !!rustdeskAction,
          onClick: () => runRustDesk('off'),
          tone: 'slate',
        },
        {
          label: 'Bật HatDisplay',
          detail: 'Kích hoạt màn hình Hat',
          busyLabel: 'Đang bật...',
          busy: hatDisplayAction,
          disabled: hatDisplayAction,
          onClick: runHatDisplay,
          tone: 'violet',
        },
        {
          label: 'Bật LM Studio Remote',
          detail: 'Khởi động model server',
          busyLabel: 'Đang bật...',
          busy: remoteServiceAction === 'lmstudio',
          disabled: !!remoteServiceAction,
          onClick: () => runRemoteService('lmstudio'),
          tone: 'indigo',
        },
      ],
    },
    {
      title: 'Mạng',
      sub: 'Dò tìm LAN IP khi Tailscale lỗi',
      actions: [
        {
          label: lanIpData?.lan_ip ? `LAN IP: ${lanIpData.lan_ip}` : 'Dò IP LAN',
          detail: lanIpData?.lan_ip
            ? `Phát hiện qua ${(lanIpData.discovered_via || []).map(d => d.via).join(', ') || 'N/A'}`
            : `Quét ARP + ping sweep subnet tìm MAC ${lanIpData?.mac || '9c:6b:00:17:93:7a'}`,
          busyLabel: 'Đang dò...',
          busy: lanIpLoading,
          disabled: lanIpLoading,
          onClick: scanLanIP,
          tone: lanIpData?.lan_ip ? 'emerald' : lanIpData ? 'red' : 'sky',
        },
      ],
    },
    {
      title: 'Bảo trì',
      sub: 'Dọn dữ liệu runtime và tác vụ rủi ro',
      actions: [
        {
          label: 'Dọn sessions',
          detail: 'Xóa lịch sử session và file trên đĩa',
          busyLabel: 'Đang dọn...',
          busy: cleaningSessions,
          disabled: cleaningSessions,
          onClick: async () => {
            if (!window.confirm('Xoá tất cả session history và file trên đĩa?')) return
            setCleaningSessions(true)
            setMessage({ text: '', type: '' })
            try {
              const res = await fetch('/api/sessions/clean', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              })
              const data = await readJsonResponse(res)
              if (!res.ok) throw new Error(data.detail || data.error || 'Không dọn được sessions')
              setMessage({ text: data.message || 'Đã dọn sessions', type: 'success' })
            } catch (err) {
              setMessage({ text: err.message, type: 'error' })
            } finally {
              setCleaningSessions(false)
            }
          },
          tone: 'amber',
        },
        {
          label: 'Force restart',
          detail: 'Restart Mac mini bằng sudo',
          busyLabel: 'Đang gửi...',
          busy: rebooting,
          disabled: rebooting,
          onClick: forceReboot,
          tone: 'red',
          danger: true,
        },
      ],
    },
  ]
  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100',
    orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300 hover:bg-orange-100',
    sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100',
    slate: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100',
    violet: 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300 hover:bg-indigo-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100',
    red: 'border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100',
  }
  const renderAction = (action) => (
    <button
      key={action.label}
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={`group flex min-h-[82px] flex-col justify-between rounded-lg border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[action.tone] || toneClasses.slate}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-5 text-gray-950">
            {action.busy ? action.busyLabel : action.label}
          </div>
          <div className="mt-1 text-[11px] leading-4 opacity-75">{action.detail}</div>
        </div>
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${action.danger ? 'bg-red-500' : action.busy ? 'animate-pulse bg-current' : 'bg-current opacity-60'}`} />
      </div>
      {action.danger && (
        <div className="mt-3 inline-flex w-fit items-center rounded border border-red-200 bg-white/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700">
          Xác nhận bắt buộc
        </div>
      )}
    </button>
  )

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-950 via-gray-900 to-slate-800 px-5 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <PowerIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Điều khiển Mac mini</h2>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">Host operations console</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshRemoteStatus()}
              disabled={remoteStatusLoading}
              className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-white/15 bg-white/10 px-3 text-[11px] font-semibold text-white transition-all hover:bg-white/15 disabled:opacity-50"
            >
              {remoteStatusLoading ? 'Đang quét...' : 'Quét trạng thái'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-3">
            <div className={`rounded-lg border p-4 ${statusTone}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${statusDot} ${remoteStatusLoading ? 'animate-pulse' : ''}`} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{statusLabel}</div>
                  <div className="mt-1 break-words text-[12px] leading-5 opacity-80">{statusSummary}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div className="text-[12px] font-semibold">Khu vực thao tác hệ thống</div>
              <p className="mt-1 text-[11px] leading-5 text-amber-800/80">
                Các lệnh shutdown, dọn session và restart bắt buộc xác nhận trước khi gửi xuống host.
              </p>
            </div>

            {showSudoInput && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-red-500">Sudo password</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={sudoPassword}
                    onChange={e => setSudoPassword(e.target.value)}
                    placeholder="Nhập sudo password..."
                    className="min-w-0 flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-[12px] text-red-700 outline-none transition-all placeholder:text-red-300 focus:border-red-400"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') forceReboot() }}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowSudoInput(false); setSudoPassword('') }}
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-[11px] font-semibold text-red-600 hover:border-red-300"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </aside>

          <div className="space-y-4">
            {controlGroups.map(group => (
              <div key={group.title} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-gray-950">{group.title}</h3>
                    <p className="mt-0.5 text-[11px] leading-4 text-gray-400">{group.sub}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {group.actions.map(renderAction)}
                </div>
              </div>
            ))}

            {lanIpData && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-gray-900">Kết quả dò IP LAN</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lanIpData.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${lanIpData.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {lanIpData.ok ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <span className="text-gray-500">LAN IP</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {lanIpData.lan_ip || 'Không tìm thấy'}
                    </span>
                  </div>

                  {lanIpData.lan_ip && (
                    <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                      <span className="text-gray-500">SSH</span>
                      <span className="flex items-center gap-2 font-mono text-gray-700">
                        <span className="select-all">{lanIpData.instructions}</span>
                        <CopyButton text={lanIpData.instructions} />
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <span className="text-gray-500">MAC</span>
                    <span className="font-mono text-xs text-gray-700">{lanIpData.mac}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <span className="text-gray-500">Tailscale</span>
                    <span className={`font-mono ${lanIpData.tailscale_down ? 'text-red-600' : 'text-emerald-600'}`}>
                      {lanIpData.tailscale_down ? 'DOWN' : 'OK'}
                    </span>
                  </div>

                  {lanIpData.discovered_via?.length > 0 && (
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <div className="text-gray-500 mb-1">Phương thức phát hiện</div>
                      <div className="flex flex-wrap gap-1.5">
                        {lanIpData.discovered_via.map((m, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            <span className={`h-1.5 w-1.5 rounded-full ${lanIpData.ok ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                            {m.via}: {m.lan_ip || m.ip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {lanIpData.arp_hits?.length > 0 && (
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <div className="text-gray-500 mb-1">ARP cache</div>
                      <div className="flex flex-wrap gap-1.5">
                        {lanIpData.arp_hits.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600">
                            {a.ip}{a.hostname ? ` (${a.hostname})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Fetch DeepSeek Key Button ───────────────────────────────────────────────────
function FetchDeepSeekButton({ token, model }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleFetch = async () => {
    setLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/quick-commands/fetch-deepseek-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
      setResult(data.content || '✅ Đã cập nhật key DeepSeek mới')
    } catch (err) {
      setResult(`❌ ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleFetch}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600 transition-all hover:border-gray-400 hover:bg-white hover:text-gray-900 disabled:opacity-40"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Đang lấy...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
            </svg>
            Lấy key mới
          </>
        )}
      </button>
      {result && (
        <span className={`text-[11px] font-medium ${result.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
          {result}
        </span>
      )}
    </div>
  )
}

// ── Provider Manager ──────────────────────────────────────────────────────────
function ProviderManager({ token, providers, onProvidersChange, modelSuggestions = PROVIDER_MODEL_SUGGESTIONS, onModelSuggestionsChange }) {
  const [expanded, setExpanded] = useState(null)
  const [editData, setEditData] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [newP, setNewP] = useState({ name: '', label: '', type: 'openai', base_url: '', api_key: '', model: '', contextLength: '' })
  const [busy, setBusy] = useState(false)
  const [probing, setProbing] = useState('')
  const [err, setErr] = useState('')
  const [suggestionDraft, setSuggestionDraft] = useState('')
  const [suggestionsExpanded, setSuggestionsExpanded] = useState({})

  const authFetch = (url, opts = {}) =>
    fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } })

  const toggle = (p) => {
    if (expanded === p.name) { setExpanded(null); return }
    setExpanded(p.name)
    setEditData({ label: p.label, base_url: p.baseURL || '', model: p.model || '', contextLength: p.contextLength || '', api_key: '', type: p.type || 'openai' })
    setErr('')
  }

  const saveProvider = async (name) => {
    if (!editData.label) { setErr('Tên hiển thị bắt buộc'); return }
    setBusy(true); setErr('')
    try {
      const ctx = editData.contextLength === '' || editData.contextLength == null ? null : Number(editData.contextLength)
      const payload = {
        label: editData.label,
        type: editData.type || 'openai',
        base_url: editData.base_url || '',
        model: editData.model || '',
      }
      if (editData.api_key) payload.api_key = editData.api_key
      if (ctx && Number.isFinite(ctx)) payload.contextLength = ctx
      const res = await authFetch(`/api/auth/providers/${name}`, {
        method: 'PUT', body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
      onProvidersChange(providers.map(p => p.name === name ? { ...p, label: editData.label, baseURL: editData.base_url, model: editData.model, contextLength: ctx, type: editData.type } : p))
      setExpanded(null)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const resolveContext = async (name, data, applyValue) => {
    if (!data.model) { setErr('Cần nhập model trước khi dò context'); return }
    setProbing(name || 'new'); setErr('')
    try {
      const res = await authFetch('/api/auth/providers/resolve-context', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: data.type || 'openai',
          base_url: data.base_url || data.baseURL || '',
          api_key: data.api_key || '',
          model: data.model,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.detail || payload.error || 'Không dò được context')
      if (!payload.contextLength) throw new Error('Provider không trả context hợp lệ')
      applyValue(String(payload.contextLength))
      if (name) {
        onProvidersChange(providers.map(p => p.name === name ? { ...p, contextLength: Number(payload.contextLength) } : p))
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setProbing('')
    }
  }

  const deleteProvider = async (name) => {
    if (!confirm(`Xóa provider "${name}"?`)) return
    setBusy(true); setErr('')
    try {
      const res = await authFetch(`/api/auth/providers/${name}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
      onProvidersChange(providers.filter(p => p.name !== name))
      setExpanded(null)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const addProvider = async () => {
    if (!newP.name || !newP.label) { setErr('Cần nhập ID và tên hiển thị'); return }
    setBusy(true); setErr('')
    try {
      const ctx = newP.contextLength === '' || newP.contextLength == null ? null : Number(newP.contextLength)
      const payload = {
        name: newP.name,
        label: newP.label,
        type: newP.type || 'openai',
        base_url: newP.base_url || '',
        model: newP.model || '',
      }
      if (newP.api_key) payload.api_key = newP.api_key
      if (ctx && Number.isFinite(ctx)) payload.contextLength = ctx
      const res = await authFetch('/api/auth/providers', { method: 'POST', body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
      onProvidersChange([...providers, { name: newP.name, label: newP.label, baseURL: newP.base_url, model: newP.model, contextLength: ctx, type: newP.type, custom: true }])
      setNewP({ name: '', label: '', type: 'openai', base_url: '', api_key: '', model: '', contextLength: '' })
      setShowAdd(false)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const smInput = 'w-full bg-white border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] outline-none transition-all font-medium text-gray-700'
  const updateSuggestions = (updater) => {
    const next = typeof updater === 'function' ? updater(modelSuggestions) : updater
    onModelSuggestionsChange?.(writeModelSuggestions(next))
  }
  const addModelSuggestion = (providerName) => {
    const trimmed = suggestionDraft.trim()
    if (!providerName || !trimmed) return
    updateSuggestions(prev => ({
      ...prev,
      [providerName]: normalizeModelList([trimmed, ...(prev[providerName] || [])]),
    }))
    setSuggestionDraft('')
  }
  const removeModelSuggestion = (providerName, modelName) => {
    updateSuggestions(prev => ({
      ...prev,
      [providerName]: normalizeModelList((prev[providerName] || []).filter(m => m !== modelName)),
    }))
  }
  const resetSuggestions = () => {
    if (!confirm('Reset danh sách model gợi ý về mặc định?')) return
    localStorage.removeItem(MODEL_SUGGESTIONS_KEY)
    const defaults = normalizeModelSuggestions(PROVIDER_MODEL_SUGGESTIONS)
    onModelSuggestionsChange?.(defaults)
    window.dispatchEvent(new CustomEvent('hagent-model-suggestions-updated', { detail: defaults }))
  }
  const renderModelField = (providerName, value, onChange, inputClass) => {
    const suggestions = normalizeModelList(modelSuggestions[providerName] || [])
    return (
      <Field label="Model">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="smart-chat" className={inputClass} />
        {suggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map(model => (
              <button
                key={`${providerName}-${model}`}
                type="button"
                onClick={() => onChange(model)}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all ${value === model ? 'border-gray-500 bg-gray-900 text-white' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}
              >
                {model}
              </button>
            ))}
          </div>
        )}
      </Field>
    )
  }
  const renderSuggestionManager = (providerName, onPickModel) => {
    const models = normalizeModelList(modelSuggestions[providerName] || [])
    const expandedList = Boolean(suggestionsExpanded[providerName])
    const visibleModels = expandedList ? models : models.slice(0, COMPACT_MODEL_SUGGESTION_COUNT)
    const hiddenCount = Math.max(models.length - visibleModels.length, 0)
    return (
      <div className="rounded-md border border-gray-100 bg-gray-50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Model gợi ý</span>
            <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-gray-400">{models.length}</span>
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setSuggestionsExpanded(prev => ({ ...prev, [providerName]: !expandedList }))}
              className="shrink-0 text-[10px] font-semibold text-gray-500 hover:text-gray-900"
            >
              {expandedList ? 'Thu gọn' : `+${hiddenCount}`}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={suggestionDraft}
            onChange={e => setSuggestionDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addModelSuggestion(providerName)
              if (e.key === 'Escape') setSuggestionDraft('')
            }}
            placeholder="Thêm model gợi ý..."
            className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={() => addModelSuggestion(providerName)}
            disabled={!suggestionDraft.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Thêm
          </button>
        </div>
        {visibleModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleModels.map(model => (
              <div key={`${providerName}-manage-${model}`} className="group flex max-w-full items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-mono text-gray-700">
                <button type="button" onClick={() => onPickModel?.(model)} className="max-w-[220px] truncate hover:text-gray-950" title={model}>{model}</button>
                <button type="button" onClick={() => removeModelSuggestion(providerName, model)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity" title="Xóa">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Quản lý Provider</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetSuggestions}
            className="text-[10px] font-semibold text-gray-400 hover:text-gray-900 transition-colors px-2.5 py-1 rounded-md hover:bg-gray-100">
            Reset gợi ý
          </button>
          <button type="button" onClick={() => { setShowAdd(s => !s); setErr('') }}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-900 transition-colors px-2.5 py-1 rounded-md hover:bg-gray-100">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Thêm mới
          </button>
        </div>
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
                  {renderModelField(p.name, editData.model, model => setEditData(d => ({ ...d, model })), smInput)}
                  <Field label="Ngữ cảnh provider">
                    <div className="flex gap-2">
                      <input type="number" value={editData.contextLength} onChange={e => setEditData(d => ({ ...d, contextLength: e.target.value }))} placeholder="8192" className={smInput} />
                      <button type="button" onClick={() => resolveContext(p.name, editData, value => setEditData(d => ({ ...d, contextLength: value })))} disabled={Boolean(probing)}
                        className="shrink-0 rounded-md border border-gray-200 px-3 text-[10px] font-semibold text-gray-500 transition-all hover:border-gray-400 hover:text-gray-900 disabled:opacity-40">
                        {probing === p.name ? 'Dò...' : 'Dò max'}
                      </button>
                    </div>
                  </Field>
                  <Field label="API Key"><input type="password" value={editData.api_key} onChange={e => setEditData(d => ({ ...d, api_key: e.target.value }))} placeholder="Để trống nếu không đổi" className={smInput} /></Field>
                </div>
                {renderSuggestionManager(p.name, model => setEditData(d => ({ ...d, model })))}
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
            {renderModelField(newP.name, newP.model, model => setNewP(s => ({ ...s, model })), inputCls)}
            <Field label="Ngữ cảnh provider">
              <div className="flex gap-2">
                <input type="number" value={newP.contextLength} onChange={e => setNewP(s => ({ ...s, contextLength: e.target.value }))} placeholder="8192" className={inputCls} />
                <button type="button" onClick={() => resolveContext(newP.name, newP, value => setNewP(s => ({ ...s, contextLength: value })))} disabled={Boolean(probing)}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-3 text-[10px] font-semibold text-gray-500 transition-all hover:border-gray-400 hover:text-gray-900 disabled:opacity-40">
                  {probing === (newP.name || 'new') ? 'Dò...' : 'Dò max'}
                </button>
              </div>
            </Field>
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

function GmailAccountsPanel({ token }) {
  const [accounts, setAccounts] = useState([])
  const [clientSecretReady, setClientSecretReady] = useState(false)
  const [pending, setPending] = useState(null)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const authHeaders = { Authorization: `Bearer ${token}` }

  const loadAccounts = async () => {
    const res = await fetch('/api/google/accounts', { headers: authHeaders })
    const data = await readJsonResponse(res)
    if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được Gmail')
    setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    setClientSecretReady(Boolean(data.clientSecretReady))
  }

  useEffect(() => {
    if (!token) return
    loadAccounts().catch(err => setError(err.message))
  }, [token])

  useEffect(() => {
    if (!pending?.state) return undefined
    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/google/accounts/pending/${encodeURIComponent(pending.state)}`, { headers: authHeaders })
        const data = await readJsonResponse(res)
        if (!res.ok) throw new Error(data.detail || data.error || 'Không kiểm tra được OAuth')
        if (stopped || data.status === 'pending') return
        if (data.status === 'success') {
          setPending(null)
          setCallbackUrl('')
          setNotice(`Đã cấp quyền cho ${data.account?.email || 'Gmail'}`)
          await loadAccounts()
          return
        }
        if (data.status === 'error') {
          setError(data.error || 'Google OAuth lỗi')
          setPending(null)
          return
        }
        if (data.status === 'expired') {
          setError('Phiên OAuth đã hết hạn. Bấm Thêm Gmail để thử lại.')
          setPending(null)
        }
      } catch (err) {
        if (!stopped) setError(err.message)
      }
    }
    poll()
    const timer = window.setInterval(poll, 1500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [pending?.state, token])

  const startOAuth = async () => {
    setBusy('auth')
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/google/accounts/auth-url', { method: 'POST', headers: authHeaders })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tạo được link Google')
      setPending({
        state: data.state,
        authUrl: data.authUrl,
        redirectUri: data.redirectUri,
        callbackMode: data.callbackMode,
        requiredRedirectUri: data.requiredRedirectUri,
        redirectUriRegistered: data.redirectUriRegistered
      })
      setCallbackUrl('')
      window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      if (data.redirectUriRegistered === false) {
        setNotice('Đã mở Google bằng callback local. Muốn tự nhận callback trên host hiện tại thì cần thêm redirect URI bên dưới vào Google Cloud.')
      } else {
        setNotice('Đã mở Google. Sau khi cấp quyền, hệ thống sẽ tự lưu Google Workspace và cập nhật danh sách.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const completeOAuth = async () => {
    if (!pending?.state) {
      setError('Chưa có phiên OAuth đang chờ')
      return
    }
    setBusy('exchange')
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/google/accounts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ state: pending.state, callback: callbackUrl })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không lưu được tài khoản Gmail')
      setPending(null)
      setCallbackUrl('')
      setNotice(`Đã cấp quyền cho ${data.account?.email || 'Gmail'}`)
      await loadAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const setDefault = async (id) => {
    setBusy(id)
    setError('')
    try {
      const res = await fetch(`/api/google/accounts/${id}/default`, { method: 'POST', headers: authHeaders })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không chọn được tài khoản mặc định')
      await loadAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const togglePermission = async (account) => {
    setBusy(account.id)
    setError('')
    try {
      const res = await fetch(`/api/google/accounts/${account.id}/permission`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ enabled: !account.enabledForAgent })
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không cập nhật được quyền agent')
      await loadAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const removeAccount = async (account) => {
    if (!confirm(`Gỡ quyền Gmail ${account.email}?`)) return
    setBusy(account.id)
    setError('')
    try {
      const res = await fetch(`/api/google/accounts/${account.id}`, { method: 'DELETE', headers: authHeaders })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không gỡ được tài khoản')
      await loadAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader icon={<GmailIcon />} color="bg-red-500 shadow-red-500/20" title="Google Workspace" sub="Đăng nhập từng Google account và cấp quyền Gmail, Drive, Docs, Sheets cho agent" />
        <button
          type="button"
          onClick={startOAuth}
          disabled={busy === 'auth' || !clientSecretReady}
          className="rounded-md bg-gray-950 px-4 py-2 text-[11px] font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'auth' ? 'Đang tạo link...' : 'Thêm Google'}
        </button>
      </div>

      {!clientSecretReady && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
          Chưa có Google client secret trong backend. Cần thêm file client secret trước khi đăng nhập Google.
        </div>
      )}

      {pending && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[12px] leading-5 text-gray-500">
              Đang chờ Google cấp quyền. Sau khi bạn bấm Allow, tab Google sẽ tự gửi code về HAgent và có thể tự đóng.
            </div>
            <a href={pending.authUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-[10px] font-semibold text-gray-600 hover:border-gray-400 hover:text-gray-900">
              Mở lại Google
            </a>
          </div>
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
            Quyền cấp gồm Gmail, Drive, Calendar, Contacts, Sheets và Docs. Không cần dán link nếu Google redirect thành công.
          </div>
          {pending.redirectUriRegistered === false && pending.requiredRedirectUri && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <div className="font-semibold">Host hiện tại chưa có trong Authorized redirect URIs của Google Cloud.</div>
              <div className="break-all rounded border border-amber-200 bg-white px-2 py-1 font-mono text-[11px] text-amber-900">{pending.requiredRedirectUri}</div>
              <div>Thêm URI này vào OAuth client để lần sau Google tự trả quyền về đúng tab này.</div>
            </div>
          )}
          <details className="rounded-md border border-gray-200 bg-white p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-gray-500">Fallback: dán URL callback thủ công</summary>
            <div className="mt-3 space-y-3">
          <textarea
            value={callbackUrl}
            onChange={e => setCallbackUrl(e.target.value)}
            placeholder={`${pending.redirectUri}?code=...&state=...`}
            className="min-h-[76px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] leading-5 text-gray-700 outline-none transition-all focus:border-gray-400"
          />
          <div className="flex gap-2">
            <button type="button" onClick={completeOAuth} disabled={busy === 'exchange' || !callbackUrl.trim()} className="rounded-md bg-emerald-600 px-4 py-2 text-[11px] font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-40">
              {busy === 'exchange' ? 'Đang lưu...' : 'Hoàn tất cấp quyền'}
            </button>
            <button type="button" onClick={() => { setPending(null); setCallbackUrl('') }} className="rounded-md px-4 py-2 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
              Hủy
            </button>
          </div>
            </div>
          </details>
        </div>
      )}

      {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">{error}</div>}

      <div className="space-y-2">
        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-[12px] font-medium text-gray-400">
            Chưa có Google account nào được cấp quyền.
          </div>
        ) : accounts.map(account => (
          <div key={account.id} className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-[13px] font-semibold text-gray-900">{account.email}</div>
                {account.isDefault && <span className="rounded bg-gray-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">Mặc định</span>}
                <span className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${account.enabledForAgent ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                  {account.enabledForAgent ? 'Agent được phép' : 'Agent tắt quyền'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-400">{account.scopes?.length || 0} scope · {account.lastStatus}</div>
              {!account.workspaceReady && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                  Thiếu quyền: {account.missingScopeLabels?.join(', ') || 'Workspace'}. Bấm Thêm Google và chọn lại email này để cấp thêm.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => togglePermission(account)} disabled={busy === account.id || account.isDefault} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[10px] font-semibold text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:opacity-40">
                {account.enabledForAgent ? 'Tắt quyền' : 'Cấp quyền'}
              </button>
              <button type="button" onClick={() => setDefault(account.id)} disabled={busy === account.id || account.isDefault} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[10px] font-semibold text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:opacity-40">
                Dùng mặc định
              </button>
              <button type="button" onClick={() => removeAccount(account)} disabled={busy === account.id} className="rounded-md border border-red-100 bg-white px-3 py-2 text-[10px] font-semibold text-red-500 hover:border-red-300 hover:bg-red-50 disabled:opacity-40">
                Gỡ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function UserSettings({ token, user, provider, cxModel, onCxModelChange, onProviderChange, onUpdate, onLogout, agents = [], onAgentsUpdate }) {
  const [displayName, setDisplayName] = useState(user?.display_name || user?.displayName || '')
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [agentConfig, setAgentConfig] = useState({})
  const [configYaml, setConfigYaml] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [configMode, setConfigMode] = useState('form')
  const [settingsTab, setSettingsTab] = useState(() => localStorage.getItem('hagent_settings_tab') || 'system')
  const [message, setMessage] = useState({ text: '', type: '' })
  const [providers, setProviders] = useState([])
  const [agentSaveHandler, setAgentSaveHandler] = useState(null)
  const [agentSaving, setAgentSaving] = useState(false)
  const [skillSaveHandler, setSkillSaveHandler] = useState(null)
  const [skillSaving, setSkillSaving] = useState(false)
  const [contextSaveHandler, setContextSaveHandler] = useState(null)
  const [contextSaving, setContextSaving] = useState(false)
  const [autoRefreshKey, setAutoRefreshKey] = useState(() => localStorage.getItem('deepseek_auto_refresh_key') === 'true')
  const [pekpikSelectedModel, setPekpikSelectedModel] = useState('smart-chat')
  const [modelSuggestions, setModelSuggestions] = useState(readModelSuggestions)

  const [telegramConfig, setTelegramConfig] = useState({
    botToken: '',
    botTokenMasked: '',
    botId: '',
    terminalBotToken: '',
    terminalBotTokenMasked: '',
    terminalBotId: '',
    homeChannel: '',
    homeChannelThreadId: '',
    apiId: '',
    apiHash: '',
    apiHashMasked: '',
  })

  const authHeaders = { Authorization: `Bearer ${token}` }
  // Nếu sub-tab hiện tại không hợp lệ hoặc không được phép, chuyển về tab đầu tiên hợp lệ.
  useEffect(() => {
    if (SETTINGS_TAB_IDS.includes(settingsTab) && canAccess(user, 'settings:' + settingsTab)) return
    const next = SETTINGS_TAB_IDS.find(id => canAccess(user, 'settings:' + id)) || 'user'
    setSettingsTab(next)
    localStorage.setItem('hagent_settings_tab', next)
  }, [user, settingsTab])
  const selectedProvider = providers.find(p => p.name === provider)
  const selectedProviderContext = selectedProvider?.contextLength || ''
  const syncProviderContextToConfig = (nextProviderName, providerList = providers) => {
    const nextProvider = providerList.find(p => p.name === nextProviderName)
    const nextContext = nextProvider?.contextLength ? Number(nextProvider.contextLength) : ''
    setAgentConfig(prev => setPath(prev, 'model.context_length', nextContext))
  }
  const handleProvidersChange = (nextProviders) => {
    setProviders(nextProviders)
    syncProviderContextToConfig(provider, nextProviders)
  }
  const handleProviderChange = (nextProvider) => {
    onProviderChange(nextProvider)
    syncProviderContextToConfig(nextProvider)
  }

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
      if (pvRes.ok) {
        const providerList = await pvRes.json()
        setProviders(providerList)
        syncProviderContextToConfig(provider, providerList)
      }
      const tgRes = await fetch('/api/config/telegram', { headers: authHeaders })
      if (tgRes.ok) {
        const tg = await tgRes.json()
        const value = tg.config || {}
        setTelegramConfig(prev => ({
          ...prev,
          botToken: '',
          botTokenMasked: value.bot_token_masked || '',
          botId: value.bot_id || '',
          terminalBotToken: '',
          terminalBotTokenMasked: value.terminal_bot_token_masked || '',
          terminalBotId: value.terminal_bot_id || '',
          homeChannel: value.home_channel || '',
          homeChannelThreadId: value.home_channel_thread_id || '',
          apiId: value.api_id || '',
          apiHash: '',
          apiHashMasked: value.api_hash_masked || '',
        }))
      }
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => { if (token) loadConfig() }, [token])

  useEffect(() => {
    if (providers.length) syncProviderContextToConfig(provider, providers)
  }, [provider, providers])

  useEffect(() => {
    const refreshSuggestions = (event) => {
      setModelSuggestions(event?.detail ? normalizeModelSuggestions(event.detail, false) : readModelSuggestions())
    }
    window.addEventListener('hagent-model-suggestions-updated', refreshSuggestions)
    window.addEventListener('storage', refreshSuggestions)
    return () => {
      window.removeEventListener('hagent-model-suggestions-updated', refreshSuggestions)
      window.removeEventListener('storage', refreshSuggestions)
    }
  }, [])

  // Đồng bộ model khi provider change
  useEffect(() => {
    const pekpikModel = providers.find(p => p.name === provider)?.model
    if (pekpikModel) setPekpikSelectedModel(pekpikModel)
  }, [provider, providers])

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.displayName || '')
      setUsername(user.username || '')
      setEmail(user.email || '')
      setAvatar(user.avatar || '')
    }
  }, [user])

  const updateConfigField = (path, rawValue) => {
    const field = configFields.find(f => f.path === path)
    let value = rawValue
    if (field?.type === 'number') value = rawValue === '' ? '' : Number(rawValue)
    if (field?.type === 'boolean') value = Boolean(rawValue)
    setAgentConfig(prev => setPath(prev, path, value))
  }

  const saveTelegramConfig = async () => {
    const res = await fetch('/api/config/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        bot_token: telegramConfig.botToken,
        terminal_bot_token: telegramConfig.terminalBotToken,
        home_channel: telegramConfig.homeChannel,
        home_channel_thread_id: telegramConfig.homeChannelThreadId,
        api_id: telegramConfig.apiId,
        api_hash: telegramConfig.apiHash,
      })
    })
    const data = await readJsonResponse(res)
    if (!res.ok) throw new Error(data.detail || data.error || 'Lỗi lưu Telegram')
    const value = data.config || {}
    setTelegramConfig(prev => ({
      ...prev,
      botToken: '',
      botTokenMasked: value.bot_token_masked || '',
      botId: value.bot_id || '',
      terminalBotToken: '',
      terminalBotTokenMasked: value.terminal_bot_token_masked || '',
      terminalBotId: value.terminal_bot_id || '',
      homeChannel: value.home_channel || '',
      homeChannelThreadId: value.home_channel_thread_id || '',
      apiId: value.api_id || '',
      apiHash: '',
      apiHashMasked: value.api_hash_masked || '',
    }))
    setMessage({ text: data.message || 'Đã lưu cấu hình Telegram', type: 'success' })
  }

  const handleSaveAll = async () => {
    if (settingsTab === 'connections') {
      setLoading(true)
      setMessage({ text: '', type: '' })
      try {
        await saveTelegramConfig()
      } catch (err) {
        setMessage({ text: err.message, type: 'error' })
      } finally {
        setLoading(false)
      }
      return
    }
    if (settingsTab === 'system') {
      // Lưu model suggestions
      setModelSuggestions(writeModelSuggestions(modelSuggestions))

      if (agentSaveHandler) {
        setAgentSaving(true)
        try {
          await agentSaveHandler()
        } catch (err) {
          setMessage({ text: err.message, type: 'error' })
        } finally {
          setAgentSaving(false)
        }
        return
      }
    }
    if (settingsTab === 'skills' && skillSaveHandler) {
      setSkillSaving(true)
      try {
        await skillSaveHandler()
      } catch (err) {
        setMessage({ text: err.message, type: 'error' })
      } finally {
        setSkillSaving(false)
      }
      return
    }
    if (settingsTab === 'context' && contextSaveHandler) {
      setContextSaving(true)
      try {
        await contextSaveHandler()
      } catch (err) {
        setMessage({ text: err.message, type: 'error' })
      } finally {
        setContextSaving(false)
      }
      return
    }
    setLoading(true)
    setMessage({ text: '', type: '' })
    try {
      // 1. Tài khoản
      const userRes = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ displayName, username, password: password || undefined, email, avatar })
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
      let updatedConfig = setPath(agentConfig, 'model.provider', provider)
      updatedConfig = setPath(
        updatedConfig,
        'model.context_length',
        selectedProviderContext ? Number(selectedProviderContext) : getPath(agentConfig, 'model.context_length')
      )
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
            <p className="mt-1 text-[12px] leading-5 text-gray-400">Quản lý tài khoản, provider, tool, agent và skill tập trung</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={onLogout} title="Đăng xuất"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
            <button type="button" onClick={handleSaveAll} disabled={loading || agentSaving || skillSaving || contextSaving} title="Lưu thay đổi"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-30">
              {loading || agentSaving || skillSaving || contextSaving
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

        <SettingsTabs value={settingsTab} user={user} onChange={(tab) => { setSettingsTab(tab); localStorage.setItem('hagent_settings_tab', tab) }} />

        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-5 animate-in fade-in zoom-in-95 duration-300">
          {['system', 'tools', 'skills'].includes(settingsTab) && !agentSaveHandler && <AgentToolSkillNote />}

          {settingsTab === 'user' && (
            <section className="space-y-6">
              <SectionHeader icon={<UserIcon />} color="bg-gray-950 shadow-black/10" title="Thông tin tài khoản" sub="Cá nhân & Bảo mật" />
              
              <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="relative group shrink-0">
                  {avatar ? (
                    <img src={avatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md group-hover:scale-105 transition-transform duration-200" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-950 text-white flex items-center justify-center font-bold text-2xl border-2 border-white shadow-md group-hover:scale-105 transition-transform duration-200">
                      {String(displayName || username || 'H').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 w-full space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Ảnh đại diện</h3>
                    <p className="text-[10px] text-gray-400 font-medium">Chọn một trong những ảnh đại diện mẫu bên dưới hoặc dán đường dẫn ảnh tùy ý của bạn.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_PRESETS.map((presetUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatar(presetUrl)}
                        className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all ${avatar === presetUrl ? 'border-emerald-500 scale-110 shadow-sm' : 'border-transparent hover:border-gray-300'}`}
                      >
                        <img src={presetUrl} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAvatar('')}
                      className="h-9 px-3 rounded-full border border-gray-200 hover:border-red-500 hover:text-red-500 text-[10px] font-semibold transition-all"
                    >
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Tên hiển thị">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} />
                </Field>
                <Field label="Tên đăng nhập">
                  <input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className={inputCls} />
                </Field>
                <Field label="Địa chỉ Email">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@domain.com" className={inputCls} />
                </Field>
                <Field label="Đường dẫn ảnh đại diện tùy chỉnh (URL)">
                  <input value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="https://example.com/avatar.png" className={inputCls} />
                </Field>
                <Field label="Mật khẩu mới" className="md:col-span-2">
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Để trống nếu không đổi" className={inputCls} />
                </Field>
              </div>
            </section>
          )}

          {settingsTab === 'connections' && (
            <section className="space-y-5">
              <SectionHeader icon={<ConnectionIcon />} color="bg-gray-950 shadow-black/10" title="Kênh kết nối" sub="Bot, messaging và dịch vụ ngoài" />

              <GmailAccountsPanel token={token} />

              <div className="rounded-md border border-gray-200 bg-white p-4 space-y-4">
                <SectionHeader icon={<TelegramIcon />} color="bg-sky-500 shadow-sky-500/20" title="Telegram" sub=".env cho bot, workflow và terminal" />
                {(telegramConfig.botId || telegramConfig.terminalBotId) && (
                  <div className="text-[12px] leading-5 text-gray-500">
                    {telegramConfig.botId && <div className="font-semibold text-gray-800">Bot hiện tại: {telegramConfig.botId}</div>}
                    {telegramConfig.terminalBotId && <div className="font-semibold text-gray-800">Terminal: {telegramConfig.terminalBotId}</div>}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Bot token chính" className="md:col-span-2">
                    <input
                      type="password"
                      value={telegramConfig.botToken}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, botToken: e.target.value }))}
                      placeholder={telegramConfig.botTokenMasked || '123456789:AA...'}
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Bot token Claude Terminal" className="md:col-span-2">
                    <input
                      type="password"
                      value={telegramConfig.terminalBotToken}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, terminalBotToken: e.target.value }))}
                      placeholder={telegramConfig.terminalBotTokenMasked || 'Để trống để fallback về bot chính'}
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Home channel / chat id">
                    <input
                      value={telegramConfig.homeChannel}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, homeChannel: e.target.value }))}
                      placeholder="7782048635 hoặc -100..."
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Thread id">
                    <input
                      value={telegramConfig.homeChannelThreadId}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, homeChannelThreadId: e.target.value }))}
                      placeholder="Để trống nếu không dùng topic"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Telegram API ID">
                    <input
                      value={telegramConfig.apiId}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, apiId: e.target.value }))}
                      placeholder="Dùng cho Telegram user account"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Telegram API Hash">
                    <input
                      type="password"
                      value={telegramConfig.apiHash}
                      onChange={e => setTelegramConfig(prev => ({ ...prev, apiHash: e.target.value }))}
                      placeholder={telegramConfig.apiHashMasked || 'Để trống nếu không đổi'}
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2">
                  <div className="rounded-md bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">TELEGRAM_BOT_TOKEN</div>
                    <div className="mt-1 font-mono text-gray-400">{telegramConfig.botTokenMasked || 'Chưa có'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">TELEGRAM_TERMINAL_BOT_TOKEN</div>
                    <div className="mt-1 font-mono text-gray-400">{telegramConfig.terminalBotTokenMasked || 'Fallback bot chính'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">TELEGRAM_HOME_CHANNEL</div>
                    <div className="mt-1 font-mono text-gray-400">{telegramConfig.homeChannel || 'Chưa có'}</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {settingsTab === 'system' && (
            <>
              {/* Provider manager */}
              <ProviderManager token={token} providers={providers} onProvidersChange={handleProvidersChange} modelSuggestions={modelSuggestions} onModelSuggestionsChange={setModelSuggestions} />

              {/* Nút lấy key mới cho Pekpik — theo model đã chọn */}
              <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Pekpik Key</span>
                    <p className="mt-1 text-[11px] leading-5 text-gray-400">
                      Tự động lấy key API mới và chuyển model dự phòng khi gặp lỗi xác thực. Click model bên dưới để chọn model cần lấy key, rồi bấm Lấy key mới. Tương thích chế độ di động.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 justify-start sm:justify-end">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={autoRefreshKey}
                        onChange={(e) => { const v = e.target.checked; setAutoRefreshKey(v); localStorage.setItem('deepseek_auto_refresh_key', v ? 'true' : 'false') }}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      Tự động
                    </label>
                    <FetchDeepSeekButton token={token} model={pekpikSelectedModel} />
                  </div>
                </div>
                {/* Model selector chips — lấy theo model đã chọn */}
                <div className="flex flex-wrap gap-2">
                  {modelSuggestions.pekpik?.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPekpikSelectedModel(m)}
                      className={`rounded-md border px-3 py-2 text-[10px] font-semibold transition-all ${
                        pekpikSelectedModel === m
                          ? 'border-gray-500 bg-gray-900 text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-900'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <Divider />

              {/* ── Quản lý Agent ── */}
              <section className="space-y-4">
                {!agentSaveHandler && (
                  <SectionHeader icon={<UsersIcon />} color="bg-indigo-600 shadow-indigo-600/20" title="Danh sách Agent" sub="Quản lý nhân sự AI" />
                )}
                <div className={agentSaveHandler ? 'min-h-[560px]' : ''}>
                  <AgentManager token={token} agents={agents} onUpdate={onAgentsUpdate || onUpdate} embedded registerSave={setAgentSaveHandler} />
                </div>
              </section>

              {!agentSaveHandler && (
                <>
                  <Divider />

                  {/* ── Cấu hình Agent ── */}
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <SectionHeader icon={<WrenchIcon />} color="bg-emerald-500 shadow-emerald-500/20" title="Cấu hình Agent & Model" sub={configPath || 'config.yaml'} />
                      <div className="flex rounded-md bg-gray-100 p-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <button type="button" onClick={() => setConfigMode('form')} className={`rounded px-3 py-1.5 transition-all ${configMode === 'form' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>Form</button>
                        <button type="button" onClick={() => setConfigMode('yaml')} className={`rounded px-3 py-1.5 transition-all ${configMode === 'yaml' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}>YAML</button>
                      </div>
                    </div>

                    {/* Provider selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Provider mặc định" className="md:col-span-2">
                        <select value={provider} onChange={e => handleProviderChange(e.target.value)} className={`${inputCls} appearance-none`}>
                          {providers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
                        </select>
                      </Field>
                    </div>

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
                </>
              )}
            </>
          )}

          {settingsTab === 'context' && (
            <ContextCompaction token={token} contextLength={selectedProviderContext} embedded registerSave={setContextSaveHandler} />
          )}

          {settingsTab === 'tools' && (
            <ToolPresetSection agentConfig={agentConfig} setAgentConfig={setAgentConfig} />
          )}

          {settingsTab === 'models' && (
            <div className="h-full min-h-0 overflow-hidden">
              <ModelStatus token={token} />
            </div>
          )}

          {settingsTab === 'skills' && (
            <section className="min-h-[560px]">
              <SkillManager token={token} embedded registerSave={setSkillSaveHandler} />
            </section>
          )}

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
function UsersIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function ConnectionIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 6.5l4-4a4 4 0 1 1 5.66 5.66l-4 4"/><path d="M10.5 17.5l-4 4A4 4 0 0 1 .84 15.84l4-4"/><path d="M8 12h8"/></svg>
}
function PowerIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10"/><path d="M6.34 6.34a8 8 0 1 0 11.32 0"/></svg>
}
function TelegramIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3L3 10.5l7 2.5"/><path d="M21 3l-4.5 18-6.5-8"/><path d="M21 3L10 13"/></svg>
}
function GmailIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
}
