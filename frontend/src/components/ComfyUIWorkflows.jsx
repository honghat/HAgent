import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeEditor from './CodeEditor'

const BASE = '/api/comfyui/workflows'

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fmtTime(mtime) {
  const d = new Date(mtime * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN', { hour12: false })
}

export default function ComfyUIWorkflows({ token }) {
  const [list, setList] = useState([])
  const [selected, setSelected] = useState('')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const fileInputRef = useRef(null)

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  const dirty = content !== originalContent

  const flash = useCallback((text, type = 'success') => {
    setMessage({ text, type })
    if (type === 'success') {
      window.setTimeout(() => setMessage({ text: '', type: '' }), 2500)
    }
  }, [])

  const loadList = useCallback(async () => {
    try {
      const r = await fetch(BASE, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Không tải được danh sách')
      setList(data.workflows || [])
    } catch (err) {
      flash(err.message, 'error')
    }
  }, [token, flash])

  const loadOne = useCallback(
    async (name) => {
      setLoading(true)
      setMessage({ text: '', type: '' })
      try {
        const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || 'Không đọc được file')
        setSelected(name)
        setContent(data.content || '')
        setOriginalContent(data.content || '')
      } catch (err) {
        flash(err.message, 'error')
      } finally {
        setLoading(false)
      }
    },
    [token, flash],
  )

  useEffect(() => {
    loadList()
  }, [loadList])

  async function handleSave() {
    if (!selected || saving) return
    setSaving(true)
    setMessage({ text: '', type: '' })
    try {
      const r = await fetch(`${BASE}/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Không lưu được')
      setOriginalContent(content)
      flash(data.json_valid ? 'Đã lưu' : 'Đã lưu (cảnh báo: JSON không hợp lệ)', data.json_valid ? 'success' : 'warn')
      loadList()
    } catch (err) {
      flash(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`Xoá workflow "${selected}"?`)) return
    try {
      const r = await fetch(`${BASE}/${encodeURIComponent(selected)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Không xoá được')
      flash(`Đã xoá ${selected}`)
      setSelected('')
      setContent('')
      setOriginalContent('')
      loadList()
    } catch (err) {
      flash(err.message, 'error')
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch(`${BASE}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Upload thất bại')
      flash(data.json_valid ? `Đã upload ${data.name}` : `Đã upload ${data.name} (JSON không hợp lệ)`, data.json_valid ? 'success' : 'warn')
      await loadList()
      await loadOne(data.name)
    } catch (err) {
      flash(err.message, 'error')
    }
  }

  const tone = message.type === 'error'
    ? 'bg-red-50 text-red-700 border-red-200'
    : message.type === 'warn'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <div className="flex h-full min-h-0">
      <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-black/[0.1] bg-white/80 md:w-64`}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Workflows ({list.length})
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            + Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-gray-500">Chưa có workflow nào</div>
          )}
          {list.map(item => (
            <button
              key={item.name}
              onClick={() => loadOne(item.name)}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-black/[0.05] px-3 py-2 text-left transition-colors ${
                selected === item.name ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex w-full items-center gap-1.5">
                <span className="truncate text-[12px] font-semibold text-gray-900">
                  {item.display && item.display !== item.name ? item.display : item.name}
                </span>
                {item.kind === 'preset' && (
                  <span className="ml-auto shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-700">
                    preset
                  </span>
                )}
                {item.kind === 'template' && item.used_by && (
                  <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                    đang dùng
                  </span>
                )}
              </div>
              {item.used_by && (
                <span className="text-[10px] text-emerald-700">{item.used_by}</span>
              )}
              <span className="text-[10px] text-gray-500">
                {item.category} · {fmtSize(item.size)} · {fmtTime(item.mtime)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        <header className="flex shrink-0 items-center gap-2 border-b border-black/[0.1] bg-white/80 px-3 py-2">
          <button
            onClick={() => setSelected('')}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 md:hidden"
            title="Quay lại danh sách"
            aria-label="Quay lại"
          >
            ←
          </button>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-900">
            {selected || 'Chưa chọn workflow'}
          </span>
          {dirty && selected && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
              chưa lưu
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={handleSave}
              disabled={!selected || !dirty || saving}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? '...' : 'Lưu'}
            </button>
            <button
              onClick={handleDelete}
              disabled={!selected}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xoá
            </button>
          </div>
        </header>

        {message.text && (
          <div className={`shrink-0 border-b px-3 py-1.5 text-[11px] font-medium ${tone}`}>
            {message.text}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden bg-white">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
              Đang tải...
            </div>
          ) : selected ? (
            <CodeEditor value={content} onChange={setContent} />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-gray-500">
              Chọn 1 workflow ở danh sách bên trái
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
