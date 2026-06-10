import { useState, useEffect } from 'react'
import { BookOpen, ArrowLeft, ArrowUpDown, Search, User, Eye, RefreshCw, Trash2 } from 'lucide-react'
import Toast, { useToast } from './Toast'

const BASE = window.location.origin

async function apiGet(url) {
  const r = await fetch(`${BASE}${url}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json()
}

function getChapterNumber(chapter, fallbackIndex = 0) {
  const direct = Number(chapter?.chapter_number || 0)
  if (Number.isFinite(direct) && direct > 0) return direct

  const source = `${chapter?.slug || ''} ${chapter?.title || ''}`
  const match = source.match(/(?:chuong|chương|chapter)[-/\s]*(\d+)/i)
    || source.match(/(?:^|\s)(\d+)\s*[:.-]/)
  if (match) {
    const parsed = Number(match[1])
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return fallbackIndex + 1
}

function chapterTitleWithoutNumber(title, chapterNumber) {
  const value = String(title || '').trim()
  if (!value || !chapterNumber) return value || 'Không có tiêu đề'
  const pattern = new RegExp(`^(?:chương|chuong|chapter)\\s*${chapterNumber}\\s*[:.\\-–—]?\\s*`, 'i')
  return value.replace(pattern, '').trim() || value
}

function isTtvStory(story) {
  return story?.source === 'ttv' || String(story?.slug || '').startsWith('ttv--')
}

export default function StoryDetail({ story, onBack, onSelectChapter }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [lastRead, setLastRead] = useState(null)
  const { toast, showToast, dismissToast } = useToast()

  useEffect(() => {
    loadStoryDetail(isTtvStory(story))
    // Load last read chapter from history
    try {
      const history = JSON.parse(localStorage.getItem('hagent_reading_history') || '{}')
      if (history[story.slug]) {
        setLastRead(history[story.slug])
      }
    } catch (e) {
      console.error('Error loading history:', e)
    }
  }, [story.slug])

  async function loadStoryDetail(forceRefresh = false) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (forceRefresh) params.set('refresh', 'true')
      if (isTtvStory(story)) params.set('source', 'ttv')
      const query = params.toString()
      const data = await apiGet(`/api/truyencv/story/${story.slug}${query ? `?${query}` : ''}`)
      setDetail(data)
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#fafaf9] gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-amber-100 border-t-amber-600 animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-amber-700">CV</div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">Đang cào dữ liệu chương...</p>
          <p className="text-xs text-gray-400 mt-1">Quá trình này có thể mất vài giây nếu truyện chưa được lưu trong DB</p>
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#fafaf9] p-6 text-center">
        <div className="mb-4 rounded-full bg-red-50 p-3 text-red-500">
          <BookOpen className="h-8 w-8" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800">Không thể tải thông tin chi tiết</h3>
        <p className="mt-1 text-xs text-gray-500 max-w-xs">{error || 'Đã xảy ra lỗi không xác định'}</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại
          </button>
          <button
            onClick={() => loadStoryDetail(true)}
            className="flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-all shadow-sm shadow-amber-600/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại & Tải lại
          </button>
        </div>
      </div>
    )
  }

  // Filter & Sort Chapters
  const filteredChapters = detail.chapters.filter(ch =>
    ch.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(ch.chapter_number).includes(searchQuery)
  )

  const sortedChapters = [...filteredChapters].sort((a, b) => {
    if (sortOrder === 'asc') {
      return a.chapter_number - b.chapter_number
    } else {
      return b.chapter_number - a.chapter_number
    }
  })
  const capturedChapterCount = detail.chapters.length
  const knownChapterCount = detail.chapter_count || capturedChapterCount
  const chapterCountLabel = capturedChapterCount > 0
    ? `${capturedChapterCount} chương`
    : knownChapterCount > 0
      ? `0/${knownChapterCount} chương`
      : '0 chương'

  // Handle start/resume reading
  const handleStartOrResume = () => {
    if (lastRead) {
      // Find the chapter in the list to make sure it's valid
      const ch = detail.chapters.find(c => c.slug === lastRead.chapterSlug)
      if (ch) {
        onSelectChapter(ch)
        return
      }
    }
    // Default to first chapter
    if (detail.chapters.length > 0) {
      onSelectChapter(detail.chapters[0])
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#fafaf9]">
      <Toast toast={toast} onClose={dismissToast} />
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Back button */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-2.5 sm:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-amber-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách
          </button>
        </div>

        {/* Banner area */}
        <div className="relative border-b border-gray-100 bg-white px-5 py-6 sm:px-8">
          <div className="flex flex-col md:flex-row gap-6 md:items-start max-w-4xl mx-auto">
            {/* Cover image */}
            <div className="w-32 h-44 shrink-0 mx-auto md:mx-0 overflow-hidden rounded-xl bg-gray-50 border border-gray-100 shadow-md">
              <img
                src={detail.cover_url || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300'}
                alt={detail.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.src = 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300'
                }}
              />
            </div>

            {/* Meta info */}
            <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
              <h2 className="text-xl font-bold text-gray-900 leading-tight tracking-tight md:text-2xl font-sans">
                {detail.title}
              </h2>
              
              <div className="mt-3.5 flex flex-wrap justify-center md:justify-start gap-y-2 gap-x-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-amber-500/80" />
                  Tác giả: <span className="font-semibold text-gray-700">{detail.author || 'Đang cập nhật'}</span>
                </span>
                <span className="h-3 w-px bg-gray-200 self-center hidden sm:inline"></span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-amber-500/80" />
                  Trạng thái: <span className="font-semibold text-gray-700">{detail.status || 'Đang cập nhật'}</span>
                </span>
                <span className="h-3 w-px bg-gray-200 self-center hidden sm:inline"></span>
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-amber-500/80" />
                  Số chương: <span className="font-semibold text-gray-700">{detail.chapter_count || detail.chapters.length}</span>
                </span>
              </div>

              {/* Tags/Genres */}
              {detail.genres && detail.genres.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-1.5">
                  {detail.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full bg-amber-50 border border-amber-100/60 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 shadow-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap gap-2.5 justify-center md:justify-start w-full">
                <button
                  onClick={handleStartOrResume}
                  disabled={capturedChapterCount === 0}
                  className="flex items-center justify-center gap-2 rounded-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:bg-gray-300 disabled:shadow-none text-white px-7 py-2.5 text-sm font-semibold transition-all duration-300 shadow-md shadow-amber-600/10"
                >
                  <BookOpen className="h-4 w-4" />
                  {lastRead ? `Đọc tiếp: ${lastRead.chapterTitle}` : 'Bắt đầu đọc'}
                </button>
                
                <button
                  onClick={() => loadStoryDetail(true)}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-600 transition-all duration-300 shadow-sm"
                  title="Tải lại từ trang nguồn"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Cập nhật chương mới
                </button>

                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`${BASE}/api/truyencv/story/${story.slug}`, { method: 'DELETE' })
                      if (r.ok) {
                        showToast('Đã xoá truyện khỏi kho.', 'success')
                        window.setTimeout(onBack, 350)
                      } else {
                        showToast('Lỗi khi xoá: ' + await r.text(), 'error', 5000)
                      }
                    } catch (err) {
                      showToast(err.message, 'error', 5000)
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-red-200 bg-white hover:bg-red-50 active:bg-red-100 px-4 py-2 text-xs font-semibold text-red-500 transition-all duration-300 shadow-sm hover:border-red-300"
                  title="Xóa toàn bộ truyện khỏi database"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xoá truyện
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Synopsis & Chapters layout */}
        <div className="max-w-4xl mx-auto px-5 py-6 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Synopsis */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2">
              <span>📝</span> Giới thiệu truyện
            </h3>
            <div className="text-sm text-gray-600 leading-relaxed font-sans whitespace-pre-line bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              {detail.description ? detail.description : 'Story chưa có bản tóm tắt nội dung.'}
            </div>
          </div>

          {/* Chapters Sidebar */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span>📋</span> Mục lục
              </h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                {chapterCountLabel}
              </span>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col gap-3">
              {/* Search and Sort controls */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm chương..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50/50 pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white focus:border-amber-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="rounded-lg border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 transition-all text-gray-500 hover:text-gray-700 flex items-center justify-center shrink-0"
                  title={sortOrder === 'asc' ? 'Hiện chương mới nhất lên đầu' : 'Hiện chương cũ nhất lên đầu'}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Chapters list */}
              <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-gray-50 pr-1">
                {sortedChapters.length === 0 ? (
                  <div className="py-12 text-center text-xs leading-5 text-gray-400">
                    {knownChapterCount > 0
                      ? 'Chưa có mục lục đã capture. Mở mục lục truyện này trong app TTV trên iPad rồi bấm Cập nhật chương mới.'
                      : 'Không tìm thấy chương nào.'}
                  </div>
                ) : (
                  sortedChapters.map((ch, index) => {
                    const isLastReadCh = lastRead?.chapterSlug === ch.slug
                    const chapterNumber = getChapterNumber(ch, index)
                    const chapterTitle = chapterTitleWithoutNumber(ch.title, chapterNumber)
                    return (
                      <div
                        key={ch.slug}
                        className={`w-full py-1 px-1.5 hover:bg-amber-50/50 rounded-lg flex items-center justify-between text-xs group ${
                          isLastReadCh ? 'bg-amber-50' : ''
                        }`}
                      >
                        <button
                          onClick={() => onSelectChapter(ch)}
                          className={`flex-1 text-left py-1 truncate pr-2 group-hover:translate-x-0.5 transition-transform duration-200 hover:text-amber-700 ${
                            isLastReadCh ? 'font-semibold text-amber-800' : 'text-gray-600'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              isLastReadCh ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              Chương {chapterNumber}
                            </span>
                            <span className="min-w-0 truncate">{chapterTitle}</span>
                          </span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {isLastReadCh && (
                            <span className="text-[9px] text-amber-600 font-medium bg-amber-100/50 px-1 py-0.5 rounded">
                              Vừa đọc
                            </span>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const r = await fetch(`${BASE}/api/truyencv/story/${story.slug}/chapter/${ch.slug}`, { method: 'DELETE' })
                                if (r.ok) {
                                  showToast('Đã xoá chương khỏi kho.', 'success');
                                  loadStoryDetail();
                                } else {
                                  showToast('Lỗi khi xoá chương: ' + await r.text(), 'error', 5000);
                                }
                              } catch (err) {
                                showToast(err.message, 'error', 5000);
                              }
                            }}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                            title="Xóa chương này khỏi database"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
