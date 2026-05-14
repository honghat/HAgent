import { useEffect, useState } from 'react'
import axios from 'axios'
import { Download, ExternalLink, FileText, Loader2, Play, RefreshCw, Trash2, Wand2 } from 'lucide-react'

const defaultForm = {
  topic: 'Vòng đời của cây',
  channel: '@duide_duide',
  durationSec: 24,
  format: '9:16',
  style: 'Sạch, sáng, ít chi tiết, chuyển động mượt',
  useProvider: true,
  includeTts: true,
  voice: 'hoaimy',
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fileUrl(path) {
  return path ? `/uploads/${path}` : ''
}

function shortDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function EducationAnimation({ token, provider, embedded = false }) {
  const [form, setForm] = useState(defaultForm)
  const [plan, setPlan] = useState(null)
  const [html, setHtml] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [busyPlan, setBusyPlan] = useState(false)
  const [busyRender, setBusyRender] = useState(false)
  const [busyHistory, setBusyHistory] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [publishing, setPublishing] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadHistory(true)
  }, [token])

  const files = result?.files || {}
  const selectedFormat = plan?.format || form.format

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function loadHistory(silent = false) {
    if (!silent) setBusyHistory(true)
    try {
      const res = await axios.get('/api/education-animation/history?limit=30', {
        headers: authHeaders(token),
      })
      setHistory(Array.isArray(res.data.items) ? res.data.items : [])
    } catch {
      setHistory([])
    } finally {
      if (!silent) setBusyHistory(false)
    }
  }

  async function createPlan() {
    setBusyPlan(true)
    setError('')
    setNotice('')
    setResult(null)
    try {
      const res = await axios.post('/api/education-animation/plan', {
        topic: form.topic,
        channel: form.channel,
        durationSec: Number(form.durationSec),
        format: form.format,
        style: form.style,
        provider: form.useProvider ? provider : '',
      }, { headers: authHeaders(token) })
      setPlan(res.data.plan)
      setHtml(res.data.html || '')
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setBusyPlan(false)
    }
  }

  async function renderVideo() {
    if (!plan) return
    setBusyRender(true)
    setError('')
    setNotice('')
    try {
      const res = await axios.post('/api/education-animation/render', {
        plan: { ...plan, channel: form.channel },
        format: plan.format,
        includeTts: form.includeTts,
        voice: form.voice,
      }, { headers: authHeaders(token) })
      setResult(res.data)
      if (res.data.html) setHtml(res.data.html)
      loadHistory(true)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setBusyRender(false)
    }
  }

  async function selectHistoryItem(item) {
    setResult(item)
    setPlan(item.plan || null)
    setError('')
    setNotice('')
    if (!item.files?.html) {
      setHtml('')
      return
    }
    try {
      const res = await axios.get(fileUrl(item.files.html), { responseType: 'text' })
      setHtml(typeof res.data === 'string' ? res.data : '')
    } catch {
      setHtml('')
    }
  }

  async function deleteHistoryItem(item) {
    if (!item?.id) return
    if (!window.confirm(`Xóa "${item.title || item.id}"?`)) return
    setDeletingId(item.id)
    setError('')
    try {
      await axios.delete(`/api/education-animation/history/${encodeURIComponent(item.id)}`, {
        headers: authHeaders(token),
      })
      setHistory(prev => prev.filter(x => x.id !== item.id))
      if (result?.id === item.id) {
        setResult(null)
        setPlan(null)
        setHtml('')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setDeletingId('')
    }
  }

  async function publish(platform) {
    if (!result?.files?.video) return
    setPublishing(platform)
    setNotice('')
    setError('')
    const metadata = result.metadata || {}
    try {
      const body = platform === 'youtube'
        ? {
            file: result.files.video,
            title: metadata.youtubeTitle || result.plan?.title,
            description: metadata.youtubeDescription || result.plan?.objective,
            tags: metadata.youtubeTags || '',
          }
        : {
            file: result.files.video,
            title: result.plan?.title,
            caption: metadata.tiktokCaption || result.plan?.title,
          }
      const res = await axios.post(`/api/education-animation/publish/${platform}`, body, {
        headers: authHeaders(token),
      })
      setNotice(`${platform}: ${res.data.url || res.data.publishId || 'Hoàn tất'}`)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setPublishing('')
    }
  }

  return (
    <div className={`${embedded ? '' : 'h-full overflow-y-auto bg-[#f7f7f4] p-3 pb-safe sm:p-5'}`}>
      <div className={`mx-auto grid h-full w-full grid-cols-1 ${embedded ? 'max-w-6xl gap-3 lg:grid-cols-[280px_minmax(0,1fr)]' : 'max-w-7xl gap-4 lg:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <aside className={`min-w-0 ${embedded ? 'space-y-3' : 'space-y-4'}`}>
          <section className={`rounded-2xl border border-black/[0.06] bg-white shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
            <div className={`${embedded ? 'mb-3' : 'mb-4'} flex items-center justify-between gap-3`}>
              <div>
                <h1 className="text-base font-semibold text-gray-950">Hoạt hình</h1>
                <p className="text-[11px] font-medium text-gray-400">{provider}</p>
              </div>
              <button
                onClick={() => setForm(defaultForm)}
                className="h-9 rounded-xl bg-gray-50 px-3 text-[12px] font-semibold text-gray-500 hover:bg-gray-100"
              >
                Reset
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Chủ đề">
                <textarea
                  value={form.topic}
                  onChange={e => update('topic', e.target.value)}
                  rows={embedded ? 2 : 3}
                  className={`field resize-none ${embedded ? 'min-h-16' : 'min-h-24'}`}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Thời lượng">
                  <input
                    type="number"
                    min="12"
                    max="60"
                    value={form.durationSec}
                    onChange={e => update('durationSec', e.target.value)}
                    className="field"
                  />
                </Field>
                <Field label="Tỷ lệ">
                  <select value={form.format} onChange={e => update('format', e.target.value)} className="field">
                    <option value="9:16">9:16</option>
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                  </select>
                </Field>
              </div>

              <Field label="Phong cách">
                <input value={form.style} onChange={e => update('style', e.target.value)} className="field" />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Kênh">
                  <input value={form.channel} onChange={e => update('channel', e.target.value)} className="field" />
                </Field>
                <Field label="Giọng">
                  <select value={form.voice} onChange={e => update('voice', e.target.value)} className="field">
                    <option value="hoaimy">Hoài My</option>
                    <option value="namminh">Nam Minh</option>
                    <option value="google">Google</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Model" checked={form.useProvider} onChange={value => update('useProvider', value)} />
                <Toggle label="TTS" checked={form.includeTts} onChange={value => update('includeTts', value)} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={createPlan}
                  disabled={busyPlan || !form.topic.trim()}
                  className="btn-primary"
                >
                  {busyPlan ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                  Tạo
                </button>
                <button
                  onClick={renderVideo}
                  disabled={!plan || busyRender}
                  className="btn-secondary"
                >
                  {busyRender ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  Render
                </button>
              </div>
            </div>
          </section>

          <section className={`rounded-2xl border border-black/[0.06] bg-white shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-gray-500">Lịch sử</h2>
              <button
                onClick={() => loadHistory(false)}
                disabled={busyHistory}
                className="grid h-8 w-8 place-items-center rounded-xl bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
              >
                <RefreshCw size={14} className={busyHistory ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className={`${embedded ? 'max-h-44' : 'max-h-72'} space-y-2 overflow-y-auto pr-1 custom-scrollbar`}>
              {history.length === 0 && (
                <div className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[12px] font-medium text-gray-400">
                  Chưa có file render
                </div>
              )}
              {history.map(item => (
                <div
                  key={item.id}
                  className={`group flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    result?.id === item.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white hover:bg-gray-50'
                  }`}
                >
                  <button onClick={() => selectHistoryItem(item)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[12px] font-semibold text-gray-900">{item.title || item.id}</div>
                    <div className="mt-0.5 text-[10px] font-medium text-gray-400">{shortDate(item.createdAt)}</div>
                  </button>
                  <button
                    onClick={() => deleteHistoryItem(item)}
                    disabled={deletingId === item.id}
                    className="grid h-8 w-8 place-items-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                  >
                    {deletingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className={`min-w-0 ${embedded ? 'space-y-3' : 'space-y-4'}`}>
          {(error || notice) && (
            <div className={`rounded-2xl border px-4 py-3 text-[12px] font-semibold ${
              error ? 'border-red-100 bg-red-50 text-red-600' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}>
              {error || notice}
            </div>
          )}

          <section className={`grid grid-cols-1 ${embedded ? 'gap-3 xl:grid-cols-[minmax(0,1fr)_220px]' : 'gap-4 xl:grid-cols-[minmax(0,1fr)_260px]'}`}>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-sm">
              <div className={`${embedded ? 'mb-2 min-h-8' : 'mb-3 min-h-10'} flex items-center justify-between gap-3 px-1`}>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-gray-950">{plan?.title || 'Preview'}</h2>
                  <p className="truncate text-[11px] font-medium text-gray-400">{plan?.objective || form.topic}</p>
                </div>
                {files.video && (
                  <a href={fileUrl(files.video)} download className="btn-compact bg-gray-900 text-white hover:bg-black">
                    <Download size={14} />
                    MP4
                  </a>
                )}
              </div>

              <div className={`grid place-items-center overflow-hidden rounded-xl bg-gray-100 ${embedded ? 'min-h-[46vh] p-2' : 'min-h-[58vh] p-3'}`}>
                {files.video ? (
                  <video src={fileUrl(files.video)} controls playsInline className={`${embedded ? 'max-h-[58vh]' : 'max-h-[70vh]'} w-full rounded-lg bg-black`} />
                ) : html ? (
                  <iframe
                    title="HTML/CSS animation preview"
                    srcDoc={html}
                    sandbox="allow-scripts"
                    className={`border-0 bg-white shadow-xl ${
                      selectedFormat === '16:9'
                        ? 'aspect-video w-full max-w-[880px]'
                        : selectedFormat === '1:1'
                          ? 'aspect-square w-full max-w-[560px]'
                          : `aspect-[9/16] ${embedded ? 'h-[56vh] max-h-[620px]' : 'h-[68vh] max-h-[720px]'}`
                    }`}
                  />
                ) : (
                  <div className="text-center text-[12px] font-semibold text-gray-400">Chưa có preview</div>
                )}
              </div>
            </div>

            <aside className={embedded ? 'space-y-3' : 'space-y-4'}>
              <section className={`rounded-2xl border border-black/[0.06] bg-white shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
                <h2 className="mb-3 text-[12px] font-semibold text-gray-500">File</h2>
                <div className="space-y-2">
                  <FileButton label="Video" href={fileUrl(files.video)} />
                  <FileButton label="Audio" href={fileUrl(files.audio)} />
                  <FileButton label="HTML" href={fileUrl(files.html)} />
                  <FileButton label="SRT" href={fileUrl(files.captions)} />
                  <FileButton label="JSON" href={fileUrl(files.storyboard)} />
                </div>
              </section>

              <section className={`rounded-2xl border border-black/[0.06] bg-white shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
                <h2 className="mb-3 text-[12px] font-semibold text-gray-500">Xuất bản</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => publish('youtube')} disabled={!files.video || publishing === 'youtube'} className="btn-secondary">
                    {publishing === 'youtube' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    YouTube
                  </button>
                  <button onClick={() => publish('tiktok')} disabled={!files.video || publishing === 'tiktok'} className="btn-secondary">
                    {publishing === 'tiktok' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    TikTok
                  </button>
                </div>
              </section>

              {plan?.scenes?.length > 0 && (
                <section className={`rounded-2xl border border-black/[0.06] bg-white shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
                  <h2 className="mb-3 text-[12px] font-semibold text-gray-500">Cảnh</h2>
                  <div className="space-y-2">
                    {plan.scenes.slice(0, 6).map((scene, index) => (
                      <div key={scene.id || index} className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="truncate text-[12px] font-semibold text-gray-900">{index + 1}. {scene.title}</div>
                        <div className="mt-0.5 truncate text-[10px] font-medium text-gray-400">{scene.durationSec}s · {scene.motion}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </section>
        </main>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-gray-400">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex min-h-10 items-center justify-between rounded-xl bg-gray-50 px-3 text-[12px] font-semibold text-gray-600">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 accent-gray-900"
      />
    </label>
  )
}

function FileButton({ label, href }) {
  if (!href) {
    return (
      <div className="flex min-h-10 items-center justify-between rounded-xl bg-gray-50 px-3 text-[12px] font-semibold text-gray-300">
        <span className="flex items-center gap-2"><FileText size={14} />{label}</span>
        <Download size={13} />
      </div>
    )
  }
  return (
    <a href={href} download className="flex min-h-10 items-center justify-between rounded-xl bg-gray-50 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-100">
      <span className="flex items-center gap-2"><FileText size={14} />{label}</span>
      <Download size={13} />
    </a>
  )
}
