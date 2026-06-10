import { Suspense, lazy, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { filterTabs } from '../lib/permissions.js'

const TAB_BAR_VISIBLE_KEY = 'hagent_automation_tab_bar_visible'

const Workflows = lazy(() => import('./Workflows.jsx'))
const CronManager = lazy(() => import('./CronManager.jsx'))
const PhotoTab = lazy(() => import('./PhotoTab.jsx'))
const AnimateTab = lazy(() => import('./AnimateTab.jsx'))
const VideoEditor = lazy(() => import('./VideoEditor.jsx'))
const ComfyUIWorkflows = lazy(() => import('./ComfyUIWorkflows.jsx'))
const PdfTools = lazy(() => import('./PdfTools.jsx'))

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500">
      Đang tải...
    </div>
  )
}

const tabs = [
  // {
  //   id: 'photo',
  //   label: 'Photo',
  //   icon: (
  //     <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
  //       <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  //     </svg>
  //   ),
  // },
  // {
  //   id: 'animate',
  //   label: 'Animate',
  //   icon: (
  //     <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
  //       <rect x="3" y="5" width="18" height="14" rx="2" />
  //       <path d="M10 9l5 3-5 3z" />
  //     </svg>
  //   ),
  // },
  {
    id: 'editor',
    label: 'Video',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="12" rx="1.5" />
        <path d="M7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4" />
      </svg>
    ),
  },
  {
    id: 'pdf',
    label: 'PDF',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    id: 'workflows',
    label: 'Workflow',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M6 6h5v5H6zM13 13h5v5h-5z" />
        <path d="M11 8.5h2a3 3 0 013 3V13" />
      </svg>
    ),
  },
]

export default function AutomationHub({ token, provider, cxModel, user }) {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('hagent_automation_tab')
    if (saved === 'create-video') return 'editor'
    if (saved === 'cron') return 'workflows'
    if (saved === 'video') return 'editor'
    return saved || 'workflows'
  })
  const [workflowSubTab, setWorkflowSubTab] = useState(() => {
    return localStorage.getItem('hagent_workflow_subtab') || 'flow'
  })
  const [showTabBar, setShowTabBar] = useState(() => localStorage.getItem(TAB_BAR_VISIBLE_KEY) !== 'false')

  const visibleTabs = filterTabs(user, 'automation', tabs)
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id

  function selectTab(tab) {
    setActiveTab(tab)
    localStorage.setItem('hagent_automation_tab', tab)
  }

  function toggleTabBar() {
    setShowTabBar(value => {
      const next = !value
      localStorage.setItem(TAB_BAR_VISIBLE_KEY, String(next))
      return next
    })
  }

  function selectWorkflowSubTab(sub) {
    setWorkflowSubTab(sub)
    localStorage.setItem('hagent_workflow_subtab', sub)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <div className={`relative sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 bg-white/90 backdrop-blur-xl transition-all ${showTabBar ? 'border-b border-black/[0.12] px-2 py-1 sm:px-3' : 'h-0'}`}>
        {showTabBar && (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-gray-100 p-0.5">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                  effectiveTab === tab.id
                    ? 'bg-white text-gray-950 shadow-sm'
                    : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={toggleTabBar}
          title={showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-amber-300 hover:text-amber-600 active:scale-95 ${showTabBar ? '' : 'absolute right-2 top-2'}`}
        >
          {showTabBar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="sr-only">{showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<TabLoading />}>
          {effectiveTab === 'photo' && (
            <div className="h-full min-h-0 overflow-hidden">
              <PhotoTab token={token} provider={provider} />
            </div>
          )}
          {effectiveTab === 'animate' && (
            <div className="h-full min-h-0 overflow-hidden">
              <AnimateTab token={token} />
            </div>
          )}
          {effectiveTab === 'editor' && (
            <div className="h-full min-h-0 overflow-hidden">
              <VideoEditor token={token} />
            </div>
          )}
          {effectiveTab === 'workflows' && (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-black/[0.08] bg-white/70 px-2 py-1">
                <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
                  <button
                    onClick={() => selectWorkflowSubTab('flow')}
                    className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                      workflowSubTab === 'flow' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6h5v5H6zM13 13h5v5h-5z" />
                      <path d="M11 8.5h2a3 3 0 013 3V13" />
                    </svg>
                    Flow
                  </button>
                  <button
                    onClick={() => selectWorkflowSubTab('cron')}
                    className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                      workflowSubTab === 'cron' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                    Cron
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {workflowSubTab === 'flow' && <Workflows token={token} />}
                {workflowSubTab === 'cron' && <CronManager token={token} provider={provider} />}
              </div>
            </div>
          )}
          {effectiveTab === 'comfyui' && (
            <div className="h-full min-h-0 overflow-hidden">
              <ComfyUIWorkflows token={token} />
            </div>
          )}
          {effectiveTab === 'pdf' && (
            <div className="h-full min-h-0 overflow-hidden">
              <PdfTools token={token} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
