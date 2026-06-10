// Nhật ký hoạt động — lọc theo hành động, người dùng, thời gian.
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from './adminApi.js'
import { Spinner, ErrorNote, EmptyState, Badge, inputCls, btn, fmtDate } from './ui.jsx'

const ACTIONS = [
  ['', 'Tất cả hành động'],
  ['login', 'Đăng nhập'], ['logout', 'Đăng xuất'],
  ['user.create', 'Tạo user'], ['user.update', 'Sửa user'], ['user.delete', 'Xoá user'],
  ['role.create', 'Tạo vai trò'], ['role.update', 'Sửa quyền'], ['role.delete', 'Xoá vai trò'],
  ['device.approve', 'Duyệt thiết bị'], ['device.revoke', 'Thu hồi thiết bị'],
]
const LABELS = Object.fromEntries(ACTIONS.slice(1))
const COLOR = {
  login: 'green', logout: 'gray',
  'user.create': 'blue', 'user.update': 'amber', 'user.delete': 'red',
  'role.create': 'blue', 'role.update': 'amber', 'role.delete': 'red',
  'device.approve': 'green', 'device.revoke': 'red',
}

export default function AdminAudit({ token }) {
  const [entries, setEntries] = useState(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ action: '', actor: '', date_from: '', date_to: '', limit: 200 })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const load = useCallback(() => {
    setErr(''); setEntries(null)
    adminApi.audit(token, f).then(d => setEntries(d.entries || [])).catch(e => setErr(e.message))
  }, [token, f])

  useEffect(() => { load() }, [token])

  function detailText(d) {
    if (!d) return ''
    try { const o = JSON.parse(d); return Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') }
    catch { return String(d) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block text-[11px] font-semibold text-gray-500">Hành động</span>
          <select className={inputCls} value={f.action} onChange={set('action')}>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block text-[11px] font-semibold text-gray-500">Người dùng</span>
          <input className={inputCls} value={f.actor} onChange={set('actor')} placeholder="tên đăng nhập" />
        </label>
        <label className="min-w-[150px]">
          <span className="mb-1 block text-[11px] font-semibold text-gray-500">Từ ngày</span>
          <input type="date" className={inputCls} value={f.date_from} onChange={set('date_from')} />
        </label>
        <label className="min-w-[150px]">
          <span className="mb-1 block text-[11px] font-semibold text-gray-500">Đến ngày</span>
          <input type="date" className={inputCls} value={f.date_to} onChange={set('date_to')} />
        </label>
        <button className={btn('primary')} onClick={load}>Lọc</button>
      </div>

      <ErrorNote>{err}</ErrorNote>
      {!entries ? <Spinner /> : entries.length === 0 ? <EmptyState>Không có bản ghi</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Thời gian</th>
                <th className="px-3 py-2 font-semibold">Người thực hiện</th>
                <th className="px-3 py-2 font-semibold">Hành động</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">Chi tiết</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{fmtDate(e.created_at)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-800">{e.actor_name || '—'}</td>
                  <td className="px-3 py-2"><Badge color={COLOR[e.action] || 'gray'}>{LABELS[e.action] || e.action}</Badge></td>
                  <td className="hidden max-w-[320px] truncate px-3 py-2 text-gray-500 md:table-cell" title={detailText(e.detail)}>{detailText(e.detail)}</td>
                  <td className="hidden px-3 py-2 text-gray-400 sm:table-cell">{e.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
