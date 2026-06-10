import { Suspense, lazy, useState, useEffect } from 'react'
import { BookOpen, Clapperboard, Compass, FileText, Eye, EyeOff } from 'lucide-react'
import { canAccess } from '../lib/permissions.js'

const StoryBrowser = lazy(() => import('./StoryBrowser'))
const StoryDetail = lazy(() => import('./StoryDetail'))
const StoryReader = lazy(() => import('./StoryReader'))
const EntertainmentVideo = lazy(() => import('./EntertainmentVideo'))
const AppApiDiscoveryTool = lazy(() => import('./AppApiDiscoveryTool'))
const TtvManager = lazy(() => import('./TtvManager'))

const TAB_BAR_VISIBLE_KEY = 'hagent_entertainment_tab_bar_visible'

export default function EntertainmentHub({ token, provider, cxModel, user }) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState('browse')
  const [currentStory, setCurrentStory] = useState(null)
  const [currentChapter, setCurrentChapter] = useState(null)
  const [showTabBar, setShowTabBar] = useState(() => localStorage.getItem(TAB_BAR_VISIBLE_KEY) !== 'false')
  // Tăng mỗi khi bắt đầu một phiên đọc mới → ép reader nhảy chương (đổi tab thì giữ nguyên)
  const [readerSession, setReaderSession] = useState(0)

  useEffect(() => {
    setMounted(true)
    try {
      const savedTab = localStorage.getItem('hagent_entertainment_tab')
      const savedStory = localStorage.getItem('hagent_entertainment_story')
      const savedChapter = localStorage.getItem('hagent_entertainment_chapter')
      
      if (savedTab === 'browse' || !savedStory) {
        localStorage.removeItem('hagent_entertainment_story')
        localStorage.removeItem('hagent_entertainment_chapter')
      } else {
        if (savedStory) {
          setCurrentStory(JSON.parse(savedStory))
        }
        if (savedChapter) {
          setCurrentChapter(JSON.parse(savedChapter))
        }
      }
      if (savedTab) {
        const nextTab = savedTab === 'ttv' ? 'app-api' : savedTab
        setActiveTab(nextTab)
        if (nextTab !== savedTab) localStorage.setItem('hagent_entertainment_tab', nextTab)
      }
    } catch (e) {
      console.error('Error restoring story session:', e)
    }
  }, [])

  const handleSelectStory = (story) => {
    setCurrentStory(story)
    setCurrentChapter(null)
    localStorage.setItem('hagent_entertainment_story', JSON.stringify(story))
    localStorage.removeItem('hagent_entertainment_chapter')
    setActiveTab('detail')
    localStorage.setItem('hagent_entertainment_tab', 'detail')
  }

  const handleStartReading = (story, chapter) => {
    setCurrentStory(story)
    setCurrentChapter(chapter)
    setReaderSession(s => s + 1)
    localStorage.setItem('hagent_entertainment_story', JSON.stringify(story))
    localStorage.setItem('hagent_entertainment_chapter', JSON.stringify(chapter))
    setActiveTab('reader')
    localStorage.setItem('hagent_entertainment_tab', 'reader')
  }

  const handleBackToBrowse = () => {
    setCurrentStory(null)
    setCurrentChapter(null)
    setActiveTab('browse')
    localStorage.setItem('hagent_entertainment_tab', 'browse')
    localStorage.removeItem('hagent_entertainment_story')
    localStorage.removeItem('hagent_entertainment_chapter')
  };

  const handleBackToDetail = () => {
    setActiveTab('detail')
    localStorage.setItem('hagent_entertainment_tab', 'detail')
  }

  const handleStoryButtonClick = () => {
    handleBackToBrowse()
  }

  const handleOpenVideo = () => {
    setActiveTab('video')
    localStorage.setItem('hagent_entertainment_tab', 'video')
  }

  const handleOpenAppApiTool = () => {
    setActiveTab('app-api')
    localStorage.setItem('hagent_entertainment_tab', 'app-api')
  }

  const toggleTabBar = () => {
    setShowTabBar(value => {
      const next = !value
      localStorage.setItem(TAB_BAR_VISIBLE_KEY, String(next))
      return next
    })
  }

  if (!mounted) return null

  const canStory = canAccess(user, 'entertainment:browse')
  const canVideo = canAccess(user, 'entertainment:video')
  const canAppApi = canAccess(user, 'entertainment:app-api')
  const areaOf = (t) => (t === 'video' ? 'video' : t === 'app-api' ? 'app-api' : 'browse')
  const areaAllowed = { browse: canStory, video: canVideo, 'app-api': canAppApi }
  // Nếu tab hiện tại không được phép, chuyển về nhóm đầu tiên được phép.
  if (!areaAllowed[areaOf(activeTab)]) {
    const next = canStory ? 'browse' : canVideo ? 'video' : canAppApi ? 'app-api' : null
    if (next && next !== activeTab) {
      setActiveTab(next)
      localStorage.setItem('hagent_entertainment_tab', next)
      return null
    }
  }

  const isStoryTab = activeTab === 'browse' || activeTab === 'detail' || activeTab === 'reader' || activeTab === 'app-api'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)] text-gray-800">
      {/* Header */}
      <div className={`relative flex items-center justify-between bg-white/70 backdrop-blur-xl sticky top-0 z-30 transition-all ${
        showTabBar ? 'border-b border-gray-100/80 px-2 py-2 shadow-sm sm:px-4 sm:py-3' : 'h-0'
      }`}>
        {showTabBar && (
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-600 rounded-xl">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <h1 className="hidden text-xs font-extrabold tracking-wider text-gray-800 uppercase font-sans sm:block">
              Giải trí
            </h1>
          </div>
          <div className="hidden h-4 w-px bg-gray-200 sm:block"></div>
          
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
            {canStory && (
            <div className="relative shrink-0">
              <button
                className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-300 cursor-pointer sm:h-auto sm:px-4 sm:py-1.5 ${
                  isStoryTab
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10 scale-[1.02]'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                onClick={handleStoryButtonClick}
                title="Truyện"
              >
                <Compass className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Truyện</span>
              </button>
            </div>
            )}
            {canVideo && (
            <button
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-300 cursor-pointer sm:h-auto sm:px-4 sm:py-1.5 ${
                activeTab === 'video'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10 scale-[1.02]'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
              onClick={handleOpenVideo}
            >
              <Clapperboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Video</span>
            </button>
            )}
            {currentStory && activeTab !== 'video' && (
              <button
                className={`flex h-9 min-w-0 flex-1 max-w-[9rem] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-300 cursor-pointer sm:h-auto sm:max-w-[260px] sm:px-4 sm:py-1.5 lg:max-w-[360px] ${
                  activeTab === 'detail' || activeTab === 'reader'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10 scale-[1.02]'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                onClick={handleBackToDetail}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{currentStory.title}</span>
              </button>
            )}
          </div>
        </div>
        )}
        <button
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-amber-300 hover:text-amber-600 active:scale-95 ${
            showTabBar ? 'ml-1 sm:ml-3' : 'absolute right-3 top-3'
          }`}
          onClick={toggleTabBar}
          title={showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}
        >
          {showTabBar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="sr-only">{showTabBar ? 'Ẩn thanh tab' : 'Hiện thanh tab'}</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="flex h-full flex-col items-center justify-center text-sm text-gray-400 gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-amber-600"></div>
            <span>Đang tải...</span>
          </div>
        }>
          {activeTab === 'browse' && canStory && (
            <StoryBrowser
              token={token}
              onSelectStory={handleSelectStory}
              onResumeStory={handleStartReading}
              onOpenAppApi={handleOpenAppApiTool}
            />
          )}
          {activeTab === 'detail' && currentStory && (
            <StoryDetail 
              story={currentStory} 
              onBack={handleBackToBrowse} 
              onSelectChapter={(chapter) => handleStartReading(currentStory, chapter)}
            />
          )}
          {/* Giữ reader luôn mount khi đã chọn truyện để đổi tab không mất vị trí / không dừng TTS */}
          {currentStory && currentChapter && (
            <div className={`h-full ${activeTab === 'reader' ? '' : 'hidden'}`}>
              <StoryReader
                story={currentStory}
                initialChapter={currentChapter}
                sessionId={readerSession}
                onBack={handleBackToDetail}
              />
            </div>
          )}
          {activeTab === 'video' && canVideo && (
            <EntertainmentVideo token={token} chromeVisible={showTabBar} />
          )}
          {activeTab === 'app-api' && canAppApi && (
            <AppApiDiscoveryTool token={token}>
              <TtvManager token={token} embedded />
            </AppApiDiscoveryTool>
          )}
        </Suspense>
      </div>
    </div>
  )
}
