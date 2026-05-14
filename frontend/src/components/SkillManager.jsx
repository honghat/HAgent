import { useState, useEffect } from 'react'

export default function SkillManager({ token, embedded = false }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Edit/Create State
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSkills = () => {
    setLoading(true)
    fetch('/api/skills', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Không thể tải danh sách Skill')
        return r.json()
      })
      .then(data => {
        setSkills(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { loadSkills() }, [token])

  const startNew = () => {
    setEditing('new')
    setName('')
    setDescription('')
    setInstructions('')
    setError(null)
  }

  const startEdit = (s) => {
    setEditing(s.name)
    setName(s.name)
    setDescription(s.description || '')
    setInstructions(s.instructions || '')
    setError(null)
  }

  const cancel = () => {
    setEditing(null)
    setError(null)
  }

  const save = async () => {
    if (!name.trim()) { setError('Tên kỹ năng không được để trống'); return }
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const url = isNew ? '/api/skills' : `/api/skills/${editing}`
      const method = isNew ? 'POST' : 'PUT'
      
      const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description, instructions })
      })
      
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Lỗi lưu dữ liệu')
      
      setEditing(null)
      loadSkills()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (skillName) => {
    try {
      const r = await fetch(`/api/skills/${skillName}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!r.ok) throw new Error('Không thể xóa kỹ năng')
      loadSkills()
    } catch (e) {
      setError(e.message)
    }
  }

  if (editing) {
    return (
      <div className={`${embedded ? 'h-full' : 'h-full'} flex flex-col p-3 sm:p-4 md:p-10 overflow-y-auto bg-white/50 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200 pb-safe`}>
        <div className="max-w-4xl mx-auto w-full">
          <div className="bg-white border border-gray-100 rounded-[2rem] md:rounded-[2.5rem] p-4 sm:p-6 md:p-10 shadow-2xl shadow-gray-200/50">
            <div className="flex items-center gap-3 sm:gap-5 mb-6 sm:mb-10">
              <button onClick={cancel} className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-2xl transition-all active:scale-95">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">{editing === 'new' ? 'New Skill' : 'Edit Skill'}</h2>
              </div>
            </div>

            {error && <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100">{error}</div>}

            <div className="space-y-5 sm:space-y-8">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-gray-400 ml-1">Định danh Kỹ năng (Unique ID)</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  disabled={editing !== 'new'}
                  placeholder="e.g. advanced-researcher"
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-gray-900 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 text-sm font-semibold text-gray-700 outline-none transition-all disabled:opacity-50" />
                {editing === 'new' && <p className="text-[10px] text-gray-400 ml-2 font-medium mt-2">Dùng dấu gạch nối (-), không khoảng trắng, không dấu.</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-gray-400 ml-1">Mô tả tóm lược</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Kỹ năng này giúp Agent thực hiện..."
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-gray-900 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 text-sm text-gray-600 outline-none transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-gray-400 ml-1">Nội dung / Chỉ dẫn (Markdown)</label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                  rows={12}
                  placeholder="Viết hướng dẫn hoặc mã nguồn tại đây..."
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-gray-900 rounded-[1.5rem] sm:rounded-[2rem] px-4 sm:px-8 py-4 sm:py-8 text-sm font-medium text-gray-600 leading-relaxed outline-none resize-none font-mono transition-all" />
              </div>

              <div className="flex gap-4 pt-6">
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-[12px] font-medium hover:bg-black transition-all shadow-sm active:scale-[0.98] disabled:opacity-50">
                  {saving ? 'Đang đồng bộ...' : 'Triển khai Kỹ năng'}
                </button>
                <button onClick={cancel}
                  className="px-6 bg-gray-100 text-gray-500 py-3 rounded-xl text-[12px] font-medium hover:bg-gray-200 transition-all">Bỏ qua</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${embedded ? 'h-full bg-transparent pt-3 md:pt-4' : 'h-full bg-white/30'} flex flex-col p-3 sm:p-4 md:p-6 overflow-y-auto pb-safe`}>
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="space-y-1">
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Agent Skills</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => loadSkills()}
              className="bg-white border border-gray-100 text-gray-400 p-2 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm active:scale-90" title="Làm mới">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={startNew}
              className="bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-lg text-[11px] font-medium transition-all shadow-sm active:scale-95 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
              Thêm Kỹ năng
            </button>
          </div>
        </div>

        {error && <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 animate-in slide-in-from-top-2">{error}</div>}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-12 h-12 border-4 border-gray-100 border-t-gray-900 rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-semibold text-gray-300 ">Đang tải nạp bộ kỹ năng...</p>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 sm:py-24 bg-white border-2 border-dashed border-gray-100 rounded-[2rem] sm:rounded-[3rem] px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6">
               <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M11 4a2 2 0 114 0 2 2 0 01-4 0zM18 8a2 2 0 114 0 2 2 0 01-4 0zM4 8a2 2 0 114 0 2 2 0 01-4 0zM9 12a2 2 0 114 0 2 2 0 01-4 0zM16 12a2 2 0 114 0 2 2 0 01-4 0zM7 16a2 2 0 114 0 2 2 0 01-4 0zM14 16a2 2 0 114 0 2 2 0 01-4 0z" /></svg>
            </div>
            <p className="text-gray-400 font-semibold text-[13px]">Hệ thống chưa có kỹ năng bổ trợ</p>
            <button onClick={startNew} className="mt-5 text-indigo-600 font-semibold text-sm hover:underline decoration-2 underline-offset-4 transition-all">Khởi tạo Skill đầu tiên</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {skills.map(s => (
              <div key={s.name} className="group relative bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-lg hover:shadow-gray-200/50 transition-all duration-200">
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-gray-900 transition-colors duration-200 shadow-inner">
                        <span className="text-base group-hover:scale-110 transition-transform duration-200">🎯</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 tracking-tight truncate text-sm leading-tight">{s.name}</h3>
                        <span className="text-[8px] font-medium text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100/30">Ready</span>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-gray-500 font-medium leading-5 mb-4 line-clamp-2 h-10 overflow-hidden break-words">
                    {s.description || 'Kỹ năng chuyên biệt dành cho hệ thống H Agent đang chờ được cập nhật mô tả chi tiết...'}
                  </p>

                  <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-medium text-gray-400 mb-0.5">Payload</span>
                      <span className="text-[10px] font-semibold text-gray-600 tracking-tight">
                        {s.instructions ? `${s.instructions.length} BYTES` : 'EMPTY'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(s)}
                        className="w-8 h-8 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center transition-all active:scale-90" title="Chỉnh sửa">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => remove(s.name)}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-50 text-gray-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 flex items-center justify-center transition-all active:scale-90" title="Gỡ bỏ">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
