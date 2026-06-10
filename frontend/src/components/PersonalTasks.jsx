import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, Loader, Search, Calendar as CalendarIcon } from "lucide-react";

const API = "/api/personal/tasks";

const PRIORITY_STYLES = {
    high: { label: "Cao", text: "text-rose-600", dot: "bg-rose-500", ring: "ring-rose-200/60", accent: "from-rose-500 to-rose-400" },
    medium: { label: "Vừa", text: "text-amber-600", dot: "bg-amber-400", ring: "ring-amber-200/60", accent: "from-amber-400 to-amber-300" },
    low: { label: "Thấp", text: "text-emerald-600", dot: "bg-emerald-400", ring: "ring-emerald-200/60", accent: "from-emerald-400 to-emerald-300" },
};

const STATUS_TABS = [
    { id: "all", label: "Tất cả" },
    { id: "pending", label: "Chờ" },
    { id: "inProgress", label: "Đang làm" },
    { id: "done", label: "Xong" },
];

const CATEGORIES = ["work", "personal", "study", "health", "other"];
const CATEGORY_LABEL = { work: "Công việc", personal: "Cá nhân", study: "Học tập", health: "Sức khỏe", other: "Khác" };
const CATEGORY_TINT = {
    work: "bg-indigo-50 text-indigo-600",
    personal: "bg-violet-50 text-violet-600",
    study: "bg-sky-50 text-sky-600",
    health: "bg-emerald-50 text-emerald-600",
    other: "bg-slate-100 text-slate-600",
};

const authHeaders = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

const fmtDate = (d) => {
    if (!d) return null;
    const dt = new Date(d), now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.floor((dt - today) / 86400000);
    if (diff < 0) return { label: `Quá hạn ${-diff}d`, overdue: true };
    if (diff === 0) return { label: "Hôm nay", today: true };
    if (diff === 1) return { label: "Ngày mai", soon: true };
    return { label: dt.toLocaleDateString("vi-VN") };
};

const inputCls = "w-full h-10 px-3.5 text-[12px] font-semibold border border-slate-200/80 rounded-xl bg-white/80 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/8 hover:border-slate-300 transition-all placeholder:text-slate-400";

export default function PersonalTasks({ token }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusTab, setStatusTab] = useState("all");
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ text: "", category: "work", priority: "medium", due_date: "", assignee: "" });
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState({});
    const [newSubtask, setNewSubtask] = useState({});

    const headers = authHeaders(token);

    const load = useCallback(async () => {
        try {
            const data = await fetch(API, { headers }).then((r) => r.json());
            setTasks(Array.isArray(data) ? data : []);
        } finally { setLoading(false); }
    }, [token]);

    useEffect(() => { if (token) load(); }, [load]);

    const filtered = tasks.filter((t) => {
        const matchStatus = statusTab === "all" || t.status === statusTab;
        const q = search.toLowerCase();
        const matchQ = !q || t.text.toLowerCase().includes(q);
        return matchStatus && matchQ;
    });

    const addTask = async () => {
        if (!form.text.trim()) return;
        setSaving(true);
        try {
            const r = await fetch(API, { method: "POST", headers, body: JSON.stringify(form) });
            const data = await r.json();
            setTasks((p) => [data, ...p]);
            setForm({ text: "", category: "work", priority: "medium", due_date: "", assignee: "" });
            setShowForm(false);
        } finally { setSaving(false); }
    };

    const updateStatus = async (id, status) => {
        const r = await fetch(`${API}/${id}`, { method: "PUT", headers, body: JSON.stringify({ status }) });
        const data = await r.json();
        setTasks((p) => p.map((t) => t.id === id ? data : t));
    };

    const deleteTask = async (id) => {
        if (!confirm("Xóa công việc này?")) return;
        await fetch(`${API}/${id}`, { method: "DELETE", headers });
        setTasks((p) => p.filter((t) => t.id !== id));
    };

    const addSubtask = async (taskId, text) => {
        if (!text.trim()) return;
        const r = await fetch(`${API}/${taskId}/subtasks`, { method: "POST", headers, body: JSON.stringify({ text }) });
        const data = await r.json();
        setTasks((p) => p.map((t) => t.id === taskId ? data : t));
        setNewSubtask((p) => ({ ...p, [taskId]: "" }));
    };

    const toggleSubtask = async (taskId, stId) => {
        const r = await fetch(`${API}/${taskId}/subtasks/${stId}/toggle`, { method: "PUT", headers });
        const data = await r.json();
        setTasks((p) => p.map((t) => t.id === taskId ? data : t));
    };

    const deleteSubtask = async (taskId, stId) => {
        await fetch(`${API}/${taskId}/subtasks/${stId}`, { method: "DELETE", headers });
        setTasks((p) => p.map((t) =>
            t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== stId) } : t
        ));
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
            <Loader size={16} className="animate-spin" />
            <span className="text-xs font-semibold">Đang tải...</span>
        </div>
    );

    const counts = { all: tasks.length, pending: 0, inProgress: 0, done: 0 };
    tasks.forEach((t) => { if (t.status in counts) counts[t.status]++; });

    return (
        <div className="flex flex-col gap-5">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm công việc..."
                        className="w-full h-10 pl-10 pr-3 text-[12px] font-semibold border border-slate-200/80 rounded-xl bg-white/70 backdrop-blur focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/8 hover:border-slate-300 transition-all placeholder:text-slate-400" />
                </div>
                <button onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1.5 px-4 h-10 text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_16px_-2px_rgba(99,102,241,0.5)] hover:from-indigo-600 hover:to-indigo-700 transition-all active:scale-[0.97] shrink-0">
                    <Plus size={14} strokeWidth={3} /> {showForm ? "Đóng form" : "Thêm công việc"}
                </button>
            </div>

            {/* Add form */}
            {showForm && (
                <div className="bg-white/80 backdrop-blur border border-slate-200/60 rounded-2xl p-5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.08)] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Field label="Nội dung công việc">
                        <input value={form.text} onChange={(e) => setForm(p => ({ ...p, text: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addTask()}
                            placeholder="Mô tả công việc cần làm..." autoFocus className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Phân loại">
                            <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                                className={`${inputCls} bg-white`}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                            </select>
                        </Field>
                        <Field label="Độ ưu tiên">
                            <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                                className={`${inputCls} bg-white`}>
                                <option value="high">Ưu tiên cao</option>
                                <option value="medium">Ưu tiên vừa</option>
                                <option value="low">Ưu tiên thấp</option>
                            </select>
                        </Field>
                        <Field label="Hạn chót">
                            <input type="date" value={form.due_date} onChange={(e) => setForm(p => ({ ...p, due_date: e.target.value }))}
                                className={`${inputCls} bg-white`} />
                        </Field>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[12px] font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-[0.97]">Hủy</button>
                        <button onClick={addTask} disabled={saving}
                            className="px-4 py-2 text-[12px] font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_16px_-2px_rgba(99,102,241,0.5)] hover:from-indigo-600 hover:to-indigo-700 transition active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed">
                            {saving ? "Đang lưu..." : "Thêm công việc"}
                        </button>
                    </div>
                </div>
            )}

            {/* Status tabs */}
            <div className="inline-flex p-1 bg-slate-100/80 backdrop-blur rounded-xl select-none overflow-x-auto no-scrollbar gap-0.5 ring-1 ring-slate-200/40 max-w-fit">
                {STATUS_TABS.map((s) => {
                    const isActive = statusTab === s.id;
                    return (
                        <button key={s.id} onClick={() => setStatusTab(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-200 select-none cursor-pointer
                                ${isActive
                                    ? "bg-white text-indigo-600 shadow-[0_2px_8px_-2px_rgba(99,102,241,0.25)] ring-1 ring-indigo-100"
                                    : "text-slate-500 hover:text-slate-800 hover:bg-white/60"}`}>
                            {s.label}
                            {counts[s.id] > 0 && (
                                <span className={`text-[10px] tabular-nums px-1.5 rounded-md ${isActive ? "bg-indigo-50 text-indigo-500" : "bg-slate-200/60 text-slate-500"}`}>
                                    {counts[s.id]}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Task list */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3 border border-dashed border-slate-200 rounded-3xl bg-white/40 backdrop-blur">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100/60 flex items-center justify-center">
                        <Check size={24} className="text-slate-300" strokeWidth={2} />
                    </div>
                    <p className="text-xs font-semibold">Không có công việc nào</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {filtered.map((task) => (
                        <TaskCard
                            key={task.id} task={task}
                            expanded={expanded[task.id]}
                            subtaskText={newSubtask[task.id] || ""}
                            onToggleExpand={() => setExpanded(p => ({ ...p, [task.id]: !p[task.id] }))}
                            onStatusChange={(s) => updateStatus(task.id, s)}
                            onDelete={() => deleteTask(task.id)}
                            onSubtaskChange={(v) => setNewSubtask(p => ({ ...p, [task.id]: v }))}
                            onSubtaskAdd={() => addSubtask(task.id, newSubtask[task.id] || "")}
                            onSubtaskToggle={(stId) => toggleSubtask(task.id, stId)}
                            onSubtaskDelete={(stId) => deleteSubtask(task.id, stId)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</label>
            {children}
        </div>
    );
}

function TaskCard({ task, expanded, subtaskText, onToggleExpand, onStatusChange, onDelete, onSubtaskChange, onSubtaskAdd, onSubtaskToggle, onSubtaskDelete }) {
    const p = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
    const due = fmtDate(task.due_date);
    const isDone = task.status === "done";
    const subDone = task.subtasks?.filter(s => s.completed).length || 0;
    const subTotal = task.subtasks?.length || 0;
    const catTint = CATEGORY_TINT[task.category] || CATEGORY_TINT.other;

    return (
        <div className={`relative bg-white/80 backdrop-blur border border-slate-200/60 hover:border-slate-300/80 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_10px_30px_-12px_rgba(15,23,42,0.1)] ${isDone ? "opacity-60" : ""}`}>
            {/* priority accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${p.accent}`} />

            <div className="flex items-center gap-3 pl-4 pr-3 py-3.5">
                {/* checkbox */}
                <button onClick={() => onStatusChange(isDone ? "pending" : "done")}
                    className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 active:scale-90 cursor-pointer
                        ${isDone
                            ? "bg-emerald-500 border-emerald-500 ring-4 ring-emerald-100"
                            : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50 hover:ring-4 hover:ring-emerald-100/40"}`}>
                    {isDone && <Check size={12} className="text-white stroke-[3.5]" />}
                </button>

                {/* text + meta */}
                <div className="flex-1 min-w-0 py-0.5" onClick={onToggleExpand} style={{ cursor: "pointer" }}>
                    <p className={`text-[13px] font-bold tracking-tight leading-snug ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>
                        {task.text}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${catTint}`}>
                            {CATEGORY_LABEL[task.category] || task.category}
                        </span>
                        <span className={`flex items-center gap-1 text-[10px] font-bold ${p.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} /> {p.label}
                        </span>
                        {due && (
                            <span className={`flex items-center gap-1 text-[10px] font-semibold tabular-nums
                                ${due.overdue ? "text-rose-500" : due.today ? "text-orange-500" : due.soon ? "text-amber-500" : "text-slate-400"}`}>
                                <CalendarIcon size={10} strokeWidth={2.5} /> {due.label}
                            </span>
                        )}
                        {subTotal > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded-md tabular-nums">
                                {subDone}/{subTotal}
                            </span>
                        )}
                    </div>
                </div>

                {/* actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                    {subTotal > 0 && (
                        <button onClick={onToggleExpand} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                    <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Subtasks */}
            {expanded && (
                <div className="border-t border-slate-100 px-4 pb-3.5 pt-3 flex flex-col gap-2 bg-slate-50/40">
                    {task.subtasks?.map((st) => (
                        <div key={st.id} className="flex items-center gap-2.5 group pl-2">
                            <button onClick={() => onSubtaskToggle(st.id)}
                                className={`w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer
                                    ${st.completed
                                        ? "bg-emerald-500 border-emerald-500"
                                        : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50"}`}>
                                {st.completed && <Check size={9} className="text-white stroke-[3.5]" />}
                            </button>
                            <span className={`text-[12px] font-semibold flex-1 ${st.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                                {st.text}
                            </span>
                            <button onClick={() => onSubtaskDelete(st.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all">
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1 pl-2">
                        <input value={subtaskText} onChange={(e) => onSubtaskChange(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && onSubtaskAdd()}
                            placeholder="Thêm subtask..."
                            className="flex-1 h-8 px-3 text-[11.5px] font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/8 hover:border-slate-300 transition-all placeholder:text-slate-400" />
                        <button onClick={onSubtaskAdd} className="p-1.5 text-indigo-500 hover:text-white hover:bg-indigo-500 rounded-lg transition-all">
                            <Plus size={13} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            )}

            {/* hint to add first subtask */}
            {!expanded && subTotal === 0 && (
                <div className="px-4 pb-3 pl-14">
                    <button onClick={onToggleExpand}
                        className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1">
                        <Plus size={10} strokeWidth={3} /> Thêm subtask
                    </button>
                </div>
            )}
        </div>
    );
}
