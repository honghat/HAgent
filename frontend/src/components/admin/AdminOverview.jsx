// Tổng quan quản trị — thống kê người dùng, thiết bị, phiên, hoạt động.
import { useEffect, useState } from 'react'
import { adminApi } from './adminApi.js'
import { StatCard, Bars, Spinner, ErrorNote, Badge } from './ui.jsx'

const ACTION_LABEL = {
  login: 'Đăng nhập', logout: 'Đăng xuất',
  'user.create': 'Tạo user', 'user.update': 'Sửa user', 'user.delete': 'Xoá user',
  'role.create': 'Tạo vai trò', 'role.update': 'Sửa quyền', 'role.delete': 'Xoá vai trò',
  'device.approve': 'Duyệt thiết bị', 'device.revoke': 'Thu hồi thiết bị',
}

export default function AdminOverview({ token }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    adminApi.overview(token).then(d => alive && setData(d)).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [token])

  if (err) return <ErrorNote>{err}</ErrorNote>
  if (!data) return <Spinner />

  const u = data.users || {}
  const roles = Object.entries(u.by_role || {})
  const totalLogins = (data.activity?.logins_14d || []).reduce((s, d) => s + (d.count || 0), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng người dùng" value={u.total ?? 0} sub={`+${u.new_7d ?? 0} trong 7 ngày`} />
        <StatCard label="Đang hoạt động" value={u.active ?? 0} sub={`${u.inactive ?? 0} vô hiệu`} accent="text-emerald-600" />
        <StatCard label="Thiết bị chờ duyệt" value={data.devices?.pending ?? 0} sub={`${data.devices?.total ?? 0} thiết bị`} accent={(data.devices?.pending ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'} />
        <StatCard label="Phiên online" value={data.sessions?.online ?? 0} sub={`${data.sessions?.total ?? 0} tổng phiên`} accent="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-gray-700">Lượt đăng nhập 14 ngày</h3>
            <span className="text-[11px] text-gray-400">{totalLogins} lượt</span>
          </div>
          <Bars data={data.activity?.logins_14d || []} height={64} />
          <div className="mt-1.5 flex justify-between text-[10px] text-gray-300">
            <span>{(data.activity?.logins_14d || [])[0]?.date?.slice(5)}</span>
            <span>{(data.activity?.logins_14d || []).slice(-1)[0]?.date?.slice(5)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-[12px] font-semibold text-gray-700">Người dùng theo vai trò</h3>
          <div className="space-y-2">
            {roles.length === 0 && <p className="text-[12px] text-gray-400">Chưa có dữ liệu</p>}
            {roles.map(([role, count]) => (
              <div key={role} className="flex items-center justify-between text-[12px]">
                <Badge color={role === 'admin' ? 'violet' : 'gray'}>{role}</Badge>
                <span className="font-semibold text-gray-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-[12px] font-semibold text-gray-700">Hoạt động 7 ngày qua</h3>
        <div className="flex flex-wrap gap-2">
          {(data.activity?.actions_7d || []).length === 0 && <p className="text-[12px] text-gray-400">Chưa có hoạt động</p>}
          {(data.activity?.actions_7d || []).map(a => (
            <div key={a.action} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-[12px]">
              <span className="text-gray-600">{ACTION_LABEL[a.action] || a.action}</span>
              <span className="font-bold text-gray-900">{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
