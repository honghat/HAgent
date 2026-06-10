import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Loader2, Save, Target, X } from 'lucide-react'

const WORK_MODES = [
  { key: 'onsite', label: 'Onsite' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote' },
]

const LEVELS = [
  { key: 'intern', label: 'Intern' },
  { key: 'junior', label: 'Junior' },
  { key: 'mid', label: 'Mid' },
  { key: 'senior', label: 'Senior' },
  { key: 'lead', label: 'Lead' },
]

function ChipsInput({ value, onChange, placeholder, tone = 'slate' }) {
  const [draft, setDraft] = useState('')
  const toneCls = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-700'
  function commit(text) {
    const t = text.trim().replace(/,$/, '').trim()
    if (!t) return
    if (value.includes(t)) return
    onChange([...value, t])
    setDraft('')
  }
  return (
    <div className={`flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1 sm:gap-1.5 sm:px-2 sm:py-1.5 ${toneCls}`}>
      {value.map(v => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-white/80 px-1 py-0.5 text-[10px] font-semibold sm:text-[11px] sm:px-1.5 sm:py-0.5">
          {v}
          <button type="button" onClick={() => onChange(value.filter(x => x !== v))} className="text-slate-400 hover:text-rose-500">
            <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => {
          const v = e.target.value
          if (v.endsWith(',')) commit(v)
          else setDraft(v)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft) }
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[60px] flex-1 bg-transparent text-[10px] outline-none placeholder:text-slate-400 sm:min-w-[80px] sm:text-[11px]"
      />
    </div>
  )
}

function Toggle({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold transition sm:px-2 sm:py-1 sm:text-[10px] ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )
}

export default function JobPreferencesPanel({ headers, onSaved }) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(null)
  const [labels, setLabels] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    let active = true
    fetch('/api/job-hunter/preferences', { headers })
      .then(r => r.json())
      .then(data => {
        if (!active) return
        const p = data.preferences || {}
        setPrefs(p)
        setDraft(p)
        setLabels(data.location_labels || {})
        const empty = !p.locations?.length && !p.salary_min && !p.target_roles?.length
        setOpen(empty)
      })
      .catch(() => {})
    return () => { active = false }
  }, [headers])

  const summary = useMemo(() => {
    if (!prefs) return ''
    const parts = []
    if (prefs.target_roles?.length) parts.push(prefs.target_roles.slice(0, 2).join(' / '))
    if (prefs.locations?.length) parts.push('@ ' + prefs.locations.map(k => labels[k] || k).join(', '))
    if (prefs.salary_min) parts.push(`>${Math.round(prefs.salary_min / 1_000_000)}tr`)
    if (prefs.level) parts.push(prefs.level)
    if (prefs.compressed_week) parts.push('Nghỉ T7')
    if (prefs.target_companies?.length) parts.push('🏢 ' + prefs.target_companies.slice(0, 2).join(', '))
    return parts.join(' • ')
  }, [prefs, labels])

  if (!prefs || !draft) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center gap-2 text-[10px] text-slate-400 sm:text-[11px]">
          <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" /> Đang nạp preference…
        </div>
      </section>
    )
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/job-hunter/preferences', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          target_roles: draft.target_roles || [],
          locations: draft.locations || [],
          keywords: draft.keywords || [],
          salary_min: draft.salary_min || null,
          work_modes: draft.work_modes || [],
          level: draft.level || null,
          must_have_skills: draft.must_have_skills || [],
          avoid_keywords: draft.avoid_keywords || [],
          languages: draft.languages || [],
          compressed_week: draft.compressed_week ?? true,
          target_companies: draft.target_companies || [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Lưu thất bại')
      setPrefs(data.preferences)
      setDraft(data.preferences)
      setLabels(data.location_labels || labels)
      setOpen(false)
      onSaved?.(data.preferences)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function patch(key, val) { setDraft(d => ({ ...d, [key]: val })) }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 sm:px-4 sm:py-3"
      >
        <Target className="h-3.5 w-3.5 text-slate-700 sm:h-4 sm:w-4" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-slate-800 sm:text-xs">Nhu cầu của tôi</h2>
          {!open && summary && <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-[11px]">{summary}</p>}
          {!open && !summary && <p className="mt-0.5 truncate text-[10px] text-rose-500 sm:text-[11px]">Chưa khai — JD sẽ trả về lệch nhu cầu</p>}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 sm:h-4 sm:w-4" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 sm:h-4 sm:w-4" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4 sm:space-y-3">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Vị trí mục tiêu</label>
            <ChipsInput value={draft.target_roles || []} onChange={v => patch('target_roles', v)} placeholder="Data Analyst, BI Analyst…" />
          </div>
          <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Địa điểm (bắt buộc khớp)</label>
              <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {Object.entries(labels).map(([key, label]) => (
                  <Toggle
                    key={key}
                    active={(draft.locations || []).includes(key)}
                    label={label}
                    onClick={() => patch('locations', (draft.locations || []).includes(key)
                      ? draft.locations.filter(x => x !== key)
                      : [...(draft.locations || []), key])}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
                Lương tối thiểu {draft.salary_min ? `· ${Math.round(draft.salary_min / 1_000_000)}tr` : ''}
              </label>
              <input
                type="range"
                min={0}
                max={80_000_000}
                step={1_000_000}
                value={draft.salary_min || 0}
                onChange={e => patch('salary_min', Number(e.target.value) || null)}
                className="w-full accent-slate-900"
              />
              <input
                type="number"
                value={draft.salary_min || ''}
                onChange={e => patch('salary_min', Number(e.target.value) || null)}
                placeholder="VND/tháng"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-[10px] outline-none focus:border-slate-400 sm:text-[11px]"
              />
            </div>
          </div>
          <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Hình thức</label>
              <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {WORK_MODES.map(m => (
                  <Toggle
                    key={m.key}
                    active={(draft.work_modes || []).includes(m.key)}
                    label={m.label}
                    onClick={() => patch('work_modes', (draft.work_modes || []).includes(m.key)
                      ? draft.work_modes.filter(x => x !== m.key)
                      : [...(draft.work_modes || []), m.key])}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Cấp độ</label>
              <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {LEVELS.map(l => (
                  <Toggle
                    key={l.key}
                    active={draft.level === l.key}
                    label={l.label}
                    onClick={() => patch('level', draft.level === l.key ? null : l.key)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Keywords scrape (seed cho cron)</label>
            <ChipsInput value={draft.keywords || []} onChange={v => patch('keywords', v)} placeholder="data analyst, finance…" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-emerald-700 sm:text-[10px]">Kỹ năng must-have (+điểm)</label>
            <ChipsInput value={draft.must_have_skills || []} onChange={v => patch('must_have_skills', v)} placeholder="SQL, Python, Power BI…" tone="emerald" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-rose-700 sm:text-[10px]">Né tránh (ẩn JD)</label>
            <ChipsInput value={draft.avoid_keywords || []} onChange={v => patch('avoid_keywords', v)} placeholder="commission, ngoài giờ…" tone="rose" />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 sm:text-[10px]">Nghỉ thứ 7 (lọc JD có dấu hiệu làm T7)</span>
              <button
                type="button"
                onClick={() => patch('compressed_week', !draft.compressed_week)}
                className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold transition sm:px-2 sm:py-1 sm:text-[10px] ${
                  draft.compressed_week
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {draft.compressed_week ? 'Bật' : 'Tắt'}
              </button>
            </label>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-indigo-700 sm:text-[10px]">Công ty mục tiêu (làm tới già)</label>
            <ChipsInput value={draft.target_companies || []} onChange={v => patch('target_companies', v)} placeholder="THACO, Vingroup, FPT, Masan…" tone="slate" />
          </div>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700 sm:text-[11px]">{error}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-800 disabled:opacity-40 sm:text-xs"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" /> : <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              Lưu nhu cầu
            </button>
            {summary && (
              <button
                onClick={() => { setDraft(prefs); setOpen(false) }}
                className="rounded-lg border border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 sm:px-3 sm:text-xs"
              >
                Hủy
              </button>
            )}
          </div>
          {prefs.locations?.length > 0 && (
            <p className="text-[9px] leading-4 text-slate-400 sm:text-[10px]">
              <Check className="mr-1 inline h-2.5 w-2.5 text-emerald-600 sm:h-3 sm:w-3" />
              JD không khớp địa điểm / lương / từ né sẽ được ẩn khỏi danh sách.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
