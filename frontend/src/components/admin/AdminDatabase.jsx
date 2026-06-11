// Quản lý cơ sở dữ liệu (kiểu Adminer) — đăng nhập SQL server, duyệt bảng, xem cấu trúc, chạy SQL.
import { useEffect, useRef, useState, useCallback } from 'react'
import { adminApi } from './adminApi.js'
import { Spinner, ErrorNote, EmptyState, Badge, inputCls, Field, btn, Modal } from './ui.jsx'

const PAGE = 50
const SKEY = 'hagent_db_session'   // phiên (sessionStorage)
const FKEY = 'hagent_db_lastform'  // form gần nhất, không lưu mật khẩu (localStorage)

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null') } catch { return null }
}

function cellValue(v) {
  if (v === null || v === undefined)
    return <span className="italic text-gray-300">NULL</span>
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return <span className="block max-w-[280px] truncate" title={text}>{text || <span className="text-gray-300">∅</span>}</span>
}

function ResultTable({ columns, rows }) {
  if (!columns?.length) return <EmptyState>Không có cột</EmptyState>
  return (
    <div className="overflow-auto rounded-xl border border-gray-200 max-h-[60vh]">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
          <tr>{columns.map(c => <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50/60">
              {columns.map(c => <td key={c} className="px-3 py-1.5 text-gray-700">{cellValue(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Màn hình đăng nhập SQL server ───────────────────────────────────────
function ConnectScreen({ token, onConnect }) {
  const [f, setF] = useState(() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(FKEY) || 'null') } catch { return null } })()
    return { host: 'localhost', port: 5432, dbname: '', user: '', password: '', ...(saved || {}) }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function go(body, tag) {
    setBusy(tag); setErr('')
    try {
      const res = await adminApi.dbConnect(token, body)
      if (!body.useDefault) {
        localStorage.setItem(FKEY, JSON.stringify({ host: body.host, port: body.port, dbname: body.dbname, user: body.user }))
      }
      onConnect({ ...res, form: body })
    } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-900 text-white">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900">Kết nối cơ sở dữ liệu</h3>
        <p className="mt-0.5 text-[12px] text-gray-400">Đăng nhập vào PostgreSQL server</p>
      </div>

      <button className={`${btn('soft')} w-full justify-center py-2.5`} disabled={!!busy}
        onClick={() => go({ useDefault: true }, 'default')}>
        {busy === 'default' ? 'Đang kết nối…' : '⚡ Kết nối nhanh — DB ứng dụng'}
      </button>

      <div className="flex items-center gap-3 text-[11px] text-gray-300">
        <div className="h-px flex-1 bg-gray-200" /> hoặc nhập thủ công <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex gap-2">
          <div className="flex-1"><Field label="Server / Host"><input className={inputCls} value={f.host} onChange={set('host')} placeholder="localhost" /></Field></div>
          <div className="w-24"><Field label="Port"><input className={inputCls} type="number" value={f.port} onChange={set('port')} /></Field></div>
        </div>
        <Field label="Database"><input className={inputCls} value={f.dbname} onChange={set('dbname')} placeholder="tên database" /></Field>
        <Field label="Username"><input className={inputCls} value={f.user} onChange={set('user')} placeholder="postgres" /></Field>
        <Field label="Mật khẩu"><input className={inputCls} type="password" value={f.password} onChange={set('password')} placeholder="••••••" /></Field>
        <ErrorNote>{err}</ErrorNote>
        <button className={`${btn('primary')} w-full justify-center py-2.5`} disabled={!!busy}
          onClick={() => go({ ...f, port: Number(f.port) || 5432, useDefault: false }, 'manual')}>
          {busy === 'manual' ? 'Đang kết nối…' : 'Đăng nhập'}
        </button>
      </div>
    </div>
  )
}

// Hook gọi API gắn connId, tự kết nối lại nếu phiên hết hạn (server restart / nhiều worker).
function useDbApi(token, session, setSession) {
  const ref = useRef(session.connId)
  useEffect(() => { ref.current = session.connId }, [session.connId])

  const withConn = useCallback(async (fn) => {
    try { return await fn(ref.current) }
    catch (e) {
      if (e.message !== 'CONN_EXPIRED') throw e
      const r = await adminApi.dbConnect(token, session.form)
      ref.current = r.connId
      setSession(s => ({ ...s, ...r, form: session.form }))
      return fn(r.connId)
    }
  }, [token, session.form, setSession])

  return {
    tables: () => withConn(id => adminApi.dbTables(token, id)),
    columns: (n) => withConn(id => adminApi.dbColumns(token, id, n)),
    rows: (n, l, o) => withConn(id => adminApi.dbRows(token, id, n, l, o)),
    query: (q) => withConn(id => adminApi.dbQuery(token, id, q)),
    insert: (n, values) => withConn(id => adminApi.dbInsertRow(token, id, n, values)),
    update: (n, pk, set) => withConn(id => adminApi.dbUpdateRow(token, id, n, pk, set)),
    del: (n, pk) => withConn(id => adminApi.dbDeleteRow(token, id, n, pk)),
    rename: (n, newName) => withConn(id => adminApi.dbRenameTable(token, id, n, newName)),
    drop: (n, cascade) => withConn(id => adminApi.dbDropTable(token, id, n, cascade)),
  }
}

// ── Modal thêm / sửa dòng ───────────────────────────────────────────────
function EditRow({ meta, row, onSubmit, onDelete, onClose }) {
  const isInsert = !row
  const [fields, setFields] = useState(() =>
    Object.fromEntries(meta.map(c => {
      const raw = row ? row[c.name] : undefined
      const isNull = row ? (raw === null || raw === undefined) : false
      const value = raw === null || raw === undefined ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw))
      return [c.name, { value, isNull, touched: false }]
    }))
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const upd = (name, patch) => setFields(f => ({ ...f, [name]: { ...f[name], ...patch, touched: true } }))

  async function save() {
    setBusy(true); setErr('')
    try {
      if (isInsert) {
        const values = {}
        for (const c of meta) {
          const f = fields[c.name]
          if (f.isNull) values[c.name] = null
          else if (f.value !== '') values[c.name] = f.value
        }
        if (!Object.keys(values).length) { setErr('Nhập ít nhất một cột'); setBusy(false); return }
        await onSubmit({ values })
      } else {
        const set = {}
        for (const c of meta) {
          if (c.pk) continue
          const f = fields[c.name]
          if (!f.touched) continue
          set[c.name] = f.isNull ? null : f.value
        }
        if (!Object.keys(set).length) { setErr('Chưa có thay đổi'); setBusy(false); return }
        const pk = Object.fromEntries(meta.filter(c => c.pk).map(c => [c.name, row[c.name]]))
        await onSubmit({ pk, set })
      }
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  async function del() {
    if (!window.confirm('Xoá dòng này? Không thể hoàn tác.')) return
    setBusy(true); setErr('')
    try { await onDelete() } catch (e) { setErr(e.message); setBusy(false) }
  }

  const footer = (
    <>
      {!isInsert && onDelete && <button className={`${btn('danger')} mr-auto`} disabled={busy} onClick={del}>Xoá dòng</button>}
      <button className={btn('ghost')} disabled={busy} onClick={onClose}>Huỷ</button>
      <button className={btn('primary')} disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
    </>
  )

  return (
    <Modal wide title={isInsert ? 'Thêm dòng' : 'Sửa dòng'} onClose={onClose} footer={footer}>
      <div className="space-y-2.5">
        {meta.map(c => {
          const f = fields[c.name]
          const locked = !isInsert && c.pk
          const big = /json/.test(c.type) || c.type === 'text'
          return (
            <div key={c.name}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-600">{c.name}</span>
                {c.pk && <Badge color="amber">PK</Badge>}
                <span className="font-mono text-[10px] text-gray-300">{c.type}</span>
                {c.nullable && !locked && (
                  <label className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
                    <input type="checkbox" checked={f.isNull} onChange={e => upd(c.name, { isNull: e.target.checked })} />NULL
                  </label>
                )}
              </div>
              {big ? (
                <textarea rows={2} disabled={locked || f.isNull} value={f.isNull ? '' : f.value}
                  onChange={e => upd(c.name, { value: e.target.value })}
                  className={`${inputCls} resize-y font-mono text-[12px] ${(locked || f.isNull) ? 'opacity-50' : ''}`} />
              ) : (
                <input disabled={locked || f.isNull} value={f.isNull ? '' : f.value}
                  onChange={e => upd(c.name, { value: e.target.value })}
                  placeholder={locked ? '(khoá chính)' : c.default ? `mặc định: ${c.default}` : ''}
                  className={`${inputCls} ${(locked || f.isNull) ? 'opacity-50' : ''}`} />
              )}
            </div>
          )
        })}
        <ErrorNote>{err}</ErrorNote>
      </div>
    </Modal>
  )
}

// ── Chế độ duyệt bảng ──────────────────────────────────────────────────
function BrowseMode({ api }) {
  const [tables, setTables] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [view, setView] = useState('data')
  const [data, setData] = useState(null)
  const [meta, setMeta] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [edit, setEdit] = useState(null) // { mode:'insert' } | { mode:'edit', row }

  const refreshTables = useCallback(async () => {
    try {
      const d = await api.tables()
      setTables(d.tables || [])
    } catch (e) {
      setErr(e.message)
    }
  }, [api])

  useEffect(() => {
    refreshTables()
  }, [refreshTables])

  const loadData = useCallback((name, off) => {
    setLoading(true); setErr('')
    api.rows(name, PAGE, off).then(setData).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [api])

  function openTable(name) {
    setSel(name); setView('data'); setOffset(0); setData(null); setMeta(null)
    loadData(name, 0)
    api.columns(name).then(d => setMeta(d.columns || [])).catch(e => setErr(e.message))
  }
  function page(delta) {
    const off = Math.max(0, offset + delta * PAGE)
    setOffset(off); loadData(sel, off)
  }
  async function submitRow(payload) {
    if (edit.mode === 'insert') await api.insert(sel, payload.values)
    else await api.update(sel, payload.pk, payload.set)
    setEdit(null); loadData(sel, offset)
  }
  async function removeRow() {
    const pk = Object.fromEntries(meta.filter(c => c.pk).map(c => [c.name, edit.row[c.name]]))
    await api.del(sel, pk)
    setEdit(null); loadData(sel, offset)
  }

  async function handleRenameTable() {
    const isSys = tables.find(t => t.name === sel)?.system
    if (isSys) {
      const force = window.confirm(`CẢNH BÁO NGUY HIỂM: "${sel}" là bảng hệ thống của HAgent. Đổi tên có thể làm hỏng ứng dụng. Bạn vẫn muốn tiếp tục?`)
      if (!force) return
    }
    const newName = window.prompt(`Nhập tên mới cho bảng "${sel}":`, sel)
    if (!newName) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === sel) return
    setLoading(true); setErr('')
    try {
      await api.rename(sel, trimmed)
      setSel(trimmed)
      await refreshTables()
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDropTable() {
    const isSys = tables.find(t => t.name === sel)?.system
    if (isSys) {
      const force = window.confirm(`CẢNH BÁO CỰC KỲ NGUY HIỂM: "${sel}" là bảng hệ thống của HAgent. Xoá bảng này CHẮC CHẮN sẽ làm hỏng hoặc ngừng hoạt động ứng dụng. Bạn có chắc chắn muốn xoá?`)
      if (!force) return
    } else {
      const ok = window.confirm(`Bạn có chắc chắn muốn xoá bảng "${sel}"? Lệnh này không thể hoàn tác.`)
      if (!ok) return
    }
    const cascade = window.confirm(`Xoá cả các ràng buộc liên quan (CASCADE)? Chọn 'Cancel' để xoá thông thường (RESTRICT).`)
    setLoading(true); setErr('')
    try {
      await api.drop(sel, cascade)
      setSel(null)
      setData(null)
      setMeta(null)
      await refreshTables()
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const hasPk = !!(meta && meta.some(c => c.pk))

  if (!tables) return <Spinner />

  const selTable = tables.find(t => t.name === sel)

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <aside className="shrink-0 md:w-52">
        <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 md:max-h-[70vh]">
          {tables.length === 0 ? <EmptyState>Chưa có bảng</EmptyState> : tables.map(t => (
            <button key={t.name} onClick={() => openTable(t.name)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-all ${sel === t.name ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                {!t.system && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" title="Bảng tự định nghĩa (Có thể xoá an toàn)" />}
                <span className="truncate font-medium">{t.name}</span>
              </div>
              <span className={`shrink-0 text-[10px] ${sel === t.name ? 'text-gray-300' : 'text-gray-400'}`}>{t.rows}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-3">
        <ErrorNote>{err}</ErrorNote>
        {!sel ? <EmptyState>Chọn một bảng để xem</EmptyState> : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                <button onClick={() => setView('data')} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'data' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Dữ liệu</button>
                <button onClick={() => setView('structure')} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'structure' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Cấu trúc</button>
              </div>
              <div className="flex items-center gap-2">
                {view === 'data' && meta && (
                  <button className={btn('soft')} onClick={() => setEdit({ mode: 'insert' })}>+ Thêm dòng</button>
                )}
                <button className={btn('soft')} onClick={handleRenameTable} title="Đổi tên bảng">✏️ Đổi tên</button>
                <button className={btn('danger')} onClick={handleDropTable} title="Xoá bảng">🗑️ Xoá bảng</button>
                <span className="font-mono text-[12px] font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">{sel}</span>
                {selTable && (
                  selTable.system ? (
                    <Badge color="gray">Hệ thống</Badge>
                  ) : (
                    <Badge color="green">Có thể xoá</Badge>
                  )
                )}
              </div>
            </div>

            {view === 'data' ? (
              loading && !data ? <Spinner /> : data && (
                <>
                  <div className="overflow-auto rounded-xl border border-gray-200 max-h-[60vh]">
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                        <tr>
                          {hasPk && <th className="w-8 px-2 py-2" />}
                          {data.columns.map(c => <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/60">
                            {hasPk && (
                              <td className="px-2 py-1">
                                <button title="Sửa" onClick={() => setEdit({ mode: 'edit', row: r })}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                              </td>
                            )}
                            {data.columns.map(c => <td key={c} className="px-3 py-1.5 text-gray-700">{cellValue(r[c])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-gray-500">
                    <span>{data.total} dòng · hiển thị {data.total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, data.total)}</span>
                    <div className="flex gap-1">
                      <button className={btn('soft')} disabled={offset === 0 || loading} onClick={() => page(-1)}>‹ Trước</button>
                      <button className={btn('soft')} disabled={offset + PAGE >= data.total || loading} onClick={() => page(1)}>Sau ›</button>
                    </div>
                  </div>
                  {!hasPk && <p className="text-[11px] text-gray-400">Bảng không có khoá chính — chỉ thêm được dòng, không sửa/xoá từng dòng.</p>}
                </>
              )
            ) : (
              !meta ? <Spinner /> : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Cột</th>
                        <th className="px-3 py-2 font-semibold">Kiểu</th>
                        <th className="px-3 py-2 font-semibold">Null</th>
                        <th className="hidden px-3 py-2 font-semibold sm:table-cell">Mặc định</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {meta.map(c => (
                        <tr key={c.name} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 font-medium text-gray-800">{c.name} {c.pk && <Badge color="amber">PK</Badge>}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{c.type}</td>
                          <td className="px-3 py-2 text-gray-400">{c.nullable ? 'YES' : 'NO'}</td>
                          <td className="hidden max-w-[200px] truncate px-3 py-2 font-mono text-[11px] text-gray-400 sm:table-cell" title={c.default || ''}>{c.default || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </section>

      {edit && meta && (
        <EditRow meta={meta} row={edit.mode === 'edit' ? edit.row : null}
          onSubmit={submitRow} onDelete={edit.mode === 'edit' ? removeRow : null} onClose={() => setEdit(null)} />
      )}
    </div>
  )
}

// ── Chế độ SQL ─────────────────────────────────────────────────────────
function SqlMode({ api }) {
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 20;')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [running, setRunning] = useState(false)

  function run() {
    const q = sql.trim()
    if (!q || running) return
    setRunning(true); setErr(''); setRes(null)
    api.query(q).then(setRes).catch(e => setErr(e.message)).finally(() => setRunning(false))
  }

  return (
    <div className="space-y-3">
      <textarea value={sql} onChange={e => setSql(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run() }}
        spellCheck={false} rows={5} placeholder="Nhập câu lệnh SQL…  (Ctrl/⌘ + Enter để chạy)"
        className={`${inputCls} resize-y font-mono text-[12px] leading-relaxed`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Toàn quyền — cẩn thận với lệnh ghi/xoá.</span>
        <button className={btn('primary')} disabled={running} onClick={run}>{running ? 'Đang chạy…' : 'Chạy ▸'}</button>
      </div>
      <ErrorNote>{err}</ErrorNote>
      {res && (res.kind === 'select' ? (
        res.rows.length === 0 ? <EmptyState>0 dòng</EmptyState> : (
          <div className="space-y-2">
            <p className="text-[12px] text-gray-500">{res.rowCount} dòng{res.truncated && <span className="text-amber-600"> · đã cắt còn {res.rowCount} dòng đầu</span>}</p>
            <ResultTable columns={res.columns} rows={res.rows} />
          </div>
        )
      ) : (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-600">{res.message}</div>
      ))}
    </div>
  )
}

// ── Khu quản lý (đã kết nối) ─────────────────────────────────────────────
function Manager({ token, session, setSession, onDisconnect }) {
  const [mode, setMode] = useState('browse')
  const [switching, setSwitching] = useState(false)
  const api = useDbApi(token, session, setSession)

  async function switchDb(dbname) {
    if (dbname === session.dbname) return
    setSwitching(true)
    try {
      const body = { ...session.form, dbname, useDefault: !!session.form.useDefault }
      const r = await adminApi.dbConnect(token, body)
      setSession({ ...r, form: body })
    } catch { /* giữ phiên cũ nếu lỗi */ } finally { setSwitching(false) }
  }

  return (
    <div className="space-y-3">
      {/* Thanh trạng thái kết nối */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />{session.server}
        </span>
        <span className="text-gray-300">·</span>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-500">
          DB
          <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-medium text-gray-800 outline-none focus:border-gray-400"
            value={session.dbname} disabled={switching} onChange={e => switchDb(e.target.value)}>
            {(session.databases || [session.dbname]).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {session.user && <span className="hidden text-[11px] text-gray-400 sm:inline">{session.user}</span>}
        <button className={`${btn('danger')} ml-auto`} onClick={onDisconnect}>Ngắt kết nối</button>
      </div>

      <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
        <button onClick={() => setMode('browse')} className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${mode === 'browse' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500'}`}>Bảng</button>
        <button onClick={() => setMode('sql')} className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${mode === 'sql' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500'}`}>SQL</button>
      </div>

      {/* key theo connId+dbname để reset state khi đổi DB */}
      {mode === 'browse'
        ? <BrowseMode key={`b-${session.connId}`} api={api} />
        : <SqlMode key={`s-${session.connId}`} api={api} />}
    </div>
  )
}

export default function AdminDatabase({ token }) {
  const [session, setSession] = useState(loadSession)

  useEffect(() => {
    if (session) sessionStorage.setItem(SKEY, JSON.stringify(session))
    else sessionStorage.removeItem(SKEY)
  }, [session])

  async function disconnect() {
    try { if (session?.connId) await adminApi.dbDisconnect(token, session.connId) } catch { /* bỏ qua */ }
    setSession(null)
  }

  if (!session) return <ConnectScreen token={token} onConnect={setSession} />
  return <Manager token={token} session={session} setSession={setSession} onDisconnect={disconnect} />
}
