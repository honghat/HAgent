
import { Suspense, lazy, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ChevronDown, GraduationCap, Headphones, Mic, Pencil, Plus, RefreshCcw, Send, Square } from 'lucide-react'
import StepsTimeline from './StepsTimeline.jsx'
import { useSpeechToText } from '../hooks/useSpeechToText.js'
import { useHandsFreeVoice } from '../hooks/useHandsFreeVoice.js'

const Wiki = lazy(() => import('./Wiki.jsx'))

export default function Chat({ token, provider, cxModel, agents, user, onProviderChange }) {
  const MODEL_SUGGESTIONS_KEY = 'hagent_model_suggestions'
  const MAX_MODEL_SUGGESTIONS_PER_PROVIDER = 12
  const defaultProviderLabels = {
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    cx: 'CX GPT-5.5',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama',
    lmstudio: 'LM Studio',
    llamacpp: 'Llama.cpp',
    lmstudio_local: 'LM Studio Local',
    pekpik: 'Pekpik Free',
    chatgpt2api: 'ChatGPT (local)',
    alibaba: 'Alibaba Cloud',
    groq: 'Groq'
  }
  const PEKPIK_FALLBACK_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-7', 'deepseek-chat', 'smart-chat', 'deepseek-reasoner', 'gemini-2.5-flash', 'kimi-k2.5']
  const PEKPIK_PROVIDER_NAMES = ['pekpik', 'pekpik-custom']
  const FALLBACK_PROVIDERS = ['pekpik', 'pekpik-custom', 'deepseek', 'openai', 'gemini', 'anthropic', 'groq']

  const getModelSuggestions = () => {
    try {
      const saved = localStorage.getItem(MODEL_SUGGESTIONS_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  }

  const normalizeModelList = (models) => {
    const seen = new Set()
    return (Array.isArray(models) ? models : [])
      .map((item) => String(item || '').trim())
      .filter((item) => {
        if (!item || seen.has(item)) return false
        seen.add(item)
        return true
      })
      .slice(0, MAX_MODEL_SUGGESTIONS_PER_PROVIDER)
  }

  const saveModelSuggestion = (providerName, modelName) => {
    const cleanProvider = String(providerName || '').trim()
    const cleanModel = String(modelName || '').trim()
    if (!cleanProvider || !cleanModel) return
    const suggestions = getModelSuggestions()
    const next = {
      ...suggestions,
      [cleanProvider]: normalizeModelList([cleanModel, ...(suggestions[cleanProvider] || [])]),
    }
    localStorage.setItem(MODEL_SUGGESTIONS_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('hagent-model-suggestions-updated', { detail: next }))
  }

  const parseErrorMessage = (raw, fallback = 'Yêu cầu thất bại') => {
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) return fallback
    try {
      const parsed = JSON.parse(text)
      const detail = parsed.detail || parsed.error || parsed.message
      if (typeof detail === 'string') return detail
      if (detail?.message) return detail.message
      if (detail?.error?.message) return detail.error.message
      if (parsed.error?.message) return parsed.error.message
    } catch {
      // raw text from backend
    }
    return text
  }

  const formatProviderError = (raw, fallback = 'Yêu cầu thất bại') => {
    const message = parseErrorMessage(raw, fallback)
    return message.length > 260 ? `${message.slice(0, 257)}...` : message
  }

  const deletePendingFollowUp = (id) => {
    setPendingFollowUps((prev) => prev.filter((item) => item.id !== id))
  }

  const [providerLabels, setProviderLabels] = useState(defaultProviderLabels)
  const [providerOptions, setProviderOptions] = useState(() => (
    Object.entries(defaultProviderLabels).map(([name, label]) => ({ name, label }))
  ))

  // --- localStorage persistence for page-refresh resilience ---
  const PERSIST_KEY = 'hagent_chat_state'
  const PERSIST_TTL_MS = 6 * 60 * 60 * 1000
  const normalizePersistedMessage = (message, fallbackRole = 'assistant') => ({
    ...message,
    id: String(message?.id || message?.messageId || `${fallbackRole}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    role: message?.role || fallbackRole,
    content: typeof message?.content === 'string' ? message.content : String(message?.content || ''),
    createdAt: message?.createdAt || message?.created_at || new Date().toISOString(),
    usage: message?.usage || null
  })
  const loadPersistedState = () => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data.activeId) return null
      if (data.updatedAt && Date.now() - Number(data.updatedAt) > PERSIST_TTL_MS) return null
      return data
    } catch { return null }
  }
  const initialPersistedState = loadPersistedState()

  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(() => initialPersistedState?.activeId || null)
  const [selectedAgentId, setSelectedAgentId] = useState(null)

  const handleAgentChange = (id) => {
    setSelectedAgentId(id)
    fetch('/api/auth/agent', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: id })
    }).catch(() => {})
  }

  const [messages, setMessages] = useState(() => (
    Array.isArray(initialPersistedState?.messages)
      ? initialPersistedState.messages.map(normalizePersistedMessage)
      : []
  ))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(() => Boolean(initialPersistedState?.loading))
  const [streamingText, setStreamingText] = useState(() => (
    typeof initialPersistedState?.streamingText === 'string' ? initialPersistedState.streamingText : ''
  ))
  const [steps, setSteps] = useState(() => (
    Array.isArray(initialPersistedState?.steps) ? initialPersistedState.steps : []
  ))
  const [currentClarification, setCurrentClarification] = useState(null)
  const [journal, setJournal] = useState([])
  const [showJournal, setShowJournal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [showWiki, setShowWiki] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [speakingId, setSpeakingId] = useState(null)
  const [pastedImages, setPastedImages] = useState([])
  const [pendingFollowUps, setPendingFollowUps] = useState([])
  const [sttStatus, setSttStatus] = useState('')
  const [workspace, setWorkspace] = useState({ tools: [], todos: [], summary: null })
  const [providerActive, setProviderActive] = useState(true)
  const [filterSource, setFilterSource] = useState('all')
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [exhaustedAll, setExhaustedAll] = useState(false)
  const [cmdFilter, setCmdFilter] = useState('')
  const [pendingMedia, setPendingMedia] = useState([])
  const [inputComposing, setInputComposing] = useState(false)
  const [fileChanges, setFileChanges] = useState(() => (
    Array.isArray(initialPersistedState?.fileChanges) ? initialPersistedState.fileChanges : []
  ))
  const [todoPanelOpen, setTodoPanelOpen] = useState(true)
  const [todoShowCompleted, setTodoShowCompleted] = useState(false)
  const [providerConfigs, setProviderConfigs] = useState({})
  const [showComposerProviderMenu, setShowComposerProviderMenu] = useState(false)
  const [showComposerModelMenu, setShowComposerModelMenu] = useState(false)
  const [editingModel, setEditingModel] = useState(false)
  const [modelDraft, setModelDraft] = useState('')
  const [toast, setToast] = useState(null)
  const [continueMode, setContinueMode] = useState(false)
  const [professorMode, setProfessorMode] = useState(false)
  const [browserMode, setBrowserMode] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const continueModeRef = useRef(false)
  const jobHunterTouchedRef = useRef(false)
  const seenMediaRef = useRef(new Set())
  const terminalCallCounterRef = useRef(0)
  const retryModelIndexRef = useRef(0)
  const retryProviderIndexRef = useRef(0)
  const modelFetchingRef = useRef(false)
  const openedWindowsRef = useRef([])

  const fileInputRef = useRef(null)
  const useNewBackend = true
  const newBackendBase = ''

  const withBackendBase = (path, preferNew = false) => {
    if (preferNew && useNewBackend) return `${newBackendBase}${path}`
    return path
  }
  const msgEndRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const streamingTextRef = useRef(streamingText)
  const activeIdRef = useRef(activeId)
  const sessionControllersRef = useRef(new Map())
  const speechToText = useSpeechToText({
    token,
    language: '',
    onTranscript: (transcript) => {
      setSttStatus('')
      const text = String(transcript || '').trim()
      if (!text) return
      const combined = input.trim() ? `${input.trimEnd()} ${text}` : text
      setInput('')
      send(combined)
    },
    onError: (message) => setSttStatus(message || 'STT thất bại.')
  })

  const handsFreeVoice = useHandsFreeVoice({
    token,
    language: '',
    paused: loading || !!speakingId,
    onTranscript: (text) => {
      setSttStatus('')
      const t = String(text || '').trim()
      if (!t) return
      setInput('')
      send(t)
    },
    onError: (message) => setSttStatus(message || 'Voice STT lỗi.')
  })

  const prevLoadingRef = useRef(false)
  useEffect(() => {
    if (prevLoadingRef.current && !loading && handsFreeVoice.enabled) {
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content)
      if (lastAssistant) handleSpeak(lastAssistant.content, lastAssistant.id)
    }
    prevLoadingRef.current = loading
  }, [loading, handsFreeVoice.enabled, messages])

  useEffect(() => {
    fetch('/api/browser/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setBrowserMode(d.mode))
      .catch(() => setBrowserMode('headless'))
  }, [])

  const toggleBrowserMode = async () => {
    const next = browserMode === 'headless' ? 'headed' : 'headless'
    try {
      const r = await fetch('/api/browser/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: next }),
      })
      if (r.ok) setBrowserMode(next)
    } catch {}
  }

  const jsonOrThrow = async (res) => {
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      const message = data?.detail || data?.error || data?.message || `HTTP ${res.status}`
      throw new Error(message)
    }
    return data
  }
  const fmtToken = (n) => {
    if (!n) return '0'
    if (n >= 1000000) {
      const v = n / 1000000
      return (v % 1 === 0 ? v : v.toFixed(1)) + 'M'
    }
    if (n >= 1000) {
      const v = n / 1000
      return (v % 1 === 0 ? v : v.toFixed(1)) + 'K'
    }
    return n.toString()
  }

  const compactText = (value, max = 96) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
  }

  const compactUrl = (value, max = 92) => {
    try {
      const url = new URL(String(value || '').trim())
      const compact = `${url.hostname}${url.pathname}`.replace(/\/$/, '')
      return compactText(compact, max)
    } catch {
      return compactText(value, max)
    }
  }

  const toolMeta = (name, label) => {
    const toolName = String(name || '')
    const raw = String(label || name || '').replace(/\s·\sSearXNG local/g, '').trim()
    const fallback = compactText(raw || toolName)
    if (toolName === 'get_weather') {
      return { icon: '🌤', title: 'Thời tiết', source: 'Open-Meteo', preview: compactText(raw, 86) }
    }
    if (toolName === 'web_search') {
      return { icon: '🔎', title: 'Tìm web', source: 'SearXNG local', preview: compactText(raw, 86) }
    }
    if (toolName === 'web_extract') {
      return { icon: '📄', title: 'Đọc trang', source: 'web_extract', preview: compactUrl(raw, 86) }
    }
    if (toolName === 'browser_navigate') {
      return { icon: '🌐', title: 'Mở trình duyệt', source: 'browser', preview: compactUrl(raw, 86) }
    }
    if (toolName.startsWith('job_hunter_') || toolName === 'cv_generate_docx') {
      return { icon: '💼', title: 'Săn việc', source: toolName, preview: compactText(raw, 86) }
    }
    if (toolName === 'read_file' || toolName === 'read') {
      const fileLabel = compactText(raw, 86)
      return { icon: '📖', title: 'Đọc file', source: fileLabel || toolName, preview: '' }
    }
    if (toolName === 'write_file' || toolName === 'write_to_file') {
      const fileLabel = compactText(raw, 86)
      return { icon: '✍️', title: 'Ghi file', source: fileLabel || toolName, preview: '' }
    }
    if (toolName === 'patch') {
      const fileLabel = compactText(raw, 86)
      return { icon: '🔧', title: 'Sửa file', source: fileLabel || toolName, preview: '' }
    }
    if (toolName === 'terminal' || toolName === 'bash' || toolName === 'exec') {
      return { icon: '💻', title: '$ ' + compactText(raw, 80), source: 'bash', preview: '' }
    }
    return { icon: '🛠️', title: fallback || toolName || 'Tool', source: toolName, preview: '' }
  }

  const displayToolLabel = (name, label) => {
    const meta = toolMeta(name, label)
    return [meta.title, meta.source].filter(Boolean).join(' · ')
  }

  const parseJournal = (j) => {
    if (!Array.isArray(j)) return { steps: [], fileChanges: [] }
    const stepsFromJournal = []
    const fileChangesFromJournal = []
    j.forEach(entry => {
      if (entry.type === 'tool') {
        const meta = toolMeta(entry.name, entry.content)
        const stepLabel = [meta.title, meta.source].filter(Boolean).join(' · ')
        const existingIdx = stepsFromJournal.findIndex(s => s.id === entry.name)
        if (existingIdx !== -1) {
          stepsFromJournal[existingIdx] = {
            id: entry.name,
            label: stepLabel,
            icon: meta.icon,
            status: entry.status === 'start' ? 'running' : 'done',
            count: entry.count,
            input: entry.input != null ? (typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2)) : (stepsFromJournal[existingIdx].input || null),
            output: entry.output != null ? (typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output, null, 2)) : (stepsFromJournal[existingIdx].output || null)
          }
        } else {
          stepsFromJournal.push({
            id: entry.name,
            label: stepLabel,
            icon: meta.icon,
            status: entry.status === 'start' ? 'running' : 'done',
            count: entry.count,
            input: entry.input != null ? (typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2)) : null,
            output: entry.output != null ? (typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output, null, 2)) : null
          })
        }
      } else if (entry.type === 'file_change') {
        try {
          const parsed = JSON.parse(entry.content)
          fileChangesFromJournal.push({
            path: entry.name,
            added: parsed.added || 0,
            removed: parsed.removed || 0,
            tool: parsed.tool || '',
            patches: parsed.patches || []
          })
        } catch { /* ignore */ }
      }
    })
    return { steps: stepsFromJournal, fileChanges: fileChangesFromJournal }
  }

  const renderTimeline = (stepsList, fileChangesList, isLoading) => {
    return <StepsTimeline steps={stepsList} fileChanges={fileChangesList} isLoading={isLoading} />
  }

  const formatToolProgress = (name, label, status) => {
    const meta = toolMeta(name, label)
    const state = status === 'done' ? 'xong' : 'đang chạy'
    const header = `${status === 'done' ? '✅' : meta.icon} **${meta.title}** · ${meta.source} · ${state}`
    return meta.preview ? `\n> ${header}\n> ${meta.preview}\n` : `\n> ${header}\n`
  }

  const normalizeSession = (session) => ({
    ...session,
    id: session?.id || session?.session_id,
    title: session?.title || 'Cuộc trò chuyện mới',
    status: session?.status || 'idle'
  })

  const normalizeMessage = (message, fallbackRole = 'assistant') => ({
    ...message,
    id: String(message?.id || message?.messageId || `${fallbackRole}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    role: message?.role || fallbackRole,
    content: typeof message?.content === 'string' ? message.content : String(message?.content || ''),
    createdAt: message?.createdAt || message?.created_at || new Date().toISOString(),
    usage: message?.usage || null,
    journal: Array.isArray(message?.journal) ? message.journal : []
  })

  const mergeStreamingDraft = (serverMessages, sessionId, busy) => {
    const normalized = Array.isArray(serverMessages) ? serverMessages.map(normalizeMessage) : []
    if (!busy || !sessionId) return normalized

    const persisted = loadPersistedState()
    const persistedDraft = persisted?.activeId === sessionId && typeof persisted.streamingText === 'string'
      ? persisted.streamingText
      : ''
    const liveDraft = activeId === sessionId ? streamingTextRef.current : ''
    const draft = liveDraft.length >= persistedDraft.length ? liveDraft : persistedDraft
    if (!draft) return normalized

    const lastAssistantIndex = normalized.map((m) => m.role).lastIndexOf('assistant')
    if (lastAssistantIndex < 0) {
      return [
        ...normalized,
        normalizeMessage({ role: 'assistant', content: draft, id: `draft-${sessionId}` }, 'assistant')
      ]
    }

    const currentContent = normalized[lastAssistantIndex]?.content || ''
    if (currentContent.length >= draft.length) return normalized

    return normalized.map((message, index) => (
      index === lastAssistantIndex ? { ...message, content: draft } : message
    ))
  }

  const commands = [
    ['giavang', '💰 Giá vàng DOJI'],
    ['thoitiet', '🌤 Dự báo thời tiết'],
    ['tinmoi', '📰 Tin tức mới nhất'],
    ['new', '🔄 Phiên chat mới'],
    ['status', '📊 Trạng thái hệ thống'],
    ['goal', '🎯 Xem/đặt mục tiêu'],
    ['terminal', '🖥 Mở Terminal Claude'],
    ['bat', '💻 Bật máy (WOL)'],
    ['tat', '🔌 Tắt máy (SSH)'],
    ['tygia', '💱 Tỷ giá Vietcombank'],
    ['vieclam', '💼 Tìm việc làm'],
    ['chuyenclaude', '⚙️ Đổi Claude Terminal model'],
    ['chuyenclaude freemodel', '  🟢 FreeModel'],
    ['chuyenclaude deepseek', '  🟢 DeepSeek Proxy'],
    ['chuyenclaude ollama', '  🔵 Ollama Remote'],
    ['chuyenclaude lmstudio', '  🟡 LM Studio Remote'],
    ['chuyenclaude llamacpp', '  🟣 Llama.cpp'],
    ['chuyenclaude lmstudio_local', '  🟠 LM Studio Local'],
    ['chuyenclaude cx', '  🌐 9Router'],
    ['chuyenmohinh', '🤖 Đổi AI'],
    ['chuyenmohinh deepseek', '  🟢 DeepSeek V3'],
    ['chuyenmohinh lmstudio', '  🟡 LM Studio Remote'],
    ['chuyenmohinh lmstudio_local', '  🟠 LM Studio Local'],
    ['chuyenmohinh ollama', '  🔵 Ollama'],
    ['chuyenmohinh llamacpp', '  🟣 Llama.cpp'],
    ['chuyenmohinh pekpik', '  🔴 Pekpik Free'],
    ['chuyenmohinh cx', '  🌐 9Router'],
    ['rustdesk', '🟢 Bật/tắt RustDesk'],
    ['rustdesk on', '  🟢 Bật RustDesk'],
    ['rustdesk restart', '  🔁 Restart RustDesk (sửa lỗi chờ hình ảnh)'],
    ['rustdesk off', '  🔴 Tắt RustDesk'],
    ['smb', '💾 Mount remote SMB'],
['smb sys', '  💻 238GB SSD (SystemDisk)'],
    ['lmstudio', '🚀 LM Studio Remote'],
    ['lmstudio_local', '💻 LM Studio Local'],
    ['ollama', '🦙 Ollama Remote'],
    ['llamacpp', '🏗️ Llama-cpp Remote'],
    ['pekpik', '🚀 Pekpik Free API'],
    ['off', '🛑 Tắt tất cả dịch vụ'],
  ]
  const workspaceToolCount = Number.isFinite(workspace.summary?.toolCount)
    ? workspace.summary.toolCount
    : workspace.tools.length
  const workspaceTodoCount = Number.isFinite(workspace.summary?.todoCount)
    ? workspace.summary.todoCount
    : workspace.todos.length
  const activeSession = (Array.isArray(sessions) ? sessions : []).find((s) => s.id === activeId)
  const activeAgent = (Array.isArray(agents) ? agents : []).find((a) => a.id === (activeSession?.agentId || selectedAgentId))
  const activeProviderLabel = providerLabels[provider] || provider
  const activeModelLabel = providerConfigs[provider]?.model || ''
  const activeContextLabel = providerConfigs[provider]?.contextLength ? fmtToken(providerConfigs[provider].contextLength) : 'Max'
  const composerTodos = Array.isArray(workspace.todos) ? workspace.todos : []
  const visibleTodos = todoShowCompleted
    ? composerTodos
    : composerTodos.filter((todo) => todo?.status !== 'completed' && todo?.status !== 'cancelled')
  const hiddenTodoCount = composerTodos.length - visibleTodos.length
  const completedTodoCount = composerTodos.filter((todo) => todo?.status === 'completed').length
  const composerHasTodos = composerTodos.length > 0
  const composerBottomOffset = composerHasTodos && todoPanelOpen
    ? 'bottom-[13rem] sm:bottom-[13.25rem]'
    : 'bottom-[8.75rem] sm:bottom-[9rem]'

  const fetchSessions = async () => {
    const r = await fetch(withBackendBase('/api/sessions', true), { headers: { Authorization: `Bearer ${token}` } })
    const list = await jsonOrThrow(r)
    const validList = Array.isArray(list) ? list.map(normalizeSession).filter((s) => s.id) : []
    setSessions(validList)
    return validList
  }

  const fetchWorkspace = async (sessionId) => {
    if (!sessionId) return
    try {
      const r = await fetch(withBackendBase(`/api/sessions/${sessionId}/workspace`, true), { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) return
      const data = await r.json()
      if (sessionId !== activeIdRef.current) return
      setWorkspace({
        tools: Array.isArray(data.tools) ? data.tools : [],
        todos: Array.isArray(data.todos) ? data.todos : [],
        summary: data.summary || null
      })
    } catch {
      if (sessionId !== activeIdRef.current) return
      setWorkspace({ tools: [], todos: [], summary: null })
    }
  }

  // Request notification permission for bot responses
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((list) => {
        if (cancelled) return;
        const persisted = loadPersistedState()
        // If the persisted activeId still exists on the server, use it
        if (persisted?.activeId && list.some((s) => s.id === persisted.activeId)) {
          setActiveId(persisted.activeId)
        } else if (list.length > 0) {
          setActiveId(list[0].id)
        } else {
          createSession()
        }
      })
      .catch(() => {
        if (!cancelled) createSession();
      })
    return () => { cancelled = true; };
  }, [])

  // Persist activeId on changes so page refresh restores it
  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}')
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...current, activeId, updatedAt: Date.now() }))
    } catch { /* ignore */ }
  }, [activeId])

  useEffect(() => {
    streamingTextRef.current = streamingText
  }, [streamingText])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    if (!activeId) return
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        activeId,
        messages: messages.slice(-80),
        streamingText,
        loading,
        steps,
        fileChanges,
        updatedAt: Date.now()
      }))
    } catch { /* ignore */ }
  }, [activeId, messages, streamingText, loading, steps, fileChanges])

  useEffect(() => {
    if (activeId) {
      setStreamingText('')
      setSteps([])
      setFileChanges([])
      setCurrentClarification(null)
      setJournal([])
      setWorkspace({ tools: [], todos: [], summary: null })
      loadMessages(activeId)
      fetchWorkspace(activeId)
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [activeId])

  useEffect(() => {
    if (Array.isArray(agents) && agents.length > 0 && !selectedAgentId) {
      fetch('/api/auth/agent', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (data.agentId && agents.some(a => a.id === data.agentId)) {
            setSelectedAgentId(data.agentId)
          } else {
            setSelectedAgentId(agents[0].id)
          }
        })
        .catch(() => setSelectedAgentId(agents[0].id))
    }
  }, [agents, selectedAgentId])

  useEffect(() => {
    fetch('/api/auth/providers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list)) {
          const labelMap = { ...defaultProviderLabels }
          const configMap = {}
          list.forEach(p => { 
            if (p.name && p.label) labelMap[p.name] = p.label 
            configMap[p.name] = p
          })
          setProviderLabels(labelMap)
          setProviderOptions(list.filter((p) => p?.name).map((p) => ({ name: p.name, label: p.label || p.name })))
          setProviderConfigs(configMap)
        }
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!showCommands) setCmdFilter('')
  }, [showCommands])

  useEffect(() => {
    const checkProviderStatus = async () => {
      try {
        const r = await fetch(withBackendBase(`/api/auth/providers/${provider}/health`), { headers: { Authorization: `Bearer ${token}` } })
        const data = await r.json()
        setProviderActive(data.status === 'ok')
      } catch {
        setProviderActive(false)
      }
    }
    checkProviderStatus()
    const int = setInterval(() => { if (!document.hidden) checkProviderStatus() }, 15000)
    return () => clearInterval(int)
  }, [provider])

  useEffect(() => {
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages, streamingText, steps])

  const ackMedia = async (id) => {
    try { await fetch(withBackendBase(`/api/media/ack/${id}`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
  }
  const dismissMedia = async (id) => {
    setPendingMedia(prev => prev.filter(it => it.id !== id))
    await ackMedia(id)
  }
  const rememberWindow = (url, win) => {
    if (!win) return
    openedWindowsRef.current.push({ url, win })
    if (openedWindowsRef.current.length > 30) openedWindowsRef.current.shift()
  }
  const hostOf = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }
  const closeOpenedWindows = (target) => {
    const all = openedWindowsRef.current
    const remaining = []
    let closed = 0
    const t = (target || '').trim()
    const isAll = !t || t === 'all' || t === '*'
    const targetHost = hostOf(t.includes('://') ? t : `https://${t}`)
    const targetStr = t.toLowerCase()
    for (const entry of all) {
      let match = isAll
      if (!match) {
        if (entry.url === t) match = true
        else {
          const eHost = hostOf(entry.url)
          if (targetHost && eHost && (eHost === targetHost || eHost.endsWith('.' + targetHost))) match = true
          else if (entry.url.toLowerCase().includes(targetStr)) match = true
        }
      }
      if (match) {
        try { if (!entry.win.closed) { entry.win.close(); closed++ } } catch {}
      } else {
        remaining.push(entry)
      }
    }
    openedWindowsRef.current = remaining
    return closed
  }
  const openMedia = (item) => {
    let win = null
    try { win = window.open(item.url, '_blank') } catch {}
    rememberWindow(item.url, win)
    dismissMedia(item.id)
  }
  const showToast = (message, type = 'error', duration) => {
    setToast({ message, type, id: Date.now() })
    clearTimeout(window._toastTimer)
    window._toastTimer = setTimeout(() => setToast(null), duration || 5000)
  }

  useEffect(() => {
    if (!token) return
    let stopped = false
    const fetchPending = async () => {
      try {
        const r = await fetch(withBackendBase('/api/media/pending'), { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const data = await r.json()
        if (stopped) return
        const items = Array.isArray(data.items) ? data.items : []
        const blocked = []
        for (const it of items) {
          if (seenMediaRef.current.has(it.id)) continue
          seenMediaRef.current.add(it.id)
          if (it.kind === 'close') {
            closeOpenedWindows(it.url)
            ackMedia(it.id)
            continue
          }
          let win = null
          try { win = window.open(it.url, '_blank') } catch {}
          if (win) {
            rememberWindow(it.url, win)
            ackMedia(it.id)
          } else {
            blocked.push(it)
          }
        }
        setPendingMedia(prev => {
          const kept = prev.filter(p => items.some(it => it.id === p.id))
          const merged = [...kept]
          for (const b of blocked) if (!merged.some(m => m.id === b.id)) merged.push(b)
          if (merged.length === prev.length && merged.every((m, i) => m.id === prev[i]?.id)) return prev
          return merged
        })
      } catch {}
    }
    fetchPending()
    const t = setInterval(() => { if (!document.hidden) fetchPending() }, 5000)
    return () => { stopped = true; clearInterval(t) }
  }, [token])

  useEffect(() => {
    if (loading || streamingText || pendingFollowUps.length === 0) return
    const [next, ...rest] = pendingFollowUps
    setPendingFollowUps(rest)
    send(next.content)
  }, [loading, streamingText, pendingFollowUps])

  async function refreshSessionState(id) {

    if (useNewBackend) {
      const [messagesRes, statusRes, journalRes] = await Promise.all([
        fetch(withBackendBase(`/api/sessions/${id}/messages`, true), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(withBackendBase(`/api/sessions/${id}/status`, true), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(withBackendBase(`/api/sessions/${id}/journal`, true), { headers: { Authorization: `Bearer ${token}` } }),
      ])

      let busy = false
      if (statusRes.ok) {
        const status = await statusRes.json()
        busy = status.status === 'busy'
      }
      const stillActive = id === activeIdRef.current
      if (messagesRes.ok) {
        const msgs = await messagesRes.json()
        if (stillActive) {
          const nextMessages = mergeStreamingDraft(msgs, id, busy)
          setMessages(nextMessages)
          if (busy && streamingTextRef.current) setStreamingText('')
        }
      }
      if (journalRes.ok) {
        const j = await journalRes.json()
        if (stillActive) {
          setJournal(Array.isArray(j) ? j : [])
          const { steps: sj, fileChanges: fcj } = parseJournal(j)
          setSteps(sj)
          setFileChanges(fcj)
        }
      }
      return busy
    }

    const [messagesRes, journalRes, statusRes] = await Promise.all([
      fetch(`/api/sessions/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/sessions/${id}/journal`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/sessions/${id}/status`, { headers: { Authorization: `Bearer ${token}` } })
    ])

    let busy = false
    if (statusRes.ok) {
      const status = await statusRes.json()
      busy = status.status === 'busy'
    }
    const stillActive = id === activeIdRef.current
    if (messagesRes.ok) {
      const msgs = await messagesRes.json()
      if (stillActive) {
        const nextMessages = mergeStreamingDraft(msgs, id, busy)
        setMessages(nextMessages)
        if (busy && streamingTextRef.current) setStreamingText('')
      }
    }
    if (journalRes.ok) {
      const j = await journalRes.json()
      if (stillActive) {
        setJournal(Array.isArray(j) ? j : [])
        const { steps: sj, fileChanges: fcj } = parseJournal(j)
        setSteps(sj)
        setFileChanges(fcj)
      }
    }
    return busy
  }

  function startSessionPolling(id) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      if (id !== activeIdRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        return
      }
      try {
        const busy = await refreshSessionState(id)
        if (id !== activeIdRef.current) return
        setLoading(busy)
        await fetchWorkspace(id)
        if (!busy) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setStreamingText('')
          await fetchSessions()
        }
      } catch {
        // noop
      }
    }, 800)
  }

  // Auto-detect: nếu có user message chưa có assistant reply → set loading
  const prevMessagesRef = useRef([])
  useEffect(() => {
    if (messages.length === 0) {
      prevMessagesRef.current = []
      return
    }
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'user') {
      const hasReply = messages.some(
        (m) => m.role === 'assistant' && m.id !== lastMsg.id
      )
      if (!hasReply) {
        setLoading(true)
      }
    }
    prevMessagesRef.current = messages
  }, [messages])

  async function loadMessages(id) {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setSteps([])
    setFileChanges([])
    try {
      const busy = await refreshSessionState(id)
      setLoading(busy)
      if (busy) startSessionPolling(id)
    } catch {
      setLoading(false)
    }
  }

  const createSessionPromise = useRef(null)
  async function createSession() {
    if (createSessionPromise.current) return createSessionPromise.current;
    createSessionPromise.current = (async () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (speakAudioRef.current) {
        speakAudioRef.current.pause()
        speakAudioRef.current = null
      }
      setSpeakingId(null)
      setLoading(false)
      setStreamingText('')
      setSteps([])
      setFileChanges([])
      setCurrentClarification(null)
      setContinueMode(false)
      continueModeRef.current = false
      setPendingFollowUps([])
      setPendingMedia([])
      setJournal([])
      setPastedImages([])
      setShowCommands(false)
      seenMediaRef.current = new Set()
      for (const entry of openedWindowsRef.current) {
        try { if (!entry.win.closed) entry.win.close() } catch {}
      }
      openedWindowsRef.current = []
      const r = await fetch(withBackendBase('/api/sessions', true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: null, agentId: selectedAgentId || null })
      })
      const s = await jsonOrThrow(r)
      const normalized = normalizeSession(s)
      const sessionId = normalized.id
      setSessions((p) => [normalized, ...(Array.isArray(p) ? p : [])])
      setActiveId(sessionId)
      setMessages([])
      setWorkspace({ tools: [], todos: [], summary: null })
      setLoading(false)
      createSessionPromise.current = null;
      return normalized
    })();
    return createSessionPromise.current;
  }

  async function deleteSession(id) {
    await fetch(withBackendBase(`/api/sessions/${id}`, true), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const remaining = (Array.isArray(sessions) ? sessions : []).filter((s) => s.id !== id)
    setSessions(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id || null)
  }

  async function deleteMessage(msgId) {
    await fetch(withBackendBase(`/api/sessions/${activeId}/messages/${msgId}`, true), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setMessages((p) => p.filter((m) => m.id !== msgId))
  }

  async function resendMessage(msgId, content) {
    // Xoá message này và tất cả message phía sau (khỏi UI)
    setMessages((p) => {
      const idx = p.findIndex((m) => m.id === msgId)
      if (idx === -1) return p
      // Xoá từ msgId trở đi
      const idsToDelete = p.slice(idx).map((m) => m.id)
      // Xoá trên server
      idsToDelete.forEach((id) => {
        fetch(withBackendBase(`/api/sessions/${activeId}/messages/${id}`, true), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
      })
      return p.slice(0, idx)
    })
    // Gửi lại nội dung
    await send(content)
  }

  function handleStartEdit(msgId, content) {
    setEditingId(msgId)
    setEditText(content)
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  async function handleSaveEdit(msgId) {
    const trimmed = editText.trim()
    if (!trimmed) return
    await fetch(withBackendBase(`/api/sessions/${activeId}/messages/${msgId}`, true), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed })
    }).catch(() => {})
    setMessages((p) => p.map((m) => (m.id === msgId ? { ...m, content: trimmed } : m)))
    setEditingId(null)
    setEditText('')
  }

  async function runQuickCommand(raw, args = '') {
    setShowCommands(false)
    const normalized = String(raw || '').replace(/^\//, '').trim()
    if (!normalized) return

    if (normalized === 'new') {
      await createSession()
      return
    }

    let currentId = activeId
    if (!currentId) {
      const s = await createSession()
      currentId = s.id
    }

    if (['vieclam', 'sanviec', 'sănviệc', 'job', 'jobs'].includes(normalized)) {
      await send(args, { sessionId: currentId, bypassQueue: true })
      return
    }

    setLoading(true)
    setStreamingText('')
    setSteps([])
    setCurrentClarification(null)
    try {
      const res = await fetch(withBackendBase(`/api/quick-commands/${encodeURIComponent(normalized)}`, true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentId,
          provider,
          args,
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `Không chạy được /${normalized}`)
      await refreshSessionState(currentId)
      await fetchWorkspace(currentId)
      await fetchSessions()
    } catch (err) {
      setMessages((p) => [
        ...p,
        normalizeMessage({ role: 'user', content: `/${normalized}` }, 'user'),
        normalizeMessage({ role: 'assistant', content: `Lỗi: ${err.message}` }, 'assistant'),
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const speakAudioRef = useRef(null)

  const speakCancelRef = useRef(null)
  const audioElRef = useRef(null)

  const ensureAudioUnlocked = () => {
    if (audioElRef.current) return audioElRef.current
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audio.src = 'data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    try { audio.play().then(() => audio.pause()).catch(() => {}) } catch {}
    audioElRef.current = audio
    return audio
  }

  const splitForTts = (text) => {
    const parts = text.split(/(?<=[.!?…\n])\s+/).map(s => s.trim()).filter(Boolean)
    const chunks = []
    let buf = ''
    for (const p of parts) {
      if ((buf + ' ' + p).length > 160 && buf) {
        chunks.push(buf)
        buf = p
      } else {
        buf = buf ? buf + ' ' + p : p
      }
    }
    if (buf) chunks.push(buf)
    return chunks
  }

  const fetchTtsBlob = async (text, signal) => {
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, server: 'edge', voice: 'vi-VN-HoaiMyNeural', rate: '+0%', pitch: '+0Hz' }),
      signal,
    })
    if (!res.ok) throw new Error('TTS failed: ' + res.status)
    return await res.blob()
  }

  const handleSpeak = async (content, id) => {
    if (speakingId === id) {
      speakCancelRef.current?.abort()
      try { audioElRef.current?.pause() } catch {}
      setSpeakingId(null)
      return
    }
    speakCancelRef.current?.abort()
    try { audioElRef.current?.pause() } catch {}

    const audio = ensureAudioUnlocked()
    const ctl = new AbortController()
    speakCancelRef.current = ctl

    const text = content
      .replace(/<[^>]*>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_~`#]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\p{Emoji_Modifier}/gu, '')
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/[‍︎️⃣]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return

    const chunks = splitForTts(text)
    if (chunks.length === 0) return

    setSpeakingId(id)
    speakAudioRef.current = audio
    const pending = chunks.map(c => fetchTtsBlob(c, ctl.signal).catch(() => null))

    try {
      for (let i = 0; i < pending.length; i++) {
        if (ctl.signal.aborted) break
        const blob = await pending[i]
        if (!blob || ctl.signal.aborted) continue
        const url = URL.createObjectURL(blob)
        audio.src = url
        await new Promise((resolve) => {
          let resolved = false
          const done = () => { if (resolved) return; resolved = true; URL.revokeObjectURL(url); resolve() }
          audio.onended = done
          audio.onerror = done
          const onAbort = () => { try { audio.pause() } catch {}; done() }
          ctl.signal.addEventListener('abort', onAbort, { once: true })
          audio.play().catch(done)
        })
      }
    } finally {
      if (speakCancelRef.current === ctl) {
        setSpeakingId(null)
        speakAudioRef.current = null
        speakCancelRef.current = null
      }
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length === 0) return
    e.preventDefault()
    for (const file of imageFiles) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPastedImages((prev) => [...prev, {
          id: Date.now() + '-' + Math.random().toString(36).slice(2),
          dataUrl: ev.target.result,
          file
        }])
      }
      reader.readAsDataURL(file)
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(e) {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          setPastedImages((prev) => [...prev, {
            id: Date.now() + '-' + Math.random().toString(36).slice(2),
            dataUrl: ev.target.result,
            file
          }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  function removeImage(id) {
    setPastedImages((prev) => prev.filter((img) => img.id !== id))
  }

  async function waitForSessionIdle(sessionId, timeoutMs = 10000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        const res = await fetch(withBackendBase(`/api/sessions/${sessionId}/status`, true), {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status !== 'busy') return true
        }
      } catch {
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  async function stopChat() {
    const currentId = activeId
    const nextContent = input
    const nextImages = pastedImages.map((img) => img.dataUrl).filter(Boolean)
    const shouldStartNext = nextContent.trim() || nextImages.length > 0

    if (currentId && useNewBackend) {
      try {
        await fetch(withBackendBase(`/api/sessions/${currentId}/stop`, true), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
        await fetchWorkspace(currentId)
      } catch {
        // noop
      }
    }
    const sessionController = currentId ? sessionControllersRef.current.get(currentId) : null
    if (sessionController) {
      try { sessionController.abort() } catch {}
      sessionControllersRef.current.delete(currentId)
    }
    if (window._currentChatController === sessionController) {
      window._currentChatController = null
    }
    // 💡 Lưu phần bot đã stream trước khi xoá — không để mất khi stop
    if (streamingText.trim()) {
      setMessages((p) => [...p, { role: 'assistant', content: streamingText, id: 'partial-' + Date.now() }])
    }
    setStreamingText('')
    setSteps([])
    setFileChanges([])
    setLoading(false)
    setContinueMode(false)
    continueModeRef.current = false
    setPendingFollowUps([])

    if (shouldStartNext) {
      setInput('')
      setPastedImages([])
      if (currentId) await waitForSessionIdle(currentId)
      await send(nextContent, {
        sessionId: currentId,
        images: nextImages,
        bypassQueue: true,
      })
    }
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0]
    if (!file || uploading) return
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPastedImages((prev) => [...prev, {
          id: Date.now() + '-' + Math.random().toString(36).slice(2),
          dataUrl: ev.target.result,
          file
        }])
      }
      reader.readAsDataURL(file)
      event.target.value = ''
      return
    }
    let currentId = activeId
    if (!currentId) {
      const s = await createSession()
      currentId = s.id
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('provider', provider)
    setUploading(true)
    try {
      if (useNewBackend) {
        const res = await fetch(withBackendBase(`/api/sessions/${currentId}/process-file`, true), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.skipped) {
          // File không decode được → thử upload raw file
          // Tạo FormData mới để tránh consumed body issue
          const fd2 = new FormData()
          fd2.append('file', file)
          fd2.append('provider', provider)
          const uploadRes = await fetch(withBackendBase(`/api/sessions/${currentId}/upload`, true), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd2
          })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            const name = uploadData.name || file.name
            // Chèn message user + assistant báo đã upload file (giống pattern process-file)
            const userContent = `Đã tải file "${name}" lên phiên chat.`
            const msgRes = await fetch(withBackendBase(`/api/sessions/${currentId}/messages/raw`, true), {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: userContent,
                provider,
                assistant: `Đã nhận file "${name}". Bạn có thể yêu cầu HAgent mở file này hoặc phân tích nội dung.`
              })
            })
            if (!msgRes.ok) {
              const errText = await msgRes.text().catch(() => 'Unknown error')
              console.error('messages/raw thất bại:', msgRes.status, errText)
              throw new Error(`Không thêm được file vào phiên chat (server ${msgRes.status})`)
            }
            showToast(`Đã lưu file "${name}" vào phiên chat`, 'ok')
          } else {
            const errBody = await uploadRes.text().catch(() => '')
            throw new Error(data?.error || data?.detail || `Không upload được file "${file.name}"` + (errBody ? `: ${errBody}` : ''))
          }
        }
        await refreshSessionState(currentId)
        await fetchWorkspace(currentId)
        return
      }
      await fetch(withBackendBase(`/api/sessions/${currentId}/process-file`, true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      })
    } catch (err) {
      showToast(err.message || 'Upload thất bại')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleModelSelect = async (m) => {
    setProviderConfigs((prev) => prev[provider] ? { ...prev, [provider]: { ...prev[provider], model: m } } : prev)
    setShowComposerModelMenu(false)
    setEditingModel(false)
    if (!PEKPIK_PROVIDER_NAMES.includes(provider)) return
    modelFetchingRef.current = true
    await tryFetchKeyForModel(m)
    modelFetchingRef.current = false
  }

  const startEditingModel = () => {
    setModelDraft(activeModelLabel)
    setEditingModel(true)
    setShowComposerModelMenu(false)
  }

  const saveModelEdit = async () => {
    const trimmed = modelDraft.trim()
    if (!trimmed) {
      setEditingModel(false)
      return
    }
    saveModelSuggestion(provider, trimmed)
    await handleModelSelect(trimmed)
  }

  const cancelModelEdit = () => {
    setEditingModel(false)
    setModelDraft('')
  }

  const tryFetchKeyForModel = async (model) => {
    showToast(`🔄 Đang lấy key cho model ${model}...`, 'warning', 3000)
    try {
      const res = await fetch('/api/quick-commands/fetch-deepseek-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      const data = await res.json().catch(() => ({}))
      const content = data?.content || ''
      if (res.ok && content.startsWith('✅')) {
        showToast(`✅ Đã lấy key cho model ${model}`, 'ok', 3000)
        return
      }
      const currentIdx = PEKPIK_FALLBACK_MODELS.indexOf(model)
      const nextIdx = currentIdx + 1
      if (nextIdx < PEKPIK_FALLBACK_MODELS.length) {
        const nextModel = PEKPIK_FALLBACK_MODELS[nextIdx]
        setProviderConfigs((prev) => prev[provider] ? { ...prev, [provider]: { ...prev[provider], model: nextModel } } : prev)
        showToast(`⚠️ Không có key cho ${model} (${content.slice(0, 60)}), thử ${nextModel}...`, 'warning', 4000)
        await tryFetchKeyForModel(nextModel)
      } else {
        showToast(`❌ Không tìm thấy key cho model nào: ${content.slice(0, 80)}`, 'error', 5000)
      }
    } catch (err) {
      showToast(`❌ Lỗi khi lấy key: ${err.message}`, 'error', 4000)
    }
  }

  async function send(overrideContent = null, options = {}) {
    const msg = overrideContent ?? input
    const optionImages = Array.isArray(options.images) ? options.images : null
    const hasImages = optionImages ? optionImages.length > 0 : (overrideContent ? false : pastedImages.length > 0)
    if (!msg.trim() && !hasImages) return

    if (!overrideContent) { retryModelIndexRef.current = 0; retryProviderIndexRef.current = 0; setExhaustedAll(false) }

    if (msg.trim().startsWith('/') && !hasImages) {
      const rest = msg.trim().slice(1)
      const parts = rest.split(/\s+/)
      const cmd = parts[0]
      const cmdArgs = parts.slice(1).join(' ')
      if (cmd) {
        setInput('')
        setPastedImages([])
        await runQuickCommand(cmd, cmdArgs)
        return
      }
    }

    let fullContent = msg
    const imageDataUrls = optionImages || (hasImages ? pastedImages.map((img) => img.dataUrl).filter(Boolean) : [])
    if (hasImages) {
      const imageMarkdown = imageDataUrls.map((dataUrl) => `![screenshot](${dataUrl})`).join('\n')
      fullContent = imageMarkdown + (fullContent ? '\n\n' + fullContent : '')
    }

    if (loading && !overrideContent && !options.bypassQueue) {
      setPendingFollowUps((prev) => [...prev, {
        id: Date.now().toString() + '-' + Math.random().toString(16).slice(2),
        content: fullContent
      }])
      setInput('')
      setPastedImages([])
      setShowCommands(false)
      return
    }

    // 💡 Gắn user message ngay lập tức — trước mọi await — để không bị mất khi loading
    const userMsgId = Date.now().toString()
    const targetSessionId = options.sessionId || activeId
    if (!targetSessionId || targetSessionId === activeIdRef.current) {
      setMessages((p) => [...p, { role: 'user', content: fullContent, id: userMsgId }])
    }

    let currentId = targetSessionId
    if (!currentId) {
      setLoading(true)
      const s = await createSession()
      currentId = s.id
    }

    const isCurrentActive = () => currentId === activeIdRef.current
    if (isCurrentActive()) {
      setLoading(true)
      if (!continueModeRef.current) {
        setContinueMode(false)
      }
    }
    if (!overrideContent) {
      setInput('')
      setPastedImages([])
    }
    if (isCurrentActive()) {
      setStreamingText('')
      setSteps([])
      setFileChanges([])
      setCurrentClarification(null)
    }

    const controller = new AbortController()
    window._currentChatController = controller
    const prevController = sessionControllersRef.current.get(currentId)
    if (prevController && prevController !== controller) {
      try { prevController.abort() } catch {}
    }
    sessionControllersRef.current.set(currentId, controller)

    try {
      const r = await fetch(withBackendBase(`/api/sessions/${currentId}/messages`, true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          images: imageDataUrls,
          provider,
          model: providerConfigs[provider]?.model,
          contextLength: providerConfigs[provider]?.contextLength || undefined,
          force_professor: professorMode || undefined,
        }),
        signal: controller.signal
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        throw new Error(formatProviderError(body, `Error code ${r.status}`))
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let collected = ''
      let done = false

      while (!done) {
        const { done: d, value } = await reader.read()
        done = d
        if (value) buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            const isActive = currentId === activeIdRef.current
            switch (data.type) {
              case 'tool':
                if (String(data.name || '').startsWith('job_hunter_') || data.name === 'cv_generate_docx') {
                  jobHunterTouchedRef.current = true
                }
                if (isActive) {
                  const isTerminal = data.name === 'terminal' || data.name === 'bash' || data.name === 'exec'
                  const stepDetail = data.label || ''
                  const meta = toolMeta(data.name, data.label)
                  const stepLabel = [meta.title, meta.source].filter(Boolean).join(' · ')
                  if (data.status === 'start') {
                    const stepId = isTerminal
                      ? 'term-' + (++terminalCallCounterRef.current)
                      : data.name + '-' + (++toolCallCounterRef.current)
                    setSteps((p) => [...p, { id: stepId, toolName: data.name, label: stepLabel, icon: meta.icon, status: 'running', detail: stepDetail, input: data.input || null, output: data.output || null }])
                  } else if (data.status === 'done') {
                    // Tìm step running cuối cùng cùng tool name
                    setSteps((p) => {
                      let matchIdx = -1
                      for (let i = p.length - 1; i >= 0; i--) {
                        if ((p[i].toolName || p[i].id) === data.name && p[i].status === 'running') {
                          matchIdx = i
                          break
                        }
                      }
                      if (matchIdx === -1) {
                        // Không tìm thấy running step → thêm step done mới
                        const stepId = isTerminal
                          ? 'term-' + (++terminalCallCounterRef.current)
                          : data.name + '-' + (++toolCallCounterRef.current)
                        return [...p, { id: stepId, toolName: data.name, label: stepLabel, icon: meta.icon, status: 'done', count: data.count, detail: stepDetail, input: data.input || null, output: data.output || null }]
                      }
                      return p.map((s, i) => i === matchIdx ? { ...s, label: stepLabel, icon: meta.icon, status: 'done', count: data.count, detail: stepDetail, input: data.input || s.input || null, output: data.output || null } : s)
                    })
                    await fetchWorkspace(currentId)
                  }
                }
                break
              case 'workspace':
                if (isActive) {
                  setWorkspace({
                    tools: Array.isArray(data.tools) ? data.tools : [],
                    todos: Array.isArray(data.todos) ? data.todos : [],
                    summary: data.summary || null
                  })
                }
                break
              case 'file_change':
                if (isActive) {
                  setFileChanges((p) => [...p, {
                    path: data.path || '',
                    added: data.added || 0,
                    removed: data.removed || 0,
                    tool: data.tool || '',
                    patches: data.patches || []
                  }])
                }
                break
              case 'think':
                if (isActive) {
                  if (data.append) {
                    setJournal((p) => {
                      const last = p[p.length - 1]
                      if (last && last.type === 'think') {
                        return [...p.slice(0, -1), { ...last, content: (last.content || '') + data.content }]
                      }
                      return [...p, {
                        type: 'think',
                        content: data.content || '',
                        time: new Date().toLocaleTimeString('vi-VN', { hour12: false })
                      }]
                    })
                  } else {
                    setJournal((p) => [...p, {
                      type: 'think',
                      content: data.content || '',
                      name: data.name,
                      time: new Date().toLocaleTimeString('vi-VN', { hour12: false })
                    }])
                  }
                }
                break
              case 'content':
                collected += data.content || ''
                if (isActive) setStreamingText(collected)
                break
              case 'clarification':
                if (isActive) {
                  setCurrentClarification(data)
                  setSteps([])
                }
                break
              case 'done': {
                const currentJournal = [
                  ...steps.map(s => ({
                    type: 'tool',
                    name: s.toolName || s.id,
                    content: s.label,
                    status: s.status === 'running' ? 'start' : 'done',
                    count: s.count || 0,
                    input: s.input || null,
                    output: s.output || null
                  })),
                  ...fileChanges.map(fc => ({
                    type: 'file_change',
                    name: fc.path,
                    content: JSON.stringify({ added: fc.added, removed: fc.removed, tool: fc.tool, patches: fc.patches || [] })
                  }))
                ]
                if (isActive) {
                  setMessages((p) => [
                    ...p,
                    normalizeMessage({
                      role: 'assistant',
                      content: collected,
                      id: data.messageId || Date.now().toString(),
                      usage: data.usage,
                      journal: currentJournal
                    })
                  ])
                  setStreamingText('')
                  setSteps([])
                  setFileChanges([])
                  setLoading(false)
                }
                if (continueModeRef.current && isActive) {
                  setTimeout(() => send('Tiếp tục công việc đang làm', { bypassQueue: true }), 300)
                }
                if (jobHunterTouchedRef.current) {
                  jobHunterTouchedRef.current = false
                }
                await fetchSessions()
                await fetchWorkspace(currentId)
                if (document.hidden && Notification.permission === 'granted') {
                  new Notification('HAgent', { body: 'Bot đã trả lời xong' })
                }
                break
              }
                case 'error': {
                  const rawErrText = formatProviderError(data.error || data.message || '', 'Yêu cầu thất bại')
                  const isAuthError = !rawErrText ? false : /authentication|invalid.*api.?key|invalid_request_error|error code.*401|401|api.?key/i.test(rawErrText)
                  const isModelAccessError = !rawErrText ? false : /无权访问|error code.*403|403/i.test(rawErrText)
                  const canAutoFallback = PEKPIK_PROVIDER_NAMES.includes(provider)
                  if (!canAutoFallback) {
                    showToast(rawErrText, 'error', 12000)
                  }
                  // Save partial streamed content before handling error
                  if (collected.trim() && isActive) {
                    setMessages((p) => [
                      ...p,
                      normalizeMessage({
                        role: 'assistant',
                        content: collected,
                        id: data.messageId || 'partial-' + Date.now(),
                        journal: []
                      })
                    ])
                  }
                  if (canAutoFallback && (isAuthError || isModelAccessError) && !options.bypassQueue) {
                    const autoRefresh = localStorage.getItem('deepseek_auto_refresh_key') === 'true'
                    const doRetry = (fetchKey) => {
                      const modelIdx = retryModelIndexRef.current
                      const providerIdx = retryProviderIndexRef.current
                      if (providerIdx === 0 && modelIdx < PEKPIK_FALLBACK_MODELS.length) {
                        const nextModel = PEKPIK_FALLBACK_MODELS[modelIdx]
                        retryModelIndexRef.current = modelIdx + 1
                        setProviderConfigs((prev) => prev[provider] ? { ...prev, [provider]: { ...prev[provider], model: nextModel } } : prev)
                        showToast(`${fetchKey ? '✅ Đã lấy key mới, thử' : '⚠️ Model không có quyền truy cập, chuyển sang'} model ${nextModel}...`, fetchKey ? 'ok' : 'warning', 4000)
                        setPendingFollowUps((prev) => [...prev, { id: 'retry-' + Date.now(), content: msg, model: nextModel }])
                      } else if (providerIdx < FALLBACK_PROVIDERS.length) {
                        retryModelIndexRef.current = 0
                        retryProviderIndexRef.current = providerIdx + 1
                        const nextP = FALLBACK_PROVIDERS[providerIdx]
                        if (nextP !== provider) onProviderChange?.(nextP)
                        showToast(`${fetchKey ? '✅ Đã lấy key mới, chuyển' : '⚠️ Chuyển'} sang provider ${nextP}...`, fetchKey ? 'ok' : 'warning', 4000)
                        setPendingFollowUps((prev) => [...prev, { id: 'retry-' + Date.now(), content: msg }])
                      } else {
                        setExhaustedAll(true)
                        showToast('❌ Đã thử tất cả model/provider, vui lòng kiểm tra lại', 'error', 5000)
                      }
                    }
                    const tryFetchKey = async () => {
                      showToast('🔄 Đang tự động lấy key DeepSeek mới...', 'warning', 5000)
                      try {
                        const r = await fetch('/api/quick-commands/fetch-deepseek-key', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ model: providerConfigs[provider]?.model }),
                        })
                        const d = await r.json().catch(() => ({}))
                        const content = d?.content || ''
                        if (r.ok && !content.startsWith('❌')) {
                          doRetry(true)
                        } else {
                          showToast('❌ Tự động lấy key thất bại: ' + (content.slice(0, 80) || d.detail || d.error || ''), 'error', 4000)
                        }
                      } catch (fetchErr) {
                        showToast('❌ Lỗi khi tự động lấy key: ' + (fetchErr.message || ''), 'error', 4000)
                      }
                    }
                    if (isModelAccessError) {
                      if (retryModelIndexRef.current === 0) retryModelIndexRef.current += 1
                      if (autoRefresh) {
                        await tryFetchKey()
                      } else {
                        doRetry(false)
                      }
                    } else if (autoRefresh) {
                      await tryFetchKey()
                    } else {
                      showToast('Lỗi xác thực: ' + rawErrText, 'error', 2000)
                    }
                  } else if (isAuthError || isModelAccessError) {
                    setMessages((p) => [...p, normalizeMessage({
                      role: 'assistant',
                      content: 'Lỗi provider: ' + rawErrText,
                      id: data.messageId || 'err-' + Date.now(),
                      journal: []
                    })])
                    if (canAutoFallback) showToast(rawErrText, 'error', 10000)
                  } else {
                   const currentJournal = [
                     ...steps.map(s => ({
                       type: 'tool',
                       name: s.toolName || s.id,
                       content: s.label,
                       status: s.status === 'running' ? 'start' : 'done',
                       count: s.count || 0,
                       input: s.input || null,
                       output: s.output || null
                     })),
                     ...fileChanges.map(fc => ({
                       type: 'file_change',
                       name: fc.path,
                       content: JSON.stringify({ added: fc.added, removed: fc.removed, tool: fc.tool, patches: fc.patches || [] })
                     }))
                   ]
                   setMessages((p) => [
                     ...p,
                     normalizeMessage({
                       role: 'assistant',
                       content: 'Lỗi: ' + rawErrText,
                       id: data.messageId || 'err-' + Date.now(),
                       journal: currentJournal
                     })
                   ])
                   if (canAutoFallback) showToast(rawErrText, 'error', 8000)
                 }
                 if (isActive) {
                   setStreamingText('')
                   setSteps([])
                   setFileChanges([])
                   setLoading(false)
                 }
                 break
               }
              default:
                break
            }
          } catch {
            // noop
          }
        }
      }
    } catch (err) {
      const aborted = err?.name === 'AbortError' || controller.signal.aborted || /aborted/i.test(err?.message || '')
      const isActive = currentId === activeIdRef.current
      if (!aborted) {
        const isNetworkError = !err?.message || err?.name === 'TypeError' || /Failed to fetch|NetworkError|network error|Load failed/i.test(err?.message || '')
        if (isNetworkError && currentId) {
          if (isActive) showToast('Mất kết nối với backend. Đang thử kết nối lại...', 'warning', 15000)
          
          let reconnected = false
          for (let attempt = 1; attempt <= 20; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            if (currentId !== activeIdRef.current) return
            
            try {
              const busy = await refreshSessionState(currentId)
              await fetchWorkspace(currentId)
              if (busy && currentId === activeIdRef.current) {
                startSessionPolling(currentId)
              }
              if (isActive) {
                showToast('Khôi phục kết nối thành công!', 'ok', 3000)
              }
              reconnected = true
              break
            } catch (retryErr) {
              console.warn(`Thử kết nối lại thất bại (lần ${attempt}/20):`, retryErr)
            }
          }
          if (reconnected) return
        }
        // Save partial streamed content before handling error
        if (collected.trim() && isActive) {
          setMessages((p) => [...p, normalizeMessage({ role: 'assistant', content: collected, id: 'partial-' + Date.now(), journal: [] })])
        }
        const displayMessage = isNetworkError
          ? 'Mất kết nối đến server. Vui lòng kiểm tra backend có đang chạy không hoặc thử lại sau.'
          : formatProviderError(err.message)
        const outerIsAuthError = /authentication|invalid.*api.?key|invalid_request_error|error code.*401|401|api.?key/i.test(displayMessage)
        const outerIsModelAccessError = /无权访问|error code.*403|403/i.test(displayMessage)
        const canAutoFallback = PEKPIK_PROVIDER_NAMES.includes(provider)
        if (!canAutoFallback) {
          showToast(displayMessage, 'error', 12000)
        }
        if (canAutoFallback && (outerIsAuthError || outerIsModelAccessError) && !options.bypassQueue) {
          const autoRefresh = localStorage.getItem('deepseek_auto_refresh_key') === 'true'
          const doRetry = (fetchKey) => {
            const modelIdx = retryModelIndexRef.current
            const providerIdx = retryProviderIndexRef.current
            if (providerIdx === 0 && modelIdx < PEKPIK_FALLBACK_MODELS.length) {
              const nextModel = PEKPIK_FALLBACK_MODELS[modelIdx]
              retryModelIndexRef.current = modelIdx + 1
              setProviderConfigs((prev) => prev[provider] ? { ...prev, [provider]: { ...prev[provider], model: nextModel } } : prev)
              showToast(`${fetchKey ? '✅ Đã lấy key mới, thử' : '⚠️ Model không có quyền truy cập, chuyển sang'} model ${nextModel}...`, fetchKey ? 'ok' : 'warning', 4000)
              setPendingFollowUps((prev) => [...prev, { id: 'retry-' + Date.now(), content: msg, model: nextModel }])
            } else if (providerIdx < FALLBACK_PROVIDERS.length) {
              retryModelIndexRef.current = 0
              retryProviderIndexRef.current = providerIdx + 1
              const nextP = FALLBACK_PROVIDERS[providerIdx]
              if (nextP !== provider) onProviderChange?.(nextP)
              showToast(`${fetchKey ? '✅ Đã lấy key mới, chuyển' : '⚠️ Chuyển'} sang provider ${nextP}...`, fetchKey ? 'ok' : 'warning', 4000)
              setPendingFollowUps((prev) => [...prev, { id: 'retry-' + Date.now(), content: msg }])
            } else {
              setExhaustedAll(true)
              showToast('❌ Đã thử tất cả model/provider, vui lòng kiểm tra lại', 'error', 5000)
            }
          }
          const doFetchKey = async () => {
            showToast('🔄 Đang tự động lấy key DeepSeek mới...', 'warning', 5000)
            try {
              const r = await fetch('/api/quick-commands/fetch-deepseek-key', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: providerConfigs[provider]?.model }),
              })
              const d = await r.json().catch(() => ({}))
              const content = d?.content || ''
              if (r.ok && !content.startsWith('❌')) {
                doRetry(true)
              } else {
                showToast('❌ Tự động lấy key thất bại: ' + (content.slice(0, 80) || d.detail || d.error || ''), 'error', 4000)
              }
            } catch (fetchErr) {
              showToast('❌ Lỗi khi tự động lấy key: ' + (fetchErr.message || ''), 'error', 4000)
            }
          }
          if (outerIsModelAccessError) {
            if (retryModelIndexRef.current === 0) retryModelIndexRef.current += 1
            if (autoRefresh) {
              await doFetchKey()
            } else {
              doRetry(false)
            }
          } else if (autoRefresh) {
            await doFetchKey()
          } else {
            showToast('Lỗi xác thực: ' + displayMessage, 'error', 2000)
          }
        } else if (outerIsAuthError || outerIsModelAccessError) {
          setMessages((p) => [...p, { role: 'assistant', content: 'Lỗi provider: ' + displayMessage, id: 'err-' + Date.now() }])
          if (canAutoFallback) showToast(displayMessage, 'error', 10000)
        } else {
          setMessages((p) => [...p, { role: 'assistant', content: 'Lỗi: ' + displayMessage, id: 'err-' + Date.now() }])
          if (isActive && canAutoFallback) {
            showToast(isNetworkError ? 'Mất kết nối đến server backend' : displayMessage, 'error', 8000)
          }
        }
      }
      if (isActive) {
        setStreamingText('')
        setSteps([])
      }
    } finally {
      if (window._currentChatController === controller) {
        window._currentChatController = null
      }
      if (sessionControllersRef.current.get(currentId) === controller) {
        sessionControllersRef.current.delete(currentId)
      }
      // Đảm bảo loading luôn được reset khi stream kết thúc
      if (currentId === activeIdRef.current) setLoading(false)
    }
  }

  const filteredMessages = messages.filter(m => {
    if (m.role === 'assistant' && m.content) {
      const c = m.content
      if (/Lỗi provider:/i.test(c)) return true
      if (/❌?\s*lỗi/i.test(c) && /401|api.?key|authentication/i.test(c)) return false
    }
    return true
  })

  return (
    <div className="min-h-0 flex overflow-hidden bg-[#f7f7f4] relative" style={{ height: '100%' }}>
      {toast && (
        <div className={`fixed right-3 top-16 z-[100] rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur transition-all animate-fade-in ${
          toast.type === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : toast.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}
        onClick={() => setToast(null)}
        >
          {toast.message}
        </div>
      )}
      <div className={`fixed left-0 top-14 bottom-0 z-40 w-[76vw] max-w-64 sm:inset-y-0 sm:w-48 sm:max-w-none bg-[#fbfbf9]/95 border-r border-black/[0.06] backdrop-blur-xl transition-transform sm:relative sm:translate-x-0 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-2 sm:p-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <button onClick={() => { createSession(); setShowSidebar(false) }} className="flex items-center justify-center gap-2 w-full rounded-lg border border-black/[0.2] bg-white/90 px-3 py-2 text-[14px] font-normal text-gray-800 transition-all hover:bg-white hover:shadow-sm active:scale-[0.98]">
            <Pencil className="h-4 w-4 shrink-0" />
            <span>Chat mới</span>
          </button>
          <button onClick={() => setShowSidebar(false)} className="sm:hidden p-2 text-gray-400">×</button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Lịch sử</span>
          </div>
          {Array.isArray(sessions) && sessions
            .filter(s => filterSource === 'all' || (filterSource === 'telegram' ? s.title?.startsWith('[Te]') : !s.title?.startsWith('[Te]')))
            .map((s) => (
            <div key={s.id} className={`group mx-1 mb-0.5 flex items-center rounded-lg transition-all ${s.id === activeId ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/[0.04]' : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'}`}>
              <button onClick={() => { setActiveId(s.id); setShowSidebar(false) }} className="flex-1 text-left px-2 py-1.5 font-normal truncate" style={{ fontSize: '14px' }}>{s.title}</button>
              <button onClick={() => deleteSession(s.id)} className="px-2 text-gray-300 hover:text-red-500 transition-all opacity-60 group-hover:opacity-100" style={{ fontSize: '14px' }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {showSidebar && <div onClick={() => setShowSidebar(false)} className="fixed inset-x-0 top-14 bottom-0 bg-black/20 backdrop-blur-sm z-30 sm:hidden" />}

      <div className="flex-1 min-h-0 min-w-0 max-w-full bg-white/80 border-l border-black/[0.05] overflow-hidden relative">
        <header className="hagent-chat-header absolute inset-x-0 top-0 min-h-12 border-b border-black/[0.04] flex items-center gap-2 overflow-x-auto no-scrollbar px-2 py-1 sm:h-14 sm:overflow-visible sm:px-5 sm:py-0 bg-white/70 backdrop-blur-xl z-10">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="relative flex items-center">
              <button onClick={() => { setShowSidebar(true); setShowJournal(false); setShowWorkspace(false); setShowWiki(false) }} className="sm:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 relative">
                ≡
                <div
                  className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full shrink-0 transition-all duration-500 ${providerActive ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`}
                  title={providerActive ? 'Provider đang hoạt động' : 'Provider lỗi hoặc không phản hồi'}
                />
              </button>
            </div>
            <div
              className={`hidden sm:block h-2 w-2 rounded-full shrink-0 transition-all duration-500 ${providerActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}
              title={providerActive ? 'Provider đang hoạt động' : 'Provider lỗi hoặc không phản hồi'}
            />
            <h1 className="hagent-chat-header-title min-w-0 truncate text-[10px] font-semibold leading-5 text-gray-900 sm:text-xs">
              {activeSession?.title || 'Cuộc trò chuyện'}
            </h1>
          </div>

          <div className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-none sm:gap-2">
            <div className="min-w-0 shrink">
              {Array.isArray(agents) && agents.length > 0 ? (
                <select
                  value={selectedAgentId || agents[0]?.id || ''}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  disabled={loading}
                  className="hagent-chat-header-select flex h-7 w-full max-w-[132px] items-center truncate rounded-full border border-black/[0.06] bg-white/50 px-2.5 pr-7 text-[10px] font-medium leading-4 text-gray-600 outline-none transition-all hover:border-black/10 hover:bg-white disabled:opacity-50 sm:h-8 sm:max-w-[160px] sm:px-3 sm:pr-8 sm:text-xs xl:max-w-[190px]"
                  title="Chọn Agent"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              ) : (
                <span className="flex h-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 px-2.5 text-[9px] font-medium text-emerald-700">
                  HAgent
                </span>
              )}
            </div>
          </div>

          <div className="ml-0 flex shrink-0 items-center gap-1.5 sm:ml-3 sm:gap-2">
            <button onClick={toggleBrowserMode} className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] leading-none transition-all ${browserMode === 'headed' ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`} title={browserMode === 'headed' ? 'Đang hiện trình duyệt' : 'Trình duyệt ẩn'}>{browserMode === 'headed' ? '🌐' : '🕶️'}</button>
            <button onClick={() => { setShowWiki(!showWiki); setShowWorkspace(false); setShowJournal(false); setShowSidebar(false); setShowHeaderMenu(false) }} className={`flex h-7 min-w-9 items-center justify-center rounded-full border px-2 text-[10px] font-semibold leading-none transition-all ${showWiki ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}>Wiki</button>
            <button onClick={() => { setShowWorkspace(!showWorkspace); setShowJournal(false); setShowWiki(false); setShowSidebar(false); setShowHeaderMenu(false) }} className={`hidden sm:flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-all ${showWorkspace ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}>AI</button>
            <button onClick={() => { setShowJournal(!showJournal); setShowWorkspace(false); setShowWiki(false); setShowSidebar(false); setShowHeaderMenu(false) }} className={`hidden sm:flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-all ${showJournal ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}>J</button>
            <div className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(s => !s)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[14px] font-bold leading-none transition-all ${showHeaderMenu ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}
                aria-label="Mở menu thêm"
              >⋯</button>
              {showHeaderMenu && createPortal(
                <>
                  <div className="fixed inset-0 z-[150]" onClick={() => setShowHeaderMenu(false)} />
                  <div className="fixed right-3 top-14 z-[160] w-48 overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => { setShowWorkspace(!showWorkspace); setShowJournal(false); setShowWiki(false); setShowSidebar(false); setShowHeaderMenu(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${showWorkspace ? 'bg-gray-100 font-semibold' : ''}`}
                    >
                      <span className="text-base">🤖</span> AI workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowJournal(!showJournal); setShowWorkspace(false); setShowWiki(false); setShowSidebar(false); setShowHeaderMenu(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${showJournal ? 'bg-gray-100 font-semibold' : ''}`}
                    >
                      <span className="text-base">📓</span> Journal
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </header>

        <div className={`absolute inset-x-0 top-14 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 py-4 sm:top-16 md:p-8 ${composerBottomOffset}`}>
          <div className="w-full max-w-5xl mx-auto space-y-3 sm:space-y-5 overflow-x-hidden">
            {currentClarification && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 animate-fade-in">
                <div className="font-semibold">Cần bạn bổ sung thông tin</div>
                <div className="mt-1">{currentClarification.question || 'Agent cần thêm thông tin để tiếp tục.'}</div>
              </div>
            )}

            {filteredMessages.map((m) => (
              <div key={m.id} className={`flex w-full min-w-0 flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className={`flex min-w-0 items-start gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''} max-w-[92vw] sm:max-w-full ${m.role === 'user' ? 'sm:max-w-[80%]' : 'sm:max-w-[96%]'}`}>
                  <div className={`min-w-0 max-w-full rounded-[1.5rem] sm:rounded-[1.8rem] px-3 sm:px-4 py-2 sm:py-3 text-[14.5px] leading-relaxed break-words overflow-hidden shadow-sm ${m.role === 'user' ? 'bg-gray-900 text-white rounded-br-md' : 'bg-white text-gray-800 border border-black/[0.06] rounded-bl-md'}`}>
                    {editingId === m.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full min-h-[80px] resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={handleCancelEdit} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-all">Huỷ</button>
                          <button type="button" onClick={() => handleSaveEdit(m.id)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium bg-gray-900 text-white hover:bg-gray-800 transition-all">Lưu</button>
                        </div>
                      </div>
                    ) : m.role === 'assistant' && !m.content.trim() ? (
                      m.journal && m.journal.length > 0 ? (
                        <div className="text-xs text-gray-400 py-1">✅ Hoàn thành — chỉ chạy tools</div>
                      ) : (
                      <div className="flex items-center justify-center py-2 px-1">
                        <div className="dot-flashing" />
                      </div>
                      )
                    ) : (
                      <MarkdownContent content={m.content} role={m.role} />
                    )}
                  </div>
                </div>
                <div className={`flex max-w-full flex-wrap items-center gap-1.5 mt-1 px-2 ${m.role === 'user' ? 'justify-end sm:max-w-[80%]' : 'justify-start sm:max-w-[96%]'}`}>
                  {m.role === 'user' && (
                    <button type="button" onClick={() => resendMessage(m.id, m.content)} className="flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 cursor-pointer touch-manipulation" title="Hỏi lại">
                      <RefreshCcw size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => handleStartEdit(m.id, m.content)} className="flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 cursor-pointer touch-manipulation" title="Sửa tin nhắn">
                    <Pencil size={14} />
                  </button>
                  {m.usage && m.role === 'assistant' && <span className="text-[12px] leading-4 text-gray-400 font-normal mr-2">Token: {fmtToken(m.usage.total_tokens)}</span>}
                  <button type="button" onClick={() => handleCopy(m.content, m.id)} className="flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 cursor-pointer touch-manipulation">{copiedId === m.id ? '✓' : '⧉'}</button>
                  <button type="button" onClick={() => handleSpeak(m.content, m.id)}
                    className={`flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md transition-all cursor-pointer touch-manipulation ${
                      speakingId === m.id ? 'text-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                    title={speakingId === m.id ? 'Đang phát...' : 'Đọc to'}>
                    {speakingId === m.id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <line x1="23" y1="9" x2="17" y2="15"/>
                        <line x1="17" y1="9" x2="23" y2="15"/>
                      </svg>
                    )}
                  </button>
                  <button type="button" onClick={() => deleteMessage(m.id)} className="flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 cursor-pointer touch-manipulation">×</button>
                </div>
                {m.role === 'assistant' && m.journal && m.journal.length > 0 && (() => {
                  const { steps: sj, fileChanges: fcj } = parseJournal(m.journal);
                  return renderTimeline(sj, fcj, false);
                })()}
              </div>
            ))}

            {loading && steps.length > 0 && renderTimeline(steps, fileChanges, true)}

            {loading && !streamingText && (
              <div className="flex w-full min-w-0 justify-start animate-fade-in">
                <div className="min-w-0 max-w-[75vw] sm:max-w-[85%] bg-white border border-black/[0.06] rounded-[1.8rem] rounded-bl-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-sm flex items-center gap-3">
                  <div className="dot-flashing" />
                  <span className="text-[13px] text-gray-400 font-medium">Đang suy nghĩ…</span>
                </div>
              </div>
            )}

            {loading && streamingText && (
              <div className="flex w-full min-w-0 justify-start animate-fade-in">
                <div className="min-w-0 max-w-[75vw] sm:max-w-[85%] bg-white border border-black/[0.06] rounded-[1.8rem] rounded-bl-sm px-4 sm:px-5 py-3 sm:py-3.5 text-[14.5px] leading-relaxed shadow-sm overflow-hidden break-words">
                  <MarkdownContent content={streamingText} role="assistant" />
                  <span className="inline-block w-1.5 h-4 bg-gray-300 animate-pulse ml-1 align-middle" />
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 bg-white/80 p-2 pb-safe backdrop-blur-xl sm:p-2.5 md:p-3">
          <div className="w-full max-w-5xl mx-auto">
            <div className="relative overflow-visible rounded-2xl border border-gray-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileImport} accept=".txt,.md,.pdf,.doc,.docx,.xlsx,.csv,.json,.png,.jpg,.jpeg,.gif,.webp" />
              {showCommands && (
                <div className="absolute left-0 right-0 bottom-full mb-3 overflow-hidden rounded-3xl border border-gray-200/70 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl z-20">
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100/80">
                    <div className="relative flex-1">
                      <input
                        value={cmdFilter}
                        onChange={(e) => setCmdFilter(e.target.value)}
                        placeholder="Tìm lệnh..."
                        className="w-full h-9 rounded-xl bg-gray-100 px-3 pl-9 text-[13px] outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                        autoFocus
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px]">🔍</span>
                    </div>
                    <button onClick={() => { setShowCommands(false); setCmdFilter('') }} className="h-7 w-7 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">×</button>
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
                    {commands
                      .filter(([command, description]) =>
                        !cmdFilter.trim() ||
                        command.toLowerCase().includes(cmdFilter.trim().toLowerCase()) ||
                        description.toLowerCase().includes(cmdFilter.trim().toLowerCase())
                      )
                      .map(([command, description]) => (
                        <button key={command} onClick={() => { runQuickCommand(command); setCmdFilter('') }} className="group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all hover:bg-gray-100/80">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-500 group-hover:bg-white group-hover:text-gray-900 transition-all">/</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] leading-5 font-medium text-gray-900">/{command}</span>
                            <span className="block truncate text-[12px] leading-4 font-normal text-gray-400 mt-0.5">{description}</span>
                          </span>
                        </button>
                      ))}
                    {commands.filter(([command, description]) =>
                      !cmdFilter.trim() ||
                      command.toLowerCase().includes(cmdFilter.trim().toLowerCase()) ||
                      description.toLowerCase().includes(cmdFilter.trim().toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-8 text-center text-[13px] text-gray-400">Không tìm thấy lệnh nào</div>
                    )}
                  </div>
                </div>
              )}
              {composerHasTodos && (
                <div className="border-b border-gray-200/80 px-3 py-1.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setTodoPanelOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg text-left text-gray-900"
                    title={todoPanelOpen ? 'Ẩn todo list' : 'Hiện todo list'}
                  >
                    <span className="text-[13px] font-normal leading-5 text-gray-700 sm:text-[14px]">
                      {completedTodoCount} of {composerTodos.length} todos completed
                      {hiddenTodoCount > 0 && !todoShowCompleted ? ` (${hiddenTodoCount} hidden)` : ''}
                    </span>
                    <ChevronDown size={15} className={`shrink-0 text-gray-500 transition-transform ${todoPanelOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {todoPanelOpen && (
                    <div className="mt-1.5 max-h-16 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                      {visibleTodos.map((todo) => {
                      const status = todo?.status || 'pending'
                      const done = status === 'completed'
                      const running = status === 'in_progress'

  return (
                        <div key={todo.id} className="flex min-w-0 items-center gap-2 text-[12.5px] leading-4 text-gray-700 sm:text-[13px]">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${done ? 'border-gray-300 bg-gray-100 text-gray-500' : running ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-gray-300 bg-white text-transparent'}`}>
                            {done ? <Check size={11} strokeWidth={2.4} /> : running ? <span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> : null}
                          </span>
                          <span className={`min-w-0 truncate ${done ? 'text-gray-400 line-through decoration-gray-300' : ''}`}>
                            {todo.content}
                          </span>
                        </div>
                      )
                    })}
                    {hiddenTodoCount > 0 && !todoShowCompleted && (
                      <button
                        type="button"
                        onClick={() => setTodoShowCompleted(true)}
                        className="w-full text-left text-[12px] font-semibold text-gray-500 py-0.5 hover:text-gray-700 transition-colors"
                      >
                        Show {hiddenTodoCount} completed
                      </button>
                    )}
                    </div>
                  )}
                </div>
              )}
              {pastedImages?.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-2 pb-1 border-t border-black/[0.04]">
                  {pastedImages.map((img) => (
                    <div key={img.id} className="relative group">
                      <img src={img.dataUrl} alt="paste" className="h-14 w-auto max-w-[72px] rounded-lg object-cover border border-gray-200" />
                      <button type="button" onClick={() => removeImage(img.id)} className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900/70 text-white text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              )}
              {(speechToText.recording || speechToText.transcribing || sttStatus) && (
                <div className="px-3 pt-1 pb-0.5 border-t border-black/[0.04]">
                  <div className={`flex items-center gap-2 text-[13px] ${sttStatus ? 'text-red-500' : 'text-gray-500'} italic`}>
                    <span className={`inline-block h-2 w-2 rounded-full ${sttStatus ? 'bg-red-400' : 'bg-red-400 animate-pulse'}`} />
                    {sttStatus || (speechToText.transcribing ? 'Đang gửi audio tới STT server...' : 'Đang ghi âm... bấm mic lần nữa để dừng')}
                  </div>
                </div>
              )}
              {pendingFollowUps.length > 0 && (
                <div className="px-3 pt-2 pb-1 border-t border-black/[0.04]">
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold">Đang chờ gửi tiếp:</span>
                    </div>
                    {pendingFollowUps.map((item) => (
                      <div key={item.id} className="flex items-center gap-1.5 py-0.5 group">
                        <span className="min-w-0 flex-1 truncate">{compactText(item.content, 72)}</span>
                        <button
                          type="button"
                          onClick={() => deletePendingFollowUp(item.id)}
                          className="shrink-0 h-4 w-4 rounded-full text-amber-400 hover:text-red-500 hover:bg-amber-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[10px] leading-none"
                          title="Xoá tin nhắn chờ này"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="min-h-[56px] px-3 py-2 sm:px-4" onDragOver={handleDragOver} onDrop={handleDrop}>
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    if (e.target.value.startsWith('/')) {
                      setCmdFilter(e.target.value.replace(/^\//, ''))
                      setShowCommands(true)
                    }
                  }}
                  onFocus={() => { if (input.startsWith('/')) { setCmdFilter(input.replace(/^\//, '')); setShowCommands(true) } }}
                  onCompositionStart={() => setInputComposing(true)}
                  onCompositionEnd={() => setInputComposing(false)}
                  onKeyDown={(e) => { if (e.nativeEvent.isComposing || inputComposing) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  onPaste={handlePaste}
                  placeholder="Ask anything..."
                  rows={1}
                  className="block min-h-7 max-h-20 w-full resize-none border-none bg-transparent p-0 pr-9 text-[14px] leading-5 font-normal text-gray-800 outline-none placeholder:text-gray-400 sm:text-[15px]"
                />
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setShowCommands((v) => !v)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px] font-semibold leading-none transition-all ${showCommands ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`} title="Mở lệnh nhanh">
                      /
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40" title="Đính kèm file">
                      <Plus size={19} strokeWidth={1.8} />
                    </button>
                    {!loading && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSttStatus('')
                            speechToText.toggle()
                          }}
                          disabled={speechToText.transcribing || handsFreeVoice.enabled}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all disabled:opacity-50 ${speechToText.recording ? 'bg-red-500 text-white shadow-red-200 animate-pulse' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                          title={speechToText.recording ? 'Dừng ghi âm và gửi STT' : 'Ghi âm bằng STT server'}
                        >
                          <Mic size={15} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSttStatus('')
                            ensureAudioUnlocked()
                            handsFreeVoice.toggle()
                          }}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all ${handsFreeVoice.enabled ? (handsFreeVoice.listening ? 'bg-emerald-500 text-white animate-pulse' : 'bg-emerald-500 text-white') : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                          title={handsFreeVoice.enabled ? 'Tắt chế độ hands-free' : 'Bật chế độ hands-free (auto STT + TTS)'}
                        >
                          <Headphones size={15} strokeWidth={2} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProfessorMode(v => !v)}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                        professorMode
                          ? 'bg-indigo-100 text-indigo-700 shadow-sm hover:bg-indigo-200'
                          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                      title={professorMode ? 'Tắt chế độ Hỏi giáo sư' : 'Bật chế độ Hỏi giáo sư (gpt-5-5, không tool)'}
                    >
                      <GraduationCap
                        size={16}
                        strokeWidth={2.2}
                        className={professorMode ? 'text-indigo-700' : 'text-gray-400'}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContinueMode((v) => { const next = !v; continueModeRef.current = next; return next })
                      }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                        continueMode
                          ? 'bg-amber-100 text-amber-700 shadow-sm hover:bg-amber-200'
                          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                      title={continueMode ? 'Tắt tự động tiếp tục công việc' : 'Bật tự động tiếp tục công việc đang làm sau mỗi câu trả lời'}
                    >
                      <RefreshCcw
                        size={16}
                        strokeWidth={2.2}
                        className={`transition-transform ${
                          continueMode ? 'text-amber-700' : 'text-gray-400'
                        }`}
                      />
                    </button>
                    {loading && (
                      <button onClick={() => send()} disabled={!input.trim() && pastedImages.length === 0} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 disabled:text-gray-300" title="Xếp câu hỏi để gửi sau câu trả lời hiện tại">
                        <Send size={15} strokeWidth={2.1} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={loading ? stopChat : () => send()}
                      disabled={!loading && !input.trim() && pastedImages.length === 0}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all ${loading ? 'bg-[#f5efe8] text-gray-950 hover:bg-[#ede4d8]' : 'bg-[#f5efe8] text-gray-950 hover:bg-[#ede4d8] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none'}`}
                      title={loading ? 'Dừng câu trả lời hiện tại' : 'Gửi tin nhắn'}
                    >
                      {loading ? <Square size={13} fill="currentColor" strokeWidth={0} /> : <Send size={15} strokeWidth={2.2} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 border-t border-gray-200/80 px-2.5 py-1 text-[12.5px] font-medium text-gray-500 sm:flex-nowrap sm:px-3">
                <button type="button" className="flex h-7 items-center gap-1.5 rounded-md px-2 transition-all hover:bg-gray-100 hover:text-gray-900" title="Chế độ chat">
                  Build <ChevronDown size={13} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowComposerProviderMenu((open) => !open)}
                    disabled={loading}
                    className="flex h-7 max-w-[230px] items-center gap-1.5 rounded-md px-2 text-left text-[12.5px] font-medium text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                    title="Chọn provider chat"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${providerActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="min-w-0 truncate">{activeProviderLabel}</span>
                    <ChevronDown size={13} className={`shrink-0 text-gray-400 transition-transform ${showComposerProviderMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showComposerProviderMenu && (
                    <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] custom-scrollbar">
                      {providerOptions.map(({ name, label }) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            onProviderChange?.(name)
                            setShowComposerProviderMenu(false)
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${name === provider ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'}`}
                        >
                          <span className="min-w-0 truncate">{label || name}</span>
                          {name === provider && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {activeModelLabel && (
                  <div className="relative">
                    {editingModel ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={modelDraft}
                          onChange={(e) => setModelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveModelEdit()
                            if (e.key === 'Escape') cancelModelEdit()
                          }}
                          onBlur={saveModelEdit}
                          autoFocus
                          className="h-7 w-40 rounded-md border border-gray-300 bg-white px-2 text-[12px] font-mono text-gray-900 outline-none focus:border-gray-400"
                          placeholder="Nhập model"
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowComposerModelMenu((open) => !open)}
                          onDoubleClick={startEditingModel}
                          disabled={loading}
                          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-mono text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                          title="Click: chọn model | Double-click: sửa model"
                        >
                          {activeModelLabel}
                          <ChevronDown size={11} className={`shrink-0 text-gray-400 transition-transform ${showComposerModelMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showComposerModelMenu && (
                          <div className="absolute bottom-full left-0 z-30 mb-2 max-h-72 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] custom-scrollbar">
                            <button
                              type="button"
                              onClick={startEditingModel}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-100 hover:text-gray-950 mb-1 border-b border-gray-100"
                            >
                              <span className="text-gray-400">✏️</span>
                              <span className="font-medium">Nhập model tùy chỉnh...</span>
                            </button>
                            {(() => {
                              const suggestions = getModelSuggestions()
                              const providerModels = normalizeModelList(suggestions[provider] || [])
                              const fallbackModels = PEKPIK_PROVIDER_NAMES.includes(provider)
                                ? (providerModels.length > 0 ? providerModels : PEKPIK_FALLBACK_MODELS)
                                : (provider === 'chatgpt2api'
                                  ? (providerModels.length > 0 ? providerModels : ['gpt-5-mini', 'gpt-5-3-mini', 'auto'])
                                  : (providerModels.length > 0 ? providerModels : [activeModelLabel]))
                              return normalizeModelList(fallbackModels).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => handleModelSelect(m)}
                                  disabled={modelFetchingRef.current}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${m === activeModelLabel ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'} ${modelFetchingRef.current ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  <span className="min-w-0 truncate font-mono">{m}</span>
                                  {m === activeModelLabel && <Check size={15} />}
                                </button>
                              ))
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <button type="button" className="flex h-7 items-center gap-1.5 rounded-md px-2 transition-all hover:bg-gray-100 hover:text-gray-900" title="Context length">
                  {activeContextLabel} <ChevronDown size={13} />
                </button>
                {exhaustedAll && (
                  <span className="flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 whitespace-nowrap">
                    Đã thử tất cả
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWiki && <button onClick={() => setShowWiki(false)} className="fixed inset-x-0 top-28 bottom-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" aria-label="Đóng wiki" />}
      {showWiki && (
        <div className="fixed right-0 top-28 bottom-0 z-50 w-[92vw] max-w-xl border-l border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-col shadow-2xl animate-in slide-in-from-right-4 lg:top-0 lg:w-[48vw] lg:min-w-[640px] lg:max-w-[860px]">
          <div className="min-h-0 flex-1">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500">Đang tải...</div>}>
              <Wiki token={token} provider={provider} embedded onClose={() => setShowWiki(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {showWorkspace && <button onClick={() => setShowWorkspace(false)} className="fixed inset-x-0 top-28 bottom-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" aria-label="Đóng workspace" />}
      {showWorkspace && (
        <div className="fixed right-0 top-28 bottom-0 z-50 w-[86vw] max-w-sm border-l border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-col p-6 shadow-2xl animate-in slide-in-from-right-4 sm:p-8 lg:top-0 lg:w-[420px] lg:max-w-none">
          <div className="mb-6 flex items-center justify-between border-b border-black/[0.05] pb-4">
            <div>
              <h2 className="text-[14px] leading-5 font-semibold text-gray-900">Không gian Agent</h2>
              <p className="mt-1 text-[12px] leading-4 text-gray-500">
                {workspace.summary ? `${workspaceToolCount} công cụ · ${workspaceTodoCount} việc cần làm` : 'Đang tải...'}
              </p>
            </div>
            <button onClick={() => setShowWorkspace(false)} className="h-9 w-9 rounded-2xl bg-white/80 text-gray-400 shadow-sm transition-all hover:bg-white hover:text-gray-900">×</button>
          </div>

          <div className="space-y-6 overflow-y-auto custom-scrollbar">
            <section>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Kế hoạch / Việc cần làm</div>
              <div className="space-y-2">
                {workspace.todos.length === 0 && <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-3 text-[13px] text-gray-500">Phiên này chưa có việc cần làm.</div>}
                {workspace.todos.map((todo) => (
                  <div key={todo.id} className="rounded-2xl border border-black/[0.05] bg-white/80 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-gray-900">{todo.content}</div>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{todo.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Danh mục công cụ</div>
              <div className="space-y-2">
                {workspace.tools.slice(0, 16).map((tool) => (
                  <div key={tool.name} className="rounded-2xl border border-black/[0.05] bg-white/80 px-4 py-3 shadow-sm">
                    <div className="text-[13px] font-semibold text-gray-900">{tool.name}</div>
                    <div className="mt-1 text-[12px] leading-5 text-gray-500">{tool.desc || tool.description || 'Chưa có mô tả'}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {showJournal && <button onClick={() => setShowJournal(false)} className="fixed inset-x-0 top-28 bottom-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" aria-label="Đóng nhật ký" />}
      {showJournal && (
        <div className="fixed right-0 top-28 bottom-0 z-50 w-[86vw] max-w-sm border-l border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-col p-6 shadow-2xl animate-in slide-in-from-right-4 sm:p-8 lg:top-0 lg:w-[420px] lg:max-w-none">
          <div className="mb-6 flex items-center justify-between border-b border-black/[0.05] pb-4">
            <h2 className="text-[14px] leading-5 font-semibold text-gray-900">Nhật ký xử lý</h2>
            <button onClick={() => setShowJournal(false)} className="h-9 w-9 rounded-2xl bg-white/80 text-gray-400 shadow-sm transition-all hover:bg-white hover:text-gray-900">×</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-7 custom-scrollbar">
            {journal.map((j, i) => (
              <div key={i} className="relative pl-6 border-l-2 border-black/[0.04] py-1 animate-fade-in">
                <div className="absolute -left-[6px] top-3 w-2.5 h-2.5 rounded-full bg-white border-2 border-black/10 shadow-sm" />
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">{j.time}</div>
                <div className="prose prose-sm prose-gray max-w-none">
                  <MarkdownContent content={j.content} role="assistant" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingMedia.length > 0 && createPortal(
        <div className="fixed top-16 right-3 z-[200] flex w-[calc(100vw-24px)] max-w-sm flex-col gap-2 sm:right-4 sm:top-20">
          {pendingMedia.map(item => (
            <div key={item.id} className="animate-fade-in flex items-start gap-3 rounded-xl border border-black/[0.08] bg-white/95 p-3 shadow-lg backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-lg">🔗</div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Trình duyệt chặn popup — bấm Mở</div>
                <div className="truncate text-sm font-medium text-gray-900" title={item.title}>{item.title}</div>
                <div className="truncate text-[11px] text-gray-500" title={item.url}>{item.url}</div>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => openMedia(item)} className="rounded-full bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-black">Mở tab mới</button>
                  <button onClick={() => dismissMedia(item.id)} className="rounded-full px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100">Bỏ qua</button>
                </div>
              </div>
              <button onClick={() => dismissMedia(item.id)} aria-label="Đóng" className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

function cleanMessage(msg) {
  if (!msg) return ''
  return msg
    .replace(/<\|\?tool_call\|\?>[\s\S]*?(?=<\|\?tool_call\|\?>|$)/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/A tool result section for [\s\S]*? was provided, showing the [\s\S]*? details\./g, '')
    .replace(/(?:cite|url|entity).*?/g, '')
    .trim()
}

function MarkdownContent({ content, role }) {
  const displayContent = cleanMessage(content)

  return (
    <div className={`prose prose-sm max-w-none min-w-0 break-words ${role === 'user' ? 'prose-invert text-white' : 'prose-gray text-gray-800'} prose-p:leading-relaxed prose-headings:font-semibold prose-headings:normal-case prose-strong:font-semibold prose-a:break-all prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:break-words`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          img: ({ node, ...props }) => (
            <img {...props} className="max-w-full max-h-60 rounded-xl my-2 object-contain" />
          )
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  )
}