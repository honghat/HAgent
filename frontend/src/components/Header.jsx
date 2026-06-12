import logo from '../assets/logo.png'
import { canAccess, isAdmin } from '../lib/permissions.js'

export default function Header({ user, view, collapsed = false, onViewChange, onLogout }) {
  const allTabs = [
    { id: 'blog', label: 'Blog', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 012 2v6a2 2 0 01-2 2h-2a2 2 0 01-2-2v-6a2 2 0 012-2m-2 4h.01M9 16h6M9 12h6M9 8h2" /></svg> },
    { id: 'chat', label: 'Chat', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    { id: 'system', label: 'Hệ thống', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /><path d="M8 7v10M16 7v10" /></svg> },
    { id: 'automation', label: 'Công cụ', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
    { id: 'learning', label: 'Học tập', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" /><path d="M8 7h8M8 11h5" /><path d="M15 15l2 2 4-4" /></svg> },
    { id: 'personal', label: 'Cá nhân', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    { id: 'entertainment', label: 'Giải trí', icon: <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" /></svg> },
    { id: 'settings', label: 'Settings', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" /><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21a2 2 0 01-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.88.34l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3a2 2 0 010-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.34-1.88l-.06-.06a2 2 0 012.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3a2 2 0 014 0v.1A1.7 1.7 0 0016 4.6a1.7 1.7 0 001.88-.34l.06-.06a2 2 0 012.83 2.83l-.06.06A1.7 1.7 0 0019.4 9c0 .4.22.77.6 1 .32.2.7.4 1.1.4h-.1a2 2 0 010 4h.1A1.7 1.7 0 0019.4 15z" /></svg> },
    { id: 'admin', label: 'Quản trị', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg> },
  ]

  const tabs = allTabs.filter(tab => {
    if (!user) return tab.id === 'blog'
    if (tab.id === 'personal' || tab.id === 'blog') return true
    return tab.id === 'admin' ? isAdmin(user) : canAccess(user, tab.id)
  })

  if (!user) {
    tabs.push({
      id: 'login',
      label: 'Đăng nhập',
      icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" /></svg>
    })
  }

  return (
    <aside className={`h-14 w-full sm:h-screen sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-black/[0.14] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-row sm:flex-col z-[100] ${collapsed ? 'sm:hidden' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <button onClick={() => onViewChange(user ? 'chat' : 'blog')} className="hidden h-16 items-center justify-center border-b border-black/[0.1] active:scale-[0.99] transition-transform sm:flex sm:justify-start sm:px-4 gap-2 group">
        <img src={logo} alt="Logo" className="w-10 h-10 rounded-full shadow-sm group-hover:scale-110 transition-transform duration-200" />
        <span className="hidden sm:block text-xl leading-6 font-semibold text-gray-950 tracking-tight">H-Agent</span>
      </button>

      <nav className="grid w-full gap-1 overflow-x-auto px-1.5 py-1.5 no-scrollbar sm:block sm:flex-1 sm:overflow-y-auto sm:overflow-x-hidden sm:px-2 sm:py-3 sm:space-y-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, tabs.length)}, minmax(44px, 1fr))` }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={`min-h-11 min-w-0 sm:min-h-10 sm:min-w-11 sm:w-full flex flex-col items-center justify-center sm:flex-row sm:justify-start gap-0.5 sm:gap-2.5 rounded-xl px-1 text-[11px] leading-4 font-normal transition-all sm:px-2.5 ${
              view === tab.id
                ? 'bg-gray-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            {tab.icon}
            <span className="block max-w-full truncate text-[10px] leading-3 sm:max-w-none sm:text-[12px] sm:leading-4 sm:ml-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>

      {user ? (
        <div className="mt-auto border-t border-black/[0.1] p-3 hidden sm:flex items-center gap-2.5 cursor-pointer hover:bg-black/[0.02] transition-colors" onClick={() => onViewChange('settings')}>
          {user.avatar ? (
            <img src={user.avatar} alt="Avatar" className="w-8 h-8 rounded-full object-cover shadow-sm" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-950 text-white flex items-center justify-center font-bold text-[11px]">
              {String(user.displayName || user.username || 'H').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-950 truncate leading-none">{user.displayName}</p>
            <p className="text-[9px] text-gray-400 truncate mt-1">{user.email || 'Chưa có email'}</p>
          </div>
        </div>
      ) : (
        <div 
          className="mt-auto border-t border-black/[0.1] p-3 hidden sm:flex items-center gap-2.5 cursor-pointer hover:bg-black/[0.05] transition-colors text-gray-950 font-bold" 
          onClick={() => onViewChange('login')}
        >
          <svg className="w-4.5 h-4.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" />
          </svg>
          <span className="text-[12px] leading-4 ml-0.5">Đăng nhập</span>
        </div>
      )}
    </aside>
  )
}
