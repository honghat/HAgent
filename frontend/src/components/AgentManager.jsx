import { useState, useEffect } from 'react'

export default function AgentManager({ token, agents, onUpdate, embedded = false, registerSave }) {
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [soul, setSoul] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [intervalSec, setIntervalSec] = useState(300)
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [todos, setTodos] = useState([])
  const [todoInput, setTodoInput] = useState('')
  const [query, setQuery] = useState('')

  const filteredAgents = agents.filter((agent) => {
    const text = `${agent.name || ''} ${agent.description || ''}`.toLowerCase()
    return !query.trim() || text.includes(query.trim().toLowerCase())
  })

  const loadTodos = async (agentId) => {
    try {
      const r = await fetch(`/api/agents/${agentId}/todos`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok) setTodos(await r.json())
    } catch {}
  }

  const addTodo = async () => {
    if (!todoInput.trim() || !editing) return
    const r = await fetch(`/api/agents/${editing}/todos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: todoInput.trim() })
    })
    if (r.ok) {
      setTodoInput('')
      loadTodos(editing)
    }
  }

  const completeTodo = async (todoId) => {
    await fetch(`/api/agents/${editing}/todos/${todoId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    })
    loadTodos(editing)
  }

  const deleteTodo = async (todoId) => {
    await fetch(`/api/agents/${editing}/todos/${todoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    loadTodos(editing)
  }

  const startEdit = (a) => {
    setEditing(a.id)
    setName(a.name)
    setDesc(a.description || '')
    setSoul(a.soul || '')
    setAutoStart(a.auto_start || false)
    setIntervalSec(a.interval_seconds || 300)
    setNameError('')
    loadTodos(a.id)
  }

  const startNew = () => {
    setEditing('new')
    setName('')
    setDesc('')
    setSoul('')
    setAutoStart(false)
    setIntervalSec(300)
    setNameError('')
  }

  const cancel = () => {
    setEditing(null)
    setNameError('')
  }

  const save = async () => {
    if (!name.trim()) { setNameError('Tên không được để trống'); return }
    setSaving(true)

    try {
      const body = { name: name.trim(), description: desc, soul, auto_start: autoStart, interval_seconds: intervalSec }
      let r
      if (editing === 'new') {
        r = await fetch('/api/agents', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        r = await fetch(`/api/agents/${editing}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (!r.ok) { const err = await r.json(); setNameError(err.error || 'Lỗi lưu dữ liệu'); setSaving(false); return }
      setEditing(null)
      onUpdate()
    } catch (e) { setNameError(e.message) }
    setSaving(false)
  }

  useEffect(() => {
    if (registerSave) {
      if (editing) {
        registerSave(() => save)
      } else {
        registerSave(null)
      }
    }
    return () => {
      if (registerSave) registerSave(null)
    }
  }, [editing, name, desc, soul, autoStart, intervalSec, registerSave])

  const toggleActive = async (id) => {
    await fetch(`/api/agents/${id}/toggle-active`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    onUpdate()
  }

  const remove = async (id) => {
    const r = await fetch(`/api/agents/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) onUpdate()
  }

  if (editing) {
    return (
      <div className={`${embedded ? 'h-full bg-transparent p-0' : 'h-full bg-gray-50 p-3 md:p-5'} flex flex-col overflow-y-auto animate-in fade-in zoom-in-95 duration-200 pb-safe`}>
        <div className={`${embedded ? 'max-w-none' : 'max-w-3xl mx-auto'} w-full`}>
          <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-5">
            <div className="flex items-center gap-3 mb-5 border-b border-gray-100 pb-3">
              <button onClick={cancel} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-md transition-all active:scale-95">
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="w-8 h-8 rounded-md bg-indigo-600 shadow-lg shadow-indigo-600/20 flex items-center justify-center text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 leading-none">{editing === 'new' ? 'Khởi tạo agent' : 'Chỉnh sửa agent'}</h2>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-1">{editing === 'new' ? 'Thêm nhân sự mới' : 'Cập nhật thông tin'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 ml-1">Định danh Agent</label>
                <input value={name} onChange={e => { setName(e.target.value); setNameError('') }}
                  placeholder="e.g. researcher-pro"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] outline-none transition-all font-medium text-gray-700" />
                {nameError && <p className="text-[10px] text-red-500 font-bold ml-2">{nameError}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 ml-1">Nhiệm vụ chính</label>
                <input value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="Mô tả ngắn gọn về vai trò của Agent này..."
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] outline-none transition-all text-gray-600" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 ml-1">Linh hồn (Soul/Prompt)</label>
                <textarea value={soul} onChange={e => setSoul(e.target.value)}
                  rows={6}
                  placeholder="Xác định tính cách, kiến thức và cách hành xử của Agent..."
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-md px-3 py-2 text-[12px] font-medium text-gray-600 leading-relaxed transition-all" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md border border-gray-200">
                <div className="space-y-3">
                  <label className="text-[10px] font-semibold text-gray-400 ml-1">Tần suất quét (giây)</label>
                  <input type="number" value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))}
                    min={60} max={86400} step={60}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-gray-200 transition-all font-medium text-gray-700" />
                </div>
                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} className="sr-only peer" />
                      <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gray-900"></div>
                    </div>
                    <span className="text-[12px] font-medium text-gray-700 group-hover:text-black transition-colors">Tự khởi động</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-gray-400 ml-1">Danh sách công việc (Auto-Task)</label>
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">{todos.length} việc</span>
                </div>
                <div className="flex gap-2">
                  <input value={todoInput} onChange={e => setTodoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
                    placeholder="Nhập đầu việc mới..."
                    className="flex-1 bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px] outline-none focus:border-gray-400 transition-all" />
                  <button onClick={addTodo} disabled={!todoInput.trim()}
                    className="bg-gray-900 text-white w-10 h-9 rounded-md flex items-center justify-center hover:bg-black transition-all disabled:opacity-30 active:scale-95">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                  {todos.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-md">
                       <p className="text-xs text-gray-400 font-medium">Không có công việc nào đang chờ.</p>
                    </div>
                  ) : (
                    todos.map(t => (
                      <div key={t.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-md px-3 py-2 group hover:border-gray-300 transition-all">
                        <button onClick={() => t.status === 'pending' && completeTodo(t.id)}
                          className={`shrink-0 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                            t.status === 'completed' ? 'bg-gray-900 border-gray-900 shadow-gray-100 shadow-md' :
                            t.status === 'in_progress' ? 'border-amber-400 bg-amber-50' : 'border-gray-100 group-hover:border-gray-300'
                          }`}>
                          {t.status === 'completed' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                          {t.status === 'in_progress' && <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />}
                        </button>
                        <span className={`flex-1 text-[13px] font-medium truncate ${t.status === 'completed' ? 'text-gray-300 line-through font-normal' : 'text-gray-600'}`}>
                          {t.content}
                        </span>
                        <button onClick={() => deleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-all">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {!registerSave && (
                <div className="flex gap-4 pt-2">
                  <button onClick={save} disabled={saving}
                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-md text-[12px] font-medium hover:bg-black transition-all shadow-sm active:scale-[0.98] disabled:opacity-50">
                    {saving ? 'Đang đồng bộ...' : 'Cập nhật Agent'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${embedded ? 'h-full bg-transparent p-0' : 'h-full bg-gray-50 p-3 md:p-5'} flex flex-col overflow-y-auto pb-safe`}>
      <div className={`${embedded ? 'max-w-none' : 'max-w-6xl mx-auto'} w-full`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="space-y-1">
            <h1 className="text-sm font-semibold text-gray-900">AI agent</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm agent..."
              className="h-9 w-full sm:w-56 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-gray-400"
            />
            <button onClick={startNew}
              className="bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-md text-[12px] font-medium transition-all active:scale-95 shrink-0 flex items-center justify-center gap-2 w-full sm:w-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
              Khởi tạo Agent
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-white border border-dashed border-gray-200 rounded-lg px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-14 h-14 bg-gray-50 rounded-lg flex items-center justify-center mb-4">
               <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <p className="text-gray-400 font-semibold text-[13px]">Chưa có lực lượng Agent nào</p>
            <button onClick={startNew} className="mt-5 text-gray-900 font-semibold text-[12px] hover:underline decoration-2 underline-offset-4 transition-all">Bắt đầu ngay hôm nay</button>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-[12px] text-gray-400">
            Không tìm thấy agent phù hợp.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAgents.map(a => (
              <div key={a.id} className="group relative bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-all">
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1 overflow-hidden pr-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${a.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse' : 'bg-gray-300'}`} />
                        <h3 className="font-semibold text-gray-900 tracking-tight truncate text-[13px]">{a.name}</h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {a.auto_start && <span className="text-[8px] font-semibold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/30">Tự chạy</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                       <button onClick={() => startEdit(a)} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-md transition-all">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                       </button>
                    </div>
                  </div>

                  <p className="text-[12px] text-gray-500 font-medium leading-5 mb-4 line-clamp-2 h-10 overflow-hidden">
                    {a.description || 'Hệ thống AI đang chờ được cấu hình nhiệm vụ chuyên biệt...'}
                  </p>

                  <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-gray-400 mb-0.5">Trạng thái</span>
                      <span className={`text-[11px] font-semibold ${a.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {a.is_active ? 'Đang phối hợp' : 'Tạm dừng'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(a.id)}
                        className={`w-8 h-8 rounded-md flex items-center justify-center transition-all active:scale-90 ${
                          a.is_active ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:text-gray-900'
                        }`}>
                        {a.is_active ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M10 9v6m4-6v6" strokeLinecap="round"/></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                        )}
                      </button>
                      <button onClick={() => remove(a.id)}
                        className="w-8 h-8 rounded-md bg-white border border-gray-200 text-gray-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 flex items-center justify-center transition-all active:scale-90">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
