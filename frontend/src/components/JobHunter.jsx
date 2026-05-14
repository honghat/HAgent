import { useState, useEffect } from 'react'
import { Briefcase, Upload, Loader2, Sparkles, FileText, ExternalLink, CheckCircle2, XCircle, Clock } from 'lucide-react'

export default function JobHunter({ token, provider }) {
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [jobUrls, setJobUrls] = useState('')
  const [sources, setSources] = useState('itviec') // itviec, linkedin, topcv
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [autoSearching, setAutoSearching] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logs, setLogs] = useState([])

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5))
  }

  // Load profiles on mount
  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    setLoading(true)
    addLog('Đang tải danh sách hồ sơ...')
    try {
      const res = await fetch('/api/job-hunter/profiles', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Không thể tải profiles')
      const data = await res.json()
      setProfiles(data.profiles || [])
      if (data.profiles?.length > 0) {
        // Nếu đã có profile được chọn, tìm lại nó trong list mới
        const current = selectedProfile ? data.profiles.find(p => p.id === selectedProfile.id) : data.profiles[0]
        setSelectedProfile(current || data.profiles[0])
        loadJobs(current?.id || data.profiles[0].id)
      }
      addLog(`Đã tải ${data.profiles?.length || 0} hồ sơ`)
    } catch (err) {
      setError(err.message)
      addLog(`Lỗi: ${err.message}`)
    }
    setLoading(false)
  }

  async function loadJobs(profileId) {
    if (!profileId) return
    try {
      const res = await fetch(`/api/job-hunter/profiles/${profileId}/jobs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const data = await res.json()
      setJobs(data.jobs || [])
    } catch (err) {
      console.error('Load jobs error:', err)
    }
  }

  async function uploadCV(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')
    setSuccess('')
    addLog(`Đang tải lên CV: ${file.name}...`)
    try {
      const form = new FormData()
      form.append('cv', file)
      form.append('provider', provider)
      addLog(`AI: Đang sử dụng ${provider}...`)
      addLog('Đang phân tích CV (Playwright + AI)...')
      const res = await fetch('/api/job-hunter/profiles/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Tải CV lên và phân tích thành công!')
      addLog('Phân tích CV hoàn tất.')
      await loadProfiles()
      setSelectedProfile(data.profile)
      loadJobs(data.profile.id)
    } catch (err) {
      setError(err.message)
      addLog(`Lỗi: ${err.message}`)
    }
    event.target.value = ''
    setLoading(false)
  }

  async function processJobs() {
    if (!selectedProfile) return
    if (!jobUrls.trim()) {
      setError('Vui lòng nhập URL việc làm')
      return
    }

    setProcessing(true)
    setError('')
    setSuccess('')
    const urls = jobUrls.split('\n').map(u => u.trim()).filter(Boolean)
    addLog(`Đang phân tích ${urls.length} việc làm...`)
    try {
      const res = await fetch(`/api/job-hunter/profiles/${selectedProfile.id}/jobs`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls, provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setJobUrls('')
      setSuccess(`Đã phân tích ${data.results?.length || 0} việc làm`)
      addLog(`Hoàn tất phân tích ${data.results?.length || 0} việc làm`)
      await loadJobs(selectedProfile.id)
    } catch (err) {
      setError(err.message)
      addLog(`Lỗi: ${err.message}`)
    }
    setProcessing(false)
  }

  async function autoSearch() {
    if (!selectedProfile) return

    setAutoSearching(true)
    setError('')
    setSuccess('')
    addLog(`AI: Đang sử dụng ${provider}...`)
    addLog(`Đang tìm việc từ ${sources} (Playwright + AI)...`)
    try {
      const res = await fetch(`/api/job-hunter/profiles/${selectedProfile.id}/auto-search`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, source: sources }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await loadJobs(selectedProfile.id)
      setSuccess(`Tìm thấy ${data.search?.summary?.totalUrls || 0} việc phù hợp!`)
      addLog(`Hoàn tất. Tìm thấy ${data.search?.summary?.totalUrls || 0} kết quả.`)
    } catch (err) {
      setError(err.message)
      addLog(`Lỗi: ${err.message}`)
    }
    setAutoSearching(false)
  }

  async function updateJobStatus(jobId, status) {
    try {
      const res = await fetch(`/api/job-hunter/jobs/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Cập nhật thất bại')

      await loadJobs(selectedProfile.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function importLocal() {
    const sourcePath = prompt('Nhập đường dẫn file CV trên máy (VD: /Users/name/cv.pdf):')
    if (!sourcePath) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/job-hunter/profiles/import', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: sourcePath, provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await loadProfiles()
      setSelectedProfile(data.profile)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="h-full bg-gray-50 overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-indigo-200 shadow-lg">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Săn Việc AI</h1>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{provider}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            <button
              onClick={importLocal}
              disabled={loading}
              className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-all flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Local
            </button>
            <label className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer hover:bg-indigo-700 transition-all flex items-center gap-1.5 shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              Upload CV
              <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={uploadCV} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Profile Selector */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FileText className="w-3 h-3" /> Hồ sơ của bạn
              </h3>

              {profiles.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProfile(p)
                        loadJobs(p.id)
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedProfile?.id === p.id
                        ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                        : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${selectedProfile?.id === p.id ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                        <span className={`text-xs font-bold truncate ${selectedProfile?.id === p.id ? 'text-indigo-900' : 'text-gray-700'}`}>
                          {p.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 line-clamp-1">{p.parsed?.roles?.[0] || 'Chưa phân tích'}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-[10px] font-bold text-gray-400">CHƯA CÓ CV</p>
                </div>
              )}
            </div>

            {/* Auto Search Config */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Tìm việc thông minh
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 mb-2 block">NGUỒN DỮ LIỆU</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['itviec', 'topcv', 'linkedin', 'career'].map(src => (
                      <button
                        key={src}
                        onClick={() => setSources(src)}
                        className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                          sources === src
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={autoSearch}
                  disabled={!selectedProfile || autoSearching}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-indigo-700 shadow-indigo-100 shadow-lg transition-all"
                >
                  {autoSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang quét {sources}...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Tìm Việc Cho Tôi
                    </>
                  )}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100"></span></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold"><span className="bg-white px-2 text-gray-300">Hoặc dán URL</span></div>
                </div>

                <textarea
                  value={jobUrls}
                  onChange={(e) => setJobUrls(e.target.value)}
                  placeholder="Dán URL việc làm vào đây (mỗi dòng 1 URL)..."
                  className="w-full h-24 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
                />

                <button
                  onClick={processJobs}
                  disabled={!selectedProfile || processing || !jobUrls.trim()}
                  className="w-full py-3 rounded-xl bg-gray-900 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-black transition-all"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Phân Tích URL
                </button>
              </div>
            </div>

            {/* Status Messages */}
            {(error || success || logs.length > 0) && (
              <div className="space-y-3">
                {logs.length > 0 && (
                  <div className="bg-gray-900 rounded-2xl p-4 font-mono text-[10px] text-emerald-400 shadow-inner">
                    <div className="flex items-center gap-2 mb-2 border-b border-gray-800 pb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-gray-400 uppercase tracking-widest">Processing Log</span>
                    </div>
                    {logs.map((log, i) => (
                      <div key={i} className={i === 0 ? 'text-white' : 'opacity-50'}>{log}</div>
                    ))}
                  </div>
                )}

                {(error || success) && (
                  <div className={`p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                    error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  }`}>
                    {error ? <XCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    <p className="text-xs font-bold leading-tight">{error || success}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main Feed */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Briefcase className="w-3 h-3" /> Kết quả phân tích ({jobs.length})
              </h2>
            </div>

            {jobs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-3xl py-24 text-center px-6">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-gray-200" />
                </div>
                <h4 className="text-sm font-bold text-gray-900 mb-1">Bắt đầu tìm việc</h4>
                <p className="text-xs text-gray-500 max-w-[200px] mx-auto leading-relaxed">Chọn CV và bấm nút Tìm Việc hoặc dán link tuyển dụng để AI bắt đầu phân tích</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 pb-10">
                {jobs.map(job => (
                  <JobResultCard
                    key={job.id}
                    job={job}
                    onUpdateStatus={updateJobStatus}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function JobResultCard({ job, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcons = {
    new: <Clock className="w-3.5 h-3.5 text-gray-400" />,
    reviewing: <Clock className="w-3.5 h-3.5 text-blue-500" />,
    interested: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    applied: <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />,
    rejected: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  }

  const matchColor = job.matchScore >= 80 ? 'text-emerald-600' : job.matchScore >= 60 ? 'text-indigo-600' : 'text-amber-600'
  const matchBg = job.matchScore >= 80 ? 'bg-emerald-50' : job.matchScore >= 60 ? 'bg-indigo-50' : 'bg-amber-50'

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-4 sm:p-5 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-gray-900 truncate">{job.job_title || job.title}</h3>
            {statusIcons[job.status]}
          </div>
          <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-tight">{job.company}</p>
        </div>

        <div className={`shrink-0 w-12 h-12 rounded-2xl ${matchBg} flex flex-col items-center justify-center transition-transform group-hover:scale-105`}>
          <span className={`text-lg font-black ${matchColor} leading-none`}>{job.matchScore}</span>
          <span className={`text-[8px] font-bold ${matchColor} uppercase`}>Match</span>
        </div>
      </div>

      {/* Pitch / Summary */}
      {job.analysis?.pitch && (
        <div className="mt-4 p-3 rounded-2xl bg-gray-50 border border-gray-100 italic">
          <p className="text-[11px] leading-relaxed text-gray-600">"{job.analysis.pitch}"</p>
        </div>
      )}

      {/* Skills Match */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {job.analysis?.skillsMatch?.slice(0, 5).map(skill => (
          <span key={skill} className="px-2 py-1 rounded-lg bg-emerald-50 text-[10px] font-bold text-emerald-700">
            {skill}
          </span>
        ))}
        {job.analysis?.skillsGap?.length > 0 && (
          <span className="px-2 py-1 rounded-lg bg-amber-50 text-[10px] font-bold text-amber-700">
            +{job.analysis.skillsGap.length} skills gap
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-3 py-2.5 rounded-xl bg-gray-900 text-white text-[10px] font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
        >
          {expanded ? 'Thu gọn' : 'Chi tiết & Luyện tập'}
        </button>
        <a
          href={job.job_url || job.url}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
        </a>

        <div className="flex gap-1 ml-auto">
          {['interested', 'applied', 'rejected'].map(st => (
            <button
              key={st}
              onClick={() => onUpdateStatus(job.id, st)}
              className={`p-2 rounded-xl border transition-all ${
                job.status === st ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
              title={st}
            >
              <div className="opacity-70">{statusIcons[st]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2">
          {/* Skills Detailed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-2xl bg-emerald-50/50">
              <p className="text-[9px] font-black text-emerald-700 uppercase mb-2">Ưu điểm</p>
              <div className="flex flex-wrap gap-1">
                {job.analysis?.skillsMatch?.map(s => <span key={s} className="text-[10px] font-bold text-emerald-900">✓ {s}</span>)}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50/50">
              <p className="text-[9px] font-black text-amber-700 uppercase mb-2">Hạn chế</p>
              <div className="flex flex-wrap gap-1">
                {job.analysis?.skillsGap?.map(s => <span key={s} className="text-[10px] font-bold text-amber-900">✗ {s}</span>)}
              </div>
            </div>
          </div>

          {/* Interview Questions */}
          {job.interviewPrep?.questions?.length > 0 && (
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-[10px] font-black text-purple-700 uppercase">Câu hỏi phỏng vấn dự kiến</p>
              </div>
              <ul className="space-y-3">
                {job.interviewPrep.questions.map((q, i) => (
                  <li key={i} className="text-[11px] font-bold text-purple-900 leading-relaxed pl-3 border-l-2 border-purple-200">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
