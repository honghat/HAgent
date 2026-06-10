import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const styles = {
  success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  ok: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  error: 'border-red-100 bg-red-50 text-red-800',
  warning: 'border-amber-100 bg-amber-50 text-amber-800',
  info: 'border-gray-100 bg-white text-gray-700',
}

const iconStyles = {
  success: 'text-emerald-600',
  ok: 'text-emerald-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-gray-500',
}

function ToastIcon({ type }) {
  if (type === 'success' || type === 'ok') return <CheckCircle2 className="h-4 w-4" />
  if (type === 'error' || type === 'warning') return <AlertCircle className="h-4 w-4" />
  return <Info className="h-4 w-4" />
}

export function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const dismissToast = () => {
    window.clearTimeout(timerRef.current)
    setToast(null)
  }

  const showToast = (message, type = 'info', duration = 3500) => {
    window.clearTimeout(timerRef.current)
    setToast({ id: Date.now(), message, type })
    timerRef.current = window.setTimeout(() => setToast(null), duration)
  }

  return { toast, showToast, dismissToast }
}

export default function Toast({ toast, onClose }) {
  if (!toast) return null
  const type = toast.type || 'info'

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[220] flex justify-end sm:inset-x-auto sm:right-4 sm:top-4">
      <div
        className={`pointer-events-auto flex max-w-[min(92vw,420px)] items-start gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold shadow-lg shadow-black/10 backdrop-blur ${styles[type] || styles.info}`}
        role="status"
      >
        <span className={`mt-0.5 shrink-0 ${iconStyles[type] || iconStyles.info}`}>
          <ToastIcon type={type} />
        </span>
        <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Đóng thông báo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function inferToastType(message) {
  const text = String(message || '').toLowerCase()
  if (/(lỗi|loi|fail|failed|thất bại|không thể|không xoá|không xóa|error)/i.test(text)) return 'error'
  if (/(cảnh báo|warning|chưa|không có key|không tìm thấy)/i.test(text)) return 'warning'
  if (/(đã|thành công|success|saved|created|uploaded|downloaded)/i.test(text)) return 'success'
  return 'info'
}

export function GlobalToastViewport() {
  const { toast, showToast, dismissToast } = useToast()

  useEffect(() => {
    const originalAlert = window.alert

    window.__hagentToast = (message, type = inferToastType(message), duration) => {
      showToast(String(message ?? ''), type, duration)
    }
    window.alert = message => {
      window.__hagentToast?.(message)
    }

    return () => {
      window.alert = originalAlert
      delete window.__hagentToast
    }
  }, [showToast])

  return <Toast toast={toast} onClose={dismissToast} />
}
