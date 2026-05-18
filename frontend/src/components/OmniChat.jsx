import { ArrowLeft, Check, Pencil, Pin, PinOff, QrCode, RefreshCw, Reply, Send, Settings, Smile, Trash2, UserRound, X, Paperclip, Image as ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const AUTO_REFRESH_MS = 5000
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|bmp|avif)(?:[?#][^\s"'<>]*)?/gi

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function omniApi(path, token, options = {}) {
  const res = await fetch(`/api/omni${path}`, {
    ...options,
    headers: {
      ...authHeaders(token),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => null)
  const message = data?.detail || data?.error || data?.message || `${res.status} ${res.statusText || 'OmniChat lỗi'}`
  if (!res.ok) throw new Error(message)
  return data || {}
}

function displayErrorMessage(err, fallback = '') {
  const message = typeof err === 'string' ? err : (err?.message || '')
  if (message === 'OmniChat request failed') return fallback || 'Không gọi được OmniChat.'
  return message === 'Không tìm thấy hội thoại.' ? fallback : (message || fallback)
}

async function telegramApi(path, token, options = {}) {
  const res = await fetch(`/api/telegram${path}`, {
    ...options,
    headers: {
      ...authHeaders(token),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || data.message || 'Telegram request failed')
  return data
}

function stickerFromRawText(text = '') {
  const raw = String(text || '').trim()
  if (!raw.startsWith('{') || !raw.endsWith('}')) return null
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    if (!('id' in data) || !('catId' in data) || !('type' in data)) return null
    return {
      type: 'sticker',
      label: 'Sticker Zalo',
      emoji: '🙂',
      sticker_id: String(data.id || ''),
      cat_id: String(data.catId || ''),
      sticker_type: String(data.type || ''),
    }
  } catch {
    return null
  }
}

function zaloJsonMediaFromRawText(text = '') {
  const raw = String(text || '').trim()
  if (!raw.startsWith('{') || !raw.endsWith('}')) return null
  try {
    const data = JSON.parse(raw)
    const urls = new Set()
    const captions = []
    const visit = value => {
      if (!value) return
      if (typeof value === 'string') {
        for (const match of value.matchAll(IMAGE_URL_RE)) urls.add(match[0])
        return
      }
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      if (typeof value === 'object') {
        for (const key of ['title', 'description']) {
          const textValue = value[key]
          if (typeof textValue === 'string' && textValue.trim()) captions.push(textValue.trim())
        }
        Object.values(value).forEach(visit)
      }
    }
    visit(data)
    if (!urls.size) return null
    return {
      text: captions.find(Boolean) || '',
      media: [...urls].map(url => ({ type: 'image', url, label: 'Ảnh' })),
    }
  } catch {
    return null
  }
}

function formatMessageText(text) {
  if (!text) return [{ type: 'text', content: '' }]
  
  const parts = []
  let lastIndex = 0
  
  // Match **bold**, *italic*, `code`, ~~strikethrough~~, including bold text across lines.
  const regex = /(\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`|~~([\s\S]+?)~~)/g
  let match
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    
    // Add formatted text
    if (match[2]) {
      parts.push({ type: 'bold', content: match[2] })
    } else if (match[3]) {
      parts.push({ type: 'italic', content: match[3] })
    } else if (match[4]) {
      parts.push({ type: 'code', content: match[4] })
    } else if (match[5]) {
      parts.push({ type: 'strike', content: match[5] })
    }
    
    lastIndex = regex.lastIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }
  
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

function MessageBody({ content = '' }) {
  const markerMedia = String(content)
    .split('\n')
    .filter(line => line.startsWith('__OMNI_MEDIA__'))
    .map(line => {
      try { return JSON.parse(line.slice('__OMNI_MEDIA__'.length)) } catch { return null }
    })
    .filter(Boolean)

  const visibleText = String(content)
    .split('\n')
    .filter(line => !line.startsWith('__OMNI_MEDIA__'))
    .join('\n')
    .trim()
  const markerUrls = new Set(markerMedia.map(item => item.url).filter(Boolean))
  const inlineImages = [...visibleText.matchAll(IMAGE_URL_RE)]
    .map(match => match[0])
    .filter(url => !markerUrls.has(url))
    .map(url => ({ type: 'image', url, label: 'Ảnh' }))
  const rawSticker = stickerFromRawText(visibleText)
  const rawJsonMedia = rawSticker ? null : zaloJsonMediaFromRawText(visibleText)
  const textWithoutInlineImages = visibleText
    .replace(IMAGE_URL_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const visibleCleanText = rawJsonMedia ? rawJsonMedia.text : textWithoutInlineImages
  const media = [
    ...markerMedia,
    ...(rawSticker ? [rawSticker] : []),
    ...(rawJsonMedia ? rawJsonMedia.media : inlineImages),
  ]

  return (
    <div className="space-y-2">
      {visibleCleanText && !rawSticker && (
        <p className="whitespace-pre-wrap break-words">
          {formatMessageText(visibleCleanText).map((part, partIdx) => {
            if (part.type === 'bold') {
              return <strong key={partIdx} className="font-semibold">{part.content}</strong>
            } else if (part.type === 'italic') {
              return <em key={partIdx} className="italic">{part.content}</em>
            } else if (part.type === 'code') {
              return <code key={partIdx} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] font-mono">{part.content}</code>
            } else if (part.type === 'strike') {
              return <del key={partIdx} className="line-through opacity-70">{part.content}</del>
            } else {
              return <span key={partIdx}>{part.content}</span>
            }
          })}
        </p>
      )}
      {media.map((item, index) => (
        item.type === 'image' ? (
          <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
            <img src={item.url} alt={item.label || 'Ảnh'} className="max-h-72 w-full max-w-72 rounded-xl object-cover" />
          </a>
        ) : item.type === 'sticker' ? (
          <div key={`sticker-${item.sticker_id || index}`} className="inline-flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2">
            <span className="text-2xl leading-none">{item.emoji || '🙂'}</span>
            <span className="text-xs font-medium">{item.label || 'Sticker Zalo'}</span>
          </div>
        ) : item.url ? (
          <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="block break-all rounded-xl bg-black/5 px-3 py-2 text-xs underline">
            {item.label || item.url}
          </a>
        ) : (
          <div key={`media-${index}`} className="rounded-xl bg-black/5 px-3 py-2 text-xs">
            {item.label || 'File phương tiện'}
          </div>
        )
      ))}
      {(!visibleCleanText || rawSticker) && media.length === 0 && <p>File phương tiện</p>}
    </div>
  )
}

function messagePreview(content = '') {
  const raw = String(content || '')
  const jsonMedia = zaloJsonMediaFromRawText(raw)
  if (jsonMedia) return jsonMedia.text || 'Ảnh'
  const markers = raw
    .split('\n')
    .filter(line => line.startsWith('__OMNI_MEDIA__'))
    .map(line => {
      try { return JSON.parse(line.slice('__OMNI_MEDIA__'.length)) } catch { return null }
    })
    .filter(Boolean)
  const text = raw
    .split('\n')
    .filter(line => !line.startsWith('__OMNI_MEDIA__'))
    .join(' ')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/~~([\s\S]+?)~~/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(IMAGE_URL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stickerFromRawText(raw)) return 'Sticker Zalo'
  if (!text && [...raw.matchAll(IMAGE_URL_RE)].length) return 'Ảnh'
  if (!text && markers[0]?.type === 'sticker') return 'Sticker Zalo'
  if (!text && markers.length) return markers[0]?.type === 'image' ? 'Ảnh' : 'File phương tiện'
  return text.length > 100 ? `${text.slice(0, 97)}...` : text
}

function formatMessageTime(value) {
  if (!value) return ''
  const raw = String(value)
  const date = new Date(raw.includes('T') ? raw : `${raw}Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function isDefaultAvatar(src = '') {
  const value = String(src || '').trim().toLowerCase()
  return !value || value.includes('default_avatar') || value.endsWith('/default')
}

function Avatar({ src, className = 'h-10 w-10' }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (failed || isDefaultAvatar(src)) {
    return (
      <div className={`${className} shrink-0 rounded-full bg-gray-100 text-gray-400 inline-flex items-center justify-center border border-black/[0.04]`}>
        <UserRound className="h-1/2 w-1/2" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} shrink-0 rounded-full object-cover bg-gray-100`}
      onError={() => setFailed(true)}
    />
  )
}

function isOutgoingMessage(msg) {
  return msg?.sender_type === 'agent' || msg?.sender_type === 'user'
}

function hasUsableQr(value) {
  const raw = String(value || '')
  return raw.startsWith('data:image/') && raw.length > 'data:image/png;base64,'.length + 24 && !raw.includes('STUB_')
}

export default function OmniChat({ token, provider }) {
  const [conversations, setConversations] = useState([])
  const [contacts, setContacts] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [sidebarMode, setSidebarMode] = useState('chats')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [status, setStatus] = useState('')
  const [channelStatus, setChannelStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [showChannels, setShowChannels] = useState(false)
  const [qr, setQr] = useState(null)
  const [qrSession, setQrSession] = useState('')
  const [telegramQr, setTelegramQr] = useState(null)
  const [telegramQrSession, setTelegramQrSession] = useState('')
  const [syncingTelegram, setSyncingTelegram] = useState(false)
  const [syncingZalo, setSyncingZalo] = useState(false)
  const [syncingFacebook, setSyncingFacebook] = useState(false)
  const [agentAutoState, setAgentAutoState] = useState({ enabled: false, session_id: '', last_error: '' })
  const [agentAutoSaving, setAgentAutoSaving] = useState(false)
  const [savingFacebook, setSavingFacebook] = useState(false)
  const [showFacebookConnect, setShowFacebookConnect] = useState(false)
  const [facebookCookie, setFacebookCookie] = useState('')
  const [todayStats, setTodayStats] = useState({ sent: 0, received: 0, total: 0 })
  const [replyTo, setReplyTo] = useState(null)
  const [reactionMenuId, setReactionMenuId] = useState('')
  const [telegramCommands, setTelegramCommands] = useState([])
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const messagesPaneRef = useRef(null)
  const bottomRef = useRef(null)
  const selectedIdRef = useRef('')
  const reloadTimerRef = useRef(null)

  const selected = conversations.find(item => item.id === selectedId) || contacts.find(item => item.id === selectedId) || null

  const conversationStats = useMemo(() => {
    const rows = Array.isArray(todayStats.by_conversation) ? todayStats.by_conversation : []
    return new Map(rows.map(item => [item.conversation_id, item]))
  }, [todayStats])

  const selectedStats = conversationStats.get(selectedId) || { sent: 0, received: 0, total: 0 }

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return conversations
      .filter(item => filter === 'all' || item.channel === filter)
      .filter(item => {
        if (!query) return true
        return `${item.sender || ''} ${item.content || ''} ${item.channel || ''}`.toLowerCase().includes(query)
      })
  }, [conversations, search, filter])

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return contacts
      .filter(item => filter === 'all' || item.channel === filter)
      .filter(item => {
        if (!query) return true
        return `${item.sender || ''} ${item.external_id || ''} ${item.channel || ''}`.toLowerCase().includes(query)
      })
  }, [contacts, search, filter])

  async function loadConversations({ quiet = false } = {}) {
    if (!quiet) setStatus('')
    const data = await omniApi('/conversations', token)
    const rows = Array.isArray(data) ? data : []
    setConversations(rows)
    setSelectedId(current => current || rows[0]?.id || '')
    setStatus(current => current === 'OmniChat request failed' ? '' : current)
    setLoading(false)
  }

  async function loadContacts() {
    const data = await omniApi('/contacts', token)
    setContacts(Array.isArray(data) ? data : [])
  }

  async function loadTodayStats() {
    const data = await omniApi('/stats/today', token)
    setTodayStats(data || { sent: 0, received: 0, total: 0 })
  }

  async function loadAgentAutoReply(id) {
    if (!id) {
      setAgentAutoState({ enabled: false, session_id: '', last_error: '' })
      return
    }
    const data = await omniApi(`/conversations/${id}/agent-auto-reply`, token)
    setAgentAutoState({
      enabled: Boolean(data.enabled),
      session_id: data.session_id || '',
      last_error: data.last_error || '',
    })
  }

  function messagesAreNearBottom() {
    const el = messagesPaneRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }))
  }

  async function loadMessages(id, { stickToBottom = false } = {}) {
    if (!id) {
      setMessages([])
      return
    }
    const data = await omniApi(`/conversations/${id}/messages`, token)
    const shouldScroll = stickToBottom || messagesAreNearBottom()
    setMessages(Array.isArray(data) ? data : [])
    if (shouldScroll) scrollMessagesToBottom()
  }

  useEffect(() => {
    loadConversations().catch(err => {
      setLoading(false)
      setStatus(displayErrorMessage(err))
    })
    loadContacts().catch(() => { })
    loadTodayStats().catch(() => { })
  }, [token])

  useEffect(() => {
    selectedIdRef.current = selectedId
    loadMessages(selectedId, { stickToBottom: true }).catch(err => setStatus(displayErrorMessage(err)))
    loadAgentAutoReply(selectedId).catch(() => setAgentAutoState({ enabled: false, session_id: '', last_error: '' }))
    setReplyTo(null)
    setReactionMenuId('')
    setRenaming(false)
  }, [selectedId])

  useEffect(() => {
    if (!selected || selected.channel !== 'telegram' || !selected.external_id) {
      setTelegramCommands([])
      return
    }
    telegramApi(`/conversations/${selected.external_id}/commands`, token)
      .then(data => setTelegramCommands(Array.isArray(data.commands) ? data.commands : []))
      .catch(() => setTelegramCommands([]))
  }, [selected?.id, selected?.channel, selected?.external_id, token])

  useEffect(() => {
    if (!token) return undefined
    const events = new EventSource(`/api/omni/events?t=${encodeURIComponent(token)}`)
    let lastEventTime = Date.now()
    
    events.onopen = () => {
      setStatus(current => current === 'Mất kết nối realtime, đang tự nối lại...' || current === 'OmniChat request failed' ? '' : current)
    }

    events.addEventListener('omni', (e) => {
      lastEventTime = Date.now()
      window.dispatchEvent(new CustomEvent('omni-sse-alive', { detail: { time: lastEventTime } }))
      
      try {
        const event = JSON.parse(e.data)
        
        if (event.type === 'message') {
          const currentId = selectedIdRef.current
          if (currentId === event.conversationId) {
            loadMessages(currentId, { stickToBottom: true }).catch(() => {})
          }
          loadConversations({ quiet: true }).catch(() => {})
          loadTodayStats().catch(() => {})
        } else if (event.type === 'message_deleted') {
          const currentId = selectedIdRef.current
          if (currentId) loadMessages(currentId).catch(() => {})
          loadConversations({ quiet: true }).catch(() => {})
        } else {
          loadConversations({ quiet: true }).catch(() => {})
          loadContacts().catch(() => {})
          loadTodayStats().catch(() => {})
          const currentId = selectedIdRef.current
          if (currentId) loadMessages(currentId).catch(() => {})
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    })
    
    events.onerror = () => setStatus('Mất kết nối realtime, đang tự nối lại...')

    return () => {
      events.close()
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    let lastSseTime = Date.now()
    
    const handleSseAlive = (e) => {
      lastSseTime = e.detail?.time || Date.now()
    }
    
    window.addEventListener('omni-sse-alive', handleSseAlive)
    
    const timer = window.setInterval(() => {
      const timeSinceLastSse = Date.now() - lastSseTime
      if (timeSinceLastSse > 15000) {
        loadConversations({ quiet: true }).catch(() => { })
        loadContacts().catch(() => { })
        loadTodayStats().catch(() => { })
        const currentId = selectedIdRef.current
        if (currentId) loadMessages(currentId).catch(() => { })
      }
    }, AUTO_REFRESH_MS)
    
    return () => {
      window.removeEventListener('omni-sse-alive', handleSseAlive)
      window.clearInterval(timer)
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    const timer = window.setInterval(async () => {
      const shouldPollZalo = selected?.channel === 'zalo' || conversations.some(item => item.channel === 'zalo')
      if (!shouldPollZalo || syncingZalo) return
      try {
        const data = await omniApi('/sync/zalo/messages', token, {
          method: 'POST',
          body: JSON.stringify({ maxThreads: 120, maxMessages: 20 }),
        })
        if ((data.synced_messages || 0) > 0) {
          await Promise.all([loadConversations({ quiet: true }), loadContacts()])
          const currentId = selectedIdRef.current
          if (currentId) await loadMessages(currentId)
        }
      } catch {
        // Realtime is primary; this is only a quiet safety net for missed Zalo events.
      }
    }, 30000)
    return () => window.clearInterval(timer)
  }, [token, selected?.channel, conversations, syncingZalo])

  useEffect(() => {
    if (!qrSession) return
    const timer = setInterval(async () => {
      try {
        const data = await omniApi(`/sync/zalo/qr/${qrSession}/status`, token)
        if (data.status === 'connected') {
          setQr(null)
          setQrSession('')
          setChannelStatus('Zalo đã kết nối.')
          await Promise.all([loadConversations({ quiet: true }), loadContacts()])
        } else if (data.status === 'unavailable') {
          setQr(null)
          setQrSession('')
          setChannelStatus(data.detail || 'Zalo chưa có QR thực trên backend.')
        } else {
          setChannelStatus('Đang chờ quét QR Zalo...')
        }
      } catch (err) {
        setChannelStatus(displayErrorMessage(err))
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [qrSession, token])

  useEffect(() => {
    if (!telegramQrSession) return
    const timer = setInterval(async () => {
      try {
        const data = await telegramApi(`/qr/${telegramQrSession}/status`, token)
        if (data.status === 'connected') {
          setTelegramQr(null)
          setTelegramQrSession('')
          setChannelStatus('Telegram đã kết nối.')
          await loadConversations({ quiet: true })
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          setTelegramQr(null)
          setTelegramQrSession('')
          setChannelStatus('QR Telegram đã hết hạn.')
        } else if (data.status === 'unavailable') {
          setTelegramQr(null)
          setTelegramQrSession('')
          setChannelStatus(data.detail || 'Telegram chưa có QR thực trên backend.')
        } else {
          setChannelStatus('Đang chờ quét QR Telegram...')
        }
      } catch (err) {
        setChannelStatus(displayErrorMessage(err))
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [telegramQrSession, token])

  async function refresh() {
    try {
      await loadConversations()
      await loadContacts()
      await loadTodayStats()
      if (selectedId) await loadMessages(selectedId)
      setStatus('Đã làm mới.')
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  async function sendMessage(e) {
    e.preventDefault()
    const text = draft.trim()
    if ((!text && attachments.length === 0) || !selected || sendingRef.current) return

    sendingRef.current = true
    setSending(true)
    setStatus('')
    
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text || (attachments.length > 0 ? `📎 ${attachments.length} file(s)` : ''),
      created_at: new Date().toISOString(),
      status: 'sending',
      reply_to_id: replyTo?.id || null,
    }
    setMessages(prev => [...prev, optimisticMsg])
    
    const savedReplyTo = replyTo
    const savedAttachments = [...attachments]
    
    // Clear immediately for better UX
    setDraft('')
    setReplyTo(null)
    setAttachments([])
    
    setTimeout(() => scrollMessagesToBottom(), 50)
    
    try {
      // Upload attachments first if any
      let uploadedUrls = []
      if (savedAttachments.length > 0) {
        setUploading(true)
        const formData = new FormData()
        savedAttachments.forEach(file => {
          formData.append('files', file)
        })
        
        const uploadRes = await fetch('/api/omni/upload', {
          method: 'POST',
          headers: authHeaders(token),
          body: formData,
        })
        
        if (!uploadRes.ok) throw new Error('Upload failed')
        const uploadData = await uploadRes.json()
        uploadedUrls = uploadData.urls || []
        setUploading(false)
      }
      
      // Build message content with uploaded files
      let finalContent = text
      if (uploadedUrls.length > 0) {
        const mediaMarkers = uploadedUrls.map(url => {
          const isImage = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(url)
          return `__OMNI_MEDIA__${JSON.stringify({ type: isImage ? 'image' : 'file', url, label: isImage ? 'Ảnh' : 'File' })}`
        }).join('\n')
        finalContent = finalContent ? `${finalContent}\n${mediaMarkers}` : mediaMarkers
      }
      
      await omniApi(`/conversations/${selected.id}/messages`, token, {
        method: 'POST',
        body: JSON.stringify({ content: finalContent, reply_to_id: savedReplyTo?.id || '' }),
      })
      
      await Promise.all([
        loadMessages(selected.id, { stickToBottom: true }),
        loadConversations({ quiet: true }),
        loadTodayStats()
      ])
      
      // Ensure draft stays cleared after reload
      setDraft('')
      setReplyTo(null)
      setAttachments([])
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      if (!['zalo', 'telegram'].includes(selected?.channel)) {
        setDraft(text)
        setReplyTo(savedReplyTo)
        setAttachments(savedAttachments)
      }
      setStatus(displayErrorMessage(err))
    } finally {
      sendingRef.current = false
      setSending(false)
      setUploading(false)
    }
  }

  async function toggleAgentAutoReply() {
    if (!selected || agentAutoSaving) return
    if (!['zalo', 'telegram'].includes(selected.channel)) {
      setStatus('Agent Auto Reply chỉ hỗ trợ Zalo/Telegram.')
      return
    }
    const nextEnabled = !agentAutoState.enabled
    setAgentAutoSaving(true)
    setStatus(nextEnabled ? 'Agent sẽ tự trả lời khi có tin nhắn mới.' : 'Đã chuyển về chế độ tự trả lời.')
    try {
      const data = await omniApi(`/conversations/${selected.id}/agent-auto-reply`, token, {
        method: 'POST',
        body: JSON.stringify({ enabled: nextEnabled, provider }),
      })
      setAgentAutoState({
        enabled: Boolean(data.enabled),
        session_id: data.session_id || '',
        last_error: data.last_error || '',
      })
      setStatus(data.enabled ? 'Agent Auto Reply đã bật. Tin nhắn mới tới sẽ tự kích hoạt.' : 'Agent Auto Reply đã tắt.')
    } catch (err) {
      setStatus(displayErrorMessage(err, 'Không đổi được chế độ Agent Auto Reply.'))
    } finally {
      setAgentAutoSaving(false)
    }
  }

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Limit to 5 files
    const newFiles = files.slice(0, 5 - attachments.length)
    setAttachments(prev => [...prev, ...newFiles])
    e.target.value = '' // Reset input
  }

  function removeAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    
    const imageFiles = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }
    
    if (imageFiles.length > 0) {
      e.preventDefault()
      // Limit to 5 total attachments
      const newFiles = imageFiles.slice(0, 5 - attachments.length)
      setAttachments(prev => [...prev, ...newFiles])
      setStatus(`Đã dán ${newFiles.length} ảnh từ clipboard`)
    }
  }

  async function deleteConversation(conv) {
    if (!conv) return
    if (!window.confirm(`Xóa hội thoại với ${conv.sender || 'người này'}?`)) return

    setStatus('')
    try {
      await omniApi(`/conversations/${conv.id}`, token, { method: 'DELETE' })
      setMessages([])
      setConversations(current => current.filter(item => item.id !== conv.id))
      setContacts(current => current.filter(item => item.id !== conv.id))
      setSelectedId(current => {
        if (current !== conv.id) return current
        const next = conversations.find(item => item.id !== conv.id)
        return next?.id || ''
      })
      await Promise.all([loadConversations({ quiet: true }), loadContacts()])
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  async function deleteContact(contact) {
    if (!contact) return
    if (!window.confirm(`Xóa ${contact.sender || 'liên hệ này'} khỏi danh bạ?`)) return
    setStatus('')
    try {
      await omniApi(`/contacts/${contact.id}`, token, { method: 'DELETE' })
      setContacts(current => current.filter(item => item.id !== contact.id))
      setSelectedId(current => current === contact.id ? '' : current)
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  async function deleteMessage(msg) {
    if (!msg || !selected) return
    if (!window.confirm('Xóa tin nhắn này?')) return

    setStatus('')
    try {
      await omniApi(`/messages/${msg.id}`, token, { method: 'DELETE' })
      await Promise.all([loadMessages(selected.id), loadConversations({ quiet: true }), loadContacts()])
      await loadTodayStats()
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  async function toggleConversationPin(conv) {
    if (!conv) return
    setStatus('')
    try {
      await omniApi(`/conversations/${conv.id}/toggle-pin`, token, { method: 'POST' })
      await Promise.all([loadConversations({ quiet: true }), loadContacts()])
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  function beginRename() {
    if (!selected) return
    setRenameDraft(selected.sender || '')
    setRenaming(true)
  }

  async function saveConversationName() {
    if (!selected) return
    const name = renameDraft.trim()
    if (!name) return
    setStatus('')
    try {
      await omniApi(`/conversations/${selected.id}/rename`, token, {
        method: 'POST',
        body: JSON.stringify({ custom_name: name }),
      })
      setRenaming(false)
      await Promise.all([loadConversations({ quiet: true }), loadContacts()])
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  async function reactToMessage(msg, emoji) {
    if (!msg || !selected) return
    setReactionMenuId('')
    setStatus('')
    try {
      await omniApi(`/messages/${msg.id}/reaction`, token, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      })
      await loadMessages(selected.id)
    } catch (err) {
      setStatus(displayErrorMessage(err))
    }
  }

  const visibleTelegramCommands = useMemo(() => {
    if (selected?.channel !== 'telegram' || !draft.startsWith('/')) return []
    const needle = draft.slice(1).trim().toLowerCase()
    return telegramCommands.filter(item => {
      const command = String(item.command || '').toLowerCase()
      return !needle || command.startsWith(needle)
    })
  }, [draft, selected?.channel, telegramCommands])

  async function startTelegramQr() {
    setTelegramQr(null)
    setTelegramQrSession('')
    setChannelStatus('Đang tạo QR Telegram...')
    try {
      const data = await telegramApi('/qr/start', token, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const usable = hasUsableQr(data.qr)
      setTelegramQr(usable ? data : null)
      setTelegramQrSession(usable ? data.session_id : '')
      setChannelStatus(usable ? 'Quét QR bằng Telegram.' : (data.detail || 'Telegram chưa có QR thực trên backend.'))
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    }
  }

  async function syncTelegramMessages() {
    setSyncingTelegram(true)
    setChannelStatus('Đang đồng bộ Telegram...')
    try {
      const data = await telegramApi('/sync/messages', token, {
        method: 'POST',
        body: JSON.stringify({ maxThreads: 500, maxMessages: 80 }),
      })
      setChannelStatus(`Telegram: ${data.synced_conversations || 0} hội thoại, ${data.synced_messages || 0} tin.`)
      await loadConversations({ quiet: true })
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    } finally {
      setSyncingTelegram(false)
    }
  }

  async function startZaloQr() {
    setQr(null)
    setQrSession('')
    setChannelStatus('Đang tạo QR Zalo...')
    try {
      const data = await omniApi('/sync/zalo/qr/start', token, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const usable = hasUsableQr(data.qr)
      setQr(usable ? data.qr : null)
      setQrSession(usable ? data.session_id : '')
      setChannelStatus(usable ? 'Quét QR bằng Zalo trên điện thoại.' : (data.detail || 'Zalo chưa có QR thực trên backend.'))
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    }
  }

  async function syncZaloMessages() {
    setSyncingZalo(true)
    setChannelStatus('Đang đồng bộ Zalo...')
    try {
      const data = await omniApi('/sync/zalo/messages', token, {
        method: 'POST',
        body: JSON.stringify({ maxThreads: 500, maxMessages: 80 }),
      })
      setChannelStatus(`Zalo: ${data.synced_contacts || 0} bạn bè, ${data.synced_conversations || 0} hội thoại, ${data.synced_messages || 0} tin.`)
      await Promise.all([loadConversations({ quiet: true }), loadContacts()])
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    } finally {
      setSyncingZalo(false)
    }
  }

  async function connectFacebook() {
    const cookie = facebookCookie.trim()
    if (!cookie) {
      setChannelStatus('Nhập cookie Facebook trước.')
      return
    }
    setSavingFacebook(true)
    setChannelStatus('Đang lưu Facebook...')
    try {
      await omniApi('/connect/facebook', token, {
        method: 'POST',
        body: JSON.stringify({ cookie }),
      })
      setFacebookCookie('')
      setChannelStatus('Đã kết nối Facebook.')
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    } finally {
      setSavingFacebook(false)
    }
  }

  async function syncFacebookMessages() {
    setSyncingFacebook(true)
    setChannelStatus('Đang đồng bộ Facebook...')
    try {
      const data = await omniApi('/sync/facebook/messages', token, {
        method: 'POST',
        body: JSON.stringify({ maxThreads: 8, maxMessages: 25 }),
      })
      setChannelStatus(`Facebook: ${data.synced_conversations || 0} hội thoại, ${data.synced_messages || 0} tin.`)
      await loadConversations({ quiet: true })
    } catch (err) {
      setChannelStatus(displayErrorMessage(err))
    } finally {
      setSyncingFacebook(false)
    }
  }

  function renderMessageActions(msg) {
    const outgoing = isOutgoingMessage(msg)
    const menuSide = outgoing ? 'right-0' : 'left-0'
    const deleteTitle = outgoing && selected?.channel === 'zalo'
      ? 'Thu hồi Zalo'
      : outgoing && selected?.channel === 'telegram'
        ? 'Xoá Telegram'
        : 'Xoá tin nhắn'

    return (
      <div className="relative mb-1 flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setReactionMenuId(current => (current === msg.id ? '' : msg.id))}
          className="h-7 w-7 rounded-lg bg-white text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700 inline-flex items-center justify-center"
          title="Cảm xúc"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
        {reactionMenuId === msg.id && (
          <div className={`absolute bottom-8 ${menuSide} z-20 flex gap-1 rounded-xl border border-black/[0.06] bg-white p-1 shadow-lg`}>
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => reactToMessage(msg, emoji)}
                className="h-8 w-8 rounded-lg text-sm hover:bg-gray-100"
                title={`Thả ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setReactionMenuId('')
            setReplyTo(msg)
          }}
          className="h-7 w-7 rounded-lg bg-white text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700 inline-flex items-center justify-center"
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setReactionMenuId('')
            deleteMessage(msg)
          }}
          className="h-7 w-7 rounded-lg bg-white text-gray-400 shadow-sm hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
          title={deleteTitle}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="h-full bg-[#f7f7f4] p-0 sm:p-3">
      <div className="flex h-full overflow-hidden border border-black/[0.06] bg-white sm:rounded-lg">
        <aside className={`${selected ? 'hidden sm:flex' : 'flex'} w-full sm:w-64 border-r border-black/[0.06] flex-col`}>
          <div className="border-b border-black/[0.06] p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-[13px] font-semibold leading-5 text-gray-950">Omni chat</h1>
                <p className="text-[10px] leading-4 text-gray-500">Gom hội thoại nhiều kênh</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowChannels(value => !value)}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.06] ${showChannels ? 'bg-gray-950 text-white' : 'bg-white text-gray-600'}`}
                  title="Kênh"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.06] bg-white text-gray-600"
                  title="Làm mới"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={sidebarMode === 'contacts' ? 'Tìm danh bạ' : 'Tìm hội thoại'}
                className="w-full rounded-md border border-black/[0.06] bg-gray-50 py-1.5 pl-2.5 pr-8 text-[11px] outline-none focus:border-gray-300"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Xóa tìm kiếm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-0.5">
              {[
                ['chats', 'Hội thoại'],
                ['contacts', 'Danh bạ'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSidebarMode(value)}
                  className={`rounded px-2 py-1 text-[10px] font-semibold ${sidebarMode === value ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-md bg-gray-100 p-0.5">
              {[
                ['all', 'Tất cả'],
                ['telegram', 'Tele'],
                ['zalo', 'Zalo'],
                ['facebook', 'FB'],
              ].map(([item, label]) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-md px-1.5 py-1 text-[10px] font-semibold ${filter === item ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {showChannels && (
              <div className="mt-2 rounded-md border border-black/[0.06] bg-gray-50 p-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 rounded-md bg-white p-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900">Telegram</p>
                      <p className="truncate text-[10px] text-gray-400">Dùng bot token</p>
                    </div>
                    <button
                      type="button"
                      onClick={startTelegramQr}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      QR
                    </button>
                    <button
                      type="button"
                      onClick={syncTelegramMessages}
                      disabled={syncingTelegram}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {syncingTelegram ? '...' : 'Sync'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 rounded-md bg-white p-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900">Zalo</p>
                      <p className="truncate text-[10px] text-gray-400">Chưa bật QR</p>
                    </div>
                    <button
                      type="button"
                      onClick={startZaloQr}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      QR
                    </button>
                    <button
                      type="button"
                      onClick={syncZaloMessages}
                      disabled={syncingZalo}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {syncingZalo ? '...' : 'Sync'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 rounded-md bg-white p-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Settings className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900">Facebook</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFacebookConnect(value => !value)}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cookie
                    </button>
                    <button
                      type="button"
                      onClick={syncFacebookMessages}
                      disabled={syncingFacebook}
                      className="h-6 rounded-md border border-black/[0.06] px-2 text-[9px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {syncingFacebook ? '...' : 'Sync'}
                    </button>
                  </div>
                </div>

                {showFacebookConnect && (
                  <div className="mt-2 rounded-xl bg-white p-2">
                    <textarea
                      value={facebookCookie}
                      onChange={e => setFacebookCookie(e.target.value)}
                      placeholder="Cookie Facebook"
                      className="min-h-16 w-full resize-none rounded-md border border-black/[0.06] bg-gray-50 px-3 py-2 text-xs outline-none focus:border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={connectFacebook}
                      disabled={savingFacebook}
                      className="mt-2 h-8 w-full rounded-lg bg-gray-950 px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {savingFacebook ? 'Đang lưu...' : 'Lưu Facebook'}
                    </button>
                  </div>
                )}

                {channelStatus && <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[11px] leading-4 text-gray-500">{channelStatus}</p>}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {loading ? (
              <div className="p-8 text-center text-xs font-semibold text-gray-400">Đang tải...</div>
            ) : sidebarMode === 'contacts' ? (
              filteredContacts.length === 0 ? (
                <div className="p-8 text-center text-xs font-semibold text-gray-400">Chưa có danh bạ</div>
              ) : (
                filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    className={`group flex w-full gap-3 rounded-md p-2 text-left transition-colors ${selectedId === contact.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(contact.id)}
                      className="min-w-0 flex flex-1 gap-3 text-left"
                    >
                      <Avatar src={contact.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{contact.sender}</p>
                          {contact.has_conversation && <span className="h-2 w-2 rounded-full bg-gray-300" />}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{contact.external_id}</p>
                        <p className="mt-1 text-[11px] font-medium uppercase text-gray-400">{contact.channel}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteContact(contact)}
                      className="h-8 w-8 shrink-0 rounded-lg text-gray-400 opacity-100 sm:opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
                      title="Xoá khỏi danh bạ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs font-semibold text-gray-400">Chưa có hội thoại</div>
            ) : (
              filteredConversations.map(conv => {
                const convStats = conversationStats.get(conv.id)
                return (
                  <div
                    key={conv.id}
                    className={`group flex w-full gap-2 rounded-md p-2 text-left transition-colors ${selectedId === conv.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(conv.id)}
                      className="min-w-0 flex flex-1 gap-3 text-left"
                    >
                      <Avatar src={conv.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{conv.sender}</p>
                          {conv.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                          {conv.unread && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{conv.content || 'Không có nội dung'}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium uppercase text-gray-400">
                          <span>{conv.channel}</span>
                          {convStats?.total > 0 && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="normal-case">Gửi {convStats.sent || 0}</span>
                              <span className="normal-case">Nhận {convStats.received || 0}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConversationPin(conv)}
                      className={`h-8 w-8 shrink-0 rounded-lg opacity-100 sm:opacity-0 group-hover:opacity-100 inline-flex items-center justify-center ${conv.is_pinned ? 'text-gray-950 hover:bg-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                      title={conv.is_pinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                    >
                      {conv.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(conv)}
                      className="h-8 w-8 shrink-0 rounded-lg text-gray-400 opacity-100 sm:opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
                      title="Xoá hội thoại"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        <section className={`${selected ? 'flex' : 'hidden sm:flex'} min-w-0 flex-1 flex-col bg-gray-50`}>
          {selected ? (
            <>
              <div className="flex min-h-14 items-center gap-2 border-b border-black/[0.06] bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => setSelectedId('')}
                  className="sm:hidden h-9 w-9 rounded-xl bg-gray-100 text-gray-600 inline-flex items-center justify-center"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar src={selected.avatar} />
                <div className="min-w-0 flex-1">
                  {renaming ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveConversationName()
                          if (e.key === 'Escape') setRenaming(false)
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-950 outline-none focus:border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={saveConversationName}
                        className="h-8 w-8 shrink-0 rounded-lg bg-gray-950 text-white inline-flex items-center justify-center disabled:opacity-40"
                        disabled={!renameDraft.trim()}
                        title="Lưu tên"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(false)}
                        className="h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 inline-flex items-center justify-center"
                        title="Hủy"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h2 className="truncate text-[13px] font-semibold text-gray-950">{selected.sender}</h2>
                      <button
                        type="button"
                        onClick={beginRename}
                        className="h-7 w-7 shrink-0 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 inline-flex items-center justify-center"
                        title="Sửa tên trong DB"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="truncate text-[11px] text-gray-500">
                    {selected.channel} · {selected.external_id} · Gửi {selectedStats.sent || 0} / Nhận {selectedStats.received || 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAgentAutoReply}
                  disabled={agentAutoSaving || !['zalo', 'telegram'].includes(selected.channel)}
                  className={`h-9 w-9 shrink-0 rounded-xl inline-flex items-center justify-center disabled:opacity-40 ${agentAutoState.enabled ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                  title={agentAutoState.enabled ? `Agent đang trực (${agentAutoState.session_id})` : 'Tôi tự trả lời'}
                >
                  <Reply className={`h-4 w-4 ${agentAutoSaving || agentAutoState.enabled ? 'animate-pulse' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleConversationPin(selected)}
                  className={`h-9 w-9 rounded-xl inline-flex items-center justify-center ${selected.is_pinned ? 'bg-gray-100 text-gray-950' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                  title={selected.is_pinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                >
                  {selected.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteConversation(selected)}
                  className="h-9 w-9 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
                  title="Xoá hội thoại"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div
                ref={messagesPaneRef}
                onScroll={() => {
                  if (reactionMenuId) setReactionMenuId('')
                }}
                className="flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar sm:p-4"
              >
                {messages.length === 0 && (
                  <div className="pt-12 text-center text-xs font-semibold text-gray-400">Chưa có tin nhắn</div>
                )}
                {messages.map(msg => {
                  if (msg.sender_type === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="max-w-[82%] rounded-full bg-gray-100 px-3 py-1.5 text-center text-[11px] font-medium text-gray-500">
                          {messagePreview(msg.content) || msg.content}
                        </div>
                      </div>
                    )
                  }

                  const outgoing = isOutgoingMessage(msg)
                  return (
                    <div key={msg.id} className={`group flex items-end gap-2 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      {outgoing && renderMessageActions(msg)}
                      <div className={`max-w-[82%] rounded-xl px-3 py-2 text-[13px] leading-5 shadow-sm ${outgoing ? 'bg-gray-950 text-white rounded-br-md' : 'bg-white text-gray-800 border border-black/[0.06] rounded-bl-md'}`}>
                        {selected.thread_type === 'group' && !outgoing && msg.external_author_name && (
                          <p className="mb-1 text-[11px] font-semibold leading-none text-gray-400">{msg.external_author_name}</p>
                        )}
                        {msg.reply_to?.content && (
                          <div className={`mb-2 rounded-xl border-l-2 px-2 py-1.5 text-xs leading-5 ${msg.sender_type === 'agent' ? 'border-white/40 bg-white/10 text-white/75' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                            {messagePreview(msg.reply_to.content)}
                          </div>
                        )}
                        <MessageBody content={msg.content} />
                        {formatMessageTime(msg.created_at) && (
                          <p className={`mt-1 text-[10px] leading-none ${outgoing ? 'text-right text-white/55' : 'text-gray-400'}`}>
                            {formatMessageTime(msg.created_at)}
                          </p>
                        )}
                        {msg.status && !['sent', 'synced', 'received'].includes(msg.status) && (
                          <p className={`mt-1 text-[11px] ${outgoing ? 'text-white/65' : 'text-gray-400'}`}>{msg.status}</p>
                        )}
                        {Object.keys(msg.reactions || {}).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {Object.entries(msg.reactions || {}).map(([emoji, count]) => (
                              <span key={emoji} className={`rounded-full px-2 py-0.5 text-xs ${outgoing ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                {emoji}{count > 1 ? ` ${count}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!outgoing && renderMessageActions(msg)}
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {status && (
                <div className="border-t border-black/[0.04] bg-white px-4 py-2 text-xs text-gray-500">{status}</div>
              )}
              {replyTo && (
                <div className="border-t border-black/[0.06] bg-white px-3 pt-3">
                  <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                    <Reply className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-400">
                        Trả lời {isOutgoingMessage(replyTo) ? 'tin đã gửi' : 'tin đã nhận'}
                      </p>
                      <p className="truncate text-xs text-gray-700">{messagePreview(replyTo.content) || 'File phương tiện'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:bg-white hover:text-gray-700 inline-flex items-center justify-center"
                      title="Bỏ reply"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="border-t border-black/[0.06] bg-gray-50 p-2">
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="relative group">
                        {file.type.startsWith('image/') ? (
                          <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-black/[0.06]">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              className="absolute right-1 top-1 h-5 w-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative flex h-16 w-32 items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-2">
                            <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-gray-600">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              className="h-5 w-5 shrink-0 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <form onSubmit={sendMessage} className="relative flex flex-col gap-2 border-t border-black/[0.06] bg-white p-3 pb-safe">
                {replyTo && (
                  <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-gray-50 px-3 py-2">
                    <Reply className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-500">Trả lời</p>
                      <p className="truncate text-[12px] text-gray-700">{messagePreview(replyTo.content)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="h-6 w-6 shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 inline-flex items-center justify-center"
                      title="Hủy reply"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 rounded-lg border border-black/[0.06] bg-gray-50 p-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="group relative">
                        <div className="h-16 w-16 overflow-hidden rounded-lg border border-black/[0.06] bg-white">
                          {file.type.startsWith('image/') ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                              <Paperclip className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 inline-flex items-center justify-center shadow-sm"
                          title="Xóa"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="mt-1 truncate text-[9px] text-gray-500" style={{ maxWidth: '64px' }}>
                          {file.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  {visibleTelegramCommands.length > 0 && (
                    <div className="absolute bottom-[52px] left-3 right-14 z-20 overflow-hidden rounded-md border border-black/[0.08] bg-white shadow-lg">
                      {visibleTelegramCommands.map(item => (
                        <button
                          key={item.command}
                          type="button"
                          onClick={() => setDraft(`/${item.command} `)}
                          className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <span className="shrink-0 text-[13px] font-semibold text-gray-950">/{item.command}</span>
                          <span className="min-w-0 text-[12px] text-gray-500">{item.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    type="file"
                    id="file-upload"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.txt,.zip,.rar"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-black/[0.06] text-gray-600 hover:bg-gray-50"
                    title="Đính kèm file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </label>
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Nhập phản hồi (hoặc dán ảnh Cmd+V)"
                    className="min-w-0 flex-1 rounded-md border border-black/[0.06] bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-gray-300"
                  />
                  <button
                    disabled={sending || uploading || (!draft.trim() && attachments.length === 0)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-950 px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    {uploading ? 'Đang tải...' : 'Gửi'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm font-semibold text-gray-400">
              Chọn một hội thoại
            </div>
          )}
        </section>
      </div>
      {(telegramQr || qr) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[calc(100vh-2rem)] overflow-auto rounded-md bg-white p-5 text-center shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-gray-800">{qr ? 'Zalo' : 'Telegram'}</span>
              <button
                type="button"
                onClick={() => {
                  setQr(null)
                  setQrSession('')
                  setTelegramQr(null)
                  setTelegramQrSession('')
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/[0.06] text-gray-500 hover:bg-gray-50"
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {telegramQr && !qr && (
              <img src={telegramQr.qr} alt="Telegram QR" className="h-[min(76vw,520px)] w-[min(76vw,520px)] object-contain" />
            )}
            {qr && (
              <img src={qr} alt="Zalo QR" className="h-[min(76vw,520px)] w-[min(76vw,520px)] bg-white object-contain [image-rendering:pixelated]" />
            )}
            {qr && (
              <button
                type="button"
                onClick={startZaloQr}
                className="mt-3 h-8 rounded-md border border-black/[0.08] px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50"
              >
                Làm mới QR
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
