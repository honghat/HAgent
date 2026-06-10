import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Image,
  Images,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react'

const API = '/api/google/photos'
const auth = token => (token ? { Authorization: `Bearer ${token}` } : {})
const PICKER_SESSION_STORE = 'hagent_google_photos_picker_sessions'

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { detail: text }
  }
}

function itemBaseUrl(item) {
  return item?.mediaFile?.baseUrl || item?.baseUrl || ''
}

function thumbUrl(item, options = {}, size = 'w720-h540') {
  if (item?.id && options.accountId && options.sessionId) {
    const params = new URLSearchParams({
      account_id: options.accountId,
      session_id: options.sessionId,
      media_id: item.id,
      size,
    })
    if (options.token) params.set('t', options.token)
    return `${API}/picker/media-file?${params}`
  }
  const baseUrl = itemBaseUrl(item)
  return baseUrl ? `${baseUrl}=${size}` : ''
}

function itemCreatedAt(item) {
  return item?.createTime || item?.mediaMetadata?.creationTime || item?.mediaMetadata?.creation_time || ''
}

function itemMimeType(item) {
  return item?.mediaFile?.mimeType || item?.mimeType || ''
}

function fmtDate(value) {
  if (!value) return 'Chưa có ngày'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa có ngày'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mimeLabel(value) {
  if (!value) return 'Media'
  if (value.startsWith('image/')) return value.replace('image/', '').toUpperCase()
  if (value.startsWith('video/')) return value.replace('video/', '').toUpperCase()
  return value
}

function isVideo(item) {
  return item?.type === 'VIDEO' || String(itemMimeType(item)).startsWith('video/')
}

function itemTitle(item) {
  return item?.mediaFile?.filename || item?.filename || item?.description || item?.id || 'Google Photos item'
}

function itemSessionId(item) {
  return item?.__sessionId || ''
}

function itemKey(item) {
  return `${itemSessionId(item)}:${item?.id || ''}`
}

function tagPickerItem(item, session, index) {
  return {
    ...item,
    __sessionId: session.id,
    __sessionIndex: index,
    __key: `${session.id}:${item.id}`,
  }
}

function readPickerSessionStore() {
  try {
    const data = JSON.parse(localStorage.getItem(PICKER_SESSION_STORE) || '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function normalizeStoredPickerSession(session) {
  if (!session?.id) return null
  const removedMediaIds = Array.isArray(session.removedMediaIds)
    ? session.removedMediaIds.map(id => String(id || '').trim()).filter(Boolean)
    : []
  return {
    id: session.id,
    pickerUri: session.pickerUri || '',
    mediaItemsSet: Boolean(session.mediaItemsSet),
    expireTime: session.expireTime || '',
    pickingConfig: session.pickingConfig || null,
    removedMediaIds: [...new Set(removedMediaIds)],
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function loadStoredPickerSessionRecord(accountId) {
  if (!accountId) return { activeSessionId: '', sessions: [] }
  const data = readPickerSessionStore()
  const value = data[accountId]
  if (!value) return { activeSessionId: '', sessions: [] }
  if (Array.isArray(value.sessions)) {
    const sessions = value.sessions.map(normalizeStoredPickerSession).filter(Boolean)
    const activeSessionId = sessions.some(session => session.id === value.activeSessionId)
      ? value.activeSessionId
      : sessions[0]?.id || ''
    return { activeSessionId, sessions }
  }
  const legacySession = normalizeStoredPickerSession(value)
  return {
    activeSessionId: legacySession?.id || '',
    sessions: legacySession ? [legacySession] : [],
  }
}

function saveStoredPickerSessionRecord(accountId, record) {
  if (!accountId) return
  const sessions = (record.sessions || []).map(normalizeStoredPickerSession).filter(Boolean)
  const activeSessionId = sessions.some(session => session.id === record.activeSessionId)
    ? record.activeSessionId
    : sessions[0]?.id || ''
  const data = readPickerSessionStore()
  data[accountId] = { activeSessionId, sessions }
  localStorage.setItem(PICKER_SESSION_STORE, JSON.stringify(data))
}

function saveStoredPickerSession(accountId, session, { makeActive = true } = {}) {
  if (!accountId || !session?.id) return
  const record = loadStoredPickerSessionRecord(accountId)
  const normalized = normalizeStoredPickerSession(session)
  if (!normalized) return
  const existingIndex = record.sessions.findIndex(item => item.id === session.id)
  const sessions = [...record.sessions]
  if (existingIndex >= 0) {
    normalized.removedMediaIds = sessions[existingIndex].removedMediaIds || normalized.removedMediaIds
    sessions[existingIndex] = normalized
  } else {
    sessions.push(normalized)
  }
  saveStoredPickerSessionRecord(accountId, {
    activeSessionId: makeActive ? normalized.id : record.activeSessionId,
    sessions,
  })
}

function removeStoredPickerItems(accountId, sessionId, mediaIds) {
  const record = loadStoredPickerSessionRecord(accountId)
  const removeSet = new Set(mediaIds.map(id => String(id || '').trim()).filter(Boolean))
  if (!sessionId || removeSet.size === 0) return record
  const sessions = record.sessions.map(session => {
    if (session.id !== sessionId) return session
    return {
      ...session,
      removedMediaIds: [...new Set([...(session.removedMediaIds || []), ...removeSet])],
      updatedAt: new Date().toISOString(),
    }
  })
  saveStoredPickerSessionRecord(accountId, { ...record, sessions })
  return loadStoredPickerSessionRecord(accountId)
}

function storedRemovedMediaSet(accountId, sessionId) {
  const record = loadStoredPickerSessionRecord(accountId)
  const session = record.sessions.find(item => item.id === sessionId)
  return new Set(session?.removedMediaIds || [])
}

function EmptyState({ icon: Icon = Images, title, detail, action }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm ring-1 ring-black/[0.08]">
          <Icon size={22} className={Icon === Loader2 ? 'animate-spin' : ''} />
        </div>
        <h3 className="mt-3 text-sm font-bold text-gray-950">{title}</h3>
        {detail && <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export default function GooglePhotosManager({ token }) {
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [clientSecretReady, setClientSecretReady] = useState(false)
  const [pickerSession, setPickerSession] = useState(null)
  const [pickerSessions, setPickerSessions] = useState([])
  const [pickerMedia, setPickerMedia] = useState([])
  const [pickerMediaTokens, setPickerMediaTokens] = useState({})
  const [pickerLoadedSessionId, setPickerLoadedSessionId] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [previewItem, setPreviewItem] = useState(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState('')
  const [pickerLoading, setPickerLoading] = useState(false)
  const [error, setError] = useState('')
  const accountMenuRef = useRef(null)

  const selectedAccount = useMemo(
    () => accounts.find(account => account.id === accountId) || null,
    [accounts, accountId],
  )
  const pickerReady = Boolean(selectedAccount?.pickerReady)
  const media = pickerMedia
  const mediaToken = Object.values(pickerMediaTokens).some(Boolean)
  const loading = pickerLoading
  const selectedCount = selectedIds.size
  const permissionReady = Boolean(selectedAccount && pickerReady)
  const permissionMissing = !permissionReady
  const filteredMedia = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return media
    return media.filter(item => {
      const haystack = [
        itemTitle(item),
        item.description,
        itemMimeType(item),
        item.id,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [media, query])
  const readySessionKey = useMemo(
    () => pickerSessions.filter(session => session.mediaItemsSet).map(session => session.id).join('|'),
    [pickerSessions],
  )
  const allVisibleSelected = filteredMedia.length > 0 && filteredMedia.every(item => selectedIds.has(itemKey(item)))
  const previewIndex = previewItem ? filteredMedia.findIndex(item => itemKey(item) === itemKey(previewItem)) : -1
  const previewSelected = previewItem ? selectedIds.has(itemKey(previewItem)) : false
  const previewSrc = previewItem ? thumbUrl(previewItem, {
    accountId,
    sessionId: itemSessionId(previewItem) || pickerSession?.id || '',
    token,
  }, 'w2200-h1600') : ''
  const accountReadyForPicker = useCallback(account => Boolean(account?.pickerReady), [])

  const movePreview = useCallback(direction => {
    setPreviewItem(current => {
      if (!current || filteredMedia.length < 2) return current
      const currentIndex = filteredMedia.findIndex(item => itemKey(item) === itemKey(current))
      if (currentIndex < 0) return current
      const nextIndex = (currentIndex + direction + filteredMedia.length) % filteredMedia.length
      return filteredMedia[nextIndex]
    })
  }, [filteredMedia])

  const loadAccounts = useCallback(async () => {
    if (!token) return
    setBusy('accounts')
    setError('')
    try {
      const res = await fetch(`${API}/accounts`, { headers: auth(token) })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được tài khoản Google')
      const nextAccounts = Array.isArray(data.accounts) ? data.accounts : []
      setAccounts(nextAccounts)
      setClientSecretReady(Boolean(data.clientSecretReady))
      setAccountId(current => {
        if (nextAccounts.some(account => account.id === current)) return current
        return nextAccounts.find(account => account.isDefault && account.pickerReady)?.id
          || nextAccounts.find(account => account.isDefault)?.id
          || nextAccounts.find(account => account.pickerReady)?.id
          || nextAccounts[0]?.id
          || ''
      })
    } catch (err) {
      setError(err.message || 'Không tải được tài khoản Google')
    } finally {
      setBusy('')
    }
  }, [token])

  const loadPickerMedia = useCallback(async ({ append = false, sessionId = '', sessions = null } = {}) => {
    const sourceSessions = Array.isArray(sessions)
      ? sessions
      : (sessionId
          ? pickerSessions.filter(session => session.id === sessionId)
          : pickerSessions.filter(session => session.mediaItemsSet))
    const activeSessions = sourceSessions.filter(session => (
      session?.id && session.mediaItemsSet && (!append || pickerMediaTokens[session.id])
    ))
    if (!token || !accountId || !pickerReady || activeSessions.length === 0) return
    setPickerLoading(true)
    setError('')
    if (!append) setSelectedIds(new Set())
    try {
      const results = await Promise.all(activeSessions.map(async (session, index) => {
        const params = new URLSearchParams({
          account_id: accountId,
          session_id: session.id,
          page_size: '60',
        })
        const nextToken = append ? pickerMediaTokens[session.id] : ''
        if (nextToken) params.set('page_token', nextToken)
        const res = await fetch(`${API}/picker/media?${params}`, { headers: auth(token) })
        const data = await readJsonResponse(res)
        if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được ảnh đã chọn')
        const removedIds = storedRemovedMediaSet(accountId, session.id)
        const items = (Array.isArray(data.mediaItems) ? data.mediaItems : [])
          .filter(item => item?.id && !removedIds.has(item.id))
          .map(item => tagPickerItem(item, session, index))
        return { sessionId: session.id, items, nextPageToken: data.nextPageToken || '' }
      }))
      const nextTokens = { ...(append ? pickerMediaTokens : {}) }
      results.forEach(result => {
        nextTokens[result.sessionId] = result.nextPageToken
      })
      const nextMedia = results.flatMap(result => result.items)
      setPickerMedia(prev => {
        if (!append) return nextMedia
        const seen = new Set(prev.map(item => item.__key || itemKey(item)))
        const merged = [...prev]
        nextMedia.forEach(item => {
          const key = item.__key || itemKey(item)
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(item)
          }
        })
        return merged
      })
      setPickerMediaTokens(nextTokens)
      setPickerLoadedSessionId(activeSessions.map(session => session.id).join('|'))
    } catch (err) {
      setError(err.message || 'Không tải được ảnh đã chọn')
    } finally {
      setPickerLoading(false)
    }
  }, [accountId, pickerMediaTokens, pickerReady, pickerSessions, token])

  const checkPickerSession = useCallback(async (sessionId = '') => {
    const activeSessionId = sessionId || pickerSession?.id
    if (!token || !accountId || !pickerReady || !activeSessionId) return null
    const params = new URLSearchParams({ account_id: accountId })
    const res = await fetch(`${API}/picker/sessions/${encodeURIComponent(activeSessionId)}?${params}`, { headers: auth(token) })
    const data = await readJsonResponse(res)
    if (!res.ok) throw new Error(data.detail || data.error || 'Không kiểm tra được phiên chọn ảnh')
    const session = data.session || null
    setPickerSession(session)
    saveStoredPickerSession(accountId, session)
    setPickerSessions(loadStoredPickerSessionRecord(accountId).sessions)
    return session
  }, [accountId, pickerReady, pickerSession?.id, token])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    if (!accountMenuOpen) return undefined
    const close = event => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [accountMenuOpen])

  useEffect(() => {
    if (!pending?.state || !token) return undefined
    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/google/accounts/pending/${encodeURIComponent(pending.state)}`, { headers: auth(token) })
        const data = await readJsonResponse(res)
        if (!res.ok || stopped || data.status === 'pending') return
        if (data.status === 'success') {
          setPending(null)
          await loadAccounts()
          return
        }
        if (data.status === 'error' || data.status === 'expired') {
          setPending(null)
          setError(data.error || 'Phiên cấp quyền Google Photos đã hết hạn')
        }
      } catch {
        // Poll lại ở vòng sau để tránh báo lỗi khi tab OAuth chưa kịp đóng.
      }
    }
    poll()
    const timer = window.setInterval(poll, 1500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [loadAccounts, pending?.state, token])

  useEffect(() => {
    const record = loadStoredPickerSessionRecord(accountId)
    const activeSession = record.sessions.find(session => session.id === record.activeSessionId) || record.sessions[0] || null
    setPickerSessions(record.sessions)
    setPickerSession(activeSession)
    setPickerMedia([])
    setPickerMediaTokens({})
    setPickerLoadedSessionId('')
    setSelectedIds(new Set())
    setPreviewItem(null)
  }, [accountId])

  useEffect(() => {
    if (!previewItem) return undefined
    const handleKey = event => {
      if (event.key === 'Escape') setPreviewItem(null)
      if (event.key === 'ArrowLeft') movePreview(-1)
      if (event.key === 'ArrowRight') movePreview(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [movePreview, previewItem])

  useEffect(() => {
    if (!pickerSession?.id || pickerSession.mediaItemsSet || !pickerReady) return undefined
    let stopped = false
    const poll = async () => {
      try {
        const session = await checkPickerSession(pickerSession.id)
        if (stopped || !session) return
        if (session.mediaItemsSet) {
          const record = loadStoredPickerSessionRecord(accountId)
          await loadPickerMedia({ sessions: record.sessions.filter(item => item.mediaItemsSet) })
        }
      } catch {
        // Picker session có thể chưa sẵn sàng, tiếp tục poll.
      }
    }
    const timer = window.setInterval(poll, 1800)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [accountId, checkPickerSession, loadPickerMedia, pickerReady, pickerSession?.id, pickerSession?.mediaItemsSet])

  useEffect(() => {
    if (!pickerReady || !readySessionKey) return
    if (pickerLoadedSessionId !== readySessionKey) {
      loadPickerMedia({ sessions: pickerSessions.filter(session => session.mediaItemsSet) })
    }
  }, [loadPickerMedia, pickerLoadedSessionId, pickerReady, pickerSessions, readySessionKey])

  const startOAuth = async () => {
    if (!token) return
    if (!clientSecretReady) {
      setError('Chưa có google_client_secret.json để cấp quyền Google Photos')
      return
    }
    setBusy('oauth')
    setError('')
    try {
      const res = await fetch('/api/google/accounts/auth-url', {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedAccount?.email || '',
          scope_group: 'workspace_photos',
        }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tạo được link Google Photos')
      setPending({ state: data.state, authUrl: data.authUrl })
      window.open(data.authUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err.message || 'Không tạo được link Google Photos')
    } finally {
      setBusy('')
    }
  }

  const setDefaultAccount = async id => {
    if (!token || !id) return
    setBusy('default-account')
    setError('')
    try {
      const res = await fetch(`/api/google/accounts/${encodeURIComponent(id)}/default`, {
        method: 'POST',
        headers: auth(token),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không đặt được email mặc định')
      setAccountId(id)
      await loadAccounts()
      setAccountMenuOpen(false)
    } catch (err) {
      setError(err.message || 'Không đặt được email mặc định')
    } finally {
      setBusy('')
    }
  }

  const createPickerSession = async () => {
    if (!token || !accountId) return
    if (!pickerReady) {
      setError('Tài khoản cần cấp thêm quyền Google Photos Picker')
      return
    }
    setBusy('picker')
    setError('')
    try {
      const res = await fetch(`${API}/picker/sessions`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, max_item_count: 2000 }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tạo được phiên chọn ảnh')
      const session = data.session || null
      setPickerSession(session)
      saveStoredPickerSession(accountId, session)
      setPickerSessions(loadStoredPickerSessionRecord(accountId).sessions)
      if (session?.pickerUri) {
        window.open(session.pickerUri, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setError(err.message || 'Không tạo được phiên chọn ảnh')
    } finally {
      setBusy('')
    }
  }

  const openPicker = () => {
    if (pickerSession?.pickerUri) {
      window.open(pickerSession.pickerUri, '_blank', 'noopener,noreferrer')
    }
  }

  const refreshAll = async () => {
    await loadAccounts()
    if (pickerSessions.length > 0) {
      for (const session of pickerSessions) {
        if (!session.mediaItemsSet) {
          await checkPickerSession(session.id)
        }
      }
      const record = loadStoredPickerSessionRecord(accountId)
      if (record.sessions.some(session => session.mediaItemsSet)) {
        await loadPickerMedia({ sessions: record.sessions.filter(session => session.mediaItemsSet) })
      }
    }
  }

  const refreshPickerSelection = async () => {
    if (!pickerSession?.id) return
    setBusy('picker-check')
    setError('')
    try {
      const session = await checkPickerSession(pickerSession.id)
      if (session?.mediaItemsSet) {
        const record = loadStoredPickerSessionRecord(accountId)
        await loadPickerMedia({ sessions: record.sessions.filter(item => item.mediaItemsSet) })
      }
    } catch (err) {
      setError(err.message || 'Không kiểm tra được ảnh đã chọn')
    } finally {
      setBusy('')
    }
  }

  const toggleItem = item => {
    const key = itemKey(item)
    if (!key) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        filteredMedia.forEach(item => next.delete(itemKey(item)))
      } else {
        filteredMedia.forEach(item => next.add(itemKey(item)))
      }
      return next
    })
  }

  const deletePickerItems = items => {
    const targetItems = Array.isArray(items)
      ? items.filter(item => item?.id && itemSessionId(item))
      : pickerMedia.filter(item => selectedIds.has(itemKey(item)))
    if (targetItems.length === 0) return
    const label = targetItems.length === 1 ? 'ảnh này' : `${targetItems.length} ảnh đã chọn`
    if (!window.confirm(`Xoá ${label} khỏi phiên này? Ảnh gốc trong Google Photos không bị xoá.`)) return
    const grouped = targetItems.reduce((map, item) => {
      const sessionId = itemSessionId(item)
      map.set(sessionId, [...(map.get(sessionId) || []), item.id])
      return map
    }, new Map())
    let record = loadStoredPickerSessionRecord(accountId)
    grouped.forEach((mediaIds, sessionId) => {
      record = removeStoredPickerItems(accountId, sessionId, mediaIds)
    })
    const deleteKeys = new Set(targetItems.map(item => itemKey(item)))
    const remainingVisible = filteredMedia.filter(item => !deleteKeys.has(itemKey(item)))
    setPickerSessions(record.sessions)
    setPickerSession(current => record.sessions.find(session => session.id === current?.id) || current)
    setPickerMedia(prev => prev.filter(item => !deleteKeys.has(itemKey(item))))
    setSelectedIds(prev => {
      const next = new Set(prev)
      deleteKeys.forEach(key => next.delete(key))
      return next
    })
    setPreviewItem(current => {
      if (!current || !deleteKeys.has(itemKey(current))) return current
      return remainingVisible[0] || null
    })
  }

  const loadMore = () => {
    loadPickerMedia({ append: true })
  }

  const permissionClass = permissionMissing
    ? 'bg-gray-950 text-white hover:bg-black'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
  const permissionLabel = busy === 'oauth' ? 'Đang cấp quyền' : (permissionMissing ? 'Cấp quyền' : 'Đã cấp quyền')
  const PermissionIcon = busy === 'oauth' ? Loader2 : (permissionMissing ? ShieldAlert : Check)

  const connectAction = (
    <button
      type="button"
      onClick={startOAuth}
      disabled={busy === 'oauth' || !clientSecretReady}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors disabled:opacity-50 ${permissionClass}`}
    >
      <PermissionIcon size={14} className={busy === 'oauth' ? 'animate-spin' : ''} />
      {permissionLabel}
    </button>
  )

  const pickerAction = (
    <button
      type="button"
      onClick={createPickerSession}
      disabled={busy === 'picker' || !pickerReady}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-gray-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-black disabled:opacity-50"
    >
      {busy === 'picker' ? <Loader2 size={14} className="animate-spin" /> : <Images size={14} />}
      Mở Google Photos
    </button>
  )

  const mainEmpty = (() => {
    if (!clientSecretReady) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Thiếu Google client secret"
          detail="Cần cấu hình google_client_secret.json trước khi cấp quyền Google Photos."
        />
      )
    }
    if (accounts.length === 0) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Chưa có tài khoản Google"
          detail="Kết nối tài khoản Google để dùng Photos."
          action={connectAction}
        />
      )
    }
    if (selectedAccount && !pickerReady) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Cần cấp quyền Photos"
          detail={selectedAccount.pickerMissingScopeLabels?.join(', ') || 'Cấp quyền để chọn ảnh từ thư viện.'}
          action={connectAction}
        />
      )
    }
    if (loading && media.length === 0) {
      return (
        <EmptyState
          icon={Loader2}
          title="Đang tải Google Photos"
          detail="Đang lấy danh sách ảnh từ thư viện cá nhân."
        />
      )
    }
    if (pickerSession?.id && !pickerSession.mediaItemsSet && media.length === 0) {
      return (
        <EmptyState
          icon={Images}
          title="Chờ hoàn tất chọn ảnh"
          detail="Bấm Done trong cửa sổ Google Photos rồi kiểm tra lại."
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              {pickerSession.pickerUri && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-gray-950 px-3 text-xs font-bold text-white hover:bg-black"
                >
                  <ExternalLink size={13} />
                  Mở lại
                </button>
              )}
              <button
                type="button"
                onClick={refreshPickerSelection}
                disabled={busy === 'picker-check'}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === 'picker-check' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Kiểm tra
              </button>
            </div>
          )}
        />
      )
    }
    if (filteredMedia.length === 0) {
      return (
        <EmptyState
          icon={Images}
          title={query ? 'Không có ảnh khớp tìm kiếm' : 'Chưa chọn ảnh từ thư viện'}
          detail="Mở Google Photos và chọn ảnh cần dùng."
          action={pickerAction}
        />
      )
    }
    return null
  })()

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-100 text-gray-950">
      <div className="shrink-0 border-b border-black/[0.08] bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Images size={17} className="text-gray-800" />
            <h2 className="truncate text-sm font-bold text-gray-950">Google Photos</h2>
            <span className="hidden text-[11px] font-semibold text-gray-500 sm:inline">Thư viện cá nhân</span>
          </div>

          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <div ref={accountMenuRef} className="relative w-[220px] min-w-0 sm:w-[260px]">
              <button
                type="button"
                onClick={() => setAccountMenuOpen(value => !value)}
                disabled={accounts.length === 0}
                className="flex h-8 w-full items-center gap-2 rounded-md border border-black/[0.08] bg-white px-2.5 text-left text-xs font-semibold text-gray-800 outline-none transition-colors hover:border-gray-300 disabled:text-gray-400"
                title={selectedAccount?.email || 'Chưa kết nối Google'}
              >
                <span className="min-w-0 flex-1 truncate">{selectedAccount?.email || 'Chưa kết nối Google'}</span>
                {selectedAccount?.isDefault && <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" />}
                <span className={`h-2 w-2 shrink-0 rounded-full ${permissionReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 top-9 z-50 max-h-72 w-full overflow-y-auto rounded-lg border border-black/[0.08] bg-white p-1 shadow-xl">
                  {accounts.length === 0 ? (
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400">Chưa có tài khoản</div>
                  ) : accounts.map(account => {
                    const active = account.id === accountId
                    const ready = accountReadyForPicker(account)
                    return (
                      <div
                        key={account.id}
                        className={`flex w-full items-center gap-1 rounded-md transition-colors ${
                          active ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setAccountId(account.id)
                            setAccountMenuOpen(false)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{account.email}</span>
                          {account.isDefault && (
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700'
                            }`}>
                              Mặc định
                            </span>
                          )}
                          {active && <Check size={13} className="shrink-0" />}
                        </button>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            setDefaultAccount(account.id)
                          }}
                          disabled={busy === 'default-account' || account.isDefault}
                          className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            account.isDefault
                              ? 'text-amber-500'
                              : active
                                ? 'text-white/60 hover:bg-white/15 hover:text-amber-300'
                                : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                          } disabled:opacity-80`}
                          title={account.isDefault ? 'Email mặc định' : 'Đặt làm email mặc định'}
                          aria-label={account.isDefault ? 'Email mặc định' : 'Đặt làm email mặc định'}
                        >
                          {busy === 'default-account' ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Star size={13} className={account.isDefault ? 'fill-current' : ''} />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {permissionMissing && (
              <button
                type="button"
                onClick={startOAuth}
                disabled={busy === 'oauth' || !clientSecretReady}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors disabled:opacity-50 ${permissionClass}`}
                title="Cấp quyền Google Photos"
              >
                <PermissionIcon size={14} className={busy === 'oauth' ? 'animate-spin' : ''} />
                {permissionLabel}
              </button>
            )}

            {pickerAction}

            {pickerSession?.pickerUri && !pickerSession.mediaItemsSet && (
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink size={13} />
                Mở lại
              </button>
            )}

            {pickerSession?.id && !pickerSession.mediaItemsSet && (
              <button
                type="button"
                onClick={refreshPickerSelection}
                disabled={busy === 'picker-check'}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === 'picker-check' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Kiểm tra
              </button>
            )}

            <button
              type="button"
              onClick={refreshAll}
              disabled={busy === 'accounts' || pickerLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/[0.08] bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              title="Làm mới"
              aria-label="Làm mới"
            >
              <RefreshCw size={14} className={busy === 'accounts' || pickerLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm ảnh..."
              className="h-8 w-full rounded-md border border-black/[0.1] bg-white pl-8 pr-3 text-xs outline-none focus:border-gray-500"
            />
          </div>

          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={filteredMedia.length === 0}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/[0.08] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            title={allVisibleSelected ? 'Bỏ chọn trang' : 'Chọn trang'}
            aria-label={allVisibleSelected ? 'Bỏ chọn trang' : 'Chọn trang'}
          >
            <Check size={14} />
          </button>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => deletePickerItems()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 hover:bg-red-50"
              title="Xoá ảnh đã chọn khỏi phiên"
              aria-label="Xoá ảnh đã chọn khỏi phiên"
            >
              <Trash2 size={14} />
            </button>
          )}

          <span className="hidden shrink-0 text-[11px] font-semibold text-gray-500 sm:block">
            {filteredMedia.length}{query ? `/${media.length}` : ''} ảnh{selectedCount ? ` · chọn ${selectedCount}` : ''}
          </span>
        </div>

        {pending?.state && (
          <div className="mt-2 text-[11px] font-semibold text-amber-700">Đang chờ cấp quyền Google</div>
        )}

        {error && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-700 ring-1 ring-red-100">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 leading-5">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="mt-0.5 text-current opacity-70 hover:opacity-100"
              aria-label="Đóng thông báo"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
        {mainEmpty || (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredMedia.map(item => {
                const selected = selectedIds.has(itemKey(item))
                const video = isVideo(item)
                const imageSrc = thumbUrl(item, {
                  accountId,
                  sessionId: itemSessionId(item) || pickerSession?.id || '',
                  token,
                })
                return (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewItem(item)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setPreviewItem(item)
                      }
                    }}
                    className={`group overflow-hidden rounded-lg border bg-white text-left shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-gray-900/20 ${
                      selected ? 'border-gray-950 ring-2 ring-gray-900/10' : 'border-black/[0.08] hover:border-gray-300'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-gray-200">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={itemTitle(item)}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          {video ? <Video size={30} /> : <Image size={30} />}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); toggleItem(item) }}
                        className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border text-white shadow-sm transition-colors ${
                          selected ? 'border-gray-950 bg-gray-950' : 'border-white/80 bg-black/35 hover:bg-black/55'
                        }`}
                        aria-label={selected ? 'Bỏ chọn media' : 'Chọn media'}
                      >
                        {selected && <Check size={15} />}
                      </button>

                      {video && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-bold text-white">
                          <Video size={11} />
                          Video
                        </span>
                      )}
                    </div>

                    <div className="px-2.5 py-2">
                      <p className="truncate text-xs font-bold text-gray-950" title={itemTitle(item)}>
                        {itemTitle(item)}
                      </p>
                      <p className="mt-0.5 truncate text-[10.5px] text-gray-500">
                        {fmtDate(itemCreatedAt(item))} · {mimeLabel(itemMimeType(item))}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>

            {mediaToken && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-3 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Tải thêm ảnh
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {previewItem && (
        <div
          className="fixed inset-0 z-[80] bg-black text-white"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-2 bg-black/75 px-3 backdrop-blur sm:px-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{itemTitle(previewItem)}</p>
              <p className="truncate text-[11px] text-white/55">
                {fmtDate(itemCreatedAt(previewItem))} · {mimeLabel(itemMimeType(previewItem))}
                {previewIndex >= 0 && ` · ${previewIndex + 1}/${filteredMedia.length}`}
              </p>
            </div>
            <button
              type="button"
              onClick={event => { event.stopPropagation(); toggleItem(previewItem) }}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold ${
                previewSelected ? 'bg-white text-gray-950' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Check size={14} />
              {previewSelected ? 'Đã chọn' : 'Chọn'}
            </button>
            <button
              type="button"
              onClick={event => { event.stopPropagation(); deletePickerItems([previewItem]) }}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-red-600"
              aria-label="Xoá ảnh khỏi phiên"
              title="Xoá ảnh khỏi phiên"
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              onClick={event => { event.stopPropagation(); setPreviewItem(null) }}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
              aria-label="Đóng xem ảnh"
            >
              <X size={16} />
            </button>
          </div>

          {filteredMedia.length > 1 && (
            <>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); movePreview(-1) }}
                className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-white/10 text-white backdrop-blur hover:bg-white/20 sm:left-4"
                aria-label="Ảnh trước"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); movePreview(1) }}
                className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-white/10 text-white backdrop-blur hover:bg-white/20 sm:right-4"
                aria-label="Ảnh sau"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <div
            className="flex h-full w-full items-center justify-center px-2 pb-4 pt-16 sm:px-16 sm:pb-6"
            onClick={event => event.stopPropagation()}
          >
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={itemTitle(previewItem)}
                className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white/35">
                {isVideo(previewItem) ? <Video size={48} /> : <Image size={48} />}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
