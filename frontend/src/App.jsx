import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import Chat from './components/Chat.jsx'
import Wiki from './components/Wiki.jsx'
import Login from './components/Login.jsx'
import AgentSkillManager from './components/AgentSkillManager.jsx'
import VideoPage from './components/video/VideoPage.jsx'
import UserSettings from './components/UserSettings.jsx'
import OmniChat from './components/OmniChat.jsx'
import JobHunter from './components/JobHunter.jsx'
import PortManager from './components/PortManager.jsx'
import CodeWorkspace from './components/CodeWorkspace.jsx'
import Learn from './components/Learn.jsx'
import English from './components/English.jsx'
import Evolution from './components/Evolution.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [view, setView] = useState('chat')
  const [provider, setProvider] = useState(localStorage.getItem('hagent_provider') || 'cx')
  const [cxModel, setCxModel] = useState(localStorage.getItem('hagent_cx_model') || 'cx/gpt-5.5')
  const [agents, setAgents] = useState([])

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
    localStorage.setItem('hagent_provider', p)
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
    localStorage.setItem('hagent_cx_model', model)
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
    if (token) {
      localStorage.setItem('token', token)
      fetchUser()
    }
  }, [token])

  const fetchUser = () => {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.ok) return r.json();
        if (r.status === 401) {
          setToken(null);
          setUser(null);
          localStorage.removeItem('token');
        }
        return null;
      })
      .then(u => {
        if (u) {
          setUser({ ...u, displayName: u.display_name || u.displayName || u.username })
          if (u.default_provider) {
            setProvider(u.default_provider)
            localStorage.setItem('hagent_provider', u.default_provider)
          }
        }
      })
      .catch(err => console.error('Error fetching user:', err))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }

  if (!user) return <Login onLogin={(t, u) => { setToken(t); setUser(u) }} />

  return (
    <div className="flex flex-col-reverse overflow-hidden bg-[#f7f7f4] text-gray-950 sm:flex-row" style={{ height: '100dvh' }}>
      <Header
        user={user}
        view={view}
        onViewChange={setView}
        onControlService={handleControlService}
        onLogout={logout}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden" style={{ height: '100%' }}>
        {view === 'chat' && <Chat key="chat" token={token} provider={provider} cxModel={cxModel} agents={agents} user={user} onProviderChange={saveProvider} onShowAgentManager={() => setView('agents')} onLogout={logout} />}
        {view === 'wiki' && <Wiki token={token} provider={provider} />}
        {view === 'evolution' && <Evolution token={token} />}
        {view === 'omni' && <OmniChat token={token} provider={provider} />}
        {view === 'job-hunter' && <JobHunter token={token} provider={provider} />}
        {view === 'learn' && <Learn token={token} provider={provider} />}
        {view === 'english' && <English token={token} />}
        {view === 'agents' && <AgentSkillManager token={token} agents={agents} onUpdate={fetchAgents} />}
        {view === 'code' && <CodeWorkspace token={token} provider={provider} />}
        {view === 'video' && <VideoPage token={token} provider={provider} />}
        {view === 'ports' && <PortManager token={token} />}
        {view === 'settings' && <UserSettings token={token} user={user} provider={provider} cxModel={cxModel} onCxModelChange={saveCxModel} onProviderChange={saveProvider} onUpdate={fetchUser} onLogout={logout} />}
      </main>
    </div>
  )
}
