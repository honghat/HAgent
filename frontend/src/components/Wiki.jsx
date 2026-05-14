import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  Folder,
  Inbox,
  Loader2,
  Menu,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { fetchWiki, restructureWiki, updateEntry, deleteEntry, exportWiki } from '../api.js'

export default function Wiki({ token, provider }) {
  const [entries, setEntries] = useState([])
  const [topics, setTopics] = useState({})
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [restructuring, setRestructuring] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', content: '', summary: '', topics: '' })

  useEffect(() => { loadWiki() }, [])

  async function loadWiki() {
    setLoading(true)
    try {
      const d = await fetchWiki(token)
      setEntries(d.entries || [])
      setTopics(d.topics || {})
    } catch {}
    setLoading(false)
  }

  async function handleRestructure() {
    setRestructuring(true)
    try {
      const r = await restructureWiki(token, provider)
      if (r.restructured) loadWiki()
    } catch {}
    setRestructuring(false)
  }

  function openEntry(entry) {
    setSelectedEntry(entry)
    setEditing(false)
    setEditForm({
      title: entry.title,
      content: entry.content,
      summary: entry.summary || '',
      topics: (entry.topics || []).join(', '),
    })
    setShowSidebar(false)
  }

  function startNew() {
    setSelectedEntry({ id: 'new', title: '', content: '', topics: [], summary: '' })
    setEditing(true)
    setEditForm({ title: '', content: '', summary: '', topics: '' })
    setShowSidebar(false)
  }

  async function handleDelete(id) {
    await deleteEntry(id, token)
    loadWiki()
    if (selectedEntry?.id === id) setSelectedEntry(null)
  }

  async function saveEdit() {
    const topicsArr = editForm.topics.split(',').map(t => t.trim()).filter(Boolean)
    const payload = { title: editForm.title, content: editForm.content, summary: editForm.summary, topics: topicsArr }

    if (selectedEntry.id === 'new') {
      alert('Chức năng tạo bài viết thủ công đang được đồng bộ với Backend.')
    } else {
      await updateEntry(selectedEntry.id, payload, token)
    }
    setEditing(false)
    loadWiki()
  }

  const topicList = Object.keys(topics).sort((a, b) => a.localeCompare(b, 'vi'))
  const sourceEntries = selectedTopic ? (topics[selectedTopic] || []) : entries
  const normalizedSearch = search.trim().toLowerCase()
  const displayEntries = sourceEntries.filter(entry => {
    if (!normalizedSearch) return true
    return [entry.title, entry.summary, entry.content]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(normalizedSearch))
  })
  const pageTitle = selectedTopic || 'Tất cả tri thức'

  const SidebarContent = () => (
    <aside className="flex h-full flex-col bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold leading-5 text-gray-950">Wiki</h2>
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">{entries.length} mục tri thức</p>
          </div>
          <button
            onClick={startNew}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white shadow-sm transition-all hover:bg-black active:scale-95"
            title="Tạo bài mới"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={handleRestructure}
            disabled={restructuring}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-40"
          >
            {restructuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            Sắp xếp
          </button>
          <button
            onClick={() => exportWiki(token)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm trong wiki"
            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-[13px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
        <button
          onClick={() => { setSelectedTopic(null); setShowSidebar(false) }}
          className={`group flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] font-medium transition-all ${
            !selectedTopic ? 'bg-gray-950 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">Tất cả</span>
          </span>
          <span className={`rounded-lg px-2 py-0.5 text-[11px] ${!selectedTopic ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {entries.length}
          </span>
        </button>

        <div className="mt-3 space-y-1">
          {topicList.map(topic => (
            <button
              key={topic}
              onClick={() => { setSelectedTopic(topic); setShowSidebar(false) }}
              className={`group flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] font-medium transition-all ${
                selectedTopic === topic ? 'bg-gray-950 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{topic}</span>
              </span>
              <span className={`ml-2 rounded-lg px-2 py-0.5 text-[11px] ${selectedTopic === topic ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {topics[topic].length}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )

  if (selectedEntry) {
    return (
      <div className="flex h-full flex-col bg-[#fbfbf8] animate-in fade-in duration-200">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white/90 px-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => { setSelectedEntry(null); setEditing(false) }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-950 active:scale-95"
              title="Quay lại"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            <h2 className="truncate text-[14px] font-semibold text-gray-950 sm:max-w-[420px]">
              {selectedEntry.id === 'new' ? 'Bài viết mới' : selectedEntry.title}
            </h2>
          </div>

          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={saveEdit}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[12px] font-medium text-white transition-all hover:bg-black active:scale-95"
              >
                <Save className="h-3.5 w-3.5" />
                Lưu
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-all hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-950" title="Chỉnh sửa">
                <Edit3 className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(selectedEntry.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-all hover:bg-red-50 hover:text-red-500" title="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10 pb-safe">
            {editing ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Tiêu đề</label>
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm(form => ({ ...form, title: e.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xl font-semibold text-gray-950 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100 sm:text-2xl"
                    placeholder="Tiêu đề bài viết"
                  />
                </div>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Tóm tắt</label>
                  <input
                    value={editForm.summary}
                    onChange={e => setEditForm(form => ({ ...form, summary: e.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[14px] text-gray-700 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                    placeholder="Tóm tắt ngắn"
                  />
                </div>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Chủ đề</label>
                  <input
                    value={editForm.topics}
                    onChange={e => setEditForm(form => ({ ...form, topics: e.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[13px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                    placeholder="cong-nghe, tai-chinh"
                  />
                </div>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Nội dung</label>
                  <textarea
                    value={editForm.content}
                    onChange={e => setEditForm(form => ({ ...form, content: e.target.value }))}
                    className="min-h-[440px] w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-4 text-[14px] leading-7 text-gray-800 outline-none transition-all focus:border-gray-300 focus:ring-2 focus:ring-gray-100 sm:px-5"
                  />
                </div>
              </div>
            ) : (
              <article className="rounded-2xl border border-gray-100 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
                <div className="mb-6 border-b border-gray-100 pb-6">
                  <h1 className="text-2xl font-semibold leading-tight tracking-tight text-gray-950 sm:text-3xl">{selectedEntry.title}</h1>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(selectedEntry.topics || []).map(topic => (
                      <span key={topic} className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">{topic}</span>
                    ))}
                  </div>
                  {selectedEntry.summary && (
                    <p className="mt-5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[14px] leading-6 text-gray-600">{selectedEntry.summary}</p>
                  )}
                </div>

                <div
                  className="whitespace-pre-wrap text-[15px] leading-8 text-gray-800"
                  onDoubleClick={() => setEditing(true)}
                >
                  {selectedEntry.content}
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-[#f6f6f2] animate-in fade-in duration-300">
      <div className="hidden w-[280px] shrink-0 border-r border-gray-100 bg-white md:flex">
        <SidebarContent />
      </div>

      {showSidebar && (
        <div className="fixed inset-0 z-[60] bg-gray-950/30 backdrop-blur-sm md:hidden" onClick={() => setShowSidebar(false)}>
          <div className="h-full w-[290px] bg-white shadow-2xl animate-in slide-in-from-left duration-200" onClick={event => event.stopPropagation()}>
            <div className="absolute left-[246px] top-3 z-10">
              <button onClick={() => setShowSidebar(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setShowSidebar(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 transition-all hover:bg-gray-100 md:hidden">
              <Menu className="h-4.5 w-4.5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold leading-5 text-gray-950">{pageTitle}</h1>
              <p className="text-[11px] font-medium text-gray-400">{displayEntries.length} mục đang hiển thị</p>
            </div>
          </div>
          <button
            onClick={startNew}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[12px] font-medium text-white transition-all hover:bg-black active:scale-95 md:hidden"
          >
            <Plus className="h-3.5 w-3.5" />
            Mới
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          {loading ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-gray-900" />
              <p className="text-[12px] font-medium text-gray-400">Đang tải tri thức...</p>
            </div>
          ) : displayEntries.length === 0 ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 text-center">
              <Inbox className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-[14px] font-semibold text-gray-800">Chưa có nội dung phù hợp</p>
              <p className="mt-1 max-w-sm text-[12px] leading-5 text-gray-400">Thử đổi từ khóa tìm kiếm hoặc tạo một mục tri thức mới.</p>
              <button onClick={startNew} className="mt-4 flex h-9 items-center gap-1.5 rounded-xl bg-gray-950 px-3 text-[12px] font-medium text-white">
                <Plus className="h-3.5 w-3.5" />
                Tạo bài mới
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="hidden min-w-[760px] grid-cols-[minmax(220px,1.1fr)_minmax(280px,1.5fr)_220px_72px] border-b border-gray-100 bg-gray-50/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
                <div>Tiêu đề</div>
                <div>Tóm tắt</div>
                <div>Chủ đề</div>
                <div className="text-right">Mở</div>
              </div>

              <div className="divide-y divide-gray-100">
                {displayEntries.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => openEntry(entry)}
                    className="group cursor-pointer px-4 py-4 transition-colors hover:bg-gray-50/80 md:grid md:min-w-[760px] md:grid-cols-[minmax(220px,1.1fr)_minmax(280px,1.5fr)_220px_72px] md:items-center md:gap-4 md:py-3"
                  >
                    <div className="flex min-w-0 items-start gap-3 md:items-center">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 md:mt-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-[14px] font-semibold leading-5 text-gray-950 group-hover:text-gray-700 md:truncate">
                          {entry.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                          {(entry.topics || []).slice(0, 3).map(topic => (
                            <span key={topic} className="max-w-[140px] truncate rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-gray-500 md:mt-0">
                      {entry.summary || 'Không có mô tả vắn tắt.'}
                    </p>

                    <div className="hidden min-w-0 flex-wrap gap-1.5 md:flex">
                      {(entry.topics || []).slice(0, 3).map(topic => (
                        <span key={topic} className="max-w-[92px] truncate rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-1 md:mt-0">
                      <button
                        onClick={event => { event.stopPropagation(); handleDelete(entry.id) }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-all hover:bg-red-50 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                        title="Xóa nhanh"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
