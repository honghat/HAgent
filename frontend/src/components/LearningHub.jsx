import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Clock } from 'lucide-react'
import { fetchLessonReviewQueue, fetchEnglishReviewQueue } from '../lib/recallApi.js'
import { filterTabs } from '../lib/permissions.js'

const TAB_BAR_VISIBLE_KEY = 'hagent_learning_tab_bar_visible'

const Learn = lazy(() => import('./Learn.jsx'))
const English = lazy(() => import('./English.jsx'))
const Mindmap = lazy(() => import('./Mindmap.jsx'))
const ReviewQueue = lazy(() => import('./ReviewQueue.jsx'))
const LearnRecall = lazy(() => import('./LearnRecall.jsx'))

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500">
      Đang tải...
    </div>
  )
}

const tabs = [
  {
    id: 'review',
    label: 'Cần ôn',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    id: 'learn',
    label: 'Learn Code',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
        <path d="M8 7h8M8 11h6" />
      </svg>
    ),
  },
  {
    id: 'english',
    label: 'Tiếng Anh',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M5 8h9" />
        <path d="M7 5v3c0 4 3 7 7 8" />
        <path d="M12 8c-.5 3-2.5 5.5-6 8" />
        <path d="M16 19l3-7 3 7" />
        <path d="M17 17h4" />
      </svg>
    ),
  },
  {
    id: 'mindmap',
    label: 'Mindmap',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 9V4M12 20v-5M9 12H4M20 12h-5M14.2 9.8l3.5-3.5M6.3 17.7l3.5-3.5M14.2 14.2l3.5 3.5M6.3 6.3l3.5 3.5" />
      </svg>
    ),
  },
]

export default function LearningHub({ token, provider, cxModel, user }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hagent_learning_tab') || 'review')
  const [showTabBar, setShowTabBar] = useState(() => localStorage.getItem(TAB_BAR_VISIBLE_KEY) !== 'false')
  const [reviewCounts, setReviewCounts] = useState({ code: 0, english: 0, total: 0 })
  const [recallOpen, setRecallOpen] = useState(null) // { kind: 'lesson'|'english', item }

  const visibleTabs = filterTabs(user, 'learning', tabs)
  const effectiveTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : visibleTabs[0]?.id

  const refreshReviewCounts = useCallback(async () => {
    try {
      const [code, eng] = await Promise.all([
        fetchLessonReviewQueue(token).catch(() => []),
        fetchEnglishReviewQueue(token).catch(() => []),
      ])
      setReviewCounts({
        code: Array.isArray(code) ? code.length : 0,
        english: Array.isArray(eng) ? eng.length : 0,
        total: (Array.isArray(code) ? code.length : 0) + (Array.isArray(eng) ? eng.length : 0),
      })
    } catch (e) {
      setReviewCounts({ code: 0, english: 0, total: 0 })
    }
  }, [token])

  useEffect(() => {
    refreshReviewCounts()
    const handle = setInterval(refreshReviewCounts, 60_000)
    return () => clearInterval(handle)
  }, [refreshReviewCounts])

  function selectTab(tab) {
    setActiveTab(tab)
    localStorage.setItem('hagent_learning_tab', tab)
  }

  function toggleTabBar() {
    setShowTabBar(value => {
      const next = !value
      localStorage.setItem(TAB_BAR_VISIBLE_KEY, String(next))
      return next
    })
  }

  function openRecall(kind, item) {
    setRecallOpen({ kind, item })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <div className={`relative sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 bg-white/90 backdrop-blur-xl transition-all ${showTabBar ? 'border-b border-black/[0.12] px-2 py-1 sm:px-3' : 'h-0'}`}>
        {showTabBar && (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-gray-100 p-0.5">
            {visibleTabs.map(tab => {
              const isActive = effectiveTab === tab.id
              const showBadge = tab.id === 'review' && reviewCounts.total > 0
              const badgeColor = isActive ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
              return (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`relative flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-gray-600 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {showBadge && (
                    <span
                      className={`ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black ${badgeColor}`}
                      title={`${reviewCounts.total} mục cần ôn (${reviewCounts.code} code, ${reviewCounts.english} tiếng Anh)`}
                    >
                      {reviewCounts.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <button
          onClick={toggleTabBar}
          title={showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-amber-300 hover:text-amber-600 active:scale-95 ${showTabBar ? '' : 'absolute right-2 top-2'}`}
        >
          {showTabBar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {reviewCounts.total > 0 && !showTabBar && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
              {reviewCounts.total}
            </span>
          )}
          <span className="sr-only">{showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<TabLoading />}>
          {effectiveTab === 'review' && (
            <div className="h-full min-h-0 overflow-hidden">
              <ReviewQueue
                token={token}
                onOpenRecall={openRecall}
                onRefreshCount={refreshReviewCounts}
              />
            </div>
          )}

          {effectiveTab === 'learn' && (
            <div className="h-full min-h-0 overflow-hidden">
              <Learn token={token} provider={provider} cxModel={cxModel} />
            </div>
          )}

          {effectiveTab === 'english' && (
            <div className="h-full min-h-0 overflow-hidden">
              <English token={token} provider={provider} cxModel={cxModel} />
            </div>
          )}

          {effectiveTab === 'mindmap' && (
            <div className="h-full min-h-0 overflow-hidden">
              <Mindmap user={user} />
            </div>
          )}
        </Suspense>
      </div>

      {recallOpen && (
        <Suspense fallback={null}>
          <LearnRecall
            token={token}
            provider={provider}
            cxModel={cxModel}
            mode={recallOpen.kind === 'english' ? 'english' : 'lesson'}
            item={recallOpen.item}
            onClose={() => { setRecallOpen(null); refreshReviewCounts() }}
            onCompleted={() => refreshReviewCounts()}
          />
        </Suspense>
      )}
    </div>
  )
}
