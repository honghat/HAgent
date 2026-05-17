import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Briefcase, Download, Trash2, TrendingUp, Building2, Globe } from 'lucide-react'

const SOURCES = ['itviec', 'topdev', 'vietnamworks', 'careerlink']

export default function JobHunter({ token }) {
  const [keywords, setKeywords] = useState('')
  const [sources, setSources] = useState(['itviec', 'topdev'])
  const [maxPages, setMaxPages] = useState(2)
  const [keywordSearch, setKeywordSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const res = await fetch('/api/job-hunter/stats', { headers })
      if (res.ok) setStats(await res.json())
    } catch {}
  }

  const scrape = useCallback(async () => {
    if (!keywords.trim()) { setError('Nhập từ khóa, ví dụ: python, react'); return }
    setLoading(true); setError(''); setStatus('')
    try {
      const res = await fetch('/api/job-hunter/scrape', {
        method: 'POST', headers,
        body: JSON.stringify({
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          sources, max_pages: maxPages
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Quét thất bại')
      setJobs(data.jobs)
      setStatus(`Tìm thấy ${data.count} việc (${data.new_count} mới)`)
      loadStats()
    } catch (err) { setError(err.message) }
    setLoading(false)
  }, [keywords, sources, maxPages, headers])

  const search = useCallback(async () => {
    setSearching(true); setError(''); setStatus('')
    try {
      // If a search keyword is provided, scrape fresh jobs first
      if (keywordSearch.trim()) {
        const scrapeRes = await fetch('/api/job-hunter/scrape', {
          method: 'POST', headers,
          body: JSON.stringify({
            keywords: keywordSearch.split(',').map(k => k.trim()).filter(Boolean),
            sources,
            max_pages: maxPages
          })
        })
        const scrapeData = await scrapeRes.json()
        if (!scrapeRes.ok) throw new Error(scrapeData.detail || 'Tìm kiếm thất bại')
      }

      // Then filter/search through cache
      const params = new URLSearchParams()
      if (keywordSearch) params.set('keyword', keywordSearch)
      if (sourceFilter) params.set('source', sourceFilter)
      if (locationSearch) params.set('location', locationSearch)
      if (salaryMin) params.set('salary_min', salaryMin)
      params.set('limit', '100')
      const res = await fetch(`/api/job-hunter/search?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Tìm kiếm thất bại')
      setJobs(data.jobs)
      setStatus(`${data.count} kết quả`)
      loadStats()
    } catch (err) { setError(err.message) }
    setSearching(false)
  }, [keywordSearch, sourceFilter, locationSearch, salaryMin, sources, maxPages, headers])

  const exportCsv = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (keywordSearch) params.set('keyword', keywordSearch)
      if (sourceFilter) params.set('source', sourceFilter)
      if (salaryMin) params.set('salary_min', salaryMin)
      const res = await fetch(`/api/job-hunter/export?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      const blob = new Blob([data.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'jobs.csv'; a.click()
      URL.revokeObjectURL(url)
      setStatus(`Đã xuất ${data.rows} việc`)
    } catch (err) { setError(err.message) }
  }, [keywordSearch, sourceFilter, salaryMin, headers])

  function fmtSalary(job) {
    if (job.salary) return job.salary
    if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max)
      return `${(job.salary_min / 1_000_000).toFixed(0)} - ${(job.salary_max / 1_000_000).toFixed(0)} triệu`
    if (job.salary_max) return `Tới ${(job.salary_max / 1_000_000).toFixed(0)} triệu`
    if (job.salary_min) return `Từ ${(job.salary_min / 1_000_000).toFixed(0)} triệu`
    return 'Thỏa thuận'
  }

  function fmtDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Hôm nay'
    if (diff === 1) return 'Hôm qua'
    if (diff < 7) return `${diff} ngày trước`
    return d.toLocaleDateString('vi-VN')
  }

  const sourceColors = {
    itviec: 'bg-slate-100 text-slate-700',
    topdev: 'bg-emerald-50 text-emerald-700',
    vietnamworks: 'bg-amber-50 text-amber-700',
    careerlink: 'bg-sky-50 text-sky-700',
  }

  return (
    <div className="h-full bg-gray-50 flex flex-col font-sans">
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Săn việc</h1>
              <p className="text-[10px] text-gray-400">{SOURCES.join(', ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                {stats.total} việc đã lưu
              </span>
            )}
            <button onClick={exportCsv} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Xuất CSV">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Scrape form */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="Từ khóa, ví dụ: python, react, devops"
              className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-slate-400"
            />
            <input
              type="number" min={1} max={5}
              value={maxPages}
              onChange={e => setMaxPages(Number(e.target.value))}
              className="w-14 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs text-center outline-none focus:ring-1 focus:ring-slate-400"
              title="Số trang"
            />
            <button
              onClick={scrape} disabled={loading}
              className="px-2.5 py-1.5 rounded-md bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {loading ? 'Đang quét...' : 'Quét'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map(s => (
              <button key={s} onClick={() => setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all ${
                  sources.includes(s) ? sourceColors[s] + ' border-transparent' : 'bg-white border-gray-200 text-gray-400'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Search / Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input value={keywordSearch} onChange={e => setKeywordSearch(e.target.value)}
              placeholder="Tìm trong kết quả..."
              className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-slate-400"
            />
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-slate-400">
              <option value="">Tất cả nguồn</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={locationSearch} onChange={e => setLocationSearch(e.target.value)}
              placeholder="Địa điểm"
              className="w-24 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-slate-400"
            />
            <input type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)}
              placeholder="Lương tối thiểu"
              className="w-28 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button onClick={search} disabled={searching}
              className="px-2.5 py-1.5 rounded-md bg-gray-800 text-white text-xs font-semibold hover:bg-black disabled:opacity-40 flex items-center gap-1">
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Tìm
            </button>
          </div>
        </div>

        {/* Status / Error */}
        {status && <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-100 text-[11px] font-medium text-emerald-700">{status}</div>}
        {error && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-100 text-[11px] font-medium text-red-600">{error}</div>}

        {/* Stats mini */}
        {stats && stats.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white border border-gray-200 rounded-md p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium mb-1"><Briefcase className="w-3 h-3" /> Tổng</div>
              <div className="text-base font-semibold text-gray-900">{stats.total}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium mb-1"><Globe className="w-3 h-3" /> Nguồn</div>
              <div className="text-base font-semibold text-gray-900">{Object.keys(stats.by_source || {}).length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium mb-1"><Building2 className="w-3 h-3" /> Công ty</div>
              <div className="text-base font-semibold text-gray-900">{(stats.top_companies || []).length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium mb-1"><TrendingUp className="w-3 h-3" /> Lương TB</div>
              <div className="text-base font-semibold text-gray-900">
                {stats.avg_salary_max ? `${(stats.avg_salary_max / 1_000_000).toFixed(0)}tr` : '-'}
              </div>
            </div>
          </div>
        )}

        {/* Job results */}
        <div className="space-y-2 pb-4">
          {jobs.length === 0 && !loading && (
            <div className="bg-white border border-gray-200 rounded-lg py-12 text-center">
              <Briefcase className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400 font-medium">Nhập từ khóa rồi bấm Quét</p>
            </div>
          )}
          {jobs.map(job => (
            <div key={job.url} className="bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sourceColors[job.source] || 'bg-gray-100 text-gray-600'}`}>
                      {job.source}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDate(job.posted_date)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug">{job.title}</h3>
                  <p className="text-[11px] font-medium text-slate-600 mt-0.5">{job.company}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold text-emerald-700">{fmtSalary(job)}</div>
                </div>
              </div>
              {(job.location || job.description_snippet) && (
                <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">
                  {job.location && <span className="font-medium">{job.location}</span>}
                  {job.location && job.description_snippet && ' · '}
                  {job.description_snippet}
                </p>
              )}
              {job.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {job.skills.slice(0, 6).map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-600">{s}</span>
                  ))}
                  {job.skills.length > 6 && <span className="text-[10px] text-gray-400 self-center">+{job.skills.length - 6}</span>}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <a href={job.url} target="_blank" rel="noreferrer"
                  className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 truncate">
                  Mở trên {job.url.replace(/^https?:\/\//, '').replace(/\/.*/, '')}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
