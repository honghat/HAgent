import { useState, useEffect } from 'react'
import { Search, BookOpen, Clock, Trash2, RefreshCw, AlertCircle } from 'lucide-react'
import Toast, { useToast } from './Toast'
import { getTruyenCVHistory, saveTruyenCVHistory } from '../api.js'

const BASE = window.location.origin
const STORY_SOURCE_KEY = 'hagent_story_browser_source'

async function apiGet(url) {
  const r = await fetch(`${BASE}${url}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json()
}

export default function StoryBrowser({ token, onSelectStory, onResumeStory, onDeleteStory, onOpenAppApi, refreshKey = 0 }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [readingHistory, setReadingHistory] = useState([])
  const [source, setSource] = useState(() => localStorage.getItem(STORY_SOURCE_KEY) || 'truyencv')
  const [syncing, setSyncing] = useState(false)
  const { toast, showToast, dismissToast } = useToast()

  useEffect(() => {
    loadStories(1, true)
  }, [refreshKey, source])

  useEffect(() => {
    loadReadingHistory()
  }, [])

  async function loadReadingHistory() {
    try {
      let localHistory = {}
      try {
        localHistory = JSON.parse(localStorage.getItem('hagent_reading_history') || '{}')
      } catch (e) {
        console.error('Error parsing local history:', e)
      }
      
      const setList = (hist) => {
        const historyList = Object.keys(hist).map(slug => ({
          slug,
          ...hist[slug]
        })).sort((a, b) => b.timestamp - a.timestamp)
        setReadingHistory(historyList)
      }
      
      setList(localHistory)

      if (token) {
        try {
          const serverHistory = await getTruyenCVHistory(token)
          let hasChanges = false
          const merged = { ...localHistory }
          
          const allSlugs = new Set([...Object.keys(localHistory), ...Object.keys(serverHistory)])
          for (const slug of allSlugs) {
            const localItem = localHistory[slug]
            const serverItem = serverHistory[slug]
            
            if (localItem && serverItem) {
              if (localItem.timestamp > serverItem.timestamp) {
                merged[slug] = localItem
                hasChanges = true
              } else if (serverItem.timestamp > localItem.timestamp) {
                merged[slug] = serverItem
                hasChanges = true
              }
            } else if (serverItem) {
              merged[slug] = serverItem
              hasChanges = true
            } else if (localItem) {
              hasChanges = true
            }
          }

          if (hasChanges) {
            localStorage.setItem('hagent_reading_history', JSON.stringify(merged))
            setList(merged)
            await saveTruyenCVHistory(merged, token)
          }
        } catch (serverErr) {
          console.error('Error syncing history with server:', serverErr)
        }
      }
    } catch (e) {
      console.error('Error loading history:', e)
    }
  }

      async function loadStories(pageNum = 1, replace = false) {
    setLoading(true)
    setError(null)
    try {
      const srcParam = `&source=${source === 'ttv' ? 'ttv' : 'truyencv'}`
      const endpoint = searchQuery.trim()
        ? `/api/truyencv/search?q=${encodeURIComponent(searchQuery)}${srcParam}`
        : `/api/truyencv/recent?page=${pageNum}${srcParam}`
      
      const r = await fetch(`${BASE}${endpoint}`)
      if (!r.ok) {
        let msg = "Không thể tải dữ liệu"
        // Handle các status code khác nhau
        if (r.status === 404) msg = "Chưa có truyện nào trong kho. Hãy bật chế độ 'Cập nhật' hoặc đợi cron crawl tự động."
        else if (r.status === 503) msg = "Nguồn crawl đang tạm dừng. Thử lại sau vài phút."
        else if (source === 'ttv') msg = "TTV web không truy cập được từ Mac. Hãy dùng API App > Proxy iPad tự lưu, mở truyện trong app TTV trên iPad rồi nhấn “Nhập ngay”."
        
        throw new Error(msg)
      }
      const data = await r.json()
      const list = Array.isArray(data) ? data : []
      if (replace) {
        setStories(list)
      } else {
        setStories(prev => [
          ...prev,
          ...list.filter(s => !prev.some(p => p.slug === s.slug)) // tránh trùng
        ])
      }
      setHasMore(list.length >= 30) // nếu ít hơn 30 thì hết trang
      setIsSearching(!!searchQuery.trim())
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    localStorage.setItem(STORY_SOURCE_KEY, source)
    setPage(1)
    setHasMore(true)
    loadStories(1, true)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
    setPage(1)
    setHasMore(true)
    setLoading(true)
    apiGet(`/api/truyencv/recent?page=1&source=${source === 'ttv' ? 'ttv' : 'truyencv'}`)
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setStories(list)
        setHasMore(list.length >= 30)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }

  const handleSyncStories = async () => {
    setSyncing(true)
    setError(null)
    try {
      const sourceParam = source === 'ttv' ? '?source=ttv' : ''
      const res = await fetch(`${BASE}/api/truyencv/sync${sourceParam}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || 'Đồng bộ thất bại')
      setPage(1)
      setHasMore(true)
      setIsSearching(false)
      await loadStories(1, true)
      showToast(`Đã đồng bộ ${data.count || 0} truyện ${source === 'ttv' ? 'TTV' : 'TruyenCV'}.`, 'success')
    } catch (e) {
      showToast(e.message || 'Đồng bộ thất bại', 'error', 5000)
    } finally {
      setSyncing(false)
    }
  }

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    loadStories(nextPage, false)
  }

  const handleRemoveHistory = async (storySlug, e) => {
    e.stopPropagation()
    try {
      const history = JSON.parse(localStorage.getItem('hagent_reading_history') || '{}')
      delete history[storySlug]
      localStorage.setItem('hagent_reading_history', JSON.stringify(history))
      
      const historyList = Object.keys(history).map(slug => ({
        slug,
        ...history[slug]
      })).sort((a, b) => b.timestamp - a.timestamp)
      setReadingHistory(historyList)

      if (token) {
        try {
          await saveTruyenCVHistory(history, token)
        } catch (serverErr) {
          console.error('Error removing history from server:', serverErr)
        }
      }
    } catch (err) {
      console.error('Error removing history:', err)
    }
  }

  const handleDeleteStory = async (story, e) => {
    e.stopPropagation()

    try {
      const r = await fetch(`${BASE}/api/truyencv/story/${story.slug}`, { method: 'DELETE' })
      if (!r.ok) {
        showToast(`Lỗi khi xoá: ${await r.text()}`, 'error', 5000)
        return
      }

      setStories(prev => prev.filter(item => item.slug !== story.slug))
      handleRemoveHistory(story.slug, e)
      onDeleteStory?.(story)
      showToast(`Đã xoá "${story.title}" khỏi kho.`, 'success')
    } catch (err) {
      showToast(err.message, 'error', 5000)
    }
  }

  function handleSelectStory(s) {
    onSelectStory(s)
  }

  return (
    <div className="h-full flex flex-col bg-[#fafaf9] overflow-hidden">
      <Toast toast={toast} onClose={dismissToast} />
      {/* Search Bar & Title Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
        <h2 className="text-base font-bold text-gray-800 self-start sm:self-center flex items-center gap-2">
          <span>📖</span> Danh sách truyện
        </h2>
        
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={handleSyncStories}
            disabled={syncing}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Đồng bộ truyện
          </button>
          {onOpenAppApi && (
            <button
              type="button"
              onClick={onOpenAppApi}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition-all hover:border-amber-300 hover:text-amber-700"
            >
              <Search className="h-3.5 w-3.5" />
              API App
            </button>
          )}
          <select
            value={source}
            onChange={(e) => {
              const next = e.target.value
              setSource(next)
              localStorage.setItem(STORY_SOURCE_KEY, next)
              setPage(1)
              setHasMore(true)
            }}
            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-600 outline-none transition-all focus:border-amber-500 focus:bg-white"
          >
            <option value="truyencv">TruyenCV</option>
            <option value="ttv">TTV</option>
          </select>
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Tìm kiếm truyện hoặc tác giả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-gray-200 bg-gray-50 pl-10 pr-9 py-1.5 text-xs outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition-all font-sans"
            />
            <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-2 text-[10px] text-gray-400 hover:text-gray-600 font-semibold"
              >
                Xoá
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* Error message */}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 flex gap-3 items-start animate-fade-in">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-700">Lỗi tải dữ liệu</p>
              <p className="text-[10px] text-red-500/90 mt-0.5">{error}</p>
              <button
                onClick={() => loadStories(page)}
                className="mt-2 text-[10px] font-semibold text-red-700 underline hover:text-red-800"
              >
                Thử tải lại
              </button>
            </div>
          </div>
        )}

        {/* Reading History / Recent Reads */}
        {!isSearching && stories.length > 0 && readingHistory.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Đang đọc gần đây
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {readingHistory.map((item) => (
                <div
                  key={item.slug}
                  onClick={() => onResumeStory(
                    { slug: item.slug, title: item.storyTitle, cover_url: item.coverUrl },
                    { slug: item.chapterSlug, title: item.chapterTitle }
                  )}
                  className="flex items-center gap-3 cursor-pointer rounded-xl border border-amber-100 bg-amber-50/20 p-3 hover:bg-amber-50/40 hover:border-amber-200 transition-all duration-300 group shadow-sm"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-gray-100 border border-gray-200 shadow-sm">
                    <img
                      src={item.coverUrl || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200'}
                      alt={item.storyTitle}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200'
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-800 truncate group-hover:text-amber-800 transition-colors">
                      {item.storyTitle}
                    </h4>
                    <p className="text-[10px] text-gray-500 mt-1 truncate">
                      Đọc tiếp: <span className="font-semibold text-amber-700">{item.chapterTitle}</span>
                    </p>
                    <span className="text-[9px] text-gray-400 block mt-0.5">
                      {new Date(item.timestamp).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleRemoveHistory(item.slug, e)}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all shrink-0 self-start"
                    title="Xoá lịch sử truyện này"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Story List / Search Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> {isSearching ? 'Kết quả tìm kiếm' : 'Kho truyện mới'}
            </h3>
            {!isSearching && !loading && (
              <button
                onClick={() => loadStories(page)}
                className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 transition-all"
              >
                <RefreshCw className="h-3 w-3" /> Tải lại danh sách
              </button>
            )}
          </div>

          {/* Empty state - chỉ hiện khi DB trống (không phụ thuộc vào error) */}
          {!isSearching && !loading && stories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <BookOpen className="h-12 w-12 mb-3 text-gray-300" />
              <p className="text-sm font-medium text-center">Kho truyện đang trống</p>
              <p className="text-xs text-gray-500 mt-1">
                {source === 'ttv' ? 'TTV cần API capture từ iPad nếu web TTV không truy cập được.' : 'Nhấn “Đồng bộ TruyenCV” để tải danh sách mới nhất.'}
              </p>
            </div>
          )}

          {stories.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {stories.map((s, i) => (
                <div
                  key={i}
                  onClick={() => handleSelectStory(s)}
                  className="flex items-center gap-3 cursor-pointer rounded-xl border border-gray-200/60 bg-white p-3.5 hover:shadow-md hover:border-amber-400/50 hover:-translate-y-0.5 transition-all duration-300 group shadow-sm"
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-gray-50 border border-gray-100 shadow-sm">
                    <img
                      src={s.cover_url || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200'}
                      alt={s.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200'
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight group-hover:text-amber-700 transition-colors font-sans">
                      {s.title}
                    </h4>
                    
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.tags && s.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[8px] font-semibold text-gray-500 uppercase tracking-wider">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {s.last_chapter ? (
                        <p className="min-w-0 truncate text-[10px] text-gray-400 font-medium bg-gray-50 px-1.5 py-0.5 rounded">
                          {s.last_chapter}
                        </p>
                      ) : (
                        <span className="min-w-0"></span>
                      )}
                      <button
                        onClick={(e) => handleDeleteStory(s, e)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-100 bg-white px-2 py-1 text-[10px] font-bold text-red-500 transition-all hover:border-red-200 hover:bg-red-50"
                        title="Xoá truyện khỏi kho"
                      >
                        <Trash2 className="h-3 w-3" />
                        Xoá
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More - only shown when not searching */}
          {!isSearching && !loading && stories.length > 0 && (
            <div className="pt-6 flex items-center justify-center border-t border-gray-100">
              {hasMore ? (
                <button
                  onClick={handleLoadMore}
                  className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 px-6 py-2 text-xs font-semibold text-amber-700 transition-all shadow-sm hover:shadow-md active:scale-95"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Tải thêm truyện (Trang {page + 1})
                </button>
              ) : (
                <span className="text-[11px] text-gray-400 font-medium">Đã tải hết {stories.length} truyện</span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
