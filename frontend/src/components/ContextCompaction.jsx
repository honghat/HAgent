import { useEffect, useMemo, useState } from 'react'
import { fetchContextCompaction, updateContextCompaction } from '../api.js'

const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`

export default function ContextCompaction({ token, contextLength, embedded = false, registerSave }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({
    enabled: true,
    threshold: 0.5,
    target_ratio: 0.2,
    protect_last_n: 20,
    hygiene_hard_message_limit: 400,
  })
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const compression = status?.compression || form
  const effectiveContextLength = Number(contextLength || status?.model_context_length || 0)
  const engineLabel = status?.engine === 'compressor' ? 'Bộ nén' : (status?.engine || 'Bộ nén')
  const thresholdTokens = useMemo(() => {
    const ctx = effectiveContextLength
    return ctx ? Math.round(ctx * Number(compression.threshold || 0)) : 0
  }, [effectiveContextLength, compression.threshold])

  async function load() {
    setLoading(true)
    try {
      const data = await fetchContextCompaction(token)
      setStatus(data)
      if (data?.compression) setForm(data.compression)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token])

  useEffect(() => {
    if (registerSave) {
      registerSave(() => save)
    }
    return () => {
      if (registerSave) registerSave(null)
    }
  }, [form, token, registerSave])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setLoading(true)
    try {
      const next = await updateContextCompaction(token, form)
      setStatus(next)
      if (next?.compression) setForm(next.compression)
      setNotice('Đã lưu cấu hình tự nén ngữ cảnh')
      setTimeout(() => setNotice(''), 2400)
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <>
        <div className={`${embedded ? 'mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between' : 'mb-6 flex flex-col gap-4 border-b border-black/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center text-white rounded-md bg-teal-500 shadow-lg shadow-teal-500/20 shrink-0 ${embedded ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <svg width={embedded ? "18" : "22"} height={embedded ? "18" : "22"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18.477 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              {embedded
                ? <h2 className="text-sm font-semibold text-gray-900 leading-none">Tự nén ngữ cảnh</h2>
                : <h1 className="text-xl font-semibold tracking-tight text-gray-950">Tự động nén ngữ cảnh</h1>}
              <p className={`${embedded ? 'text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-1' : 'text-sm mt-1 text-gray-500'}`}>{embedded ? 'Quản lý bộ nhớ ngắn hạn' : 'Tự nén lịch sử dài thành checkpoint để agent tiếp tục làm việc qua nhiều lượt.'}</p>
            </div>
          </div>
          {!registerSave && (
            <button
              onClick={save}
              disabled={loading}
              className={`${embedded ? 'h-9 rounded-md px-3 text-[12px]' : 'h-10 rounded-lg px-4 text-sm'} bg-gray-950 font-medium text-white transition hover:bg-black disabled:opacity-50`}
            >
              {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          )}
        </div>

        {notice && <div className={`${embedded ? 'mb-3 rounded-md px-3 py-2 text-[12px]' : 'mb-4 rounded-lg px-4 py-3 text-sm'} border border-emerald-200 bg-emerald-50 text-emerald-800`}>{notice}</div>}

        <div className={`${embedded ? 'mb-4 grid gap-2 sm:grid-cols-4' : 'mb-6 grid gap-3 sm:grid-cols-4'}`}>
          <Metric compact={embedded} label="Trạng thái" value={form.enabled ? 'Bật' : 'Tắt'} tone={form.enabled ? 'text-emerald-700' : 'text-gray-400'} />
          <Metric compact={embedded} label="Bộ nén" value={engineLabel} />
          <Metric compact={embedded} label="Ngưỡng" value={percent(form.threshold)} />
          <Metric compact={embedded} label="Ngữ cảnh model" value={effectiveContextLength ? effectiveContextLength.toLocaleString() : 'Tự động'} />
        </div>

        <div className={`${embedded ? 'grid gap-3 lg:grid-cols-[1fr_320px]' : 'grid gap-5 lg:grid-cols-[1fr_360px]'}`}>
          <section className={`${embedded ? 'rounded-md p-3' : 'rounded-lg p-5 shadow-sm'} border border-black/[0.06] bg-white`}>
            <label className={`${embedded ? 'mb-3 rounded-md px-3 py-2' : 'mb-5 rounded-lg px-4 py-3'} flex items-center justify-between border border-black/[0.06] bg-gray-50`}>
              <div>
                <div className="text-[12px] font-semibold text-gray-950">Tự nén ngữ cảnh</div>
                <div className="mt-1 text-[11px] leading-4 text-gray-500">Bật để agent tự nén khi prompt gần đầy cửa sổ ngữ cảnh.</div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(form.enabled)}
                onChange={(e) => update('enabled', e.target.checked)}
                className="h-4 w-4 accent-gray-950"
              />
            </label>

            <Control
              compact={embedded}
              label="Ngưỡng nén"
              value={form.threshold}
              min={0.5}
              max={0.95}
              step={0.01}
              display={percent(form.threshold)}
              onChange={(value) => update('threshold', Number(value))}
            />
            <Control
              compact={embedded}
              label="Tỉ lệ tóm tắt mục tiêu"
              value={form.target_ratio}
              min={0.1}
              max={0.8}
              step={0.01}
              display={percent(form.target_ratio)}
              onChange={(value) => update('target_ratio', Number(value))}
            />
            <Control
              compact={embedded}
              label="Giữ tin nhắn gần nhất"
              value={form.protect_last_n}
              min={4}
              max={80}
              step={1}
              display={String(form.protect_last_n)}
              onChange={(value) => update('protect_last_n', Number(value))}
            />
            <Control
              compact={embedded}
              label="Giới hạn tin nhắn cứng"
              value={form.hygiene_hard_message_limit}
              min={80}
              max={2000}
              step={20}
              display={String(form.hygiene_hard_message_limit)}
              onChange={(value) => update('hygiene_hard_message_limit', Number(value))}
            />
          </section>

          <aside className={`${embedded ? 'space-y-3' : 'space-y-4'}`}>
            <div className={`${embedded ? 'rounded-md p-3' : 'rounded-lg p-5 shadow-sm'} border border-black/[0.06] bg-white`}>
              <h2 className="text-[12px] font-semibold text-gray-950">Ước tính khi chạy</h2>
              <dl className={`${embedded ? 'mt-3 space-y-2 text-[12px]' : 'mt-4 space-y-3 text-sm'}`}>
                <Row compact={embedded} label="Nén khi" value={thresholdTokens ? `${thresholdTokens.toLocaleString()} token` : 'Tự động'} />
                {!embedded && <Row compact={embedded} label="File cấu hình" value={status?.config_path || ''} mono />}
                {!embedded && <Row compact={embedded} label="Log học" value="context_compaction" mono />}
              </dl>
            </div>
            <div className={`${embedded ? 'rounded-md p-3' : 'rounded-lg p-5 shadow-sm'} border border-black/[0.06] bg-white`}>
              <h2 className="text-[12px] font-semibold text-gray-950">Hành vi</h2>
              <ul className={`${embedded ? 'mt-2 space-y-1.5 text-[12px] leading-5' : 'mt-3 space-y-2 text-sm leading-6'} text-gray-600`}>
                {(status?.notes || []).map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          </aside>
        </div>
    </>
  )

  if (embedded) {
    return <div>{content}</div>
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f4]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        {content}
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'text-gray-950', compact = false }) {
  return (
    <div className={`${compact ? 'rounded-md px-3 py-2' : 'rounded-lg px-4 py-3 shadow-sm'} border border-black/[0.06] bg-white`}>
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className={`${compact ? 'text-[18px]' : 'text-2xl'} mt-1 truncate font-semibold tracking-tight ${tone}`}>{value}</div>
    </div>
  )
}

function Control({ label, value, min, max, step, display, onChange, compact = false }) {
  return (
    <div className={`${compact ? 'py-3' : 'py-5'} border-t border-black/[0.06] first:border-t-0 first:pt-0`}>
      <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-4`}>
        <label className="text-[12px] font-semibold text-gray-800">{label}</label>
        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-gray-950"
      />
    </div>
  )
}

function Row({ label, value, mono = false, compact = false }) {
  return (
    <div className="flex gap-3">
      <dt className={`${compact ? 'w-24' : 'w-28'} shrink-0 text-gray-500`}>{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
