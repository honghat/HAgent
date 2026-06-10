import React, { useEffect, useState, useMemo } from "react";
import { Edit, Trash2, Plus, LayoutGrid, List, Search, X, StickyNote, Tag, Loader, ChevronDown, ChevronRight } from "lucide-react";

const API = "/api/personal/notes";

const COLORS = [
    { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" },
    { bg: "#d1fae5", text: "#065f46", border: "#10b981" },
    { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
    { bg: "#fee2e2", text: "#991b1b", border: "#ef4444" },
    { bg: "#ede9fe", text: "#5b21b6", border: "#8b5cf6" },
    { bg: "#fce7f3", text: "#9d174d", border: "#ec4899" },
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
    const [view, setView] = useState("grid");
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
        if (!q) return notes;
        return notes.filter((n) =>
            n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
        );
    }, [notes, search]);

    // Nhóm theo category
    const groups = useMemo(() => {
        const map = new Map();
        // Thứ tự: các nhóm có danh mục trước, không danh mục cuối
        for (const note of filtered) {
            const key = note.category_id ?? "__none__";
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(note);
        }
        const result = [];
        // Nhóm có danh mục (theo thứ tự categories)
        for (const cat of categories) {
            if (map.has(cat.id)) {
                result.push({ key: cat.id, label: cat.name, color: catColor(cat.id), notes: map.get(cat.id) });
            }
        }
        // Không danh mục
        if (map.has("__none__")) {
            result.push({ key: "__none__", label: "Chưa phân loại", color: { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" }, notes: map.get("__none__") });
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
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> <span className="text-sm">Đang tải...</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm ghi chú..."
                        className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X size={13} />
                        </button>
                    )}
                </div>
                <button onClick={() => setModal("cat")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    <Tag size={13} /> Danh mục
                </button>
                <button onClick={() => setView(v => v === "grid" ? "list" : "grid")}
                    className="p-1.5 text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    {view === "grid" ? <List size={15} /> : <LayoutGrid size={15} />}
                </button>
                <button onClick={() => openAdd()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                    <Plus size={14} /> Thêm
                </button>
            </div>

            {/* Grouped notes */}
            {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                    <StickyNote size={32} className="opacity-30" />
                    <p className="text-sm">{search ? "Không tìm thấy ghi chú nào" : "Chưa có ghi chú nào"}</p>
                </div>
            ) : (
                <div className="flex flex-col gap-5">
                    {groups.map((group) => {
                        const isCollapsed = collapsed[group.key];
                        const col = group.color;
                        return (
                            <div key={group.key} className="flex flex-col gap-2">
                                {/* Group header */}
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => toggleCollapse(group.key)}
                                        className="flex items-center gap-2 group/h"
                                    >
                                        <span className="w-0.5 h-4 rounded-full" style={{ background: col.border }} />
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
                                            style={{ background: col.bg, color: col.text, borderColor: col.border }}>
                                            {group.label}
                                        </span>
                                        <span className="text-xs text-gray-400">{group.notes.length}</span>
                                        {isCollapsed
                                            ? <ChevronRight size={13} className="text-gray-400" />
                                            : <ChevronDown size={13} className="text-gray-400" />
                                        }
                                    </button>
                                    {group.key !== "__none__" && (
                                        <button onClick={() => openAdd(group.key)}
                                            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors">
                                            <Plus size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Notes in group */}
                                {!isCollapsed && (
                                    view === "grid" ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {group.notes.map((n) => (
                                                <NoteCard key={n.id} note={n} onEdit={openEdit} onDelete={deleteNote} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1.5">
                                            {group.notes.map((n) => (
                                                <NoteRow key={n.id} note={n} onEdit={openEdit} onDelete={deleteNote} />
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
                    <div className="flex flex-col gap-3">
                        <input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                            placeholder="Tiêu đề..." autoFocus
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                        <textarea value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
                            placeholder="Nội dung..." rows={6}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y" />
                        <select value={form.category_id ?? ""} onChange={(e) => setForm(p => ({ ...p, category_id: e.target.value ? +e.target.value : null }))}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white">
                            <option value="">-- Không có danh mục --</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setModal(null)} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                            <button onClick={saveNote} disabled={saving}
                                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                                {saving ? "Đang lưu..." : "Lưu"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Category modal */}
            {modal === "cat" && (
                <Modal title="Quản lý danh mục" onClose={() => setModal(null)}>
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                                placeholder="Tên danh mục mới..."
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                            <button onClick={addCategory}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                                Thêm
                            </button>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                            {categories.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Chưa có danh mục</p>}
                            {categories.map((c) => {
                                const col = catColor(c.id);
                                return (
                                    <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: col.bg, color: col.text }}>{c.name}</span>
                                        <button onClick={() => deleteCategory(c.id)} className="text-gray-400 hover:text-red-500 transition-colors">
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

function NoteCard({ note, onEdit, onDelete }) {
    const col = catColor(note.category_id);
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-2 group">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm text-gray-800 line-clamp-2 flex-1">{note.title || "(Không có tiêu đề)"}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => onEdit(note)} className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"><Edit size={13} /></button>
                    <button onClick={() => onDelete(note.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </div>
            </div>
            {note.content && <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap line-clamp-6">{note.content}</p>}
            <div className="flex items-center justify-end mt-auto pt-1">
                <span className="text-xs text-gray-400">{fmtDate(note.updated_at)}</span>
            </div>
        </div>
    );
}

function NoteRow({ note, onEdit, onDelete }) {
    return (
        <div className="flex items-start gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-shadow group">
            <StickyNote size={14} className="text-gray-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{note.title || "(Không có tiêu đề)"}</p>
                {note.content && <p className="text-xs text-gray-400 whitespace-pre-wrap line-clamp-3 mt-0.5 leading-relaxed">{note.content}</p>}
            </div>
            <span className="text-xs text-gray-400 shrink-0 hidden sm:block mt-0.5">{fmtDate(note.updated_at)}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => onEdit(note)} className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"><Edit size={13} /></button>
                <button onClick={() => onDelete(note.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-sm text-gray-800">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
