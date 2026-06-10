import { Suspense, lazy, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { filterTabs } from '../lib/permissions.js'

const Chat = lazy(() => import('./Chat.jsx'))
const OmniChat = lazy(() => import('./OmniChat.jsx'))

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500">
      Đang tải...
    </div>
  )
}

const tabs = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'omni',
    label: 'Omni',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M17 8h2a2 2 0 012 2v7a2 2 0 01-2 2h-1l-3 3v-3h-4a2 2 0 01-2-2v-1" />
        <path d="M3 5a2 2 0 012-2h8a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 4v-4H5a2 2 0 01-2-2V5z" />
      </svg>
    ),
  },
]

export default function ChatHub({
  token,
  provider,
  cxModel,
  agents,
  user,
  onProviderChange,
  onShowAgentManager,
  onLogout,
}) {
  const [tabsHidden, setTabsHidden] = useState(() => localStorage.getItem('hagent_chat_tabs_hidden') === '1')
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hagent_chat_tab') || 'chat')

  const visibleTabs = filterTabs(user, 'chat', tabs)
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id

  function selectTab(tab) {
    setActiveTab(tab)
    localStorage.setItem('hagent_chat_tab', tab)
  }

  function setTabVisibility(hidden) {
    setTabsHidden(hidden)
    localStorage.setItem('hagent_chat_tabs_hidden', hidden ? '1' : '0')
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      {!tabsHidden && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.12] bg-white/90 px-2 py-1 backdrop-blur-xl sm:px-3">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-gray-100 p-0.5 sm:inline-flex">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                  effectiveTab === tab.id
                    ? 'bg-gray-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTabVisibility(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900"
            title="Ẩn khung tab"
            aria-label="Ẩn khung tab"
          >
            <EyeOff size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {tabsHidden && (
        <button
          type="button"
          onClick={() => setTabVisibility(false)}
          className="absolute right-3 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.06] bg-white/90 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:text-gray-950"
          title="Hiện khung tab"
          aria-label="Hiện khung tab"
        >
          <Eye size={15} strokeWidth={2} />
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<TabLoading />}>
          {effectiveTab === 'chat' && (
            <Chat
              key="chat"
              token={token}
              provider={provider}
              cxModel={cxModel}
              agents={agents}
              user={user}
              onProviderChange={onProviderChange}
              onShowAgentManager={onShowAgentManager}
              onLogout={onLogout}
            />
          )}

          {effectiveTab === 'omni' && (
            <div className="h-full min-h-0 overflow-hidden">
              <OmniChat token={token} provider={provider} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
