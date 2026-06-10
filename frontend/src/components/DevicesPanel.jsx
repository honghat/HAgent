import { useEffect, useState, useCallback } from 'react'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000)
  if (diff < 60) return 'Vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return `${Math.floor(diff / 86400)} ngày trước`
}

function DeviceIcon({ name }) {
  const n = (name || '').toLowerCase()
  const w = 'w-4 h-4'
  if (n.includes('iphone') || n.includes('android'))
    return (
      <svg className={w} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <rect x="7" y="2" width="10" height="20" rx="1.5" /><circle cx="12" cy="18" r="0.8" fill="currentColor" />
      </svg>
    )
  if (n.includes('ipad'))
    return (
      <svg className={w} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="2" width="14" height="20" rx="1.5" /><circle cx="12" cy="18" r="0.8" fill="currentColor" />
      </svg>
    )
  return (
    <svg className={w} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function StatusBadge({ label, color }) {
  const cls = color === 'green' ? 'bg-emerald-500/10 text-emerald-600' :
    color === 'amber' ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-500'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>
}

export default function DevicesPanel({ token, isAdmin = false }) {
  const [devices, setDevices] = useState([])
  const [hidden, setHidden] = useState(0)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState(null)
  const [msg, setMsg] = useState({ text: '', type: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/auth/devices', { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const d = await r.json()
        setDevices(d.devices || [])
        setHidden(d.hidden || 0)
      }
    } catch {}
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 2500)
  }

  async function approve(id) {
    setRevoking(id + '_approve')
    const r = await fetch(`/api/auth/devices/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) { flash('Đã duyệt thiết bị'); load() }
    setRevoking(null)
  }

  async function revoke(id) {
    setRevoking(id)
    const r = await fetch(`/api/auth/devices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) { flash('Đã thu hồi thiết bị'); load() }
    setRevoking(null)
  }

  async function revokeOthers() {
    if (!confirm('Thu hồi tất cả phiên khác?')) return
    setRevoking('others')
    const r = await fetch('/api/auth/devices/others', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) {
      const d = await r.json()
      flash(`Đã đăng xuất ${d.revoked} thiết bị khác`)
      load()
    }
    setRevoking(null)
  }

  async function purgeEmpty() {
    setRevoking('empty')
    const r = await fetch('/api/auth/devices/empty', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) {
      const d = await r.json()
      flash(`Đã xóa ${d.deleted} phiên không có thông tin`)
      load()
    }
    setRevoking(null)
  }

  if (loading)
    return <div className="py-10 text-center text-sm text-gray-400">Đang tải...</div>

  const pendingDevices = devices.filter(d => d.status === 'pending')
  const approvedDevices = devices.filter(d => d.status !== 'pending')
  const hasOtherDevices = devices.filter(d => !d.current).length > 0

  return (
    <div className="space-y-4">
      {msg.text && (
        <div className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
          msg.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
        }`}>
          {msg.text}
        </div>
      )}

      {pendingDevices.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 px-1">
            Chờ duyệt · {pendingDevices.length}
          </h3>
          {pendingDevices.map(d => (
            <DeviceCard key={d.id} d={d} revoking={revoking} canApprove={isAdmin}
              onApprove={approve} onRevoke={revoke} />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {approvedDevices.length > 0 && pendingDevices.length > 0 && (
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1">
            Đã duyệt
          </h3>
        )}
        {approvedDevices.map(d => (
          <DeviceCard key={d.id} d={d} revoking={revoking} canApprove={isAdmin}
            onApprove={approve} onRevoke={revoke} />
        ))}
        {devices.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">Không có phiên nào</div>
        )}
      </div>

      {hasOtherDevices && (
        <button
          onClick={revokeOthers}
          disabled={revoking === 'others'}
          className="w-full rounded-lg border border-red-200 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-40"
        >
          {revoking === 'others' ? 'Đang đăng xuất...' : 'Đăng xuất tất cả thiết bị khác'}
        </button>
      )}

      {hidden > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3.5 py-2.5">
          <span className="text-[11px] text-gray-400">{hidden} phiên cũ không có thông tin</span>
          <button
            onClick={purgeEmpty}
            disabled={revoking === 'empty'}
            className="text-[11px] font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40"
          >
            {revoking === 'empty' ? '...' : 'Xóa'}
          </button>
        </div>
      )}
    </div>
  )
}

function DeviceCard({ d, revoking, onApprove, onRevoke, canApprove = false }) {
  const isPending = d.status === 'pending'
  const isCurrent = d.current
  const border = isPending ? 'border-amber-200' :
    isCurrent ? 'border-emerald-200' : 'border-gray-100'
  const bg = isPending ? 'bg-amber-50/40' :
    isCurrent ? 'bg-emerald-50/40' : 'bg-white'
  const iconBg = isPending ? 'bg-amber-100 text-amber-600' :
    isCurrent ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'

  return (
    <div className={`flex items-center gap-3 rounded-lg border ${border} ${bg} px-3.5 py-3 transition-all duration-200`}>
      <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}>
        <DeviceIcon name={d.device_name} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">
            {d.device_name || 'Thiết bị không xác định'}
          </span>
          {isPending && <StatusBadge label="Chờ duyệt" color="amber" />}
          {isCurrent && <StatusBadge label="Thiết bị này" color="green" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          {d.ip_address && <span>{d.ip_address}</span>}
          {d.ip_address && <span className="text-gray-300">·</span>}
          <span>Đăng nhập {timeAgo(d.created_at)}</span>
          {d.session_count > 1 && (
            <>
              <span className="text-gray-300">·</span>
              <span>{d.session_count} phiên</span>
            </>
          )}
          {d.last_active && d.last_active !== d.created_at && (
            <>
              <span className="text-gray-300">·</span>
              <span>Hoạt động {timeAgo(d.last_active)}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 flex gap-1.5">
        {isPending && canApprove && (
          <button
            onClick={() => onApprove(d.id)}
            disabled={revoking === d.id + '_approve'}
            className="text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            {revoking === d.id + '_approve' ? '...' : 'Duyệt'}
          </button>
        )}
        {!isCurrent && (
          <button
            onClick={() => onRevoke(d.id)}
            disabled={revoking === d.id}
            className="text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-md px-2.5 py-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            {revoking === d.id ? '...' : isPending ? 'Từ chối' : 'Thu hồi'}
          </button>
        )}
      </div>
    </div>
  )
}
