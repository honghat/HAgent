// Quản lý thiết bị toàn hệ thống — admin duyệt/thu hồi thiết bị cho user.
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from './adminApi.js'
import { Spinner, ErrorNote, EmptyState, Badge, btn, fmtDate } from './ui.jsx'

export default function AdminDevices({ token }) {
  const [devices, setDevices] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')   // all | pending
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    setErr('')
    adminApi.devices(token, filter === 'pending' ? 'pending' : '')
      .then(d => setDevices(d.devices || []))
      .catch(e => setErr(e.message))
  }, [token, filter])

  useEffect(load, [load])

  async function approve(id) {
    setBusy(id + ':a')
    try { await adminApi.approveDevice(token, id); load() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  async function revoke(id) {
    setBusy(id + ':r')
    try { await adminApi.revokeDevice(token, id); load() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  if (err && !devices) return <ErrorNote>{err}</ErrorNote>
  if (!devices) return <Spinner />

  const pendingCount = devices.filter(d => d.status === 'pending').length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-[12px] font-semibold">
          {[['all', 'Tất cả'], ['pending', `Chờ duyệt${pendingCount ? ` (${pendingCount})` : ''}`]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`rounded-md px-3 py-1.5 transition-all ${filter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[12px] text-gray-400">{devices.length} thiết bị</p>
      </div>
      <ErrorNote>{err}</ErrorNote>

      {devices.length === 0 ? <EmptyState>Không có thiết bị</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Người dùng</th>
                <th className="px-3 py-2 font-semibold">Thiết bị</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">IP</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">Hoạt động cuối</th>
                <th className="px-3 py-2 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-gray-900">{d.display_name || d.username}</p>
                    <p className="text-[11px] text-gray-400">@{d.username}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{d.device_name || 'Không xác định'}</td>
                  <td className="hidden px-3 py-2.5 text-gray-500 sm:table-cell">{d.last_ip_address || d.first_ip_address || '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'gray'}>
                      {d.status === 'approved' ? 'Đã duyệt' : d.status === 'pending' ? 'Chờ duyệt' : d.status}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2.5 text-gray-500 md:table-cell">{fmtDate(d.last_active || d.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      {d.status === 'pending' && (
                        <button className={btn('primary')} disabled={busy === d.id + ':a'} onClick={() => approve(d.id)}>Duyệt</button>
                      )}
                      <button className={btn('danger')} disabled={busy === d.id + ':r'} onClick={() => revoke(d.id)}>Thu hồi</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
