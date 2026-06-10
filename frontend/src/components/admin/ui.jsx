// Thành phần UI dùng chung cho khu Quản trị — tối giản, tinh tế.
import { useEffect } from 'react'

export function fmtDate(s) {
  if (!s) return '—'
  try {
    const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'))
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return s
  }
}

export function Spinner({ label = 'Đang tải...' }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-[12px] font-medium text-gray-400">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
      {label}
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{children}</div>
}

export function EmptyState({ children }) {
  return <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-[12px] text-gray-400">{children}</div>
}

const BADGE = {
  gray: 'bg-gray-100 text-gray-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
}

export function Badge({ color = 'gray', children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[color] || BADGE.gray}`}>{children}</span>
}

export function StatCard({ label, value, sub, accent = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5">
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      {sub != null && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

// Biểu đồ cột nhẹ (SVG thuần) cho dữ liệu [{date,count}] hoặc [{label,count}].
export function Bars({ data = [], height = 56 }) {
  const max = Math.max(1, ...data.map(d => d.count || 0))
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.round(((d.count || 0) / max) * (height - 6))
        return (
          <div key={i} className="group relative flex flex-1 items-end" style={{ height }}>
            <div
              className="w-full rounded-sm bg-gray-300 transition-all group-hover:bg-gray-600"
              style={{ height: Math.max(2, h) }}
              title={`${d.date || d.label}: ${d.count || 0}`}
            />
          </div>
        )
      })}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[88vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl animate-in fade-in zoom-in-95 duration-200`}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 outline-none transition-all focus:border-gray-400 focus:ring-2 focus:ring-gray-100'

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  )
}

export function btn(variant = 'ghost') {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all disabled:opacity-40'
  const v = {
    primary: 'bg-gray-900 text-white hover:bg-gray-700',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'text-red-600 hover:bg-red-50',
    soft: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  }
  return `${base} ${v[variant] || v.ghost}`
}
