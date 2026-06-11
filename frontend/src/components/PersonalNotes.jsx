import React, { useEffect, useState, useMemo } from "react";
import { Edit3, Trash2, Plus, LayoutGrid, List, Search, X, StickyNote, Tag, Loader, ChevronDown, ChevronRight, Table, Pin, PinOff } from "lucide-react";

const API = "/api/personal/notes";

const COLORS = [
    { bg: "from-blue-50 to-blue-50/30", text: "#2563eb", border: "#3b82f6", soft: "bg-blue-500/10" },
    { bg: "from-emerald-50 to-emerald-50/30", text: "#059669", border: "#10b981", soft: "bg-emerald-500/10" },
    { bg: "from-amber-50 to-amber-50/30", text: "#d97706", border: "#f59e0b", soft: "bg-amber-500/10" },
    { bg: "from-rose-50 to-rose-50/30", text: "#e11d48", border: "#ef4444", soft: "bg-rose-500/10" },
    { bg: "from-violet-50 to-violet-50/30", text: "#7c3aed", border: "#8b5cf6", soft: "bg-violet-500/10" },
    { bg: "from-pink-50 to-pink-50/30", text: "#db2777", border: "#ec4899", soft: "bg-pink-500/10" },
];
const catColor = (id) => COLORS[(id || 0) % 6];

const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d), now = new Date();
    const diff = Math.floor((now - dt) / 86400000);
    if (diff === 0) return "Hôm nay";
    if (diff === 1) return "Hôm qua";
    if (diff < 7) return `${diff} ngày trước`;
    return dt.toLocaleDateString("vi-VN");
};

const authHeaders = (token) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
});

export default function PersonalNotes({ token }) {
    const [notes, setNotes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState(
        () => localStorage.getItem("hagent_notes_view") || "table"
    );

    const changeView = (v) => {
        setView(v);
        localStorage.setItem("hagent_notes_view", v);
    };
    const [search, setSearch] = useState("");
    const [collapsed, setCollapsed] = useState({});
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ title: "", content: "", category_id: null });
    const [editId, setEditId] = useState(null);
    const [newCat, setNewCat] = useState("");
    const [saving, setSaving] = useState(false);

    const headers = authHeaders(token);

    const load = async () => {
        try {
            const [n, c] = await Promise.all([
                fetch(API, { headers }).then((r) => r.json()),
                fetch(`${API}/categories`, { headers }).then((r) => r.json()),
            ]);
            setNotes(n);
            setCategories(c);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (token) load(); }, [token]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        let result = notes;
        if (!Array.isArray(result)) return [];
        if (q) result = notes.filter((n) =>
            n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
        );
        return [...result].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    }, [notes, search]);

    const groups = useMemo(() => {
        const map = new Map();
        for (const note of filtered) {
            const key = note.category_id ?? "__none__";
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(note);
        }
        const result = [];
        for (const cat of categories) {
            if (map.has(cat.id)) {
                result.push({ key: cat.id, label: cat.name, color: catColor(cat.id), notes: map.get(cat.id) });
            }
        }
        if (map.has("__none__")) {
            result.push({ key: "__none__", label: "Chưa phân loại", color: { bg: "from-slate-50 to-slate-50/30", text: "#64748b", border: "#cbd5e1", soft: "bg-slate-500/10" }, notes: map.get("__none__") });
        }
        return result;
    }, [filtered, categories]);

    const toggleCollapse = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

    const openAdd = (catId = null) => {
        setForm({ title: "", content: "", category_id: catId });
        setEditId(null);
        setModal("add");
    };
    const openEdit = (n) => {
        setForm({ title: n.title, content: n.content, category_id: n.category_id });
        setEditId(n.id);
        setModal("edit");
    };

    const saveNote = async () => {
        if (!form.title.trim()) return;
        setSaving(true);
        try {
            if (modal === "add") {
                await fetch(API, { method: "POST", headers, body: JSON.stringify(form) });
            } else {
                await fetch(`${API}/${editId}`, { method: "PUT", headers, body: JSON.stringify(form) });
            }
            await load();
            setModal(null);
        } finally { setSaving(false); }
    };

    const deleteNote = async (id) => {
        await fetch(`${API}/${id}`, { method: "DELETE", headers });
        setNotes((p) => p.filter((n) => n.id !== id));
    };

    const togglePin = async (id) => {
        await fetch(`${API}/${id}/toggle-pin`, { method: "POST", headers });
        setNotes((p) => p.map((n) => n.id === id ? { ...n, is_pinned: !n.is_pinned } : n));
    };

    const addCategory = async () => {
        if (!newCat.trim()) return;
        const r = await fetch(`${API}/categories`, { method: "POST", headers, body: JSON.stringify({ name: newCat }) });
        const data = await r.json();
        setCategories((p) => [...p, data]);
        setNewCat("");
    };

    const deleteCategory = async (id) => {
        const r = await fetch(`${API}/categories/${id}`, { method: "DELETE", headers });
        if (!r.ok) { const e = await r.json(); return alert(e.detail); }
        setCategories((p) => p.filter((c) => c.id !== id));
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
            <Loader size={16} className="animate-spin" />
            <span className="text-xs font-semibold">Đang tải...</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm ghi chú..."
                        className="w-full h-10 pl-10 pr-9 text-[12px] font-semibold border border-slate-200/80 rounded-xl bg-white/70 backdrop-blur focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/8 hover:border-slate-300 transition-all placeholder:text-slate-400"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                            <X size={13} />
                        </button>
                    )}
                </div>
                <button onClick={() => setModal("cat")}
                    className="flex items-center gap-1.5 px-3.5 h-10 text-[12px] font-bold text-slate-600 bg-white/70 backdrop-blur border border-slate-200/80 rounded-xl hover:bg-white hover:border-slate-300 hover:text-slate-800 transition active:scale-[0.97]">
                    <Tag size={13} strokeWidth={2.5} /> Danh mục
                </button>
                <button onClick={() => changeView(view === "grid" ? "list" : view === "list" ? "table" : "grid")}
                    className="p-2.5 text-slate-500 bg-white/70 backdrop-blur border border-slate-200/80 rounded-xl hover:bg-white hover:border-slate-300 hover:text-slate-800 transition active:scale-[0.97]"
                    title={view === "grid" ? "Xem danh sách" : view === "list" ? "Xem bảng" : "Xem lưới"}>
                    {view === "grid" ? <List size={15} /> : view === "list" ? <Table size={15} /> : <LayoutGrid size={15} />}
                </button>
                <button onClick={() => openAdd()}
                    className="flex items-center gap-1.5 px-4 h-10 text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_16px_-2px_rgba(99,102,241,0.5)] hover:from-indigo-600 hover:to-indigo-700 transition-all active:scale-[0.97]">
                    <Plus size={14} strokeWidth={3} /> Thêm ghi chú
                </button>
            </div>

            {/* Groups */}
            {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 border border-dashed border-slate-200 rounded-3xl bg-white/40 backdrop-blur">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100/60 flex items-center justify-center">
                        <StickyNote size={24} className="text-slate-300" strokeWidth={1.5} />
                    </div>
                    <p className="text-xs font-semibold">{search ? "Không tìm thấy ghi chú nào" : "Chưa có ghi chú nào"}</p>
                </div>
            ) : view === "table" ? (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.015)] max-h-[600px]">
                    <table className="w-full border-collapse text-left text-xs">
                            <thead className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur border-b border-slate-150">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <th className="px-4 py-2.5 w-8"></th>
                                    <th className="px-4 py-2.5">Tiêu đề</th>
                                    <th className="px-4 py-2.5">Nội dung</th>
                                    <th className="px-4 py-2.5 w-28">Cập nhật</th>
                                    <th className="px-4 py-2.5 w-24 text-right">Thao tác</th>
                                </tr>
                            </thead>
                        <tbody className="divide-y divide-slate-50">
                            {groups.map((group) => (
                                <React.Fragment key={group.key}>
                                    <tr className="bg-slate-50/60 font-bold sticky top-[33px] z-10 backdrop-blur-md border-y border-slate-100/80">
                                        <td colSpan={5} className="px-4 py-2 text-slate-700 text-[11px] font-bold">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="w-1.5 h-3 rounded-full" style={{ backgroundColor: group.color.border }} />
                                                {group.label}
                                                <span className="text-[9px] font-black text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded-md tabular-nums">{group.notes.length}</span>
                                            </span>
                                        </td>
                                    </tr>
                                    {group.notes.map((n) => (
                                        <tr key={n.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-2 py-2.5 text-center">
                                                <button onClick={() => togglePin(n.id)} className="p-1 text-slate-300 hover:text-amber-500 hover:bg-amber-50/60 rounded-lg transition-all" title={n.is_pinned ? "Bỏ ghim" : "Ghim"}>
                                                    {n.is_pinned ? <PinOff size={11} className="text-amber-500" /> : <Pin size={11} />}
                                                </button>
                                            </td>
                                            <td className="px-4 py-2.5 font-bold text-slate-700 whitespace-nowrap max-w-[150px] truncate">{n.is_pinned && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" />}{n.title || <span className="italic text-slate-400 font-normal">(Không có tiêu đề)</span>}</td>
                                            <td className="px-4 py-2.5 text-slate-500 max-w-[300px] truncate">{n.content || <span className="italic text-slate-300">-</span>}</td>
                                            <td className="px-4 py-2.5 text-slate-400 font-medium tabular-nums">{fmtDate(n.updated_at)}</td>
                                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => openEdit(n)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-lg transition-all"><Edit3 size={12} strokeWidth={2.5} /></button>
                                                    <button onClick={() => deleteNote(n.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={12} strokeWidth={2.5} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex flex-col gap-7">
                    {groups.map((group) => {
                        const isCollapsed = collapsed[group.key];
                        const col = group.color;
                        return (
                            <div key={group.key} className="flex flex-col gap-3.5">
                                {/* Group header */}
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => toggleCollapse(group.key)}
                                        className="flex items-center gap-2.5 group/h"
                                    >
                                        <span className="w-1 h-4 rounded-full" style={{ background: col.border }} />
                                        <span className="text-[13px] font-bold tracking-tight text-slate-800">
                                            {group.label}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded-md tabular-nums">{group.notes.length}</span>
                                        <span className="text-slate-300 group-hover/h:text-slate-500 transition-colors">
                                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                        </span>
                                    </button>
                                    {group.key !== "__none__" && (
                                        <button onClick={() => openAdd(group.key)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-lg transition-all"
                                            title="Thêm ghi chú vào danh mục này">
                                            <Plus size={14} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>

                                {/* Notes */}
                                {!isCollapsed && (
                                    view === "grid" ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                            {group.notes.map((n) => (
                                                <NoteCard key={n.id} note={n} onEdit={openEdit} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1.5">
                                            {group.notes.map((n) => (
                                                <NoteRow key={n.id} note={n} onEdit={openEdit} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add/Edit modal */}
            {(modal === "add" || modal === "edit") && (
                <Modal title={modal === "add" ? "Thêm ghi chú" : "Sửa ghi chú"} onClose={() => setModal(null)}>
                    <div className="flex flex-col gap-4">
                        <Field label="Tiêu đề">
                            <input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                                placeholder="Tiêu đề ghi chú..." autoFocus className={inputCls} />
                        </Field>
                        <Field label="Nội dung">
                            <textarea value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
                                placeholder="Viết gì đó..." rows={6}
                                className={`${inputCls} h-auto py-3 resize-y leading-relaxed`} />
                        </Field>
                        <Field label="Danh mục">
                            <select value={form.category_id ?? ""} onChange={(e) => setForm(p => ({ ...p, category_id: e.target.value ? +e.target.value : null }))}
                                className={`${inputCls} bg-white`}>
                                <option value="">— Không có danh mục —</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setModal(null)} className="px-4 py-2 text-[12px] font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-[0.97]">Hủy</button>
                            <button onClick={saveNote} disabled={saving}
                                className="px-4 py-2 text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_16px_-2px_rgba(99,102,241,0.5)] hover:from-indigo-600 hover:to-indigo-700 transition active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed">
                                {saving ? "Đang lưu..." : "Lưu ghi chú"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Category modal */}
            {modal === "cat" && (
                <Modal title="Quản lý danh mục" onClose={() => setModal(null)}>
                    <div className="flex flex-col gap-3.5">
                        <div className="flex gap-2">
                            <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                                placeholder="Tên danh mục mới..." className={inputCls} />
                            <button onClick={addCategory}
                                className="px-4 h-10 text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] hover:from-indigo-600 hover:to-indigo-700 transition active:scale-[0.97]">
                                Thêm
                            </button>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1 -mr-1">
                            {categories.length === 0 && (
                                <p className="text-xs font-semibold text-slate-400 text-center py-8">Chưa có danh mục nào</p>
                            )}
                            {categories.map((c) => {
                                const col = catColor(c.id);
                                return (
                                    <div key={c.id} className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/60 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                                        <span className="flex items-center gap-2 text-[12px] font-bold text-slate-700">
                                            <span className="w-2 h-2 rounded-full" style={{ background: col.border }} />
                                            {c.name}
                                        </span>
                                        <button onClick={() => deleteCategory(c.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

const inputCls = "w-full h-10 px-3.5 text-[12px] font-semibold border border-slate-200/80 rounded-xl bg-white/80 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/8 hover:border-slate-300 transition-all placeholder:text-slate-400";

function Field({ label, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</label>
            {children}
        </div>
    );
}

function NoteCard({ note, onEdit, onDelete, onTogglePin }) {
    const col = catColor(note.category_id);
    return (
        <div className="relative bg-white/80 backdrop-blur border border-slate-200/60 hover:border-slate-300/80 rounded-2xl p-4 hover:shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-2.5 group overflow-hidden">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${col.soft}`} style={{ background: col.border }} />

            {note.is_pinned && <span className="absolute top-2 right-2 text-amber-500"><PinOff size={11} /></span>}
            <div className="flex items-start justify-between gap-2 pl-1.5">
                <h3 className="font-bold text-[13px] text-slate-800 line-clamp-2 flex-1 tracking-tight leading-snug">
                    {note.is_pinned && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" />}
                    {note.title || <span className="italic text-slate-400">(Không có tiêu đề)</span>}
                </h3>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); onTogglePin?.(note.id); }} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50/60 rounded-lg transition-all" title={note.is_pinned ? "Bỏ ghim" : "Ghim"}>
                        {note.is_pinned ? <PinOff size={11} /> : <Pin size={11} />}
                    </button>
                    <button onClick={() => onEdit(note)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-lg transition-all"><Edit3 size={12} strokeWidth={2.5} /></button>
                    <button onClick={() => onDelete(note.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={12} strokeWidth={2.5} /></button>
                </div>
            </div>
            {note.content && (
                <p className="text-[11.5px] text-slate-500 leading-relaxed whitespace-pre-wrap line-clamp-5 pl-1.5">
                    {note.content}
                </p>
            )}
            <div className="flex items-center mt-auto pt-2 pl-1.5">
                <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{fmtDate(note.updated_at)}</span>
            </div>
        </div>
    );
}

function NoteRow({ note, onEdit, onDelete, onTogglePin }) {
    const col = catColor(note.category_id);
    return (
        <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur border border-slate-200/60 hover:border-slate-300/80 rounded-xl hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 group">
            <span className="w-1 h-6 rounded-full shrink-0" style={{ background: col.border }} />
            {note.is_pinned && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
            <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-bold text-slate-800 truncate tracking-tight">
                    {note.title || <span className="italic text-slate-400">(Không có tiêu đề)</span>}
                </p>
                {note.content && <p className="text-[11px] text-slate-400 truncate mt-0.5">{note.content}</p>}
            </div>
            <span className="text-[10px] font-semibold text-slate-400 shrink-0 hidden sm:block tabular-nums">{fmtDate(note.updated_at)}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onTogglePin?.(note.id); }} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50/60 rounded-lg transition-all" title={note.is_pinned ? "Bỏ ghim" : "Ghim"}>
                    {note.is_pinned ? <PinOff size={11} /> : <Pin size={11} />}
                </button>
                <button onClick={() => onEdit(note)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-lg transition-all"><Edit3 size={12} strokeWidth={2.5} /></button>
                <button onClick={() => onDelete(note.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={12} strokeWidth={2.5} /></button>
            </div>
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] w-full max-w-md p-6 border border-slate-200/60 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="font-bold text-[14px] text-slate-800 tracking-tight">{title}</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"><X size={15} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
