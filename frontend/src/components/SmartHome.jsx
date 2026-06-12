import { useCallback, useEffect, useState } from 'react'

export default function SmartHome({ token }) {
  const [devices, setDevices] = useState([])
  const [status, setStatus] = useState({})   // key -> { is_on, loading }
  const [busy, setBusy] = useState({})        // key -> bool
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ text: '', type: '' })

  const auth = { Authorization: `Bearer ${token}` }

  const flash = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 2500)
  }

  const loadStatus = useCallback(async (key) => {
    setStatus(s => ({ ...s, [key]: { ...s[key], loading: true } }))
    try {
      const r = await fetch(`/api/iot/devices/${key}/status`, { headers: auth })
      if (r.ok) {
        const d = await r.json()
        setStatus(s => ({ ...s, [key]: { is_on: d.is_on, loading: false } }))
      } else {
        setStatus(s => ({ ...s, [key]: { is_on: null, loading: false } }))
      }
    } catch {
      setStatus(s => ({ ...s, [key]: { is_on: null, loading: false } }))
    }
  }, [token])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/iot/devices', { headers: auth })
      if (r.ok) {
        const d = await r.json()
        const list = d.devices || []
        setDevices(list)
        list.forEach(dev => loadStatus(dev.key))
      }
    } catch {}
    setLoading(false)
  }, [token, loadStatus])

  useEffect(() => { load() }, [load])

  async function control(key, action) {
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const r = await fetch(`/api/iot/devices/${key}/control`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (r.ok) {
        setStatus(s => ({ ...s, [key]: { is_on: action === 'on', loading: false } }))
        flash(action === 'on' ? 'Đã bật' : 'Đã tắt')
      } else {
        const e = await r.json().catch(() => ({}))
        flash(e.detail || 'Điều khiển thất bại', 'error')
        loadStatus(key)
      }
    } catch {
      flash('Lỗi kết nối', 'error')
    }
    setBusy(b => ({ ...b, [key]: false }))
  }

  if (loading)
    return <div className="py-10 text-center text-sm text-gray-400">Đang tải...</div>

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {msg.text && (
        <div className={`rounded-lg px-3.5 py-2 text-xs font-medium ${
          msg.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
        }`}>
          {msg.text}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Chưa có thiết bị</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map(dev => {
            const st = status[dev.key] || {}
            const on = st.is_on === true
            const isBusy = busy[dev.key]
            return (
              <div key={dev.key} className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-white px-4 py-3.5 shadow-sm">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition-colors ${
                  on ? 'bg-emerald-50' : 'bg-gray-100'
                }`}>
                  {dev.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-800">{dev.name}</div>
                  <div className="mt-0.5 text-[11px] font-medium">
                    {st.loading ? (
                      <span className="text-gray-400">Đang kiểm tra...</span>
                    ) : st.is_on === null ? (
                      <span className="text-gray-400">Không rõ trạng thái</span>
                    ) : on ? (
                      <span className="text-emerald-600">● Đang bật</span>
                    ) : (
                      <span className="text-gray-400">○ Đang tắt</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => control(dev.key, on ? 'off' : 'on')}
                  disabled={isBusy}
                  role="switch"
                  aria-checked={on}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                    on ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                  title={on ? 'Tắt' : 'Bật'}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
