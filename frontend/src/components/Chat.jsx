import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function Chat({ token, provider, cxModel, agents, user }) {
  const defaultProviderLabels = {
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
  const [providerLabels, setProviderLabels] = useState(defaultProviderLabels)

  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [steps, setSteps] = useState([])
  const [currentClarification, setCurrentClarification] = useState(null)
  const [journal, setJournal] = useState([])
  const [showJournal, setShowJournal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [speakingId, setSpeakingId] = useState(null)
  const [pastedImages, setPastedImages] = useState([])
  const [workspace, setWorkspace] = useState({ tools: [], todos: [], summary: null })
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [providerActive, setProviderActive] = useState(true)
  const [filterSource, setFilterSource] = useState('all')

  const fileInputRef = useRef(null)
  const useNewBackend = true
  const newBackendBase = ''

  const withBackendBase = (path, preferNew = false) => {
    if (preferNew && useNewBackend) return `${newBackendBase}${path}`
    return path
  }
  const msgEndRef = useRef(null)
  const pollIntervalRef = useRef(null)

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
    usage: message?.usage || null
  })

  const commands = [
    ['start', 'Hướng dẫn sử dụng'],
    ['new', 'Chat mới'],
    ['status', 'Trạng thái hệ thống'],
    ['terminal', 'Mở Claude Terminal'],
    ['tinmoi', 'Tin tức mới'],
    ['thoitiet', 'Thời tiết'],
    ['giavang', 'Giá vàng'],
    ['tygia', 'Tỷ giá'],
    ['vieclam', 'Tìm việc làm'],
  ]
  const workspaceToolCount = Number.isFinite(workspace.summary?.toolCount)
    ? workspace.summary.toolCount
    : workspace.tools.length
  const workspaceTodoCount = Number.isFinite(workspace.summary?.todoCount)
    ? workspace.summary.todoCount
    : workspace.todos.length
  const activeSession = (Array.isArray(sessions) ? sessions : []).find((s) => s.id === activeId)
  const activeAgent = (Array.isArray(agents) ? agents : []).find((a) => a.id === (activeSession?.agentId || selectedAgentId))

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
      setWorkspace({
        tools: Array.isArray(data.tools) ? data.tools : [],
        todos: Array.isArray(data.todos) ? data.todos : [],
        summary: data.summary || null
      })
    } catch {
      setWorkspace({ tools: [], todos: [], summary: null })
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((list) => {
        if (cancelled) return;
        if (list.length > 0) setActiveId(list[0].id)
        else createSession()
      })
      .catch(() => {
        if (!cancelled) createSession();
      })
    return () => { cancelled = true; };
  }, [])

  useEffect(() => {
    if (activeId) {
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
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  const [providerConfigs, setProviderConfigs] = useState({})

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
          setProviderConfigs(configMap)
        }
      })
      .catch(() => {})
  }, [token])

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
    const int = setInterval(checkProviderStatus, 15000)
    return () => clearInterval(int)
  }, [provider])

  useEffect(() => {
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages, streamingText, steps])

  async function refreshSessionState(id) {
    if (useNewBackend) {
      const [messagesRes, statusRes, journalRes] = await Promise.all([
        fetch(withBackendBase(`/api/sessions/${id}/messages`, true), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(withBackendBase(`/api/sessions/${id}/status`, true), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(withBackendBase(`/api/sessions/${id}/journal`, true), { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (messagesRes.ok) {
        const msgs = await messagesRes.json()
        setMessages(Array.isArray(msgs) ? msgs.map(normalizeMessage) : [])
      }
      if (statusRes.ok) {
        const status = await statusRes.json()
        setJournal([])
        return status.status === 'busy'
      }
      if (journalRes.ok) {
        const j = await journalRes.json()
        setJournal(Array.isArray(j) ? j : [])
      }
      return false
    }

    const [messagesRes, journalRes, statusRes] = await Promise.all([
      fetch(`/api/sessions/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/sessions/${id}/journal`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/sessions/${id}/status`, { headers: { Authorization: `Bearer ${token}` } })
    ])

    if (messagesRes.ok) {
      const msgs = await messagesRes.json()
      setMessages(Array.isArray(msgs) ? msgs.map(normalizeMessage) : [])
    }
    if (journalRes.ok) {
      const j = await journalRes.json()
      setJournal(Array.isArray(j) ? j : [])
    }
    if (statusRes.ok) {
      const status = await statusRes.json()
      return status.status === 'busy'
    }
    return false
  }

  function startSessionPolling(id) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      try {
        const busy = await refreshSessionState(id)
        setLoading(busy)
        await fetchWorkspace(id)
        if (!busy) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setStreamingText('')
          setSteps([])
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
      setLoading(false)
      setStreamingText('')
      setSteps([])
      setCurrentClarification(null)
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

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const speakAudioRef = useRef(null)

  const handleSpeak = async (content, id) => {
    // Toggle: if already speaking this message, stop
    if (speakingId === id) {
      if (speakAudioRef.current) speakAudioRef.current.pause()
      speakAudioRef.current = null
      setSpeakingId(null)
      return
    }
    // Stop any previous audio
    if (speakAudioRef.current) speakAudioRef.current.pause()
    speakAudioRef.current = null

    const text = content
      .replace(/<[^>]*>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_~`#]/g, '')
      .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return

    setSpeakingId(id)

    try {
      const res = await fetch('http://127.0.0.1:5002/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'vi-VN-HoaiMyNeural', rate: '+0%' }),
      })
      if (!res.ok) throw new Error('TTS failed: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      speakAudioRef.current = audio
      audio.onended = () => { setSpeakingId(null); speakAudioRef.current = null; URL.revokeObjectURL(url) }
      audio.onerror = () => { setSpeakingId(null); speakAudioRef.current = null; URL.revokeObjectURL(url) }
      audio.play().catch(() => { setSpeakingId(null); speakAudioRef.current = null })
    } catch (e) {
      setSpeakingId(null)
      speakAudioRef.current = null
      console.error('TTS error:', e)
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

  async function stopChat() {
    if (activeId && useNewBackend) {
      try {
        await fetch(withBackendBase(`/api/sessions/${activeId}/stop`, true), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
        await fetchWorkspace(activeId)
      } catch {
        // noop
      }
    }
    if (window._currentChatController) {
      window._currentChatController.abort()
      window._currentChatController = null
    }
    setStreamingText('')
    setSteps([])
    setLoading(false)
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
        const textLike = /\.(txt|md|markdown|csv|json|yaml|yml|log|py|js|jsx|ts|tsx|css|html|xml)$/i.test(file.name)
        if (!textLike) {
          setMessages((p) => [...p, normalizeMessage({
            role: 'assistant',
            content: `Backend HAgent mới hiện chỉ nhận file dạng text trực tiếp từ frontend. File "${file.name}" chưa được gửi.`
          })])
          return
        }
        const content = await file.text()
        const clipped = content.length > 45000 ? `${content.slice(0, 45000)}\n\n[Đã cắt bớt vì file quá dài]` : content
        setInput(`Đọc file ${file.name} và xử lý theo nội dung sau:\n\n${clipped}`)
        return
      }
      await fetch(withBackendBase(`/api/sessions/${currentId}/process-file`, true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      })
    } catch {
      // noop
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function send() {
    const msg = input
    const hasImages = pastedImages.length > 0
    if (!msg.trim() && !hasImages) return
    let currentId = activeId
    if (!currentId) {
      setLoading(true)
      const s = await createSession()
      currentId = s.id
    }

    let fullContent = msg
    if (hasImages) {
      const imageMarkdown = pastedImages.map((img) => `![screenshot](${img.dataUrl})`).join('\n')
      fullContent = imageMarkdown + (fullContent ? '\n\n' + fullContent : '')
    }

    setLoading(true)
    setInput('')
    setPastedImages([])
    setStreamingText('')
    setSteps([])
    setCurrentClarification(null)
    const userMsgId = Date.now().toString()
    setMessages((p) => [...p, { role: 'user', content: fullContent, id: userMsgId }])

    const controller = new AbortController()
    window._currentChatController = controller

    try {
      const r = await fetch(withBackendBase(`/api/sessions/${currentId}/messages`, true), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: fullContent, 
          provider, 
          model: providerConfigs[provider]?.model 
        }),
        signal: controller.signal
      })
      if (!r.ok) throw new Error('Yêu cầu thất bại')
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
            switch (data.type) {
              case 'tool':
                if (data.status === 'start') {
                  setSteps((p) => p.some((s) => s.id === data.name) ? p : [...p, { id: data.name, label: data.label, status: 'running' }])
                } else if (data.status === 'done') {
                  setSteps((p) => p.map((s) => s.id === data.name ? { ...s, status: 'done', count: data.count } : s))
                  await fetchWorkspace(currentId)
                }
                break
              case 'think':
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
                break
              case 'content':
                collected += data.content || ''
                setStreamingText(collected)
                break
              case 'clarification':
                setCurrentClarification(data)
                setSteps([])
                break
              case 'done':
                setMessages((p) => [...p, { role: 'assistant', content: collected, id: data.messageId || Date.now().toString(), usage: data.usage }])
                setStreamingText('')
                setSteps([])
                setLoading(false)
                await fetchSessions()
                await fetchWorkspace(currentId)
                break
              case 'error':
                setMessages((p) => [...p, { role: 'assistant', content: 'Lỗi: ' + (data.error || 'Yêu cầu thất bại'), id: data.messageId || 'err-' + Date.now() }])
                setStreamingText('')
                setSteps([])
                setLoading(false)
                break
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
      if (!aborted) {
        setMessages((p) => [...p, { role: 'assistant', content: 'Lỗi: ' + err.message, id: 'err-' + Date.now() }])
      }
      setStreamingText('')
      setSteps([])
    } finally {
      if (window._currentChatController === controller) {
        window._currentChatController = null
      }
      // Đảm bảo loading luôn được reset khi stream kết thúc
      setLoading(false)
    }
  }

  return (
    <div className="min-h-0 flex overflow-hidden bg-[#f7f7f4] relative" style={{ height: '100%' }}>
      <div className={`fixed inset-y-0 left-0 z-40 w-[76vw] max-w-64 sm:w-48 sm:max-w-none bg-[#fbfbf9]/95 border-r border-black/[0.06] backdrop-blur-xl transition-transform sm:relative sm:translate-x-0 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-2 sm:p-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <button onClick={() => { createSession(); setShowSidebar(false) }} className="flex-1 bg-gray-950 text-white py-1.5 text-xs rounded-xl font-medium">Chat mới</button>
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

      {showSidebar && <div onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 sm:hidden" />}

      <div className="flex-1 min-h-0 min-w-0 bg-white/80 sm:rounded-tl-[2rem] border-l border-black/[0.05] overflow-hidden relative">
        <header className="absolute inset-x-0 top-0 h-14 sm:h-16 border-b border-black/[0.04] flex items-center justify-between px-4 sm:px-8 bg-white/70 backdrop-blur-xl z-10">
          <button onClick={() => { setShowSidebar(true); setShowJournal(false); setShowWorkspace(false) }} className="sm:hidden p-2 text-gray-500">≡</button>
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
            <div className={`w-2 h-2 rounded-full shrink-0 transition-all duration-500 ${providerActive ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`} />
            <h1 className="text-[11px] leading-5 font-semibold text-gray-900 truncate min-w-0">
              {activeSession?.title || 'Cuộc trò chuyện'}
            </h1>
            <span className="flex items-center justify-center h-8 px-3 shrink-0 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              {providerLabels[provider] || provider}
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              {Array.isArray(agents) && agents.length > 0 ? (
                <select
                  value={selectedAgentId || agents[0]?.id || ''}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  disabled={loading}
                  className="flex items-center h-8 max-w-[140px] rounded-full border border-black/[0.06] bg-white/50 px-3 text-xs font-medium text-gray-600 outline-none transition-all hover:bg-white hover:border-black/10 disabled:opacity-50 appearance-none cursor-pointer"
                  title="Chọn Agent"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              ) : (
                <span className="flex items-center justify-center h-7 px-2.5 shrink-0 rounded-full bg-emerald-50 text-[9px] font-medium text-emerald-700">
                  HAgent
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowWorkspace(!showWorkspace); setShowJournal(false); setShowSidebar(false) }} className={`flex text-[9px] font-semibold items-center justify-center w-7 h-7 rounded-full border transition-all ${showWorkspace ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}>AI</button>
            <button onClick={() => { setShowJournal(!showJournal); setShowWorkspace(false); setShowSidebar(false) }} className={`flex text-[9px] font-semibold items-center justify-center w-7 h-7 rounded-full border transition-all ${showJournal ? 'bg-gray-950 border-gray-950 text-white' : 'bg-white/80 border-black/[0.06] text-gray-600 hover:bg-white hover:text-gray-900'}`}>J</button>
          </div>
        </header>

        <div className="absolute inset-x-0 top-14 bottom-24 sm:top-16 md:bottom-28 overflow-y-auto custom-scrollbar p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-5 sm:space-y-8">
            {currentClarification && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 animate-fade-in">
                <div className="font-semibold">Cần bạn bổ sung thông tin</div>
                <div className="mt-1">{currentClarification.question || 'Agent cần thêm thông tin để tiếp tục.'}</div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className={`flex items-start gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''} max-w-full ${m.role === 'user' ? 'sm:max-w-[80%]' : 'sm:max-w-[96%]'}`}>
                  <div className={`rounded-[1.5rem] sm:rounded-[1.8rem] px-4 sm:px-6 py-3 sm:py-4 text-[14.5px] leading-relaxed break-words overflow-hidden shadow-sm ${m.role === 'user' ? 'bg-gray-900 text-white rounded-br-md' : 'bg-white text-gray-800 border border-black/[0.06] rounded-bl-md'}`}>
                    <MarkdownContent content={m.content} role={m.role} />
                  </div>
                </div>
                <div className={`flex items-center gap-3 mt-1.5 px-3 w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.usage && m.role === 'assistant' && <span className="text-[12px] leading-4 text-gray-400 font-normal mr-2">Token: {fmtToken(m.usage.total_tokens)}</span>}
                  <button onClick={() => handleCopy(m.content, m.id)} className="flex h-5 w-5 items-center justify-center rounded-md text-gray-300 transition-all hover:bg-gray-100 hover:text-gray-500">{copiedId === m.id ? '✓' : '⧉'}</button>
                  {m.role === 'assistant' && (
                    <button onClick={() => handleSpeak(m.content, m.id)}
                      className={`flex h-5 w-5 items-center justify-center rounded-md transition-all ${
                        speakingId === m.id ? 'text-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                      }`}
                      title={speakingId === m.id ? 'Đang phát...' : 'Đọc to'}>
                      {speakingId === m.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                          <line x1="23" y1="9" x2="17" y2="15"/>
                          <line x1="17" y1="9" x2="23" y2="15"/>
                        </svg>
                      )}
                    </button>
                  )}
                  <button onClick={() => deleteMessage(m.id)} className="flex h-5 w-5 items-center justify-center rounded-md text-gray-300 transition-all hover:bg-red-50 hover:text-red-500">×</button>
                </div>
              </div>
            ))}

            {steps.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-[85%] sm:max-w-[65%]">
                  <details className="group" open={loading}>
                    <summary className="flex items-center gap-2 text-[12px] leading-4 font-normal text-gray-400 cursor-pointer list-none hover:text-gray-600 transition-colors">
                      <span>{loading ? 'Đang xử lý...' : `Các bước: ${steps.length}`}</span>
                    </summary>
                    <div className="mt-3 space-y-2 pl-4 border-l-2 border-gray-100">
                      {steps.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{s.status === 'done' ? '✓' : '•'}</span>
                          <span className={s.status === 'running' ? 'text-gray-600 font-bold' : ''}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            )}

            {loading && streamingText && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-white border border-black/[0.06] rounded-[1.8rem] rounded-bl-sm max-w-full sm:max-w-[96%] px-6 py-4 text-[14.5px] leading-relaxed shadow-sm overflow-hidden">
                  <MarkdownContent content={streamingText} role="assistant" />
                  <span className="inline-block w-1.5 h-4 bg-gray-300 animate-pulse ml-1 align-middle" />
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-black/[0.04] bg-white/80 p-3 backdrop-blur-xl md:p-4 pb-safe">
          <div className="max-w-5xl mx-auto">
            <div className="relative bg-white border border-gray-300/80 rounded-[1.6rem] shadow-[0_10px_40px_rgba(15,23,42,0.08)] p-2 backdrop-blur-xl ring-1 ring-white/80">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileImport} accept=".txt,.md,.pdf,.doc,.docx,.xlsx,.csv,.json,.png,.jpg,.jpeg,.gif,.webp" />
              {showCommands && (
                <div className="absolute left-0 right-0 bottom-full mb-3 overflow-hidden rounded-3xl border border-gray-200/70 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl z-20">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100/80">
                    <div>
                      <p className="text-[14px] leading-5 font-semibold text-gray-900">Lệnh nhanh</p>
                      <p className="text-[12px] leading-4 font-normal text-gray-400">Chọn nhanh một lệnh để gửi trong chat</p>
                    </div>
                    <button onClick={() => setShowCommands(false)} className="h-7 w-7 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">×</button>
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
                    {commands.map(([command, description]) => (
                      <button key={command} onClick={() => { setInput(`/${command}`); setShowCommands(false) }} className="group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all hover:bg-gray-100/80">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-500 group-hover:bg-white group-hover:text-gray-900 transition-all">/</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] leading-5 font-medium text-gray-900">/{command}</span>
                          <span className="block truncate text-[12px] leading-4 font-normal text-gray-400 mt-0.5">{description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
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
              <div className="flex min-h-12 items-center gap-2" onDragOver={handleDragOver} onDrop={handleDrop}>
                <button type="button" onClick={() => setShowCommands((v) => !v)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] leading-none font-medium transition-all ${showCommands ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}>/</button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 transition-all">+</button>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onFocus={() => input.startsWith('/') && setShowCommands(true)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} onPaste={handlePaste} placeholder={`Chào ${user?.displayName || user?.display_name || 'bạn'}, hôm nay cần gì?`} rows={1} className="min-h-9 flex-1 resize-none border-none bg-transparent px-2 py-1.5 text-[14px] leading-6 font-normal text-gray-800 placeholder:text-gray-400 focus:outline-none" />
                {loading ? (
                  <button onClick={stopChat} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm transition-all hover:bg-red-600">■</button>
                ) : (
                  <button onClick={send} disabled={!input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-950 text-white shadow-sm transition-all hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">➤</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWorkspace && <button onClick={() => setShowWorkspace(false)} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" aria-label="Đóng workspace" />}
      {showWorkspace && (
        <div className="fixed inset-y-0 right-0 z-50 w-[86vw] max-w-sm border-l border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right-4 lg:relative lg:z-auto lg:w-80 lg:max-w-none">
          <div className="mb-6 flex items-center justify-between border-b border-black/[0.05] pb-4">
            <div>
              <h2 className="text-[14px] leading-5 font-semibold text-gray-900">Không gian Agent</h2>
              <p className="mt-1 text-[12px] leading-4 text-gray-500">
                {workspace.summary ? `${workspaceToolCount} công cụ · ${workspaceTodoCount} việc cần làm` : 'Đang tải...'}
              </p>
            </div>
            <button onClick={() => setShowWorkspace(false)} className="lg:hidden h-9 w-9 rounded-2xl bg-white/80 text-gray-400 shadow-sm">×</button>
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

      {showJournal && <button onClick={() => setShowJournal(false)} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" aria-label="Đóng nhật ký" />}
      {showJournal && (
        <div className="fixed inset-y-0 right-0 z-50 w-[86vw] max-w-sm border-l border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right-4 lg:relative lg:z-auto lg:w-72 lg:max-w-none">
          <div className="mb-6 flex items-center justify-between border-b border-black/[0.05] pb-4">
            <h2 className="text-[14px] leading-5 font-semibold text-gray-900">Nhật ký xử lý</h2>
            <button onClick={() => setShowJournal(false)} className="lg:hidden h-9 w-9 rounded-2xl bg-white/80 text-gray-400 shadow-sm">×</button>
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
    </div>
  )
}

function MarkdownContent({ content, role }) {
  const displayContent = content
    ? content
      .replace(/<\|?tool_call\|?>[\s\S]*?(?=<\|?tool_call\|?>|$)/g, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/A tool result section for [\s\S]*? was provided, showing the [\s\S]*? details\./g, '')
      .trim()
    : ''

  return (
    <div className={`prose prose-sm max-w-none ${role === 'user' ? 'prose-invert text-white' : 'prose-gray text-gray-800'} prose-p:leading-relaxed prose-headings:font-semibold prose-headings:normal-case prose-strong:font-semibold`}>
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
