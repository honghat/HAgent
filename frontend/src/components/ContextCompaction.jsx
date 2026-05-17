import { useEffect, useMemo, useState } from 'react'
import { fetchContextCompaction, updateContextCompaction } from '../api.js'

const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`

export default function ContextCompaction({ token }) {
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
  const thresholdTokens = useMemo(() => {
    const ctx = Number(status?.model_context_length || 0)
    return ctx ? Math.round(ctx * Number(compression.threshold || 0)) : 0
  }, [status, compression.threshold])

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

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setLoading(true)
    try {
      const next = await updateContextCompaction(token, form)
      setStatus(next)
      if (next?.compression) setForm(next.compression)
      setNotice('Đã lưu cấu hình auto compacting context')
      setTimeout(() => setNotice(''), 2400)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f4]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-black/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-950">Automatically Compacting Context</h1>
            <p className="mt-1 text-sm text-gray-500">Tự nén lịch sử dài thành checkpoint để agent tiếp tục làm việc qua nhiều lượt.</p>
          </div>
          <button
            onClick={save}
            disabled={loading}
            className="h-10 rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Trạng thái" value={form.enabled ? 'ON' : 'OFF'} tone={form.enabled ? 'text-emerald-700' : 'text-gray-400'} />
          <Metric label="Engine" value={status?.engine || 'compressor'} />
          <Metric label="Ngưỡng" value={percent(form.threshold)} />
          <Metric label="Context model" value={status?.model_context_length ? Number(status.model_context_length).toLocaleString() : 'Auto'} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-black/[0.06] bg-white p-5 shadow-sm">
            <label className="mb-5 flex items-center justify-between rounded-lg border border-black/[0.06] bg-gray-50 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-950">Auto compact context</div>
                <div className="mt-1 text-xs text-gray-500">Bật để agent tự compact khi prompt gần đầy context window.</div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(form.enabled)}
                onChange={(e) => update('enabled', e.target.checked)}
                className="h-4 w-4 accent-gray-950"
              />
            </label>

            <Control
              label="Compression threshold"
              value={form.threshold}
              min={0.5}
              max={0.95}
              step={0.01}
              display={percent(form.threshold)}
              onChange={(value) => update('threshold', Number(value))}
            />
            <Control
              label="Summary target ratio"
              value={form.target_ratio}
              min={0.1}
              max={0.8}
              step={0.01}
              display={percent(form.target_ratio)}
              onChange={(value) => update('target_ratio', Number(value))}
            />
            <Control
              label="Protect last messages"
              value={form.protect_last_n}
              min={4}
              max={80}
              step={1}
              display={String(form.protect_last_n)}
              onChange={(value) => update('protect_last_n', Number(value))}
            />
            <Control
              label="Hard message limit"
              value={form.hygiene_hard_message_limit}
              min={80}
              max={2000}
              step={20}
              display={String(form.hygiene_hard_message_limit)}
              onChange={(value) => update('hygiene_hard_message_limit', Number(value))}
            />
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-black/[0.06] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-950">Runtime estimate</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Compact at" value={thresholdTokens ? `${thresholdTokens.toLocaleString()} tokens` : 'Auto'} />
                <Row label="Config path" value={status?.config_path || ''} mono />
                <Row label="Learning log" value="context_compaction" mono />
              </dl>
            </div>
            <div className="rounded-lg border border-black/[0.06] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-950">Behavior</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                {(status?.notes || []).map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'text-gray-950' }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`mt-1 truncate text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
    </div>
  )
}

function Control({ label, value, min, max, step, display, onChange }) {
  return (
    <div className="border-t border-black/[0.06] py-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <label className="text-sm font-semibold text-gray-800">{label}</label>
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{display}</span>
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

function Row({ label, value, mono = false }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
