import { Suspense, lazy, useState } from 'react'
import { filterTabs } from '../lib/permissions.js'

const FileManager = lazy(() => import('./FileManager.jsx'))
const CodeWorkspace = lazy(() => import('./CodeWorkspace.jsx'))
const PortManager = lazy(() => import('./PortManager.jsx'))
const CameraPanel = lazy(() => import('./CameraPanel.jsx'))
const GooglePhotosManager = lazy(() => import('./GooglePhotosManager.jsx'))
const DriveSync = lazy(() => import('./DriveSync.jsx'))

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500">
      Đang tải...
    </div>
  )
}

const tabs = [
  {
    id: 'files',
    label: 'Files',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    id: 'backup',
    label: 'Sao lưu',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
        <path d="M12 12v6M9.5 14.5L12 12l2.5 2.5" />
      </svg>
    ),
  },
  {
    id: 'code',
    label: 'Code',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
        <path d="M14 4l-4 16" />
      </svg>
    ),
  },
  {
    id: 'ports',
    label: 'Cổng',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M4 17h16M4 12h16M4 7h16" />
        <path d="M8 7v10M16 7v10" />
      </svg>
    ),
  },
  {
    id: 'camera',
    label: 'Camera',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M15 10l4.5-2.5v9L15 14" />
        <path d="M4.5 6.5h9A1.5 1.5 0 0115 8v8a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 16V8a1.5 1.5 0 011.5-1.5z" />
      </svg>
    ),
  },
  {
    id: 'gphotos',
    label: 'Photos',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 16l-5-5-4 4-2-2-5 5" />
      </svg>
    ),
  },
]

export default function SystemHub({ token, provider, user }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hagent_system_tab') || 'files')
  const [tabsHidden, setTabsHidden] = useState(() => localStorage.getItem('hagent_system_tabs_hidden') === '1')

  const visibleTabs = filterTabs(user, 'system', tabs)
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id

  function selectTab(tab) {
    setActiveTab(tab)
    localStorage.setItem('hagent_system_tab', tab)
  }

  function toggleTabsHidden() {
    setTabsHidden(value => {
      const next = !value
      localStorage.setItem('hagent_system_tabs_hidden', next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      {!tabsHidden && (
        <div className="sticky top-0 z-30 shrink-0 border-b border-black/[0.12] bg-white/90 px-2 py-1 backdrop-blur-xl sm:px-3">
          <div className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-gray-100 p-0.5 sm:flex-none sm:inline-flex">
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
              onClick={toggleTabsHidden}
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="Ẩn thanh tabs"
              aria-label="Ẩn thanh tabs"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.6 5.1A10.7 10.7 0 0112 5c6 0 9.5 7 9.5 7a18 18 0 01-3.2 4M6.7 6.7C3.7 8.6 2.5 12 2.5 12s3.5 7 9.5 7c1.7 0 3.2-.5 4.5-1.2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 9.9a3 3 0 004.2 4.2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {tabsHidden && (
        <button
          type="button"
          onClick={toggleTabsHidden}
          className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-black/10 bg-white/90 text-gray-500 shadow-sm backdrop-blur hover:bg-white hover:text-gray-900"
          title="Hiện thanh tabs"
          aria-label="Hiện thanh tabs"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<TabLoading />}>
          {effectiveTab === 'files' && (
            <div className="h-full min-h-0 overflow-hidden">
              <FileManager token={token} />
            </div>
          )}

          {effectiveTab === 'code' && (
            <div className="h-full min-h-0 overflow-hidden">
              <CodeWorkspace token={token} provider={provider} />
            </div>
          )}

          {effectiveTab === 'ports' && (
            <div className="h-full min-h-0 overflow-hidden">
              <PortManager token={token} />
            </div>
          )}

          {effectiveTab === 'camera' && (
            <div className="h-full min-h-0 overflow-hidden">
              <CameraPanel token={token} />
            </div>
          )}

          {effectiveTab === 'gphotos' && (
            <div className="h-full min-h-0 overflow-hidden">
              <GooglePhotosManager token={token} />
            </div>
          )}

          {effectiveTab === 'backup' && (
            <div className="h-full min-h-0 overflow-hidden">
              <DriveSync token={token} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
