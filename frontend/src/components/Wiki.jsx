import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  ChevronRight,
  Clock,
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
import { fetchWiki, restructureWikiStream, updateEntry, deleteEntry, exportWiki, createEntry } from '../api.js'

export default function Wiki({ token, provider, embedded = false, onClose = null }) {
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
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [restructureMsg, setRestructureMsg] = useState('')

  useEffect(() => {
    loadWiki()
    const interval = setInterval(() => { if (!document.hidden) loadWiki(true) }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Auto-save khi nội dung thay đổi (debounce 1.5s)
  useEffect(() => {
    if (!editing) return
    const timer = setTimeout(autoSave, 1500)
    return () => clearTimeout(timer)
  }, [editForm, editing])

  function formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  }

  // Format ngày tháng (hỗ trợ định dạng SQLite và đa trình duyệt)
  function formatDate(dateStr) {
    if (!dateStr) return ''
    
    // Parse ngày tháng với các fallback cho Safari/iPad
    let d = new Date(dateStr.replace(' ', 'T'))
    if (isNaN(d.getTime())) {
      d = new Date(dateStr.replace(/-/g, '/'))
    }
    
    // Nếu vẫn không parse được, trả về chuỗi gốc (lấy phần ngày)
    if (isNaN(d.getTime())) return dateStr.split(' ')[0]
    
    const now = new Date()
    const diff = now - d
    
    // Thời gian tương đối
    if (Math.abs(diff) < 60000) return 'Vừa xong'
    if (diff > 0 && diff < 3600000) return `${Math.floor(diff / 60000)} phút`
    if (diff > 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`
    if (diff > 0 && diff < 172800000) return 'Hôm qua'
    
    // Thời gian tuyệt đối
    const options = { day: '2-digit', month: '2-digit' }
    if (d.getFullYear() !== now.getFullYear()) options.year = 'numeric'
    
    try {
      return d.toLocaleDateString('vi-VN', options)
    } catch (e) {
      return dateStr.split(' ')[0]
    }
  }

  async function loadWiki(silent = false) {
    if (!silent) setLoading(true)
    try {
      const d = await fetchWiki(token)
      setEntries(d.entries || [])
      setTopics(d.topics || {})
    } catch {}
    if (!silent) setLoading(false)
  }

  function handleRestructure() {
    setRestructuring(true)
    setRestructureMsg('Đang phân tích...')
    restructureWikiStream(token, provider, {
      onEvent(ev) {
        if (ev.type === 'start') setRestructureMsg(ev.message || 'Đang xử lý...')
        else if (ev.type === 'done') {
          setRestructureMsg('')
          setRestructuring(false)
          if (ev.restructured || ev.ok) loadWiki()
        } else if (ev.type === 'error') {
          setRestructureMsg('')
          setRestructuring(false)
        }
      }
    })
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

  function autoSave() {
    if (!editForm.title.trim()) return
    setIsSaving(true)
    const topicsArr = editForm.topics.split(',').map(t => t.trim()).filter(Boolean)
    const payload = { title: editForm.title, content: editForm.content, summary: editForm.summary, topics: topicsArr }
    const isNew = selectedEntry.id === 'new'
    const fn = isNew ? createEntry(payload, token) : updateEntry(selectedEntry.id, payload, token)
    fn.then(result => {
      setLastSaved(new Date())
      if (isNew && result.id) {
        setSelectedEntry({ id: result.id, title: editForm.title, content: editForm.content, summary: editForm.summary, topics: topicsArr })
        loadWiki()
      }
    }).catch(() => {}).finally(() => setIsSaving(false))
  }

  function saveEdit() { autoSave() }

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
      <div className="shrink-0 border-b border-gray-100 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 pr-12">
            <h2 className="truncate text-sm font-semibold leading-5 text-gray-950">Wiki</h2>
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">{entries.length} mục tri thức</p>
          </div>
          <button
            onClick={startNew}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-950 text-white transition-all hover:bg-black active:scale-95"
            title="Tạo bài mới"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={handleRestructure}
            disabled={restructuring}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-40"
            title={restructureMsg || undefined}
          >
            {restructuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            {restructuring ? (restructureMsg || 'Đang xử lý...') : 'Sắp xếp'}
          </button>
          <button
            onClick={() => exportWiki(token)}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 transition-all hover:bg-gray-50"
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
            className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-3 text-[12px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
        <button
          onClick={() => { setSelectedTopic(null); setShowSidebar(false) }}
          className={`group flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-[12px] font-medium transition-all ${
            !selectedTopic ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">Tất cả</span>
          </span>
          <span className={`rounded px-2 py-0.5 text-[10px] ${!selectedTopic ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {entries.length}
          </span>
        </button>

        <div className="mt-3 space-y-1">
          {topicList.map(topic => (
            <button
              key={topic}
              onClick={() => { setSelectedTopic(topic); setShowSidebar(false) }}
              className={`group flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-[12px] font-medium transition-all ${
                selectedTopic === topic ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{topic}</span>
              </span>
              <span className={`ml-2 rounded px-2 py-0.5 text-[10px] ${selectedTopic === topic ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
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
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 bg-white/90 px-3 backdrop-blur-md sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => { setSelectedEntry(null); setEditing(false) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-950 active:scale-95"
              title="Quay lại"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="truncate text-[14px] font-semibold text-gray-950 sm:max-w-[420px] max-w-[160px] xs:max-w-[220px] sm:max-w-[320px]">
              {selectedEntry.id === 'new' ? 'Bài viết mới' : selectedEntry.title}
            </h2>
          </div>

          {editing ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                {isSaving ? (
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Đang lưu...</span>
                ) : lastSaved ? (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-400" />Đã lưu {formatTime(lastSaved)}</span>
                ) : null}
              </div>
              <button
                onClick={saveEdit}
                className="flex h-8 items-center gap-1.5 rounded-md bg-gray-950 px-3 text-[11px] font-medium text-white transition-all hover:bg-black active:scale-95"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lưu</span>
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 transition-all hover:bg-gray-50 active:scale-95"
              >
                <span className="hidden sm:inline">Hủy</span>
                <X className="h-4 w-4 sm:hidden" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-950 active:scale-95" title="Chỉnh sửa">
                <Edit3 className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(selectedEntry.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 active:scale-95" title="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-5 sm:py-6 pb-safe">
            {editing ? (
              <div className="space-y-4 sm:space-y-5">
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Tiêu đề</label>
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm(form => ({ ...form, title: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[14px] font-semibold text-gray-950 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                    placeholder="Tiêu đề bài viết"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Tóm tắt</label>
                  <input
                    value={editForm.summary}
                    onChange={e => setEditForm(form => ({ ...form, summary: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-700 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                    placeholder="Tóm tắt ngắn"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Chủ đề</label>
                  <input
                    value={editForm.topics}
                    onChange={e => setEditForm(form => ({ ...form, topics: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                    placeholder="cong-nghe, tai-chinh"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="ml-1 text-[11px] font-semibold text-gray-400">Nội dung</label>
                  <textarea
                    value={editForm.content}
                    onChange={e => setEditForm(form => ({ ...form, content: e.target.value }))}
                    className="min-h-[320px] sm:min-h-[420px] w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-3 text-[13px] leading-6 text-gray-800 outline-none transition-all focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                  />
                </div>
              </div>
            ) : (
              <article className="rounded-lg border border-gray-200 bg-white px-4 py-4 sm:px-5 sm:py-5">
                <div className="mb-4 border-b border-gray-100 pb-4">
                  <h1 className="text-lg font-semibold leading-tight tracking-tight text-gray-950">{selectedEntry.title}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {(selectedEntry.topics || []).map(topic => (
                        <span key={topic} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{topic}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Tạo: {formatDate(selectedEntry.created_at || selectedEntry.createdAt)}
                      </span>
                      {(selectedEntry.updated_at || selectedEntry.updatedAt) && 
                        (selectedEntry.updated_at || selectedEntry.updatedAt) !== (selectedEntry.created_at || selectedEntry.createdAt) && (
                        <span className="flex items-center gap-1.5">
                          <Edit3 className="h-3 w-3" />
                          Sửa: {formatDate(selectedEntry.updated_at || selectedEntry.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedEntry.summary && (
                    <p className="mt-4 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] leading-5 text-gray-600">{selectedEntry.summary}</p>
                  )}
                </div>

                <div
                  className="whitespace-pre-wrap text-[13px] leading-6 text-gray-800"
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
    <div className="relative flex h-full min-w-0 overflow-hidden bg-[#f6f6f2]">
      {!embedded && (
        <div className="hidden flex-shrink-0 overflow-hidden border-r border-gray-100 bg-white lg:flex">
          <div className="w-[220px] shrink-0">
            <SidebarContent />
          </div>
        </div>
      )}

      {showSidebar && (
        <div className={`fixed inset-0 z-[200] bg-gray-950/30 backdrop-blur-sm ${embedded ? '' : 'lg:hidden'}`} onClick={() => setShowSidebar(false)}>
          <div className="h-full w-[220px] overflow-hidden bg-white shadow-2xl animate-in slide-in-from-left duration-200" onClick={event => event.stopPropagation()}>
            <div className="absolute right-3 top-3 z-10">
              <button onClick={() => setShowSidebar(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 shadow-sm hover:bg-gray-200 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="w-full">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-auto min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white/80 px-3 py-2 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button onClick={() => setShowSidebar(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-all hover:bg-gray-100 active:scale-95">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 shrink-0">
              <h1 className="truncate text-sm font-semibold leading-5 text-gray-950">{pageTitle}</h1>
              <p className="text-[11px] font-medium text-gray-400">{displayEntries.length} mục đang hiển thị</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={startNew}
              className="flex h-8 items-center gap-1.5 rounded-md bg-gray-950 px-3 text-[11px] font-medium text-white transition-all hover:bg-black active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Mới</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-950 active:scale-95"
                title="Đóng wiki"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm trong wiki"
              className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-9 text-[12px] font-medium text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto custom-scrollbar ${embedded ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4'}`}>
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
          ) : embedded ? (
            <div className="space-y-2">
              {displayEntries.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => openEntry(entry)}
                  className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50/80"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[12px] font-semibold leading-4 text-gray-950 group-hover:text-gray-700">
                        {entry.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-gray-500">
                        {entry.summary || 'Không có mô tả vắn tắt.'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(entry.updated_at || entry.updatedAt || entry.created_at || entry.createdAt)}
                        </span>
                        {(entry.topics || []).slice(0, 2).map(topic => (
                          <span key={topic} className="max-w-[120px] truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={event => { event.stopPropagation(); handleDelete(entry.id) }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 transition-all hover:bg-red-50 hover:text-red-500"
                        title="Xóa nhanh"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white custom-scrollbar">
              <div className="hidden min-w-[700px] grid-cols-[minmax(180px,1fr)_minmax(240px,1.3fr)_90px_90px_56px] border-b border-gray-100 bg-gray-50/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
                <div>Tiêu đề</div>
                <div>Tóm tắt</div>
                <div>Ngày sửa</div>
                <div>Chủ đề</div>
                <div className="text-right">Mở</div>
              </div>

              <div className="divide-y divide-gray-100">
                {displayEntries.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => openEntry(entry)}
                    className="group cursor-pointer px-4 py-3 transition-colors hover:bg-gray-50/80 md:grid md:min-w-[700px] md:grid-cols-[minmax(180px,1fr)_minmax(240px,1.3fr)_90px_90px_56px] md:items-center md:gap-4 md:py-2.5"
                  >
                    <div className="flex min-w-0 items-start gap-3 md:items-center">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 md:mt-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[12px] font-semibold leading-4 text-gray-950 group-hover:text-gray-700 md:line-clamp-2">
                          {entry.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                          {(entry.topics || []).slice(0, 3).map(topic => (
                            <span key={topic} className="max-w-[160px] truncate rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 overflow-hidden text-[11px] leading-4 text-gray-500 md:mt-0">
                      {entry.summary || 'Không có mô tả vắn tắt.'}
                    </p>

                    <div className="hidden items-center gap-1.5 text-[11px] text-gray-400 md:flex">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(entry.updated_at || entry.updatedAt || entry.created_at || entry.createdAt)}</span>
                    </div>

                    <div className="hidden min-w-0 flex-wrap gap-1.5 md:flex">
                      {(entry.topics || []).slice(0, 2).map(topic => (
                        <span key={topic} className="max-w-[120px] truncate rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
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
