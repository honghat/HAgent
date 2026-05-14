import { useEffect, useMemo, useState } from 'react'
import { Briefcase, FileText, FolderInput, Loader2, MapPin, Search, Trash2, Upload, Zap } from 'lucide-react'
import ProfileSidebar from './ProfileSidebar'
import JobCard from './JobCard'
import WorkflowProgress from './WorkflowProgress'
import * as cvApi from '../api/cv-api'

const DEFAULT_CV_PATH = '/Volumes/HatAI/Run/CV/KeHoachTimViec_NguyenHongHat.docx'
const DEFAULT_JOB_URLS = [
  'https://careerviet.vn/viec-lam/data-k-vi.html',
  'https://www.topcv.vn/viec-lam',
  'https://itviec.com/viec-lam-it/lap-trinh-vien-fullstack?job_selected=fullstack-developer-nodejs-nestjs-reactjs-mobifone-solutions-1706',
  'https://www.vietnamworks.com/viec-lam?q=data',
].join('\n')

export default function CvJobs({ token, provider }) {
  const [profiles, setProfiles] = useState([])
  const [showMobileProfiles, setShowMobileProfiles] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [searches, setSearches] = useState([])
  const [localPath, setLocalPath] = useState(DEFAULT_CV_PATH)
  const [query, setQuery] = useState('')
  const [jobSources, setJobSources] = useState(DEFAULT_JOB_URLS)
  const [location, setLocation] = useState('Vietnam')
  const [remote, setRemote] = useState(true)
  const [results, setResults] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const [workflowRunning, setWorkflowRunning] = useState(false)
  const [workflowSteps, setWorkflowSteps] = useState([])
  const [error, setError] = useState('')

  useEffect(() => { loadProfiles() }, [])
  useEffect(() => {
    if (selectedId) {
      loadProfile(selectedId)
      loadSearches(selectedId)
      loadApplications(selectedId)
    } else {
      setSelected(null)
      setSearches([])
      setResults([])
      setApplications([])
    }
  }, [selectedId])

  const currentSearch = useMemo(() => searches[0], [searches])

  async function loadProfiles() {
    setLoading(true)
    setError('')
    try {
      const profiles = await cvApi.loadProfiles(token)
      setProfiles(profiles)
      setSelectedId(current => current || profiles[0]?.id || '')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function loadProfile(id) {
    try {
      const data = await cvApi.loadProfile(id, token)
      setSelected(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadSearches(id) {
    try {
      const searches = await cvApi.loadSearches(id, token)
      setSearches(searches)
      setResults(searches[0]?.results || [])
    } catch {
      setSearches([])
    }
  }

  async function loadApplications(id) {
    try {
      const apps = await cvApi.loadApplications(id, token)
      setApplications(apps)
    } catch {
      setApplications([])
    }
  }

  async function importLocal() {
    setLoading(true)
    setError('')
    try {
      const profile = await cvApi.importLocal(localPath, token)
      await loadProfiles()
      setSelectedId(profile.id)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const profile = await cvApi.uploadFile(file, token)
      await loadProfiles()
      setSelectedId(profile.id)
    } catch (err) {
      setError(err.message)
    }
    event.target.value = ''
    setLoading(false)
  }

  async function deleteSelected() {
    if (!selectedId) return
    setLoading(true)
    try {
      await cvApi.deleteProfile(selectedId, token)
      setSelectedId('')
      await loadProfiles()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function searchJobs() {
    if (!selectedId) return
    setSearching(true)
    setError('')
    try {
      const results = await cvApi.searchJobs(selectedId, { query, location, remote, limit: 24, provider }, token)
      setResults(results)
      await loadSearches(selectedId)
    } catch (err) {
      setError(err.message)
    }
    setSearching(false)
  }

  async function autoSearchJobs() {
    if (!selectedId) return
    setAutoRunning(true)
    setError('')
    try {
      const data = await cvApi.autoSearchJobs(selectedId, { query, location, remote, limit: 24, provider, minScore: 60 }, token)
      setResults(data.results || [])
      setApplications(data.applications || [])
      await loadSearches(selectedId)
      await loadApplications(selectedId)
    } catch (err) {
      setError(err.message)
    }
    setAutoRunning(false)
  }

  async function updateApplication(id, status) {
    setError('')
    try {
      const app = await cvApi.updateApplication(id, status, token)
      setApplications(current => current.map(item => item.id === id ? app : item))
    } catch (err) {
      setError(err.message)
    }
  }

  async function runFullWorkflow() {
    if (!selectedId) return
    setWorkflowRunning(true)
    setWorkflowSteps([])
    setError('')
    try {
      const result = await cvApi.runFullWorkflow(selectedId, {
        query,
        location,
        remote,
        limit: 24,
        provider,
        minScore: 60,
      }, token)
      setWorkflowSteps(result.steps || [])
      setResults(result.results || [])
      setApplications(result.applications || [])
      await loadSearches(selectedId)
      await loadApplications(selectedId)
    } catch (err) {
      setError(err.message)
      setWorkflowSteps(prev => [...prev, { step: 'error', status: 'failed', data: { message: err.message } }])
    }
    setWorkflowRunning(false)
  }

  return (
    <div className="h-full bg-white overflow-hidden flex">
      <ProfileSidebar
        profiles={profiles}
        selectedId={selectedId}
        onSelect={setSelectedId}
        localPath={localPath}
        onLocalPathChange={setLocalPath}
        onImport={importLocal}
        onUpload={uploadFile}
        loading={loading}
      />

      <section className="flex-1 min-w-0 flex flex-col">
        <div className="h-16 border-b border-gray-100 px-4 sm:px-6 flex items-center justify-between bg-white">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">Quản lý CV và tìm việc</p>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{selected?.name || 'Nạp CV để bắt đầu'}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowMobileProfiles(v => !v)} className="lg:hidden h-10 rounded-xl bg-gray-900 px-3 text-[11px] font-semibold text-white">
              CV
            </button>
            {selected && (
              <button onClick={deleteSelected} title="Xóa CV" className="w-10 h-10 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/30">
          {showMobileProfiles && (
            <div className="lg:hidden border-b border-gray-100 bg-white p-3 space-y-3">
              <div className="flex gap-2">
                <input value={localPath} onChange={e => setLocalPath(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600 outline-none" />
                <button onClick={importLocal} disabled={loading} className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-40">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
                </button>
              </div>
              <label className="h-10 rounded-xl border border-gray-100 bg-gray-50 text-gray-500 flex items-center justify-center gap-1.5 text-[11px] font-medium cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload CV
                <input type="file" accept=".doc,.docx,.pdf,.txt" onChange={uploadFile} className="hidden" />
              </label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {profiles.map(profile => (
                  <button key={profile.id} onClick={() => { setSelectedId(profile.id); setShowMobileProfiles(false) }} className={`min-w-52 text-left p-3 rounded-2xl border ${selectedId === profile.id ? 'bg-gray-900 border-gray-900 text-white' : 'bg-gray-50 border-gray-100 text-gray-700'}`}>
                    <p className="text-xs font-semibold truncate">{profile.name}</p>
                    <p className={`text-[10px] font-semibold truncate mt-1 ${selectedId === profile.id ? 'text-white/60' : 'text-gray-400'}`}>{profile.fileName}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="max-w-7xl mx-auto p-3 sm:p-6 grid grid-cols-1 gap-4 sm:gap-5 pb-safe">
            <div className="space-y-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="w-4 h-4 text-gray-900" />
                  <h3 className="text-xs font-semibold text-gray-900">Tìm việc theo CV</h3>
                </div>
                <div className="space-y-2.5">
                  <textarea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Để trống để tự tạo query từ CV, hoặc paste URL việc làm mỗi dòng"
                    rows={5}
                    className="w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs font-mono text-gray-700 outline-none focus:ring-2 focus:ring-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setQuery(jobSources)}
                    className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all"
                  >
                    Dùng 4 nguồn mặc định
                  </button>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                      <input
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        className="w-full rounded-xl border border-gray-100 bg-gray-50 pl-9 pr-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-gray-100"
                      />
                    </div>
                    <label className="px-3 rounded-lg border border-gray-100 bg-white flex items-center gap-2 text-[11px] font-medium text-gray-500">
                      <input type="checkbox" checked={remote} onChange={e => setRemote(e.target.checked)} />
                      Remote
                    </label>
                  </div>
                  <button onClick={searchJobs} disabled={!selectedId || searching} className="w-full h-10 rounded-lg bg-gray-900 text-white text-[11px] sm:text-[12px] font-medium flex items-center justify-center gap-2 disabled:opacity-40">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                    AI săn việc mới nhất lương cao
                  </button>
                  <button onClick={autoSearchJobs} disabled={!selectedId || autoRunning} className="w-full h-10 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-[12px] font-medium flex items-center justify-center gap-2 disabled:opacity-40">
                    {autoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                    Tự tìm + tự đánh giá + tạo draft
                  </button>
                  <button onClick={runFullWorkflow} disabled={!selectedId || workflowRunning} className="w-full h-11 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[11px] sm:text-[12px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/30">
                    {workflowRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    🚀 Workflow tự động hoàn chỉnh
                  </button>
                </div>
                {error && <p className="mt-3 text-xs font-bold text-red-500">{error}</p>}
              </div>

              {workflowSteps.length > 0 && (
                <WorkflowProgress steps={workflowSteps} isRunning={workflowRunning} />
              )}

              {selected && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-4 sm:p-5 lg:hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-indigo-900">{selected.name}</h3>
                  </div>
                  <p className="text-sm text-indigo-700 leading-relaxed line-clamp-3 mb-3">{selected.summary}</p>
                  <div className="space-y-2">
                    {selected.roles?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selected.roles.slice(0, 3).map(role => (
                          <span key={role} className="px-2.5 py-1 rounded-lg bg-white/80 backdrop-blur text-[10px] font-semibold text-indigo-700">{role}</span>
                        ))}
                      </div>
                    )}
                    {selected.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selected.skills.slice(0, 6).map(skill => (
                          <span key={skill} className="px-2 py-0.5 rounded-md bg-indigo-100 text-[9px] font-semibold text-indigo-600">{skill}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 lg:hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-900">Draft chờ duyệt</h3>
                  <span className="text-[10px] font-semibold text-gray-400">{applications.length}</span>
                </div>
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
                  {applications.length === 0 ? (
                    <p className="text-xs font-semibold text-gray-400">Chưa có draft apply nào.</p>
                  ) : applications.slice(0, 3).map(app => (
                    <div key={app.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-gray-400">{app.source} · {app.status}</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{app.jobTitle}</p>
                        </div>
                        <div className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-gray-900">{app.matchScore}</div>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-xs font-semibold leading-relaxed text-gray-600 line-clamp-3">{app.draftMessage}</p>
                      <div className="mt-2.5 flex gap-2">
                        <button onClick={() => updateApplication(app.id, 'approved')} className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white">Duyệt</button>
                        <button onClick={() => updateApplication(app.id, 'rejected')} className="flex-1 rounded-lg bg-white border border-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500">Bỏ</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden xl:block space-y-5">
              {selected && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/30 rounded-full blur-3xl"></div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-indigo-900">{selected.name}</h3>
                        <p className="text-[10px] font-semibold text-indigo-600">{selected.fileName}</p>
                      </div>
                    </div>
                    <p className="text-sm text-indigo-700 leading-relaxed mb-4">{selected.summary}</p>
                    <div className="space-y-3">
                      {selected.roles?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-indigo-500 mb-2">VAI TRÒ</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.roles.map(role => (
                              <span key={role} className="px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur text-[10px] font-semibold text-indigo-700 shadow-sm">{role}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.skills?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-indigo-500 mb-2">KỸ NĂNG</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.skills.map(skill => (
                              <span key={skill} className="px-2.5 py-1 rounded-md bg-indigo-100 text-[9px] font-semibold text-indigo-600">{skill}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.locations?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-indigo-500 mb-2">ĐỊA ĐIỂM</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.locations.map(loc => (
                              <span key={loc} className="px-2.5 py-1 rounded-md bg-purple-100 text-[9px] font-semibold text-purple-600">{loc}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-gray-900">Draft chờ duyệt</h3>
                  <span className="text-[10px] font-semibold text-gray-400">{applications.length}</span>
                </div>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {applications.length === 0 ? (
                    <p className="text-xs font-semibold text-gray-400">Chưa có draft apply nào.</p>
                  ) : applications.map(app => (
                    <div key={app.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-gray-400">{app.source} · {app.status}</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900 leading-snug">{app.jobTitle}</p>
                        </div>
                        <div className="shrink-0 rounded-xl bg-white px-2 py-1 text-xs font-semibold text-gray-900">{app.matchScore}</div>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-xs font-semibold leading-relaxed text-gray-600 line-clamp-6">{app.draftMessage}</p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => updateApplication(app.id, 'approved')} className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white">Duyệt</button>
                        <button onClick={() => updateApplication(app.id, 'rejected')} className="flex-1 rounded-lg bg-white border border-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500">Bỏ</button>
                      </div>
                      <a href={app.jobUrl} target="_blank" rel="noreferrer" className="mt-3 block truncate text-[11px] font-bold text-gray-400 hover:text-gray-900">{app.jobUrl}</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-widest">Kết quả việc làm</h3>
                  <p className="text-xs font-semibold text-gray-400 mt-1">{currentSearch ? currentSearch.query : 'Chưa có lượt tìm kiếm'}</p>
                </div>
                <span className="text-[10px] font-semibold text-gray-400">{results.length} jobs</span>
              </div>

              {results.length === 0 ? (
                <div className="border-2 border-dashed border-gray-100 rounded-2xl py-28 text-center bg-white">
                  <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                  <p className="text-xs font-semibold text-gray-400">Chưa có kết quả</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                  {results.map((job, index) => (
                    <JobCard key={`${job.url}-${index}`} job={job} provider={provider} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function TagGroup({ title, items = [] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-300 mb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={item} className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{item}</span>
        ))}
      </div>
    </div>
  )
}
