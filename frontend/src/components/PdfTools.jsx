import { lazy, Suspense, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, FileType2, Combine, Languages, Loader2, Upload, Download, Eye, CheckCircle2, Pencil } from 'lucide-react'
import { canAccess } from '../lib/permissions.js'

const PdfEditor = lazy(() => import('./PdfEditor.jsx'))
const PdfTranslator = lazy(() => import('./PdfTranslator.jsx'))

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const ACTIONS = [
  { id: 'edit', label: 'Editor', desc: 'Sắp xếp trang', icon: Eye },
  { id: 'text', label: 'Text to PDF', desc: 'Từ nội dung', icon: FileText },
  { id: 'images', label: 'Images', desc: 'Ảnh thành PDF', icon: ImageIcon },
  { id: 'docx', label: 'Word', desc: 'DOCX sang PDF', icon: FileType2 },
  { id: 'merge', label: 'Merge', desc: 'Gộp tài liệu', icon: Combine },
  { id: 'translate', label: 'Dịch thuật', desc: 'Dịch PDF giữ bố cục', icon: Languages },
]

const LANGS = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'th', label: 'ไทย' },
  { value: 'ru', label: 'Русский' },
]

export default function PdfTools({ token, user }) {
  const visibleActions = ACTIONS.filter(a => canAccess(user, `automation:pdf:${a.id}`))
  const [action, setAction] = useState(() => {
    const saved = localStorage.getItem('hagent_pdf_action')
    const allowedIds = visibleActions.map(x => x.id)
    if (allowedIds.includes(saved)) return saved
    return allowedIds[0] || 'edit'
  })
  const effectiveAction = visibleActions.some(a => a.id === action) ? action : (visibleActions[0]?.id || 'edit')

  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])
  const [pages, setPages] = useState('')
  const [targetLang, setTargetLang] = useState('vi')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  function reset() {
    setFiles([])
    setText('')
    setTitle('')
    setPages('')
    setError('')
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function pickAction(id) {
    if (id === action) return
    setAction(id)
    localStorage.setItem('hagent_pdf_action', id)
    reset()
  }

  function onFilesChange(e) {
    const list = Array.from(e.target.files || [])
    setFiles(list)
    setResult(null)
  }

  async function run() {
    if (action === 'edit') return
    setBusy(true); setError(''); setResult(null)
    try {
      let url = ''
      const fd = new FormData()
      if (action === 'text') {
        if (!text.trim()) throw new Error('Văn bản rỗng')
        url = '/api/pdf/from-text'
        fd.append('text', text)
        if (title.trim()) fd.append('title', title.trim())
      } else if (action === 'images') {
        if (files.length === 0) throw new Error('Chưa chọn ảnh')
        url = '/api/pdf/from-images'
        files.forEach(f => fd.append('files', f))
      } else if (action === 'docx') {
        if (files.length === 0) throw new Error('Chưa chọn file .docx')
        url = '/api/pdf/from-docx'
        fd.append('file', files[0])
      } else if (action === 'merge') {
        if (files.length < 2) throw new Error('Cần ít nhất 2 PDF')
        url = '/api/pdf/merge'
        files.forEach(f => fd.append('files', f))
      } else if (action === 'translate') {
        if (files.length === 0) throw new Error('Chưa chọn PDF')
        url = '/api/pdf/translate'
        fd.append('file', files[0])
        fd.append('target_lang', targetLang)
      }
      const res = await fetch(url, { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) {
        const errText = await res.text()
        let detail = errText
        try { detail = JSON.parse(errText).detail || errText } catch { /* noop */ }
        throw new Error(detail || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const fname = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'output.pdf'
      const savedPath = res.headers.get('x-saved-path') || ''
      const objectUrl = URL.createObjectURL(blob)
      setResult({ url: objectUrl, name: decodeURIComponent(fname), size: blob.size, savedPath })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f4f4] text-[#1f1f1f]">
      {/* Action selector */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[#d8d8d8] bg-white px-2 py-2 sm:flex-row sm:items-center sm:px-3">
        <div className="hidden sm:mr-2 sm:flex sm:min-w-[132px] sm:items-center sm:gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#d71920] text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-4">PDF Tools</div>
            <div className="text-[10px] text-gray-500">Document workspace</div>
          </div>
        </div>
        <div className="-mx-2 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {visibleActions.map(a => {
          const Icon = a.icon
          const active = effectiveAction === a.id
          return (
            <button
              key={a.id}
              onClick={() => pickAction(a.id)}
              className={`flex shrink-0 min-w-0 items-center gap-2 rounded border px-2.5 py-1.5 text-left transition-all sm:shrink ${
                active
                  ? 'border-[#d71920] bg-[#fff4f4] text-[#b9151b]'
                  : 'border-transparent bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${active ? 'bg-[#d71920] text-white' : 'bg-gray-100 text-gray-700'}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold leading-4">{a.label}</span>
                <span className="hidden truncate text-[9px] text-gray-500 xl:block">{a.desc}</span>
              </span>
            </button>
          )
        })}
        </div>
      </div>

      {effectiveAction === 'edit' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang tải editor...</div>}>
            <PdfEditor token={token} />
          </Suspense>
        </div>
      ) : effectiveAction === 'translate' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang tải dịch thuật...</div>}>
            <PdfTranslator token={token} />
          </Suspense>
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="text-[15px] font-semibold text-gray-950">{ACTIONS.find(a => a.id === effectiveAction)?.label}</div>
            <div className="mt-1 text-[12px] text-gray-500">{ACTIONS.find(a => a.id === effectiveAction)?.desc}</div>
          </div>
          <div className="space-y-4 p-5">
          {effectiveAction === 'text' && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tiêu đề</span>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Tùy chọn"
                  className="h-10 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-[#d71920]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Nội dung</span>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={12}
                  placeholder="Dùng dòng trống để tách đoạn..."
                  className="w-full rounded border border-gray-300 p-3 text-sm leading-6 outline-none focus:border-[#d71920]"
                />
              </label>
            </>
          )}

          {(effectiveAction === 'images' || effectiveAction === 'docx' || effectiveAction === 'merge' || effectiveAction === 'translate') && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {effectiveAction === 'images' ? 'Chọn nhiều ảnh' :
                 effectiveAction === 'docx' ? 'Chọn file .docx' :
                 effectiveAction === 'merge' ? 'Chọn nhiều PDF (≥ 2)' :
                 'Chọn 1 PDF cần dịch'}
              </span>
              <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                <Upload className="mx-auto h-7 w-7 text-gray-400" />
                <div className="mt-2 text-[13px] font-semibold text-gray-800">Chọn file để xử lý</div>
                <div className="mt-1 text-[11px] text-gray-500">PDF Studio sẽ tạo file mới, không ghi đè file gốc.</div>
                <label className="mt-4 inline-flex h-9 cursor-pointer items-center gap-2 rounded bg-[#d71920] px-4 text-[12px] font-semibold text-white hover:bg-[#b9151b]">
                  <Upload className="h-3.5 w-3.5" />
                  Browse files
                  <input
                    ref={inputRef}
                    type="file"
                    multiple={effectiveAction === 'images' || effectiveAction === 'merge'}
                    accept={
                      effectiveAction === 'images' ? 'image/*' :
                      effectiveAction === 'docx' ? '.doc,.docx' :
                      'application/pdf'
                    }
                    onChange={onFilesChange}
                    className="hidden"
                  />
                </label>
              </div>
              {files.length > 0 && (
                <div className="mt-3 overflow-hidden rounded border border-gray-200">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-[12px] text-gray-700 last:border-b-0">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  ))}
                </div>
              )}
            </label>
          )}

          {effectiveAction === 'translate' && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Dịch sang</span>
              <select
                value={targetLang}
                onChange={e => setTargetLang(e.target.value)}
                className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#d71920]"
              >
                {LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2 border-t border-gray-200 pt-4">
            <button
              onClick={run}
              disabled={busy}
              className="flex h-10 items-center gap-2 rounded bg-[#d71920] px-4 text-sm font-semibold text-white hover:bg-[#b9151b] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? 'Đang xử lý...' : 'Chạy'}
            </button>
            {result && (
              <>
                <a
                  href={result.url}
                  download={result.name}
                  className="flex h-10 items-center gap-2 rounded border border-emerald-500 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <Download className="h-4 w-4" />
                  Tải {result.name}
                </a>
                {result.savedPath && (
                  <button
                    onClick={() => {
                      const path = result.savedPath
                      setAction('edit')
                      setResult(null)
                      window.dispatchEvent(new CustomEvent('hagent_open_pdf_path', { detail: { path, name: result.name } }))
                    }}
                    className="flex h-10 items-center gap-2 rounded border border-[#d71920] bg-[#fff4f4] px-4 text-sm font-semibold text-[#b9151b] hover:bg-[#ffe2e2]"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit tiếp
                  </button>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
          )}
          {result && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
              Đã tạo {result.name} ({Math.round(result.size / 1024)} KB)
            </div>
          )}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
