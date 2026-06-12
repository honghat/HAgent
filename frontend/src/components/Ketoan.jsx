import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

/* ══════════════════════════════════════════════
   COLUMN DEFINITIONS  — map model → UI
   ══════════════════════════════════════════════ */
export const COLS = [
  // ── identity
  { key: "Id",           label: "ID",              type: "number",   readOnly: true,  minW: 60,  group: "ID" },
  { key: "ParentId",     label: "Parent ID",        type: "number",   minW: 90,        group: "ID" },
  { key: "IsGroup",      label: "Nhóm?",            type: "bool",     minW: 70,        group: "ID" },
  { key: "IsActive",     label: "Kích hoạt",        type: "bool",     minW: 90,        group: "ID" },

  // ── command
  { key: "CommandKey",   label: "Command Key",      type: "text",     required: true,  minW: 140, group: "Command" },
  { key: "CommandType",  label: "Command Type",     type: "text",     minW: 120,       group: "Command" },
  { key: "CommandClass", label: "Command Class",    type: "text",     minW: 150,       group: "Command" },
  { key: "AlterCommandClass", label: "Alter Class", type: "text",     minW: 150,       group: "Command" },
  { key: "DefaultEnabledState", label: "Default Enabled", type: "bool", minW: 110,    group: "Command" },

  // ── text / i18n
  { key: "Text",         label: "Tên (VI)",         type: "text",     required: true,  minW: 200, group: "Tên" },
  { key: "Text_English", label: "English",          type: "text",     minW: 180,       group: "Tên" },
  { key: "Text_French",  label: "French",           type: "text",     minW: 160,       group: "Tên" },
  { key: "Text_Japanese",label: "Japanese",         type: "text",     minW: 160,       group: "Tên" },
  { key: "Text_Chinese", label: "Chinese",          type: "text",     minW: 160,       group: "Tên" },
  { key: "Text_Korean",  label: "Korean",           type: "text",     minW: 160,       group: "Tên" },
  { key: "Text_Custom",  label: "Custom",           type: "text",     minW: 160,       group: "Tên" },

  // ── invoke
  { key: "DLLName",      label: "DLL Name",         type: "text",     minW: 130,       group: "Invoke" },
  { key: "ClassName",    label: "Class Name",       type: "text",     minW: 130,       group: "Invoke" },
  { key: "CtorArgs",     label: "Ctor Args",        type: "text",     minW: 130,       group: "Invoke" },
  { key: "MethodName",   label: "Method Name",      type: "text",     minW: 130,       group: "Invoke" },
  { key: "InvokeArgs",   label: "Invoke Args",      type: "text",     minW: 130,       group: "Invoke" },

  // ── shortcut / image
  { key: "ShortKeyText", label: "Phím tắt (Text)",  type: "text",     minW: 120,       group: "Phím & Hình" },
  { key: "ShortKeyValue",label: "Phím tắt (Value)", type: "text",     minW: 120,       group: "Phím & Hình" },
  { key: "Image",        label: "Image",            type: "text",     minW: 160,       group: "Phím & Hình" },

  // ── flags
  { key: "CustomFlags",  label: "Custom Flags",     type: "text",     minW: 110,       group: "Flags" },
  { key: "CategoryFlags",label: "Category Flags",   type: "text",     minW: 110,       group: "Flags" },

  // ── audit (read-only)
  { key: "CreatedBy",    label: "Tạo bởi",          type: "number",   readOnly: true,  minW: 90,  group: "Audit" },
  { key: "CreatedAt",    label: "Ngày tạo",         type: "datetime", readOnly: true,  minW: 150, group: "Audit" },
  { key: "ModifiedBy",   label: "Sửa bởi",          type: "number",   readOnly: true,  minW: 90,  group: "Audit" },
  { key: "ModifiedAt",   label: "Ngày sửa",         type: "datetime", readOnly: true,  minW: 150, group: "Audit" },
];

const EDITABLE_COLS = COLS.filter((c) => !c.readOnly);
const GROUP_ORDER   = ["ID", "Command", "Tên", "Invoke", "Phím & Hình", "Flags", "Audit"];
const PAGE_SIZES    = [20, 50, 100, 200];

/* ══════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════ */
const Ico = {
  Plus:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Save:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>,
  Trash:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Undo:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M3 7v6h6"/><path d="M3 13C5.5 6.5 13 4 18 8s6 12 1 16"/></svg>,
  Spin:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  Search:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  X:          () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>,
  Warn:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  ChevL:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>,
  ChevsL:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>,
  ChevsR:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>,
  Columns:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>,
  Eye:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
};

/* ══════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════ */
const TCFG = {
  success: { bar: "#10b981", bg: "#f0fdf4", text: "#065f46" },
  error:   { bar: "#ef4444", bg: "#fef2f2", text: "#991b1b" },
  info:    { bar: "#3b82f6", bg: "#eff6ff", text: "#1e40af" },
};
const ToastStack = ({ toasts, remove }) => (
  <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none" style={{ minWidth: 260 }}>
    {toasts.map((t) => {
      const c = TCFG[t.type] || TCFG.info;
      return (
        <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 pr-4 py-2.5 rounded-xl shadow-lg text-sm font-medium overflow-hidden"
          style={{ background: c.bg, color: c.text, animation: "toastIn .2s ease" }}>
          <div className="w-1 self-stretch" style={{ background: c.bar, borderRadius: "4px 0 0 4px" }} />
          <span style={{ color: c.bar }}>{t.type === "error" ? <Ico.Warn /> : <Ico.Check />}</span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="opacity-40 hover:opacity-80"><Ico.X /></button>
        </div>
      );
    })}
  </div>
);
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);
  const remove = useCallback((id) => setToasts((p) => p.filter((x) => x.id !== id)), []);
  return { toasts, add, remove };
};

/* ══════════════════════════════════════════════
   CELL RENDERERS
   ══════════════════════════════════════════════ */
const fmtDatetime = (v) => {
  if (!v) return "";
  try { return new Date(v).toLocaleString("vi-VN"); } catch { return v; }
};

const CellInput = ({ col, value, onChange, onEnter, dirty, isNew, disabled }) => {
  if (col.readOnly) {
    return (
      <span className="block px-2.5 py-1.5 text-xs text-gray-400 font-mono select-all">
        {col.type === "datetime" ? fmtDatetime(value) : (value ?? "—")}
      </span>
    );
  }

  if (col.type === "bool") {
    return (
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:opacity-50"
        />
      </div>
    );
  }

  const base = `w-full px-2.5 py-1.5 rounded-lg border text-sm transition-all outline-none
    placeholder:text-gray-300 placeholder:text-xs disabled:opacity-50`;
  const stateClass = isNew && !value
    ? "border-dashed border-blue-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
    : dirty
      ? "border-amber-300 bg-amber-50/60 focus:ring-2 focus:ring-amber-300"
      : "border-transparent bg-transparent hover:border-gray-200 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-200";

  return (
    <input
      type={col.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(col.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      placeholder={col.label}
      disabled={disabled}
      className={`${base} ${stateClass}`}
    />
  );
};

/* ══════════════════════════════════════════════
   COLUMN VISIBILITY PANEL
   ══════════════════════════════════════════════ */
const ColVisPanel = ({ visible, toggle, toggleGroup, onClose }) => {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref}
      className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-80 max-h-[70vh] overflow-y-auto"
      style={{ animation: "fadeDown .15s ease" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Hiển thị cột</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Ico.X /></button>
      </div>
      {GROUP_ORDER.map((grp) => {
        const grpCols = COLS.filter((c) => c.group === grp);
        const allOn   = grpCols.every((c) => visible[c.key] !== false);
        return (
          <div key={grp} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <input type="checkbox" checked={allOn}
                onChange={() => toggleGroup(grp, !allOn)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{grp}</span>
            </div>
            <div className="pl-5 space-y-1">
              {grpCols.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={visible[c.key] !== false}
                    onChange={() => toggle(c.key)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                  <span className="text-xs text-gray-600 group-hover:text-gray-900">{c.label}</span>
                  {c.required && <span className="text-red-400 text-xs">*</span>}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ══════════════════════════════════════════════
   PAGINATION
   ══════════════════════════════════════════════ */
const Pagination = ({ page, totalPages, total, pageSize, onPage, onPageSize, loading }) => {
  const [jumpVal, setJumpVal] = useState("");
  const jump = () => {
    const n = parseInt(jumpVal, 10);
    if (n >= 1 && n <= totalPages && n !== page) onPage(n);
    setJumpVal("");
  };

  const pages = [];
  const d = 2, left = Math.max(1, page - d), right = Math.min(totalPages, page + d);
  if (left > 1)          { pages.push(1); if (left > 2) pages.push("...l"); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages){ if (right < totalPages - 1) pages.push("...r"); pages.push(totalPages); }

  const PB = ({ ch, onClick, active, disabled }) => (
    <button onClick={onClick} disabled={disabled || loading}
      className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40
        ${active ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
      {ch}
    </button>
  );

  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 flex-wrap gap-2">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Tổng <strong className="text-gray-700">{total}</strong> bản ghi</span>
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-1.5">Hiển thị
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} disabled={loading}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          dòng
        </span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <PB ch={<Ico.ChevsL />} onClick={() => onPage(1)}           disabled={page === 1} />
        <PB ch={<Ico.ChevL />}  onClick={() => onPage(page - 1)}    disabled={page === 1} />
        {pages.map((p) =>
          typeof p === "string"
            ? <span key={p} className="px-1 text-gray-400 text-sm select-none">…</span>
            : <PB key={p} ch={p} active={p === page} onClick={() => onPage(p)} />
        )}
        <PB ch={<Ico.ChevR />}  onClick={() => onPage(page + 1)}    disabled={page === totalPages} />
        <PB ch={<Ico.ChevsR />} onClick={() => onPage(totalPages)}   disabled={page === totalPages} />

        <div className="flex items-center gap-1 ml-1">
          <span className="text-xs text-gray-400">Đến</span>
          <input type="number" min={1} max={totalPages} value={jumpVal}
            onChange={(e) => setJumpVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && jump()}
            placeholder={String(page)} disabled={loading}
            className="w-14 h-8 text-center text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50" />
          <button onClick={jump} disabled={loading || !jumpVal}
            className="h-8 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium border border-gray-200 disabled:opacity-40 transition-colors">
            Đi
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════ */
let _uid = 0;
const uid = () => `new_${++_uid}`;

const DEFAULT_VISIBLE = Object.fromEntries(
  COLS.map((c) => [
    c.key,
    // hide verbose / rarely-needed cols by default
    !["Text_French","Text_Japanese","Text_Chinese","Text_Korean","Text_Custom",
      "Text_English","CommandType","CommandClass","InvokeArgs",
      "ShortKeyText",	"ShortKeyValue",	"Image","IsGroup",
      "AlterCommandClass","CustomFlags","CategoryFlags","ModifiedAt",
      "CreatedBy","ModifiedBy"].includes(c.key)
  ])
);

export default function Ketoan({ token }) {
  const [rows,        setRows]        = useState([]);
  const [originals,   setOriginals]   = useState({});
  const [saving,      setSaving]      = useState({});
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const [filter,      setFilter]      = useState("");
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(50);
  const [meta,        setMeta]        = useState({ total: 0, total_pages: 1 });
  const [initLoading, setInitLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [colVis,      setColVis]      = useState(DEFAULT_VISIBLE);
  const [showColPanel,setShowColPanel]= useState(false);

  const { toasts, add: toast, remove: removeToast } = useToast();
  const activeToken = token || localStorage.getItem("token");
  const authHdr = { headers: { Authorization: activeToken ? `Bearer ${activeToken}` : "" } };

  /* visible columns */
  const activeCols = COLS.filter((c) => colVis[c.key] !== false);

  /* toggle col visibility */
  const toggleCol = (key) => setColVis((v) => ({ ...v, [key]: v[key] === false }));
  const toggleGroup = (grp, on) => {
    const keys = COLS.filter((c) => c.group === grp).map((c) => c.key);
    setColVis((v) => ({ ...v, ...Object.fromEntries(keys.map((k) => [k, on])) }));
  };

  /* fetch */
  const fetchPage = useCallback(async (p, ps, spinner = false) => {
    try {
      if (spinner) setPageLoading(true);
      const res = await axios.get(`/api/ketoan?page=${p}&page_size=${ps}`, authHdr);
      const { items = [], total = 0, total_pages = 1 } = res.data;
      const mapped = items.map((r) => ({ ...r, _id: String(r.Id) }));
      setRows(mapped);
      setOriginals(Object.fromEntries(mapped.map((r) => [r._id, { ...r }])));
      setMeta({ total, total_pages });
    } catch {
      toast("Không tải được dữ liệu", "error");
    } finally {
      setInitLoading(false);
      setPageLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPage(1, pageSize); }, [fetchPage, pageSize]);

  const goPage = (p) => { setPage(p); fetchPage(p, pageSize, true); };
  const changePageSize = (ps) => { setPageSize(ps); setPage(1); fetchPage(1, ps, true); };

  /* dirty */
  const isDirty = (row) => {
    if (row._new) return EDITABLE_COLS.some((c) => row[c.key] != null && String(row[c.key]).trim() !== "");
    const o = originals[row._id];
    return o ? EDITABLE_COLS.some((c) => row[c.key] !== o[c.key]) : false;
  };

  const setCell = (id, key, val) =>
    setRows((p) => p.map((r) => (r._id === id ? { ...r, [key]: val } : r)));

  const addRow = () => {
    const nr = { _id: uid(), _new: true, ...Object.fromEntries(COLS.map((c) => [c.key, c.type === "bool" ? false : null])) };
    setRows((p) => [nr, ...p]);
  };

  const saveRow = async (row) => {
    for (const c of EDITABLE_COLS) {
      if (c.required && !row[c.key]?.toString().trim()) {
        toast(`"${c.label}" không được để trống`, "error"); return;
      }
    }
    const payload = Object.fromEntries(EDITABLE_COLS.map((c) => [c.key, row[c.key] ?? null]));
    setSaving((s) => ({ ...s, [row._id]: true }));
    try {
      if (row._new) {
        const res = await axios.post(`/api/ketoan`, payload, authHdr);
        const saved = { ...res.data, _id: String(res.data.Id) };
        setRows((p) => p.map((r) => (r._id === row._id ? saved : r)));
        setOriginals((o) => ({ ...o, [saved._id]: { ...saved } }));
        setMeta((m) => ({ ...m, total: m.total + 1 }));
        toast("Đã thêm mới thành công");
      } else {
        await axios.put(`/api/ketoan/${row.Id}`, payload, authHdr);
        setOriginals((o) => ({ ...o, [row._id]: { ...row } }));
        toast("Đã lưu thay đổi");
      }
    } catch {
      toast("Lưu thất bại, thử lại", "error");
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[row._id]; return n; });
    }
  };

  const discardRow = (row) => {
    if (row._new) { setRows((p) => p.filter((r) => r._id !== row._id)); return; }
    const orig = originals[row._id];
    if (orig) setRows((p) => p.map((r) => (r._id === row._id ? { ...orig } : r)));
  };

  const deleteRow = async (row) => {
    if (row._new) { setRows((p) => p.filter((r) => r._id !== row._id)); setConfirmDel(null); return; }
    setDeletingId(row._id);
    try {
      await axios.delete(`/api/ketoan/${row.Id}`, authHdr);
      setRows((p) => p.filter((r) => r._id !== row._id));
      setOriginals((o) => { const n = { ...o }; delete n[row._id]; return n; });
      setMeta((m) => ({ ...m, total: m.total - 1 }));
      setConfirmDel(null);
      toast("Đã xoá thành công");
    } catch {
      toast("Xoá thất bại", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const visible = filter.trim()
    ? rows.filter((r) => COLS.some((c) => String(r[c.key] ?? "").toLowerCase().includes(filter.toLowerCase())))
    : rows;

  const dirtyCount = rows.filter(isDirty).length;

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <>
      <ToastStack toasts={toasts} remove={removeToast} />

      <div className="flex flex-col h-full min-h-0 rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-gray-800 text-sm">Lệnh kế toán</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{meta.total}</span>
            {dirtyCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{dirtyCount} chưa lưu</span>
            )}
            {pageLoading && <span className="text-xs text-gray-400 flex items-center gap-1"><Ico.Spin /> Đang tải...</span>}
          </div>

          <div className="flex items-center gap-2">
            {/* search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Ico.Search /></span>
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder="Lọc trong trang..." className="pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 w-44 bg-white transition" />
              {filter && <button onClick={() => setFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><Ico.X /></button>}
            </div>

            {/* column picker */}
            <div className="relative">
              <button onClick={() => setShowColPanel((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm rounded-lg transition">
                <Ico.Columns /> Cột
                <span className="text-xs text-blue-600 font-semibold">{activeCols.length}/{COLS.length}</span>
              </button>
              {showColPanel && (
                <ColVisPanel visible={colVis} toggle={toggleCol} toggleGroup={toggleGroup} onClose={() => setShowColPanel(false)} />
              )}
            </div>

            {/* add */}
            <button onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-medium rounded-lg shadow-sm transition">
              <Ico.Plus /> Thêm dòng
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="text-sm border-collapse" style={{ minWidth: "100%" }}>
            <thead className="sticky top-0 z-20 bg-white">
              {/* group headers */}
              <tr className="bg-gray-100/80">
                <th className="w-10" />
                {GROUP_ORDER.map((grp) => {
                  const grpCols = activeCols.filter((c) => c.group === grp);
                  if (!grpCols.length) return null;
                  return (
                    <th key={grp} colSpan={grpCols.length}
                      className="px-3 py-1.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-widest border-x border-gray-100 whitespace-nowrap">
                      {grp}
                    </th>
                  );
                })}
                <th className="w-36" />
              </tr>
              {/* column headers */}
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-10 px-3 py-2 text-center text-xs font-medium text-gray-400 select-none sticky left-0 bg-gray-50 z-10">#</th>
                {activeCols.map((c) => (
                  <th key={c.key} style={{ minWidth: c.minW }}
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-x border-gray-100">
                    {c.label}
                    {c.required && <span className="text-red-400 ml-0.5">*</span>}
                    {c.readOnly && <span className="ml-1 text-gray-300 text-xs normal-case font-normal">(r)</span>}
                  </th>
                ))}
                <th className="w-36 px-3 py-2 text-center text-xs font-medium text-gray-400 sticky right-0 bg-gray-50 z-10">Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {initLoading ? (
                <tr><td colSpan={activeCols.length + 2} className="py-20 text-center text-gray-400">
                  <div className="inline-flex flex-col items-center gap-2">
                    <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <span className="text-xs">Đang tải...</span>
                  </div>
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={activeCols.length + 2} className="py-14 text-center text-sm text-gray-400">
                  {filter ? `Không tìm thấy "${filter}"` : "Chưa có dữ liệu — nhấn «Thêm dòng» để bắt đầu"}
                </td></tr>
              ) : (
                visible.map((row, idx) => {
                  const dirty      = isDirty(row);
                  const isSaving   = !!saving[row._id];
                  const isDelConf  = confirmDel === row._id;
                  const isDeleting = deletingId === row._id;
                  const rowNum     = row._new ? null : (page - 1) * pageSize + idx + 1;

                  return (
                    <tr key={row._id}
                      className={`border-b border-gray-50 group transition-colors
                        ${row._new            ? "bg-blue-50/40"        : ""}
                        ${dirty && !row._new  ? "bg-amber-50/30"       : ""}
                        ${!dirty && !row._new ? "hover:bg-gray-50/60"  : ""}
                        ${pageLoading         ? "opacity-40 pointer-events-none" : ""}
                      `}
                    >
                      {/* row # */}
                      <td className="px-3 py-1 text-center text-xs text-gray-300 font-mono select-none sticky left-0 bg-inherit z-[1]">
                        {row._new ? <span className="text-blue-400 font-bold text-base">+</span> : rowNum}
                      </td>

                      {/* data cells */}
                      {activeCols.map((c) => (
                        <td key={c.key} className="px-1.5 py-0.5 border-x border-gray-50">
                          <CellInput
                            col={c}
                            value={row[c.key]}
                            onChange={(val) => setCell(row._id, c.key, val)}
                            onEnter={() => saveRow(row)}
                            dirty={!!dirty && originals[row._id]?.[c.key] !== row[c.key]}
                            isNew={!!row._new}
                            disabled={pageLoading}
                          />
                        </td>
                      ))}

                      {/* actions */}
                      <td className="px-2 py-1 text-center sticky right-0 bg-inherit z-[1] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                        {isDelConf ? (
                          <span className="inline-flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                            <span className="text-xs text-red-600 font-medium mr-0.5">Xoá?</span>
                            <button onClick={() => deleteRow(row)} disabled={isDeleting}
                              className="w-5 h-5 rounded bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors">
                              {isDeleting ? <Ico.Spin /> : <Ico.Check />}
                            </button>
                            <button onClick={() => setConfirmDel(null)}
                              className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center">
                              <Ico.X />
                            </button>
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {dirty && (
                              <>
                                <Btn title="Lưu (Enter)" color="green"
                                  icon={isSaving ? <Ico.Spin /> : <Ico.Save />}
                                  label="Lưu" onClick={() => saveRow(row)} disabled={isSaving} />
                                <Btn title="Huỷ thay đổi" color="gray"
                                  icon={<Ico.Undo />} onClick={() => discardRow(row)} />
                              </>
                            )}
                            {!row._new && (
                              <span className={dirty ? "" : "opacity-0 group-hover:opacity-100 transition-opacity"}>
                                <Btn title="Xoá dòng" color="red" icon={<Ico.Trash />} onClick={() => setConfirmDel(row._id)} />
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!initLoading && (
          <Pagination page={page} totalPages={meta.total_pages} total={meta.total}
            pageSize={pageSize} onPage={goPage} onPageSize={changePageSize} loading={pageLoading} />
        )}
      </div>

      <style>{`
        @keyframes toastIn  { from { transform: translateX(1.5rem); opacity:0 } to { transform:translateX(0); opacity:1 } }
        @keyframes fadeDown { from { transform: translateY(-.5rem); opacity:0 } to { transform:translateY(0);  opacity:1 } }
        input[type=number]::-webkit-inner-spin-button { opacity:.4 }
      `}</style>
    </>
  );
}

/* ── Btn ── */
const BC = {
  green: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200",
  gray:  "bg-gray-100   text-gray-500   hover:bg-gray-200   border-gray-200",
  red:   "bg-red-50     text-red-500    hover:bg-red-100    border-red-200",
};
const Btn = ({ title, color, icon, label, onClick, disabled }) => (
  <button title={title} onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${BC[color]}`}>
    {icon}{label && <span>{label}</span>}
  </button>
);
