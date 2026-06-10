import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, Flag, Loader, Search, Filter } from "lucide-react";

const API = "/api/personal/tasks";

const PRIORITY_STYLES = {
    high: { label: "Cao", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
    medium: { label: "Vừa", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
    low: { label: "Thấp", bg: "bg-green-50", text: "text-green-600", border: "border-green-200", dot: "bg-green-400" },
};

const STATUS_TABS = [
    { id: "all", label: "Tất cả" },
    { id: "pending", label: "Chờ" },
    { id: "inProgress", label: "Đang làm" },
    { id: "done", label: "Xong" },
];

const CATEGORIES = ["work", "personal", "study", "health", "other"];
const CATEGORY_LABEL = { work: "Công việc", personal: "Cá nhân", study: "Học tập", health: "Sức khỏe", other: "Khác" };

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
        if (!confirm("Xóa task này?")) return;
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
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> <span className="text-sm">Đang tải...</span>
        </div>
    );

    const counts = { all: tasks.length, pending: 0, inProgress: 0, done: 0 };
    tasks.forEach((t) => { if (t.status in counts) counts[t.status]++; });

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm công việc..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white" />
                </div>
                <button onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                    <Plus size={14} /> Thêm task
                </button>
            </div>

            {/* Add form */}
            {showForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                    <input value={form.text} onChange={(e) => setForm(p => ({ ...p, text: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addTask()}
                        placeholder="Mô tả công việc..." autoFocus
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                    <div className="flex flex-wrap gap-2">
                        <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                        </select>
                        <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                            <option value="high">Ưu tiên cao</option>
                            <option value="medium">Ưu tiên vừa</option>
                            <option value="low">Ưu tiên thấp</option>
                        </select>
                        <input type="date" value={form.due_date} onChange={(e) => setForm(p => ({ ...p, due_date: e.target.value }))}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none" />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                        <button onClick={addTask} disabled={saving}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                            {saving ? "Đang lưu..." : "Thêm"}
                        </button>
                    </div>
                </div>
            )}

            {/* Status tabs */}
            <div className="flex gap-0 border-b border-gray-100">
                {STATUS_TABS.map((s) => (
                    <button key={s.id} onClick={() => setStatusTab(s.id)}
                        className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all
                            ${statusTab === s.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                        {s.label} {counts[s.id] > 0 && <span className="ml-1 text-xs opacity-70">({counts[s.id]})</span>}
                    </button>
                ))}
            </div>

            {/* Task list */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <Check size={28} className="opacity-30" />
                    <p className="text-sm">Không có công việc nào</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
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

function TaskCard({ task, expanded, subtaskText, onToggleExpand, onStatusChange, onDelete, onSubtaskChange, onSubtaskAdd, onSubtaskToggle, onSubtaskDelete }) {
    const p = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
    const due = fmtDate(task.due_date);
    const isDone = task.status === "done";

    return (
        <div className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm ${isDone ? "opacity-60" : ""} ${p.border}`}>
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Status toggle */}
                <button onClick={() => onStatusChange(isDone ? "pending" : "done")}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                        ${isDone ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}>
                    {isDone && <Check size={11} className="text-white" />}
                </button>

                {/* Text */}
                <div className="flex-1 min-w-0" onClick={onToggleExpand} style={{ cursor: "pointer" }}>
                    <p className={`text-sm font-medium ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}>{task.text}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${p.bg} ${p.text}`}>
                            {CATEGORY_LABEL[task.category] || task.category}
                        </span>
                        <span className={`flex items-center gap-1 text-xs ${p.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} /> {p.label}
                        </span>
                        {due && (
                            <span className={`text-xs font-medium ${due.overdue ? "text-red-500" : due.today ? "text-orange-500" : "text-gray-400"}`}>
                                📅 {due.label}
                            </span>
                        )}
                        {task.subtasks?.length > 0 && (
                            <span className="text-xs text-gray-400">
                                {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length} subtask
                            </span>
                        )}
                    </div>
                </div>

                {/* Expand + delete */}
                <div className="flex items-center gap-1 shrink-0">
                    {task.subtasks?.length > 0 && (
                        <button onClick={onToggleExpand} className="p-1 text-gray-400 hover:text-gray-600">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                    <button onClick={onDelete} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Subtasks */}
            {expanded && (
                <div className="border-t border-gray-50 px-4 pb-3 pt-2 flex flex-col gap-1.5 bg-gray-50/50">
                    {task.subtasks?.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 group">
                            <button onClick={() => onSubtaskToggle(st.id)}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                                    ${st.completed ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}>
                                {st.completed && <Check size={9} className="text-white" />}
                            </button>
                            <span className={`text-xs flex-1 ${st.completed ? "line-through text-gray-400" : "text-gray-700"}`}>{st.text}</span>
                            <button onClick={() => onSubtaskDelete(st.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1">
                        <input value={subtaskText} onChange={(e) => onSubtaskChange(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && onSubtaskAdd()}
                            placeholder="Thêm subtask..."
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300" />
                        <button onClick={onSubtaskAdd} className="p-1 text-indigo-500 hover:text-indigo-700">
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Expand subtask section even if collapsed (click task row) */}
            {!expanded && task.subtasks?.length === 0 && (
                <div className="px-4 pb-2">
                    <button onClick={onToggleExpand}
                        className="text-xs text-gray-400 hover:text-indigo-500 transition-colors flex items-center gap-1">
                        <Plus size={11} /> subtask
                    </button>
                </div>
            )}
        </div>
    );
}
