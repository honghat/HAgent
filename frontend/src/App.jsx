import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import Login from './components/Login.jsx'
import { AgentStoreProvider } from './lib/AgentStore.jsx'
import ChatHub from './components/ChatHub.jsx'
import Wiki from './components/Wiki.jsx'
import UserSettings from './components/UserSettings.jsx'
import AutomationHub from './components/AutomationHub.jsx'
import LearningHub from './components/LearningHub.jsx'
import SystemHub from './components/SystemHub.jsx'
import EntertainmentHub from './components/EntertainmentHub.jsx'
import AdminHub from './components/AdminHub.jsx'
import PersonalHub from './components/PersonalHub.jsx'
import BlogHub from './components/BlogHub.jsx'
import { GlobalToastViewport } from './components/Toast.jsx'
import { getDeviceCredentials, isSignedOut, saveDeviceCredentials, setSignedOut } from './lib/deviceAuth.js'
import { canAccess } from './lib/permissions.js'

const TOP_TABS = ['blog', 'chat', 'system', 'automation', 'learning', 'personal', 'entertainment', 'settings', 'admin']

function readStorage(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function readLaunchParams() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const view = params.get('view') || params.get('hagent_view') || ''
  const entertainmentTab = params.get('entertainment_tab') || params.get('hagent_entertainment_tab') || ''
  const videoId = (params.get('video_id') || params.get('hagent_video_id') || '').trim()
  return {
    view: ['blog', 'chat', 'wiki', 'automation', 'learning', 'personal', 'system', 'settings', 'entertainment', 'admin'].includes(view) ? view : '',
    entertainmentTab: ['browse', 'detail', 'reader', 'video', 'app-api'].includes(entertainmentTab) ? entertainmentTab : '',
    videoId: /^[A-Za-z0-9_-]{1,80}$/.test(videoId) ? videoId : '',
  }
}

function applyLaunchParams() {
  const params = readLaunchParams()
  if (params.view) writeStorage('hagent_view', params.view)
  if (params.entertainmentTab) writeStorage('hagent_entertainment_tab', params.entertainmentTab)
  if (params.videoId) writeStorage('hagent_entertainment_active_video', params.videoId)
  if (params.videoId) writeStorage('hagent_entertainment_force_start_video', params.videoId)
  return params
}

function resetMobileViewportZoom() {
  if (typeof window === 'undefined' || window.innerWidth > 640) return

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur()
  }

  const viewport = document.querySelector('meta[name="viewport"]')
  const lockedViewport = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
  if (viewport) {
    viewport.setAttribute('content', lockedViewport)
  }

  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0)
    viewport?.setAttribute('content', lockedViewport)
  })
}

export default function App() {
  const [launchParams] = useState(() => applyLaunchParams())
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(readStorage('token'))
  const [authLoading, setAuthLoading] = useState(!isSignedOut())
  const [view, setView] = useState(() => launchParams.view || readStorage('hagent_view', 'blog'))
  const [provider, setProvider] = useState(readStorage('hagent_provider'))
  const [cxModel, setCxModel] = useState(readStorage('hagent_cx_model', 'cx/gpt-5.5'))
  const [agents, setAgents] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStorage('hagent_sidebar_collapsed') === '1')

  const fetchAgents = () => {
    if (token) {
      fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(list => setAgents(Array.isArray(list) ? list : []))
        .catch(() => setAgents([]))
    }
  }

  const saveProvider = (p) => {
    setProvider(p)
    writeStorage('hagent_provider', p)
    if (token) {
      fetch('/api/auth/provider', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ provider: p })
      }).catch(err => console.error('Failed to sync provider to backend:', err))
    }
  }

  const saveCxModel = (model) => {
    setCxModel(model)
    writeStorage('hagent_cx_model', model)
  }

  const applyUser = (u) => {
    if (!u) return
    setUser({ ...u, displayName: u.display_name || u.displayName || u.username })
    if (u.default_provider) {
      setProvider(u.default_provider)
      writeStorage('hagent_provider', u.default_provider)
    }
  }

  const restoreDeviceSession = async () => {
    if (isSignedOut()) return false
    const device = getDeviceCredentials()
    try {
      const res = await fetch('/api/auth/device-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(device || {}),
      })
      if (!res.ok) return false
      const data = await res.json()
      saveDeviceCredentials({ deviceId: data.deviceId, deviceSecret: data.deviceSecret })
      setSignedOut(false)
      writeStorage('token', data.token)
      setToken(data.token)
      applyUser(data.user)
      return true
    } catch {
      return false
    }
  }

  const handleControlService = (service) => {
    if (!token) return
    fetch('/api/services/control', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ service })
    })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        alert(res.message)
        if (res.provider) saveProvider(res.provider)
      } else {
        alert('Lỗi: ' + res.error)
      }
    })
    .catch(e => alert('Lỗi kết nối: ' + e.message))
  }

  useEffect(() => {
    fetchAgents()
  }, [token])

  useEffect(() => {
    const params = readLaunchParams()
    if (!params.view && !params.entertainmentTab && !params.videoId) return
    if (params.view) setView(params.view)
    if (params.videoId) writeStorage('hagent_entertainment_active_video', params.videoId)
    if (params.videoId) writeStorage('hagent_entertainment_force_start_video', params.videoId)
    if (params.view || params.entertainmentTab || params.videoId) {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`
      window.history.replaceState(null, '', cleanUrl)
    }
  }, [])

  useEffect(() => {
    if (token) {
      writeStorage('token', token)
      fetchUser()
    } else if (!isSignedOut()) {
      restoreDeviceSession().finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (user) resetMobileViewportZoom()
  }, [user])

  useEffect(() => {
    writeStorage('hagent_view', view)
    if (user && view !== 'blog' && view !== 'login') {
      writeStorage('hagent_user_view', view)
    }
  }, [view, user])

  // Ép view về tab cấp-1 được phép theo vai trò.
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      if (view !== 'blog' && view !== 'login') {
        setView('blog')
      }
      return
    }

    if (view === 'login' || (view !== 'blog' && !canAccess(user, view))) {
      const savedUserView = readStorage('hagent_user_view')
      const target = (savedUserView && (savedUserView === 'blog' || canAccess(user, savedUserView)))
        ? savedUserView
        : (TOP_TABS.find(t => t === 'blog' || canAccess(user, t)) || 'blog')
      setView(target)
    }
  }, [user, view, authLoading])

  const fetchUser = async () => {
    if (!token) return
    setAuthLoading(true)
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        applyUser(await r.json())
        return
      }
      if (r.status === 401 && await restoreDeviceSession()) return
      setToken(null)
      setUser(null)
      removeStorage('token')
    } catch (err) {
      console.error('Error fetching user:', err)
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = () => {
    const currentToken = token
    setSignedOut(true)
    setToken(null)
    setUser(null)
    removeStorage('token')
    if (currentToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {})
    }
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      const next = !value
      writeStorage('hagent_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  if (authLoading && !user) {
    return <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center text-sm font-medium text-gray-400">Đang kiểm tra phiên...</div>
  }

  return (
    <AgentStoreProvider>
    <div className="relative flex flex-col overflow-hidden bg-[var(--color-bg)] text-gray-950 sm:flex-row" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
      <GlobalToastViewport />
      {user && (
        <>
          <Header
            user={user}
            view={view}
            collapsed={sidebarCollapsed}
            onViewChange={setView}
            onControlService={handleControlService}
            onToggleCollapse={toggleSidebar}
            onLogout={logout}
          />
          <button
            type="button"
            onClick={toggleSidebar}
            className={`hidden sm:flex fixed top-1/2 z-[120] h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-black/[0.16] bg-white/90 text-gray-400 shadow-[0_8px_24px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all hover:w-7 hover:bg-white hover:text-gray-950 ${sidebarCollapsed ? 'left-0' : 'left-44'}`}
            title={sidebarCollapsed ? 'Hiện sidebar' : 'Ẩn sidebar'}
            aria-label={sidebarCollapsed ? 'Hiện sidebar' : 'Ẩn sidebar'}
          >
            <svg className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {view === 'login' && <Login onLogin={(t, u) => { resetMobileViewportZoom(); setSignedOut(false); setToken(t); applyUser(u); const savedUserView = readStorage('hagent_user_view'); setView(savedUserView && canAccess(u, savedUserView) ? savedUserView : (canAccess(u, 'chat') ? 'chat' : (TOP_TABS.find(tab => canAccess(u, tab)) || 'chat'))); }} showBackToBlog={true} onBackToBlog={() => setView('blog')} />}
          {view === 'blog' && <BlogHub user={user} token={token} onViewChange={setView} />}
          {view === 'chat' && <ChatHub token={token} provider={provider} cxModel={cxModel} agents={agents} user={user} onProviderChange={saveProvider} onShowAgentManager={() => setView('settings')} onLogout={logout} />}
          {view === 'wiki' && <Wiki token={token} provider={provider} />}
          {view === 'automation' && <AutomationHub token={token} provider={provider} cxModel={cxModel} user={user} />}
          {view === 'learning' && <LearningHub token={token} provider={provider} cxModel={cxModel} user={user} />}
          {view === 'system' && <SystemHub token={token} provider={provider} user={user} />}
          {view === 'settings' && <UserSettings token={token} user={user} provider={provider} cxModel={cxModel} onCxModelChange={saveCxModel} onProviderChange={saveProvider} onUpdate={fetchUser} onLogout={logout} agents={agents} onAgentsUpdate={fetchAgents} />}
          {view === 'entertainment' && <EntertainmentHub token={token} provider={provider} cxModel={cxModel} user={user} />}
          {view === 'personal' && <PersonalHub token={token} user={user} />}
          {view === 'admin' && <AdminHub token={token} currentUser={user} />}
      </main>
    </div>
    </AgentStoreProvider>
  )
}
