// Vai trò & phân quyền — ma trận tab/tab con theo vai trò.
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from './adminApi.js'
import { Spinner, ErrorNote, Badge, Modal, Field, inputCls, btn } from './ui.jsx'

export default function AdminRoles({ token }) {
  const [roles, setRoles] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [err, setErr] = useState('')
  const [active, setActive] = useState('')          // role đang chọn
  const [sel, setSel] = useState(new Set())         // tập khoá quyền
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(() => {
    setErr('')
    Promise.all([adminApi.roles(token), adminApi.catalog(token)])
      .then(([r, c]) => {
        setRoles(r.roles || [])
        setCatalog(c.catalog || [])
        setActive(a => a || (r.roles?.[0]?.role || ''))
      })
      .catch(e => setErr(e.message))
  }, [token])

  useEffect(load, [load])

  const current = (roles || []).find(r => r.role === active)
  useEffect(() => {
    if (!current) return
    setSel(new Set(current.tabs || []))
    setLabel(current.label || '')
  }, [active, roles])

  if (err && !roles) return <ErrorNote>{err}</ErrorNote>
  if (!roles) return <Spinner />

  const isAdminRole = current?.role === 'admin'
  const allSubs = catalog.flatMap(g => g.children.map(c => c.key))

  function toggleSub(key) {
    setSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleGroup(group) {
    const subs = group.children.map(c => c.key)
    const allOn = subs.every(k => sel.has(k))
    setSel(prev => {
      const n = new Set(prev)
      subs.forEach(k => allOn ? n.delete(k) : n.add(k))
      return n
    })
  }
  function setAll(on) {
    setSel(on ? new Set(allSubs) : new Set())
  }

  async function save() {
    setSaving(true); setErr('')
    try { await adminApi.updateRole(token, active, { label, tabs: Array.from(sel) }); await reloadKeep() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  async function reloadKeep() {
    const r = await adminApi.roles(token); setRoles(r.roles || [])
  }
  async function doCreate(slug, lbl) {
    await adminApi.createRole(token, { role: slug, label: lbl, tabs: [] })
    await reloadKeep(); setActive(slug.toLowerCase()); setCreating(false)
  }
  async function doDelete() {
    try { await adminApi.deleteRole(token, confirmDel.role); setConfirmDel(null); setActive(''); load() }
    catch (e) { setErr(e.message); setConfirmDel(null) }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      {/* Danh sách vai trò */}
      <div className="space-y-2">
        <button className={`${btn('primary')} w-full`} onClick={() => setCreating(true)}>+ Vai trò mới</button>
        <div className="space-y-1">
          {roles.map(r => (
            <button key={r.role} onClick={() => setActive(r.role)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[12px] transition-all ${active === r.role ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.label}</span>
                <span className={`block truncate text-[10px] ${active === r.role ? 'text-gray-300' : 'text-gray-400'}`}>{r.role} · {r.user_count} user</span>
              </span>
              {r.is_system && <Badge color={active === r.role ? 'gray' : 'violet'}>hệ thống</Badge>}
            </button>
          ))}
        </div>
      </div>

      {/* Trình chỉnh quyền */}
      <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        {!current ? <p className="text-[12px] text-gray-400">Chọn một vai trò</p> : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[180px] flex-1">
                <Field label="Tên hiển thị vai trò">
                  <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} disabled={isAdminRole} />
                </Field>
              </div>
              <div className="flex gap-2">
                {!current.is_system && <button className={btn('danger')} onClick={() => setConfirmDel(current)}>Xoá vai trò</button>}
                {!isAdminRole && <button className={btn('primary')} onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu quyền'}</button>}
              </div>
            </div>
            <ErrorNote>{err}</ErrorNote>

            {isAdminRole ? (
              <div className="rounded-lg bg-violet-50 px-4 py-6 text-center text-[12px] font-medium text-violet-600">
                Quản trị viên có toàn quyền truy cập mọi tab — không thể giới hạn.
              </div>
            ) : (
              <>
                <div className="mb-3 flex gap-2 text-[11px]">
                  <button className={btn('soft')} onClick={() => setAll(true)}>Chọn tất cả</button>
                  <button className={btn('soft')} onClick={() => setAll(false)}>Bỏ chọn tất cả</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {catalog.map(group => {
                    const subs = group.children.map(c => c.key)
                    const allOn = subs.every(k => sel.has(k))
                    const someOn = subs.some(k => sel.has(k))
                    return (
                      <div key={group.key} className="rounded-lg border border-gray-200 p-3">
                        <label className="flex cursor-pointer items-center gap-2 border-b border-gray-100 pb-2">
                          <input type="checkbox" checked={allOn} ref={el => el && (el.indeterminate = someOn && !allOn)} onChange={() => toggleGroup(group)} className="h-4 w-4 accent-gray-900" />
                          <span className="text-[12px] font-bold text-gray-900">{group.label}</span>
                        </label>
                        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
                          {group.children.map(sub => (
                            <label key={sub.key} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-600">
                              <input type="checkbox" checked={sel.has(sub.key)} onChange={() => toggleSub(sub.key)} className="h-3.5 w-3.5 accent-gray-900" />
                              <span className="truncate">{sub.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {creating && <CreateRole onClose={() => setCreating(false)} onCreate={doCreate} />}
      {confirmDel && (
        <Modal title="Xoá vai trò" onClose={() => setConfirmDel(null)}
          footer={<>
            <button className={btn('ghost')} onClick={() => setConfirmDel(null)}>Huỷ</button>
            <button className={btn('danger')} onClick={doDelete}>Xoá</button>
          </>}>
          <p className="text-[13px] text-gray-600">Xoá vai trò <b>{confirmDel.label}</b>?</p>
        </Modal>
      )}
    </div>
  )
}

function CreateRole({ onClose, onCreate }) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit() {
    setErr(''); setBusy(true)
    try { await onCreate(slug.trim().toLowerCase(), label.trim() || slug) }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Modal title="Vai trò mới" onClose={onClose}
      footer={<>
        <button className={btn('ghost')} onClick={onClose}>Huỷ</button>
        <button className={btn('primary')} onClick={submit} disabled={busy || !slug.trim()}>Tạo</button>
      </>}>
      <ErrorNote>{err}</ErrorNote>
      <Field label="Mã vai trò (chữ thường, không dấu)">
        <input className={inputCls} value={slug} onChange={e => setSlug(e.target.value)} placeholder="vd: editor" />
      </Field>
      <Field label="Tên hiển thị">
        <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="Biên tập viên" />
      </Field>
    </Modal>
  )
}
