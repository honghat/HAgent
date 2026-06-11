import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Trash2, Edit2, Search, X, Utensils, Sunrise, Sun, Moon, Loader, Check } from "lucide-react";

const API = "/api/expenses/anuong";

const MEALS = [
    { key: "sang", label: "Sáng", icon: Sunrise, money: "tien_sang", paid: "sang_paid" },
    { key: "trua", label: "Trưa", icon: Sun, money: "tien_trua", paid: "trua_paid" },
    { key: "toi", label: "Tối", icon: Moon, money: "tien_toi", paid: "toi_paid" },
];

const authHeaders = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
const fmtVND = (n) => (n ? Number(n).toLocaleString("vi-VN") + "đ" : "0đ");

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${WD[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const today = () => new Date().toISOString().split("T")[0];

const emptyForm = () => ({
    date: today(),
    sang: "", tien_sang: "", sang_paid: false,
    trua: "", tien_trua: "", trua_paid: false,
    toi: "", tien_toi: "", toi_paid: false,
});

export default function FoodTracker({ token }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [modal, setModal] = useState(null); // "add" | "edit"
    const [form, setForm] = useState(emptyForm());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [filterUnpaid, setFilterUnpaid] = useState(false);

    const headers = authHeaders(token);

    const load = useCallback(async () => {
        try {
            const data = await fetch(API, { headers }).then((r) => r.json());
            setRecords(Array.isArray(data) ? data : []);
        } finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [token]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        let result = records.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        if (filterUnpaid) {
            result = result.filter((r) =>
                MEALS.some((m) => {
                    const amt = r[m.money] || 0;
                    return amt > 0 && !r[m.paid];
                })
            );
        }
        if (!q) return result;
        return result.filter((r) =>
            [r.sang, r.trua, r.toi].some((m) => (m || "").toLowerCase().includes(q)) || (r.date || "").includes(q)
        );
    }, [records, search, filterUnpaid]);

    const stats = useMemo(() => {
        let total = 0, unpaid = 0;
        for (const r of records) {
            for (const m of MEALS) {
                const amt = r[m.money] || 0;
                total += amt;
                if (!r[m.paid]) unpaid += amt;
            }
        }
        return { total, unpaid, days: records.length };
    }, [records]);

    const openAdd = () => { setForm(emptyForm()); setEditId(null); setModal("add"); };
    const openEdit = (r) => {
        setForm({
            date: r.date,
            sang: r.sang || "", tien_sang: r.tien_sang || "", sang_paid: !!r.sang_paid,
            trua: r.trua || "", tien_trua: r.tien_trua || "", trua_paid: !!r.trua_paid,
            toi: r.toi || "", tien_toi: r.tien_toi || "", toi_paid: !!r.toi_paid,
        });
        setEditId(r.id); setModal("edit");
    };

    const payload = (f) => ({
        date: f.date,
        sang: f.sang || null, tien_sang: f.tien_sang ? +f.tien_sang : null, sang_paid: f.sang_paid,
        trua: f.trua || null, tien_trua: f.tien_trua ? +f.tien_trua : null, trua_paid: f.trua_paid,
        toi: f.toi || null, tien_toi: f.tien_toi ? +f.tien_toi : null, toi_paid: f.toi_paid,
    });

    const save = async () => {
        setSaving(true);
        try {
            if (modal === "add") {
                await fetch(API, { method: "POST", headers, body: JSON.stringify({ user_id: 0, ...payload(form) }) });
            } else {
                await fetch(`${API}/${editId}`, { method: "PUT", headers, body: JSON.stringify(payload(form)) });
            }
            await load();
            setModal(null);
        } finally { setSaving(false); }
    };

    const remove = async (id) => {
        if (!confirm("Xóa ngày này?")) return;
        await fetch(`${API}/${id}`, { method: "DELETE", headers });
        setRecords((p) => p.filter((r) => r.id !== id));
    };

    const togglePaid = async (rec, meal) => {
        const next = !rec[meal.paid];
        const updated = { ...rec, [meal.paid]: next };
        setRecords((p) => p.map((r) => (r.id === rec.id ? updated : r))); // optimistic
        await fetch(`${API}/${rec.id}`, {
            method: "PUT", headers,
            body: JSON.stringify({
                date: rec.date,
                sang: rec.sang, tien_sang: rec.tien_sang, sang_paid: updated.sang_paid,
                trua: rec.trua, tien_trua: rec.tien_trua, trua_paid: updated.trua_paid,
                toi: rec.toi, tien_toi: rec.tien_toi, toi_paid: updated.toi_paid,
            }),
        });
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> <span className="text-sm">Đang tải...</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 min-w-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm món, ngày..."
                        className="w-full h-10 pl-9 pr-3 text-xs font-semibold border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/50 hover:border-slate-300 focus:ring-4 focus:ring-indigo-500/5 transition-all" />
                </div>
                <button onClick={() => setFilterUnpaid(!filterUnpaid)}
                    className={`flex items-center gap-1.5 px-3 h-10 text-xs font-bold rounded-xl border transition active:scale-[0.98] shrink-0 ${
                        filterUnpaid 
                            ? "bg-amber-500 border-amber-500 text-white hover:bg-amber-600" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}>
                    Chưa trả
                </button>
                <button onClick={openAdd}
                    className="flex items-center gap-1.5 px-4 h-10 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:shadow-md transition active:scale-[0.98] shrink-0">
                    <Plus size={14} /> Thêm ngày
                </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white border border-slate-100 rounded-2xl px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.015)]">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tổng chi</p>
                    <p className="text-sm font-black text-slate-800 truncate">{fmtVND(stats.total)}</p>
                </div>
                <div onClick={() => setFilterUnpaid(!filterUnpaid)}
                    className={`border rounded-2xl px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] cursor-pointer transition active:scale-[0.98] ${
                        filterUnpaid
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "bg-white border-slate-100 hover:border-amber-200"
                    }`}>
                    <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${filterUnpaid ? "text-amber-100" : "text-amber-500"}`}>Chưa trả</p>
                    <p className={`text-sm font-black truncate ${filterUnpaid ? "text-white" : "text-amber-600"}`}>{fmtVND(stats.unpaid)}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Số ngày</p>
                    <p className="text-sm font-black text-slate-700">{stats.days}</p>
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white/50">
                    <Utensils size={30} className="opacity-20 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-400">{search ? "Không tìm thấy" : "Chưa có ngày nào"}</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map((r) => {
                        const dayTotal = MEALS.reduce((s, m) => s + (r[m.money] || 0), 0);
                        return (
                            <div key={r.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.015)] group">
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 bg-slate-50/40">
                                    <span className="text-xs font-extrabold text-slate-700">{fmtDate(r.date)}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-indigo-600 tabular-nums">{fmtVND(dayTotal)}</span>
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"><Edit2 size={12} /></button>
                                            <button onClick={() => remove(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {MEALS.map((m) => {
                                        const name = r[m.key], amt = r[m.money] || 0, paid = r[m.paid];
                                        const Icon = m.icon;
                                        const empty = !name && !amt;
                                        return (
                                            <div key={m.key} className={`flex items-center gap-3 px-4 py-2.5 ${empty ? "opacity-40" : ""}`}>
                                                <span className="flex items-center gap-1.5 w-14 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                    <Icon size={13} /> {m.label}
                                                </span>
                                                <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">{name || "—"}</span>
                                                {amt > 0 && <span className="text-xs font-bold text-slate-600 shrink-0 tabular-nums">{fmtVND(amt)}</span>}
                                                {amt > 0 && (
                                                    <button onClick={() => togglePaid(r, m)}
                                                        className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all active:scale-95 ${paid
                                                            ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                                            : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"}`}>
                                                        {paid ? "Đã trả" : "Chưa trả"}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setModal(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 border border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">{modal === "add" ? "Thêm ngày ăn uống" : "Sửa ngày ăn uống"}</h2>
                            <button onClick={() => setModal(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"><X size={16} /></button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ngày</label>
                                <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                                    className="w-full h-10 px-3.5 text-xs font-semibold border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-500 hover:border-slate-300 focus:ring-4 focus:ring-indigo-500/5 transition-all" />
                            </div>
                            {MEALS.map((m) => {
                                const Icon = m.icon;
                                return (
                                    <div key={m.key} className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            <Icon size={12} /> {m.label}
                                        </label>
                                        <div className="flex gap-2">
                                            <input value={form[m.key]} onChange={(e) => setForm((p) => ({ ...p, [m.key]: e.target.value }))}
                                                placeholder="Món..."
                                                className="flex-1 min-w-0 h-9 px-3 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50/50 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            <input type="number" value={form[m.money]} onChange={(e) => setForm((p) => ({ ...p, [m.money]: e.target.value }))}
                                                placeholder="đ"
                                                className="w-24 h-9 px-3 text-xs font-semibold text-right border border-slate-200 rounded-lg bg-slate-50/50 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            <button type="button" onClick={() => setForm((p) => ({ ...p, [m.paid]: !p[m.paid] }))}
                                                className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${form[m.paid]
                                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                                    : "bg-white border-slate-200 text-slate-300 hover:border-emerald-300"}`}
                                                title={form[m.paid] ? "Đã trả" : "Chưa trả — bấm để đánh dấu đã trả"}>
                                                <Check size={14} className="stroke-[3]" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex justify-end gap-2.5 pt-2">
                                <button onClick={() => setModal(null)} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-[0.98]">Hủy</button>
                                <button onClick={save} disabled={saving}
                                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:shadow-md transition active:scale-[0.98] disabled:opacity-60">
                                    {saving ? "Đang lưu..." : "Lưu"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
