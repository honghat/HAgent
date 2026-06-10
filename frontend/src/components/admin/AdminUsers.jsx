// Quản lý người dùng — thêm/sửa/xoá, gán vai trò & trạng thái.
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from './adminApi.js'
import { Spinner, ErrorNote, EmptyState, Badge, Modal, Field, inputCls, btn, fmtDate } from './ui.jsx'

const STATUS = [
  { v: 'active', label: 'Hoạt động' },
  { v: 'disabled', label: 'Vô hiệu hoá' },
]
const STATUS_BADGE = { active: 'green', disabled: 'red', expired: 'amber', revoked: 'red', deleted: 'gray' }

function UserForm({ initial, roles, onSubmit, onClose, isCreate }) {
  const [f, setF] = useState(() => ({
    username: initial?.username || '',
    displayName: initial?.display_name || '',
    password: '',
    role: initial?.role || 'user',
    account_status: initial?.account_status || 'active',
    expires_at: initial?.expires_at || '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  async function submit() {
    setErr(''); setBusy(true)
    try {
      await onSubmit(f)
      onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={isCreate ? 'Thêm người dùng' : `Sửa: ${initial.username}`}
      onClose={onClose}
      footer={<>
        <button className={btn('ghost')} onClick={onClose}>Huỷ</button>
        <button className={btn('primary')} onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
      </>}
    >
      <ErrorNote>{err}</ErrorNote>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên đăng nhập">
          <input className={inputCls} value={f.username} onChange={set('username')} disabled={!isCreate} placeholder="vd: minh" />
        </Field>
        <Field label="Tên hiển thị">
          <input className={inputCls} value={f.displayName} onChange={set('displayName')} placeholder="Nguyễn Văn A" />
        </Field>
        <Field label={isCreate ? 'Mật khẩu' : 'Mật khẩu mới (bỏ trống nếu giữ nguyên)'}>
          <input className={inputCls} type="password" value={f.password} onChange={set('password')} placeholder="••••" />
        </Field>
        <Field label="Vai trò">
          <select className={inputCls} value={f.role} onChange={set('role')}>
            {roles.map(r => <option key={r.role} value={r.role}>{r.label} ({r.role})</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select className={inputCls} value={f.account_status} onChange={set('account_status')}>
            {STATUS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Hết hạn (tuỳ chọn)">
          <input className={inputCls} type="datetime-local" value={f.expires_at?.replace(' ', 'T').slice(0, 16)} onChange={set('expires_at')} />
        </Field>
      </div>
    </Modal>
  )
}

export default function AdminUsers({ token, currentUser }) {
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null)   // user object
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(() => {
    setErr('')
    Promise.all([adminApi.users(token), adminApi.roles(token)])
      .then(([u, r]) => { setUsers(u.users || []); setRoles(r.roles || []) })
      .catch(e => setErr(e.message))
  }, [token])

  useEffect(load, [load])

  async function doCreate(f) {
    await adminApi.createUser(token, f)
    load()
  }
  async function doUpdate(f) {
    const payload = { displayName: f.displayName, role: f.role, account_status: f.account_status, expires_at: f.expires_at }
    if (f.password) payload.password = f.password
    await adminApi.updateUser(token, editing.id, payload)
    load()
  }
  async function doDelete() {
    try { await adminApi.deleteUser(token, confirmDel.id); setConfirmDel(null); load() }
    catch (e) { setErr(e.message); setConfirmDel(null) }
  }

  if (err && !users) return <ErrorNote>{err}</ErrorNote>
  if (!users) return <Spinner />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-400">{users.length} người dùng</p>
        <button className={btn('primary')} onClick={() => setCreating(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Thêm người dùng
        </button>
      </div>
      <ErrorNote>{err}</ErrorNote>

      {users.length === 0 ? <EmptyState>Chưa có người dùng</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Người dùng</th>
                <th className="px-3 py-2 font-semibold">Vai trò</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Thiết bị</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Hoạt động cuối</th>
                <th className="px-3 py-2 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {u.avatar
                        ? <img src={u.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">{String(u.display_name || u.username || '?').charAt(0).toUpperCase()}</div>}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{u.display_name || u.username}</p>
                        <p className="truncate text-[11px] text-gray-400">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Badge color={u.role === 'admin' ? 'violet' : 'gray'}>{u.role}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={STATUS_BADGE[u.account_status] || 'gray'}>{u.account_status || 'active'}</Badge></td>
                  <td className="px-3 py-2.5">
                    <span className="text-gray-600">{u.device_count || 0}</span>
                    {u.pending_count > 0 && <span className="ml-1.5"><Badge color="amber">{u.pending_count} chờ</Badge></span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-gray-500 sm:table-cell">{fmtDate(u.last_active)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button className={btn('soft')} onClick={() => setEditing(u)}>Sửa</button>
                      {u.id !== currentUser?.id && <button className={btn('danger')} onClick={() => setConfirmDel(u)}>Xoá</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <UserForm isCreate roles={roles} onSubmit={doCreate} onClose={() => setCreating(false)} />}
      {editing && <UserForm initial={editing} roles={roles} onSubmit={doUpdate} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <Modal title="Xoá người dùng" onClose={() => setConfirmDel(null)}
          footer={<>
            <button className={btn('ghost')} onClick={() => setConfirmDel(null)}>Huỷ</button>
            <button className={btn('danger')} onClick={doDelete}>Xoá vĩnh viễn</button>
          </>}>
          <p className="text-[13px] text-gray-600">Xoá <b>{confirmDel.username}</b> cùng toàn bộ phiên & thiết bị? Không thể hoàn tác.</p>
        </Modal>
      )}
    </div>
  )
}
