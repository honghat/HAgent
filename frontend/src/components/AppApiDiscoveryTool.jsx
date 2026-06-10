import { useMemo, useState } from 'react'
import { Activity, BookOpen, Clipboard, Loader2, Search, Server, ShieldCheck } from 'lucide-react'

const DEFAULT_APP = 'TruyenCV'
const APP_NAME_KEY = 'hagent_app_api_discovery_app'
const STORY_QUERY_KEY = 'hagent_app_api_story_query'
const STORY_SOURCE_KEY = 'hagent_app_api_story_source'

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(res.ok ? 'Phản hồi máy chủ không hợp lệ' : text)
  }
}

function ResultPill({ children }) {
  return (
    <span className="inline-flex min-w-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-800">
      <span className="truncate">{children}</span>
    </span>
  )
}

function EmptyHint({ children }) {
  return <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[12px] text-gray-400">{children}</div>
}

function Section({ title, icon, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-black/[0.02]">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-gray-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-500 transition-all hover:border-gray-300 hover:text-gray-900"
    >
      <Clipboard className="h-3 w-3" />
      {copied ? 'Đã copy' : 'Copy'}
    </button>
  )
}

export default function AppApiDiscoveryTool({ token, children }) {
  const [appName, setAppName] = useState(() => localStorage.getItem(APP_NAME_KEY) || DEFAULT_APP)
  const [includeLive, setIncludeLive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [storyQuery, setStoryQuery] = useState(() => localStorage.getItem(STORY_QUERY_KEY) || '')
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState('')
  const [storyResults, setStoryResults] = useState([])
  const [storyDetail, setStoryDetail] = useState(null)
  const [storySource, setStorySource] = useState(() => localStorage.getItem(STORY_SOURCE_KEY) || 'truyencv')

  const curlExample = useMemo(() => {
    const base = result?.api_base_urls?.[0] || 'https://truyencv.io/wp-json'
    const mangaPath = result?.api_paths?.find(path => path.includes('/wp/v2/manga')) || '/wp/v2/manga'
    return `${base}${mangaPath}`
  }, [result])

  async function runDiscovery() {
    const app = appName.trim()
    if (!app) {
      setError('Nhập tên app hoặc đường dẫn .app')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    localStorage.setItem(APP_NAME_KEY, app)

    try {
      const res = await fetch('/api/app-tools/discover-app-apis', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app,
          include_live_connections: includeLive,
          limit: 120,
        }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không quét được app')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStoryDetail(story) {
    setStoryLoading(true)
    setStoryError('')
    setStoryDetail(null)
    try {
      const sourceParam = storySource === 'ttv' ? '&source=ttv' : ''
      const res = await fetch(`/api/truyencv/story/${encodeURIComponent(story.slug)}?refresh=true${sourceParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tải được danh sách chương')
      setStoryDetail(data)
    } catch (err) {
      setStoryError(err.message)
    } finally {
      setStoryLoading(false)
    }
  }

  async function searchAndFetchStory(e) {
    e?.preventDefault()
    const query = storyQuery.trim()
    if (!query) {
      setStoryError('Nhập tên truyện cần lấy')
      return
    }
    setStoryLoading(true)
    setStoryError('')
    setStoryResults([])
    setStoryDetail(null)
    localStorage.setItem(STORY_QUERY_KEY, query)
    localStorage.setItem(STORY_SOURCE_KEY, storySource)

    try {
      const sourceParam = storySource === 'ttv' ? '&source=ttv' : ''
      const res = await fetch(`/api/truyencv/search?q=${encodeURIComponent(query)}${sourceParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'Không tìm thấy truyện')
      const list = Array.isArray(data) ? data : []
      setStoryResults(list)
      if (!list.length) throw new Error(`Không có kết quả cho “${query}”`)
      await fetchStoryDetail(list[0])
    } catch (err) {
      setStoryError(err.message)
      setStoryLoading(false)
    }
  }

  const apiBaseUrls = result?.api_base_urls || []
  const apiPaths = result?.api_paths || []
  const likelyHosts = result?.likely_hosts || []
  const processes = result?.running_processes || []
  const connections = result?.live_connections || []
  const evidence = result?.evidence || []

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf9] px-4 py-5 custom-scrollbar sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm shadow-amber-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                <ShieldCheck className="h-3 w-3" />
                Read-only app API discovery
              </div>
              <h2 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Dò API từ ứng dụng macOS</h2>
              <p className="mt-2 text-[13px] leading-6 text-gray-500">
                Công cụ quét bundle `.app`, tìm URL/API path nhúng trong binary, plist và liệt kê kết nối TCP đang mở của tiến trình. Kết quả đã loại query string và không trích xuất credentials.
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white bg-white/80 p-3 shadow-sm lg:max-w-md">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tên app hoặc đường dẫn .app</label>
              <div className="flex gap-2">
                <input
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runDiscovery() }}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-semibold text-gray-800 outline-none transition-all focus:border-amber-400 focus:bg-white"
                  placeholder="TruyenCV hoặc /Applications/TruyenCV.app"
                />
                <button
                  type="button"
                  onClick={() => setAppName(DEFAULT_APP)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-500 transition-all hover:border-amber-300 hover:text-amber-700"
                >
                  TruyenCV
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-gray-500">
                  <input
                    type="checkbox"
                    checked={includeLive}
                    onChange={e => setIncludeLive(e.target.checked)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  Đọc tiến trình/kết nối đang mở
                </label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={runDiscovery}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-[12px] font-bold text-white shadow-sm shadow-amber-600/20 transition-all hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Quét API app
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
            {error}
          </div>
        )}

        {!result && !loading && !error && (
          <EmptyHint>Nhấn “Quét API app” để xem base URL, API path và bằng chứng file trong app bundle.</EmptyHint>
        )}

        <Section title="Lấy truyện và toàn bộ chương" icon={<BookOpen className="h-4 w-4" />}>
          <form onSubmit={searchAndFetchStory} className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Tên truyện</label>
              <input
                value={storyQuery}
                onChange={e => setStoryQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-semibold text-gray-800 outline-none transition-all focus:border-amber-400 focus:bg-white"
                placeholder="Ví dụ: Chấp Ma, Tận Thế Tuần Hoàn..."
              />
            </div>
            <div className="lg:w-40">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Nguồn</label>
              <select
                value={storySource}
                onChange={e => setStorySource(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-bold text-gray-700 outline-none transition-all focus:border-amber-400 focus:bg-white"
              >
                <option value="truyencv">TruyenCV</option>
                <option value="ttv">TTV</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={storyLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-[12px] font-bold text-white shadow-sm transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {storyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Tìm và tải chương
            </button>
          </form>

          {storyError && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              {storyError}
            </div>
          )}

          {storyResults.length > 1 && (
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Kết quả tìm thấy</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {storyResults.slice(0, 8).map(story => (
                  <button
                    key={story.slug}
                    type="button"
                    onClick={() => fetchStoryDetail(story)}
                    disabled={storyLoading}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
                      storyDetail?.slug === story.slug
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-100 bg-gray-50 hover:border-amber-200 hover:bg-white'
                    }`}
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
                      {story.cover_url ? <img src={story.cover_url} alt={story.title} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[12px] font-bold text-gray-800">{story.title}</div>
                      <div className="mt-1 font-mono text-[10px] text-gray-400">{story.slug}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {storyDetail && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-white bg-gray-100 shadow-sm">
                  {storyDetail.cover_url ? <img src={storyDetail.cover_url} alt={storyDetail.title} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-gray-900">{storyDetail.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-500">
                    <span>{storyDetail.author || 'Chưa rõ tác giả'}</span>
                    <span>·</span>
                    <span>{storyDetail.chapter_count || storyDetail.chapters?.length || 0} chương</span>
                    {storyDetail.status && <span>· {storyDetail.status}</span>}
                  </div>
                  {storyDetail.genres?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {storyDetail.genres.slice(0, 8).map(genre => (
                        <span key={genre} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700">{genre}</span>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[12px] leading-5 text-gray-500">
                    Đã lưu truyện và toàn bộ mục lục chương vào DB từ nguồn {storySource === 'ttv' ? 'TTV' : 'TruyenCV'}. Nội dung từng chương sẽ được tải/cache khi mở đọc chương đó.
                  </p>
                </div>
              </div>

              <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-white bg-white/70 p-2 custom-scrollbar">
                {(storyDetail.chapters || []).length ? (
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                    {storyDetail.chapters.map(chapter => (
                      <div key={chapter.slug} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-amber-50">
                        <span className="mr-2 font-mono text-[10px] text-gray-400">#{chapter.chapter_number || '-'}</span>
                        {chapter.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyHint>Truyện này chưa có chương.</EmptyHint>
                )}
              </div>
            </div>
          )}
        </Section>

        {children}

        {result && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section title="API base URL" icon={<Server className="h-4 w-4" />}>
                {apiBaseUrls.length ? (
                  <div className="flex flex-wrap gap-2">{apiBaseUrls.map(url => <ResultPill key={url}>{url}</ResultPill>)}</div>
                ) : (
                  <EmptyHint>Không tìm thấy URL có dấu hiệu API base.</EmptyHint>
                )}
              </Section>

              <Section title="Domain khả nghi" icon={<Activity className="h-4 w-4" />}>
                {likelyHosts.length ? (
                  <div className="flex flex-wrap gap-2">{likelyHosts.map(host => <ResultPill key={host}>{host}</ResultPill>)}</div>
                ) : (
                  <EmptyHint>Không tìm thấy domain riêng của app.</EmptyHint>
                )}
              </Section>
            </div>

            <Section title="API path nhúng trong app" icon={<Search className="h-4 w-4" />}>
              {apiPaths.length ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {apiPaths.map(path => (
                    <div key={path} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono text-[12px] font-semibold text-gray-700">
                      {path}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyHint>Không tìm thấy API path.</EmptyHint>
              )}
            </Section>

            <Section title="Gợi ý endpoint thử nhanh" icon={<Clipboard className="h-4 w-4" />}>
              <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-950 p-3 text-gray-100 sm:flex-row sm:items-center sm:justify-between">
                <code className="min-w-0 break-all font-mono text-[12px]">{curlExample}</code>
                <CopyButton text={curlExample} />
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section title="Tiến trình đang chạy" icon={<Activity className="h-4 w-4" />}>
                {processes.length ? (
                  <div className="space-y-2">
                    {processes.map(item => (
                      <div key={`${item.pid}-${item.command}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[12px] font-bold text-gray-800">{item.executable} · PID {item.pid}</div>
                        <div className="mt-1 break-all font-mono text-[10px] text-gray-400">{item.command}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyHint>Không thấy tiến trình app đang chạy.</EmptyHint>
                )}
              </Section>

              <Section title="TCP đang mở" icon={<Server className="h-4 w-4" />}>
                {connections.length ? (
                  <div className="space-y-2">
                    {connections.map(conn => (
                      <div key={conn} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono text-[12px] font-semibold text-gray-700">
                        {conn}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyHint>Không có kết nối TCP established hoặc app chưa mở kết nối mạng.</EmptyHint>
                )}
              </Section>
            </div>

            <Section title="Bằng chứng trong bundle" icon={<Search className="h-4 w-4" />}>
              {evidence.length ? (
                <div className="space-y-3">
                  {evidence.map(item => (
                    <details key={item.file} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                      <summary className="cursor-pointer text-[12px] font-bold text-gray-800">{item.file}</summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(item.matches || []).map(match => <ResultPill key={`${item.file}-${match}`}>{match}</ResultPill>)}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <EmptyHint>Không có file evidence.</EmptyHint>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
