import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'

const API = '/api'
const auth = t => (t ? { Authorization: `Bearer ${t}` } : {})

function fmtBytes(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

function accountQuota(account) {
  return {
    free: account.pool_free ?? account.free ?? 0,
    limit: account.pool_limit ?? account.limit ?? 0,
    used: account.pool_used ?? account.used ?? 0,
  }
}

function summarizeQuota(accounts) {
  const pools = new Map()
  accounts.forEach(account => {
    const quota = accountQuota(account)
    const group = account.shared_group || account.id
    if (!account.shared_group) {
      pools.set(group, quota)
      return
    }
    const current = pools.get(group)
    const limit = Math.max(current?.limit || 0, quota.limit)
    const free = current ? Math.min(current.free, quota.free) : quota.free
    pools.set(group, { free, limit, used: Math.max(0, limit - free) })
  })
  return [...pools.values()].reduce((total, pool) => ({
    free: total.free + pool.free,
    limit: total.limit + pool.limit,
    used: total.used + pool.used,
  }), { free: 0, limit: 0, used: 0 })
}

// ── Gmail inventory ──────────────────────────────────────────────────────
export default function GmailInventory({ token, accounts = [], onConnected }) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(null)
  const [clientSecretReady, setClientSecretReady] = useState(false)
  const [keepalive, setKeepalive] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setBusy('load')
    try {
      const r = await fetch(`${API}/google/accounts/inventory`, { headers: auth(token) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Không tải được danh sách Gmail')
      setItems(d.items || [])
      setClientSecretReady(Boolean(d.clientSecretReady))
      setKeepalive(d.keepalive || null)
    } catch (e) {
      setError(String(e.message || e))
    } finally { setBusy('') }
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!pending?.state) return undefined
    let stopped = false
    const poll = async () => {
      try {
        const r = await fetch(`${API}/google/accounts/pending/${encodeURIComponent(pending.state)}`, { headers: auth(token) })
        const d = await r.json()
        if (!r.ok || stopped || d.status === 'pending') return
        if (d.status === 'success') {
          setPending(null)
          setNotice(`Đã kết nối ${d.account?.email || pending.email}`)
          await load()
          onConnected?.()
        } else if (d.status === 'error' || d.status === 'expired') {
          setPending(null)
          setError(d.error || 'Phiên kết nối Google đã hết hạn')
        }
      } catch { /* tiếp tục poll */ }
    }
    poll()
    const timer = window.setInterval(poll, 1500)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [pending?.state, token, load, onConnected])

  const addEmails = async () => {
    const emails = draft.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)
    if (emails.length === 0) return
    setBusy('add')
    setError('')
    setNotice('')
    try {
      const r = await fetch(`${API}/google/accounts/inventory`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Không lưu được danh sách Gmail')
      setItems(d.items || [])
      setDraft('')
      setNotice(`Đã lưu ${d.added || 0} Gmail${d.invalid?.length ? ` · ${d.invalid.length} địa chỉ không hợp lệ` : ''}`)
    } catch (e) {
      setError(String(e.message || e))
    } finally { setBusy('') }
  }

  const connect = async item => {
    setBusy(item.id)
    setError('')
    setNotice('')
    try {
      const r = await fetch(`${API}/google/accounts/auth-url`, {
        method: 'POST',
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: item.email }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Không tạo được link Google')
      setPending({ state: d.state, email: item.email, authUrl: d.authUrl })
      window.open(d.authUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(String(e.message || e))
    } finally { setBusy('') }
  }

  const remove = async item => {
    setBusy(item.id)
    setError('')
    try {
      const r = await fetch(`${API}/google/accounts/inventory/${item.id}`, {
        method: 'DELETE',
        headers: auth(token),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Không xoá được Gmail')
      setItems(p => p.filter(x => x.id !== item.id))
    } catch (e) {
      setError(String(e.message || e))
    } finally { setBusy('') }
  }

  const loggedInCount = items.filter(item => item.autoAccess).length
  const independentAccounts = accounts.filter(account => !account.shared_group && !account.error)
  const familyAccounts = accounts.filter(account => account.shared_group && !account.error)
  const familyGroups = new Set(familyAccounts.map(account => account.shared_group))
  const totalQuota = summarizeQuota([...independentAccounts, ...familyAccounts])
  const familyQuota = summarizeQuota(familyAccounts)
  const duplicateFamilyAccounts = Math.max(0, familyAccounts.length - familyGroups.size)
  const accountByEmail = new Map(accounts.map(account => [String(account.email || '').toLowerCase(), account]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white to-slate-50 px-4 py-3.5 shadow-sm ring-1 ring-black/[0.03]">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400">Tổng Gmail</p>
          <p className="mt-1.5 text-2xl font-black text-gray-900">{items.length}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">Đã lưu trong danh sách</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50/60 px-4 py-3.5 shadow-sm ring-1 ring-emerald-100/50">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-600">Đã đăng nhập</p>
          <p className="mt-1.5 text-2xl font-black text-emerald-700">{loggedInCount}</p>
          <p className="mt-0.5 text-[10px] text-emerald-600/70">{items.length - loggedInCount} Gmail chưa đăng nhập</p>
        </div>
        <div className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50 to-indigo-50/60 px-4 py-3.5 shadow-sm ring-1 ring-blue-100/50">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-blue-600">Tổng dung lượng</p>
          <p className="mt-1.5 text-2xl font-black text-blue-700">{fmtBytes(totalQuota.limit)}</p>
          <p className="mt-0.5 text-[10px] text-blue-600/70">{independentAccounts.length} Gmail riêng + {familyGroups.size} pool gia đình</p>
        </div>
        <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50 to-purple-50/60 px-4 py-3.5 shadow-sm ring-1 ring-violet-100/50">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-violet-600">Dung lượng gia đình</p>
          <p className="mt-1.5 text-2xl font-black text-violet-700">{fmtBytes(familyQuota.limit)}</p>
          <p className="mt-0.5 text-[10px] text-violet-600/70">Tính {familyGroups.size} lần · loại {duplicateFamilyAccounts} Gmail trùng</p>
        </div>
      </div>

      {keepalive?.enabled && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-3 text-[10.5px] text-blue-700 shadow-sm">
          <p className="font-bold">Duy trì Gmail hàng tháng</p>
          <p className="mt-0.5 leading-4">
            Ngày {keepalive.scheduleDay} lúc {String(keepalive.scheduleHour).padStart(2, '0')}:00 ·
            {' '}{keepalive.messageCount} email hai chiều với <strong>{keepalive.targetEmail}</strong> ·
            {' '}lần tới {new Date(keepalive.nextRunAt).toLocaleString('vi-VN')}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[12.5px] font-bold text-gray-900">Danh sách tất cả Gmail</h3>
            <p className="mt-0.5 text-[10.5px] text-gray-400">Dán nhiều email, mỗi dòng một địa chỉ. Chỉ Gmail đã OAuth mới xuất hiện trong Tất cả Drive.</p>
          </div>
          <button type="button" onClick={load} disabled={busy === 'load'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <RefreshCw size={13} className={busy === 'load' ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={'gmail1@gmail.com\ngmail2@gmail.com\ngmail3@gmail.com'}
            className="min-h-20 min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2 font-mono text-[11.5px] leading-5 text-gray-700 outline-none focus:border-gray-900 focus:bg-white"
          />
          <button type="button" onClick={addEmails} disabled={!draft.trim() || busy === 'add'}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[11.5px] font-semibold text-white hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400">
            {busy === 'add' ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            Thêm vào bảng
          </button>
        </div>
        {!clientSecretReady && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] font-medium text-amber-700">Chưa có Google client secret; có thể lưu email nhưng chưa thể OAuth.</p>
        )}
        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[10.5px] leading-4 text-emerald-700">
          Không lưu mật khẩu hoặc mã 2FA. Sau khi bạn xác nhận OAuth một lần, refresh token được mã hóa trong hagent.db để HAgent tự truy cập Drive khi chạy sao lưu.
        </div>
        {pending && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-[10.5px] text-blue-700">
            <span className="truncate">Đang chờ Google cấp quyền cho <strong>{pending.email}</strong></span>
            <a href={pending.authUrl} target="_blank" rel="noreferrer" className="shrink-0 font-semibold hover:underline">Mở lại Google</a>
          </div>
        )}
        {notice && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10.5px] font-medium text-emerald-700">{notice}</p>}
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[10.5px] font-medium text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
        {/* Header — hidden on mobile */}
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_12rem_9rem_8rem] items-center gap-2 border-b border-black/[0.08] bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          <span>Gmail</span>
          <span>Dung lượng</span>
          <span>Trạng thái</span>
          <span className="text-right">Thao tác</span>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-10 text-center text-[11.5px] text-gray-400">Chưa có Gmail trong bảng</div>
        ) : items.map((item, i) => {
          const account = accountByEmail.get(String(item.email || '').toLowerCase())
          const quota = account ? accountQuota(account) : null
          const pct = quota?.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0
          return (
            <div key={item.id} className={`border-b border-black/[0.05] last:border-0 ${i % 2 ? 'bg-gray-50/70' : 'bg-white'}`}>
              {/* Desktop row */}
              <div className="hidden sm:grid min-h-12 grid-cols-[minmax(0,1fr)_12rem_9rem_8rem] items-center gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-gray-700">{item.email}</span>
                  {account?.shared_group && <span className="mt-0.5 inline-block rounded bg-blue-50 px-1 py-0.5 text-[8px] font-bold uppercase text-blue-600">Gia đình</span>}
                </span>
                <span className="min-w-0">
                  {quota ? (
                    <>
                      <span className="block truncate text-[10.5px] font-semibold text-gray-700">{fmtBytes(quota.used)} / {fmtBytes(quota.limit)}</span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-gray-100">
                        <span className={`block h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-0.5 block truncate text-[9.5px] text-gray-400">{fmtBytes(quota.free)} trống</span>
                    </>
                  ) : (
                    <span className="text-[10.5px] text-gray-300">--</span>
                  )}
                </span>
                <span className={`w-fit rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                  item.autoAccess
                    ? 'bg-emerald-50 text-emerald-700'
                    : item.connected ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {item.autoAccess && item.storedInDb ? 'DB mã hóa · Tự truy cập' : item.connected ? 'Cần kết nối lại' : 'Chưa kết nối'}
                </span>
                <span className="flex justify-end gap-1">
                  <button type="button" onClick={() => connect(item)} disabled={!clientSecretReady || busy === item.id}
                    className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold disabled:bg-gray-200 disabled:text-gray-400 ${
                      item.connected ? 'border border-black/[0.08] bg-white text-gray-600 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}>
                    {busy === item.id ? 'Đang mở...' : item.connected ? 'Kết nối lại' : 'Kết nối'}
                  </button>
                  {!item.connected && (
                    <button type="button" onClick={() => remove(item)} disabled={busy === item.id}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              </div>
              {/* Mobile card */}
              <div className="sm:hidden px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-gray-800">{item.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {account?.shared_group && <span className="rounded bg-blue-50 px-1 py-0.5 text-[8px] font-bold uppercase text-blue-600">Gia đình</span>}
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        item.autoAccess ? 'bg-emerald-50 text-emerald-700' : item.connected ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.autoAccess && item.storedInDb ? 'Tự truy cập' : item.connected ? 'Kết nối lại' : 'Chưa kết nối'}
                      </span>
                      {quota && <span className="text-[9.5px] text-gray-400">{fmtBytes(quota.used)}/{fmtBytes(quota.limit)}</span>}
                    </div>
                    {quota && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                        <span className={`block h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => connect(item)} disabled={!clientSecretReady || busy === item.id}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-semibold disabled:bg-gray-200 disabled:text-gray-400 ${
                        item.connected ? 'border border-black/[0.08] bg-white text-gray-600' : 'bg-blue-600 text-white'
                      }`}>
                      {busy === item.id ? '...' : item.connected ? 'Kết lại' : 'Kết nối'}
                    </button>
                    {!item.connected && (
                      <button type="button" onClick={() => remove(item)} disabled={busy === item.id}
                        className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
