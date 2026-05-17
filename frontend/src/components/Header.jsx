import logo from '../assets/logo.png'

export default function Header({ user, view, onViewChange, onLogout }) {
  const tabs = [
    { id: 'chat', label: 'Chat', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    { id: 'job-hunter', label: 'Săn việc', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1" /><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path d="M9 13h6" /></svg> },
    { id: 'learn', label: 'Learn', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" /><path d="M8 7h8M8 11h6" /></svg> },
    { id: 'english', label: 'Tiếng Anh', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 8h9" /><path d="M7 5v3c0 4 3 7 7 8" /><path d="M12 8c-.5 3-2.5 5.5-6 8" /><path d="M16 19l3-7 3 7" /><path d="M17 17h4" /></svg> },
    { id: 'wiki', label: 'Wiki', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18.477 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
    { id: 'evolution', label: 'Learning', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 3v4" /><path d="M12 17v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /><circle cx="12" cy="12" r="3" /></svg> },
    { id: 'context', label: 'Context', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 5h16" /><path d="M4 12h10" /><path d="M4 19h7" /><path d="M17 14l3 3-3 3" /><path d="M14 17h6" /></svg> },
    { id: 'omni', label: 'Omni', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 8h2a2 2 0 012 2v7a2 2 0 01-2 2h-1l-3 3v-3h-4a2 2 0 01-2-2v-1" /><path d="M3 5a2 2 0 012-2h8a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 4v-4H5a2 2 0 01-2-2V5z" /></svg> },
    { id: 'agents', label: 'Agents', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 10h.01M15 10h.01M9 15h6" /></svg> },
    { id: 'code', label: 'Code', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M16 18l6-6-6-6" /><path d="M8 6l-6 6 6 6" /><path d="M14 4l-4 16" /></svg> },
    { id: 'video', label: 'Video', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><circle cx="12" cy="12" r="10" /></svg> },
    { id: 'ports', label: 'Cổng', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 17h16M4 12h16M4 7h16" /><path d="M8 7v10M16 7v10" /></svg> },
    { id: 'files', label: 'Files', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg> },
    { id: 'settings', label: 'Settings', icon: <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" /><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21a2 2 0 01-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.88.34l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3a2 2 0 010-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.34-1.88l-.06-.06a2 2 0 012.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3a2 2 0 014 0v.1A1.7 1.7 0 0016 4.6a1.7 1.7 0 001.88-.34l.06-.06a2 2 0 012.83 2.83l-.06.06A1.7 1.7 0 0019.4 9c0 .4.22.77.6 1 .32.2.7.4 1.1.4h-.1a2 2 0 010 4h.1A1.7 1.7 0 0019.4 15z" /></svg> },
  ]

  return (
    <aside className="h-14 w-full sm:h-screen sm:w-44 shrink-0 border-t sm:border-t-0 sm:border-r border-black/[0.06] bg-[#fbfbf9]/95 backdrop-blur-xl flex flex-row sm:flex-col z-[100] pb-safe sm:pb-0">
      <button onClick={() => onViewChange('chat')} className="hidden h-16 items-center justify-center border-b border-black/[0.04] active:scale-[0.99] transition-transform sm:flex sm:justify-start sm:px-4 gap-2 group">
        <img src={logo} alt="Logo" className="w-10 h-10 rounded-full shadow-sm group-hover:scale-110 transition-transform duration-200" />
        <span className="hidden sm:block text-xl leading-6 font-semibold text-gray-950 tracking-tight">H-Agent</span>
      </button>

      <nav className="flex-1 overflow-x-auto sm:overflow-y-auto no-scrollbar px-1.5 py-2 sm:px-2 sm:py-3 flex sm:block items-center gap-1 sm:space-y-1 sm:gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={`min-h-10 min-w-11 sm:w-full flex items-center justify-center sm:justify-start gap-2.5 rounded-xl px-2.5 text-[12px] leading-4 font-normal transition-all ${
              view === tab.id
                ? 'bg-white text-gray-950 shadow-sm ring-1 ring-black/[0.04]'
                : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:block truncate text-[12px] leading-4">{tab.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
