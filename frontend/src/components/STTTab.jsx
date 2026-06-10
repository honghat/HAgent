import { useEffect, useState } from 'react'
import { Clock3, Copy, FileAudio, LoaderCircle, Mic, Power, PowerOff, Trash2, UploadCloud } from 'lucide-react'
import { useSpeechToText } from '../hooks/useSpeechToText.js'

const PROVIDERS = [
  { id: 'groq', label: 'Groq', tone: 'sky' },
  { id: 'sensevoice', label: 'SenseVoice', tone: 'emerald' },
  { id: 'whisper', label: 'Whisper', tone: 'amber' },
]

const API_BASE = import.meta.env.VITE_API_BASE || ''

async function readJsonResponse(res) {
  const raw = await res.text()
  if (!raw) return {}
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`API STT không trả JSON (HTTP ${res.status}). Kiểm tra backend/proxy hoặc dùng Groq nếu SenseVoice/Whisper chưa sẵn sàng.`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`API STT trả JSON lỗi định dạng (HTTP ${res.status}).`)
  }
}

const TONE = {
  sky: {
    active: 'border-sky-300 bg-sky-50 text-sky-800 ring-sky-100',
    dot: 'bg-sky-500',
  },
  emerald: {
    active: 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-emerald-100',
    dot: 'bg-emerald-500',
  },
  amber: {
    active: 'border-amber-300 bg-amber-50 text-amber-800 ring-amber-100',
    dot: 'bg-amber-500',
  },
}

export default function STTTab() {
  const [file, setFile] = useState(null)
  const [provider, setProviderState] = useState(() => localStorage.getItem('hagent_stt_provider') || 'groq')
  const [language, setLanguage] = useState('vi')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [toggleBusy, setToggleBusy] = useState('')
  const [text, setText] = useState('')
  const [micError, setMicError] = useState('')
  const [elapsedByProvider, setElapsedByProvider] = useState({})
  const [status, setStatus] = useState({})
  const token = localStorage.getItem('token')

  const selectProvider = nextProvider => {
    setProviderState(nextProvider)
    localStorage.setItem('hagent_stt_provider', nextProvider)
  }

  const refreshStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stt/status`)
      const data = await readJsonResponse(res)
      setStatus(data || {})
    } catch {
      setStatus({})
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const mic = useSpeechToText({
    token,
    language,
    prompt,
    provider,
    onTranscript: transcript => {
      setMicError('')
      setText(transcript)
    },
    onTiming: seconds => setElapsedByProvider(prev => ({ ...prev, [provider]: seconds })),
    onError: message => setMicError(message || 'STT mic lỗi'),
  })

  const runSTT = async () => {
    if (!file) {
      window.alert('Chọn file audio/video trước')
      return
    }
    if (!canUseProvider(provider)) {
      window.alert(`${providerLabel(provider)} chưa sẵn sàng. Bấm Bật rồi chờ trạng thái ready, hoặc chọn Groq để nhận dạng ngay.`)
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file)
      fd.append('language', language)
      fd.append('prompt', prompt)
      fd.append('provider', provider)
      fd.append('temperature', '0')

      const startedAt = performance.now()
      const res = await fetch(`${API_BASE}/api/stt`, { method: 'POST', body: fd })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.detail || data.error || 'STT thất bại')
      setText((data.text || '').trim())
      setElapsedByProvider(prev => ({
        ...prev,
        [provider]: ((performance.now() - startedAt) / 1000).toFixed(2),
      }))
    } catch (err) {
      window.alert(err.message || 'STT lỗi')
    } finally {
      setLoading(false)
    }
  }

  const toggleProvider = async (targetProvider, action) => {
    setToggleBusy(`${targetProvider}:${action}`)
    try {
      const res = await fetch(`${API_BASE}/api/stt/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider, action }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok || data.ok === false) throw new Error(data.detail || data.message || 'Toggle STT lỗi')
      await refreshStatus()
    } catch (err) {
      window.alert(err.message || 'Toggle STT lỗi')
    } finally {
      setToggleBusy('')
    }
  }

  const providerStatus = id => {
    if (id === 'groq') return status.groq_available ? 'ready' : 'missing'
    if (status[id]?.service_alive) return 'ready'
    if (status[id]?.tunnel_pm2 === 'registered') return 'starting'
    return 'off'
  }

  const providerLabel = id => PROVIDERS.find(item => item.id === id)?.label || id

  const canUseProvider = id => id === 'groq' ? providerStatus(id) === 'ready' : status[id]?.service_alive === true

  const handleMicToggle = () => {
    if (!canUseProvider(provider)) {
      setMicError(`${providerLabel(provider)} chưa sẵn sàng. Bấm Bật rồi chờ service_alive=true, hoặc chọn Groq.`)
      return
    }
    setMicError('')
    mic.toggle()
  }

  return (
    <div className="mx-auto max-w-6xl px-2 pb-8 sm:px-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-slate-950">Speech to Text</h2>
          <p className="mt-1 text-[12px] text-slate-500">Groq mặc định, SenseVoice và Whisper bật theo nhu cầu.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleProvider('sensevoice', providerStatus('sensevoice') === 'ready' ? 'off' : 'on')}
            disabled={!!toggleBusy}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm disabled:opacity-50"
          >
            {toggleBusy.startsWith('sensevoice') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : providerStatus('sensevoice') === 'ready' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            SenseVoice
          </button>
          <button
            type="button"
            onClick={() => toggleProvider('whisper', providerStatus('whisper') === 'ready' ? 'off' : 'on')}
            disabled={!!toggleBusy}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm disabled:opacity-50"
          >
            {toggleBusy.startsWith('whisper') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : providerStatus('whisper') === 'ready' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            Whisper
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map(item => {
              const active = provider === item.id
              const state = providerStatus(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectProvider(item.id)}
                  className={`rounded-md border px-2 py-2 text-left text-[11px] transition ${active ? `${TONE[item.tone].active} ring-2` : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'}`}
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className={`h-1.5 w-1.5 rounded-full ${state === 'ready' ? TONE[item.tone].dot : 'bg-slate-300'}`} />
                    {item.label}
                  </span>
                  <span className="mt-1 block text-[10px] capitalize opacity-70">{state}</span>
                  <span className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                    <Clock3 className="h-3 w-3" />
                    {elapsedByProvider[item.id] ? `${elapsedByProvider[item.id]}s` : '--'}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center transition hover:border-slate-400 hover:bg-white">
            <UploadCloud className="mb-2 h-6 w-6 text-slate-500" />
            <span className="max-w-full truncate text-[12px] font-semibold text-slate-800">
              {file ? file.name : 'Chọn audio hoặc video'}
            </span>
            <span className="mt-1 text-[11px] text-slate-500">{file ? `${Math.max(file.size / 1024 / 1024, 0.01).toFixed(2)} MB` : 'webm, mp3, wav, mp4'}</span>
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="">Auto</option>
            </select>
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Prompt"
              className="h-9 rounded-md border border-slate-200 px-2 text-[12px] text-slate-800"
            />
          </div>

          {provider === 'sensevoice' && language === 'vi' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              SenseVoice không hỗ trợ tiếng Việt — kết quả có thể bị nhận nhầm. Dùng Whisper hoặc Groq cho tiếng Việt.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={runSTT}
              disabled={loading || mic.transcribing || !file}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-[12px] font-bold text-white disabled:opacity-40"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4" />}
              File
            </button>
            <button
              type="button"
              onClick={handleMicToggle}
              disabled={loading || mic.transcribing}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-bold disabled:opacity-40 ${mic.recording ? 'bg-rose-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}
            >
              {mic.transcribing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {mic.recording ? 'Dừng' : 'Mic'}
            </button>
          </div>

          {micError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {micError}
            </div>
          )}
        </section>

        <section className="flex min-h-[440px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
            <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Transcript</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(text || '')}
                disabled={!text}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-30"
                title="Copy"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setText('')}
                disabled={!text}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-30"
                title="Xóa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Transcript sẽ xuất hiện ở đây..."
            className="min-h-0 flex-1 resize-none border-0 bg-white p-4 text-[14px] leading-6 text-slate-900 outline-none"
          />
        </section>
      </div>
    </div>
  )
}
