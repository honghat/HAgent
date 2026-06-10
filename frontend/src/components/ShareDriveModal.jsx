import { useCallback, useEffect, useState } from 'react'
import { Globe, Link, Mail, RefreshCw, Shield, Trash2, User, X } from 'lucide-react'

const API = '/api'
const auth = token => (token ? { Authorization: `Bearer ${token}` } : {})
const notify = (message, type, duration) => {
  if (typeof window !== 'undefined' && typeof window.__hagentToast === 'function') {
    window.__hagentToast(String(message ?? ''), type, duration)
    return
  }
  window.alert(message)
}

const ROLE_LABELS = { reader: 'Xem', writer: 'Sửa', commenter: 'Bình luận', owner: 'Sở hữu' }
const TYPE_LABELS = { user: 'Người dùng', group: 'Nhóm', domain: 'Domain', anyone: 'Công khai' }

export default function ShareDriveModal({ token, item, accountId, accounts, onClose }) {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [domain, setDomain] = useState('')
  const [role, setRole] = useState('reader')
  const [shareType, setShareType] = useState('user')
  const [sendNotify, setSendNotify] = useState(false)
  const [error, setError] = useState('')

  const targetAccount = accounts.find(account => account.id === accountId)

  const loadPermissions = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ account_id: accountId })
      const response = await fetch(`${API}/drive/sync/drive-permissions/${item.id}?${params}`, { headers: auth(token) })
      const data = await response.json()
      if (response.ok) {
        setPermissions(data.permissions || [])
      } else {
        setError(data.detail || 'Không tải được danh sách quyền')
      }
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }, [token, accountId, item.id])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  const addShare = async () => {
    if (shareType === 'user' && !email.trim()) {
      notify('Nhập email người dùng', 'error')
      return
    }
    if (shareType === 'domain' && !domain.trim()) {
      notify('Nhập domain', 'error')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        account_id: accountId,
        item_id: item.id,
        email: email.trim(),
        domain: domain.trim(),
        role,
        type: shareType,
        send_notification: sendNotify,
      }
      const response = await fetch(`${API}/drive/sync/drive-share/${item.id}`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (response.ok) {
        notify('Đã chia sẻ thành công', 'success')
        setEmail('')
        setDomain('')
        await loadPermissions()
      } else {
        setError(data.detail || 'Chia sẻ thất bại')
      }
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  const removePermission = async permissionId => {
    setSaving(true)
    try {
      const params = new URLSearchParams({ account_id: accountId })
      const response = await fetch(`${API}/drive/sync/drive-permissions/${item.id}/${permissionId}?${params}`, {
        method: 'DELETE',
        headers: auth(token),
      })
      if (response.ok) {
        notify('Đã xoá quyền truy cập', 'success')
        await loadPermissions()
      } else {
        const data = await response.json()
        setError(data.detail || 'Xoá quyền thất bại')
      }
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (permissionId, newRole) => {
    setSaving(true)
    try {
      const response = await fetch(`${API}/drive/sync/drive-permissions/${item.id}/${permissionId}`, {
        method: 'PUT',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, role: newRole }),
      })
      if (response.ok) {
        notify(`Đã cập nhật quyền thành "${ROLE_LABELS[newRole] || newRole}"`, 'success')
        await loadPermissions()
      } else {
        const data = await response.json()
        setError(data.detail || 'Cập nhật thất bại')
      }
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  const permissionIcon = type => {
    if (type === 'anyone') return <Globe size={14} className="text-green-500" />
    if (type === 'domain') return <Link size={14} className="text-orange-500" />
    if (type === 'group') return <Shield size={14} className="text-purple-500" />
    return <User size={14} className="text-blue-500" />
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="flex h-[min(640px,80vh)] w-[min(560px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border border-black/[0.12] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-green-600 shadow-sm">
            <Mail size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-gray-900">Chia sẻ Drive</p>
            <p className="truncate text-[10.5px] text-gray-400">
              {targetAccount?.email || accountId} &middot; {item.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-700">
            <X size={14} />
          </button>
        </div>

        {error && (
          <div className="mx-3 mt-2 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">
            {error}
          </div>
        )}

        <div className="grid shrink-0 gap-3 border-b border-black/[0.06] p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Loại</span>
              <select
                value={shareType}
                onChange={event => setShareType(event.target.value)}
                className="h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] font-medium text-gray-700 outline-none focus:border-blue-500"
              >
                <option value="user">Người dùng</option>
                <option value="group">Nhóm</option>
                <option value="domain">Domain</option>
                <option value="anyone">Công khai</option>
              </select>
            </label>
            <label className="min-w-0 sm:col-span-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Quyền</span>
              <select
                value={role}
                onChange={event => setRole(event.target.value)}
                className="h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] font-medium text-gray-700 outline-none focus:border-blue-500"
              >
                <option value="reader">Xem</option>
                <option value="writer">Sửa</option>
                <option value="commenter">Bình luận</option>
              </select>
            </label>
          </div>
          {shareType === 'anyone' ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Chia sẻ công khai — bất kỳ ai có link đều có thể truy cập
            </div>
          ) : shareType === 'domain' ? (
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Domain</span>
              <input
                type="text"
                value={domain}
                onChange={event => setDomain(event.target.value)}
                placeholder="vd: example.com"
                className="h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] text-gray-700 outline-none placeholder:text-gray-300 focus:border-blue-500"
              />
            </label>
          ) : (
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Email</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="vd: user@gmail.com"
                className="h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] text-gray-700 outline-none placeholder:text-gray-300 focus:border-blue-500"
              />
            </label>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendNotify}
                onChange={event => setSendNotify(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              <span className="text-[11px] text-gray-500">Gửi email thông báo</span>
            </label>
            <button
              type="button"
              onClick={addShare}
              disabled={saving || loading}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[11.5px] font-semibold text-white hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Mail size={12} />}
              Chia sẻ
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-gray-400">
              <RefreshCw size={13} className="animate-spin" /> Đang tải quyền...
            </div>
          ) : permissions.length === 0 ? (
            <div className="px-6 py-12 text-center text-[12px] text-gray-400">Chưa có quyền truy cập nào</div>
          ) : (
            <div className="bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_43px,#f7f7f8_43px,#f7f7f8_86px)]">
              {permissions.map((perm, index) => (
                <div
                  key={perm.id}
                  className={`grid min-h-[43px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 ${index % 2 ? 'bg-gray-50/80' : 'bg-white'}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {permissionIcon(perm.type)}
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-gray-800">
                        {perm.displayName || perm.emailAddress || perm.domain || TYPE_LABELS[perm.type] || perm.type}
                      </p>
                      <p className="truncate text-[10px] text-gray-400">
                        {TYPE_LABELS[perm.type] || perm.type}
                        {perm.deleted && <span className="ml-1 text-red-400">(đã xoá)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={perm.role}
                      onChange={event => updateRole(perm.id, event.target.value)}
                      disabled={saving || perm.deleted}
                      className="h-7 rounded-lg border border-black/[0.06] bg-white px-1.5 text-[10.5px] font-medium text-gray-600 outline-none focus:border-blue-500 disabled:text-gray-300"
                    >
                      <option value="reader">Xem</option>
                      <option value="writer">Sửa</option>
                      <option value="commenter">Bình luận</option>
                      <option value="owner">Sở hữu</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removePermission(perm.id)}
                      disabled={saving || perm.deleted}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:text-gray-200"
                      title="Xoá quyền"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
