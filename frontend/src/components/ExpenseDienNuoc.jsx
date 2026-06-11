import React, { useState, useEffect } from "react";
import { 
    Plus, Trash2, Check, X, Loader, 
    Edit2, Zap, Droplet, Home, Calendar, 
    ChevronDown, Sparkles, FileText, Trash 
} from "lucide-react";

const API_URL = "/api/expenses/diennuoc";

const ExpenseDienNuoc = ({ user, token }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [tempData, setTempData] = useState({});
    const [actionLoading, setActionLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [selectedRecordId, setSelectedRecordId] = useState(null);

    useEffect(() => {
        if (records.length > 0 && !selectedRecordId) {
            setSelectedRecordId(records[0].id);
        }
    }, [records, selectedRecordId]);

    const showAlert = (msg) => {
        setAlertMessage(msg);
        setTimeout(() => setAlertMessage(""), 3000);
    };

    const fetchRecords = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(API_URL, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                const sorted = Array.isArray(data)
                    ? data.sort((a, b) => new Date(b.date) - new Date(a.date))
                    : [];
                setRecords(sorted);
            } else {
                console.error("Failed to fetch diennuoc records");
            }
        } catch (err) {
            console.error("Error fetching diennuoc records:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [token]);

    const handleAddMonth = async () => {
        if (actionLoading) return;
        setActionLoading(true);
        const last = records[0];
        const today = new Date().toISOString().split("T")[0];

        const newRec = {
            user_id: 0, // Placeholder, backend maps it automatically
            date: today,
            water_old: last?.water_new || 0,
            water_new: last?.water_new || 0,
            electric_old: last?.electric_new || 0,
            electric_new: last?.electric_new || 0,
        };

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(newRec),
            });

            if (res.ok) {
                const data = await res.json();
                setRecords((prev) => [data, ...prev]);
                setSelectedRecordId(data.id);
                showAlert("Thêm tháng mới thành công!");
            } else {
                showAlert("Không thể thêm tháng mới.");
            }
        } catch (err) {
            console.error(err);
            showAlert("Lỗi kết nối khi thêm tháng mới.");
        } finally {
            setActionLoading(false);
        }
    };

    const startEdit = (record) => {
        setEditingId(record.id);
        setTempData({
            date: new Date(record.date).toISOString().split("T")[0],
            water_old: record.water_old,
            water_new: record.water_new,
            electric_old: record.electric_old,
            electric_new: record.electric_new,
        });
    };

    const saveChanges = async (id) => {
        setActionLoading(true);
        const body = {
            date: tempData.date,
            water_old: Number(tempData.water_old) || 0,
            water_new: Number(tempData.water_new) || 0,
            electric_old: Number(tempData.electric_old) || 0,
            electric_new: Number(tempData.electric_new) || 0,
        };

        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setRecords((prev) =>
                    prev.map((x) => (x.id === id ? { ...x, ...body } : x))
                );
                setEditingId(null);
                setTempData({});
                showAlert("Cập nhật thành công!");
            } else {
                showAlert("Lỗi khi lưu cập nhật.");
            }
        } catch (err) {
            console.error(err);
            showAlert("Lỗi mạng khi cập nhật.");
        } finally {
            setActionLoading(false);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setTempData({});
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                setRecords((prev) => {
                    const next = prev.filter((x) => x.id !== id);
                    if (selectedRecordId === id) {
                        setSelectedRecordId(next[0]?.id || null);
                    }
                    return next;
                });
                showAlert("Xóa bản ghi thành công!");
            } else {
                showAlert("Lỗi khi xóa bản ghi.");
            }
        } catch (err) {
            console.error(err);
            showAlert("Lỗi mạng khi xóa.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="py-6 px-4 bg-white rounded-3xl shadow-[0_4px_30px_rgba(0,0,0,0.015)] border border-slate-100/80">
            {alertMessage && (
                <div className="mb-6 p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100/50 text-blue-800 text-sm font-bold flex items-center gap-2 animate-fadeIn">
                    <Sparkles size={16} className="text-blue-500 shrink-0" />
                    <span>{alertMessage}</span>
                </div>
            )}

            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                        <Home size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Tiền nhà</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Quản lý hóa đơn sinh hoạt</p>
                    </div>
                </div>
                <button
                    onClick={handleAddMonth}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-2xl font-bold shadow-md shadow-emerald-500/15 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                    <Plus size={18} strokeWidth={2.5} />
                    <span>Thêm tháng</span>
                </button>
            </div>

            {/* Khung hóa đơn chi tiết tháng tương tự Excel */}
            {!loading && records.length > 0 && (() => {
                const selectedRec = records.find(r => r.id === selectedRecordId) || records[0];
                if (!selectedRec) return null;

                const waterUse = selectedRec.water_new - selectedRec.water_old;
                const waterBill = waterUse * 8000;
                const elecUse = selectedRec.electric_new - selectedRec.electric_old;
                const elecBill = elecUse * 3500;
                const houseRent = 1300000;
                const garbageFee = 10000;
                const totalPrice = houseRent + elecBill + waterBill + garbageFee;
                const totalUnitPrice = 1300000 + 3500 + 8000 + 10000;
                const dateObj = new Date(selectedRec.date);

                return (
                    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-[0_20px_50px_rgba(99,102,241,0.04)] space-y-5 max-w-3xl mx-auto my-6 hover:shadow-[0_20px_50px_rgba(99,102,241,0.06)] transition-all duration-300">
                        <div className="flex justify-between items-center pb-3.5 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mr-1">Chi tiết phiếu</span>
                                
                                <div className="relative inline-flex items-center">
                                    <Calendar size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
                                    <select 
                                        value={selectedRecordId || ""} 
                                        onChange={e => setSelectedRecordId(Number(e.target.value))}
                                        className="text-xs font-black border border-slate-200/80 hover:border-slate-300 bg-slate-50/80 hover:bg-white text-slate-700 rounded-xl pl-8 pr-8 py-1.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer appearance-none shadow-sm"
                                    >
                                        {records.map(r => {
                                            const d = new Date(r.date);
                                            return <option key={r.id} value={r.id}>{`Tháng ${d.getMonth() + 1}/${d.getFullYear()}`}</option>;
                                        })}
                                    </select>
                                    <ChevronDown size={13} className="absolute right-2.5 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
                                <FileText size={11} className="text-slate-400" />
                                <span>Ngày lập: {dateObj.toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>

                        <div className="overflow-hidden border border-slate-100 rounded-2xl">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                                        <th className="px-4 py-3 text-left w-44">Khoản thanh toán</th>
                                        <th className="px-4 py-3 text-center">Số mới</th>
                                        <th className="px-4 py-3 text-center">Số cũ</th>
                                        <th className="px-4 py-3 text-center">Tiêu thụ</th>
                                        <th className="px-4 py-3 text-right">Đơn giá</th>
                                        <th className="px-4 py-3 text-right">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                    <tr className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                                    <Home size={14} />
                                                </span>
                                                <span className="font-bold text-slate-700">Tiền nhà</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-right font-mono text-slate-500">{houseRent.toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right font-bold font-mono text-slate-800">{houseRent.toLocaleString()} ₫</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                                                    <Zap size={14} />
                                                </span>
                                                <span className="font-bold text-slate-700">Tiền điện</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-md font-mono text-[11px] font-bold">{selectedRec.electric_new}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-slate-400 font-mono">{selectedRec.electric_old}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="px-2 py-0.5 bg-amber-50/60 text-amber-800 rounded-lg font-bold font-mono text-[11px]">{elecUse} kWh</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-mono text-slate-500">3,500</td>
                                        <td className="px-4 py-3.5 text-right font-bold font-mono text-slate-800">{elecBill.toLocaleString()} ₫</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                                    <Droplet size={14} />
                                                </span>
                                                <span className="font-bold text-slate-700">Tiền nước</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-md font-mono text-[11px] font-bold">{selectedRec.water_new}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-slate-400 font-mono">{selectedRec.water_old}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="px-2 py-0.5 bg-blue-50/60 text-blue-800 rounded-lg font-bold font-mono text-[11px]">{waterUse} m³</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-mono text-slate-500">8,000</td>
                                        <td className="px-4 py-3.5 text-right font-bold font-mono text-slate-800">{waterBill.toLocaleString()} ₫</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                                                    <Trash size={14} />
                                                </span>
                                                <span className="font-bold text-slate-700">Rác</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-center text-slate-300">—</td>
                                        <td className="px-4 py-3.5 text-right font-mono text-slate-500">{garbageFee.toLocaleString()}</td>
                                        <td className="px-4 py-3.5 text-right font-bold font-mono text-slate-800">{garbageFee.toLocaleString()} ₫</td>
                                    </tr>
                                    <tr className="bg-gradient-to-r from-slate-50 to-indigo-50/30 font-bold text-slate-800 border-t border-slate-200">
                                        <td className="px-4 py-4 uppercase tracking-wider text-[10px] font-extrabold text-indigo-700">Tổng cộng phải trả</td>
                                        <td className="px-4 py-4 text-center text-slate-300">—</td>
                                        <td className="px-4 py-4 text-center text-slate-300">—</td>
                                        <td className="px-4 py-4 text-center text-slate-300">—</td>
                                        <td className="px-4 py-4 text-right font-mono text-slate-500 font-semibold">{totalUnitPrice.toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right">
                                            <span className="inline-flex bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl px-4 py-1.5 text-[13px] font-black shadow-md shadow-indigo-600/15 font-mono">
                                                {totalPrice.toLocaleString()} ₫
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {loading ? (
                <div className="text-center py-20 text-slate-400 flex items-center justify-center gap-2">
                    <Loader className="animate-spin text-indigo-500" />
                    <span className="font-medium text-sm">Đang tải dữ liệu...</span>
                </div>
            ) : records.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/40">
                    Chưa có dữ liệu điện nước. Bấm nút "Thêm tháng" để bắt đầu.
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto border border-slate-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                        <table className="w-full min-w-[1000px] bg-white text-xs text-left">
                            <thead>
                                <tr className="border-b border-slate-100 uppercase tracking-wider text-[9px] font-extrabold select-none">
                                    <th className="px-3 py-4 text-center bg-slate-50 text-slate-400 w-10">#</th>
                                    <th className="px-3 py-4 text-center bg-slate-50 text-slate-400 w-28">Ngày ghi</th>
                                    
                                    {/* Nhóm Nước */}
                                    <th className="px-3 py-4 text-center bg-blue-50/40 text-blue-700 w-20">Nước cũ</th>
                                    <th className="px-3 py-4 text-center bg-blue-50/40 text-blue-700 w-20">Nước mới</th>
                                    <th className="px-3 py-4 text-center bg-blue-50/60 text-blue-800 w-24">Tiêu thụ (m³)</th>
                                    <th className="px-3 py-4 text-center bg-blue-50/40 text-blue-700 w-32">Tiền nước (8K/m³)</th>
                                    
                                    {/* Nhóm Điện */}
                                    <th className="px-3 py-4 text-center bg-amber-50/40 text-amber-700 w-20">Điện cũ</th>
                                    <th className="px-3 py-4 text-center bg-amber-50/40 text-amber-700 w-20">Điện mới</th>
                                    <th className="px-3 py-4 text-center bg-amber-50/60 text-amber-800 w-24">Tiêu thụ (kWh)</th>
                                    <th className="px-3 py-4 text-center bg-amber-50/40 text-amber-700 w-32">Tiền điện (3.5K/kWh)</th>
                                    
                                    <th className="px-3 py-4 text-center bg-indigo-50/40 text-indigo-700 w-40">Tổng trả (+ Nhà & Rác)</th>
                                    <th className="px-3 py-4 text-center bg-slate-50 text-slate-400 w-28">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                {records.map((r, i) => {
                                    const isEditing = editingId === r.id;
                                    const displayData = isEditing ? tempData : r;
                                    const waterUse = displayData.water_new - displayData.water_old;
                                    const elecUse = displayData.electric_new - displayData.electric_old;
                                    const waterPrice = waterUse * 8000;
                                    const elecPrice = elecUse * 3500;
                                    const total = waterPrice + elecPrice + 1300000 + 10000;

                                    return (
                                        <tr key={r.id} className="hover:bg-slate-50/20 transition-colors">
                                            <td className="px-3 py-3.5 text-center font-bold text-slate-300 font-mono">{i + 1}</td>
                                            
                                            {/* Ngày ghi */}
                                            <td className="px-3 py-3.5 text-center font-mono">
                                                {isEditing ? (
                                                    <input
                                                        type="date"
                                                        value={tempData.date}
                                                        onChange={(e) => setTempData(prev => ({ ...prev, date: e.target.value }))}
                                                        className="w-full border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-2.5 py-1 text-center font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                    />
                                                ) : (
                                                    <div className="inline-flex items-center gap-1 text-slate-500 justify-center">
                                                        <Calendar size={12} className="text-slate-400" />
                                                        <span>{new Date(r.date).toLocaleDateString('vi-VN')}</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Nước cũ */}
                                            <td className="px-3 py-3.5 text-center font-mono">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={tempData.water_old}
                                                        onChange={(e) => setTempData(prev => ({ ...prev, water_old: e.target.value }))}
                                                        className="w-16 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-1.5 py-1 text-center focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                    />
                                                ) : (
                                                    <span className="text-slate-400">{r.water_old}</span>
                                                )}
                                            </td>

                                            {/* Nước mới */}
                                            <td className="px-3 py-3.5 text-center font-mono">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={tempData.water_new}
                                                        onChange={(e) => setTempData(prev => ({ ...prev, water_new: e.target.value }))}
                                                        className="w-16 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-1.5 py-1 text-center font-bold text-blue-600 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                    />
                                                ) : (
                                                    <span className="font-bold text-slate-700">{r.water_new}</span>
                                                )}
                                            </td>

                                            {/* Tiêu thụ Nước */}
                                            <td className="px-3 py-3.5 text-center bg-blue-50/10">
                                                <span className="inline-block bg-blue-50/70 text-blue-700 font-extrabold px-2.5 py-0.5 rounded-lg font-mono text-[11px]">{waterUse} m³</span>
                                            </td>

                                            {/* Tiền nước */}
                                            <td className="px-3 py-3.5 text-right font-bold font-mono text-slate-700 bg-blue-50/20 pr-5">
                                                {waterPrice.toLocaleString()} ₫
                                            </td>

                                            {/* Điện cũ */}
                                            <td className="px-3 py-3.5 text-center font-mono">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={tempData.electric_old}
                                                        onChange={(e) => setTempData(prev => ({ ...prev, electric_old: e.target.value }))}
                                                        className="w-16 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-1.5 py-1 text-center focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                    />
                                                ) : (
                                                    <span className="text-slate-400">{r.electric_old}</span>
                                                )}
                                            </td>

                                            {/* Điện mới */}
                                            <td className="px-3 py-3.5 text-center font-mono">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={tempData.electric_new}
                                                        onChange={(e) => setTempData(prev => ({ ...prev, electric_new: e.target.value }))}
                                                        className="w-16 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-1.5 py-1 text-center font-bold text-amber-600 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                    />
                                                ) : (
                                                    <span className="font-bold text-slate-700">{r.electric_new}</span>
                                                )}
                                            </td>

                                            {/* Tiêu thụ Điện */}
                                            <td className="px-3 py-3.5 text-center bg-amber-50/10">
                                                <span className="inline-block bg-amber-50/70 text-amber-700 font-extrabold px-2.5 py-0.5 rounded-lg font-mono text-[11px]">{elecUse} kWh</span>
                                            </td>

                                            {/* Tiền điện */}
                                            <td className="px-3 py-3.5 text-right font-bold font-mono text-slate-700 bg-amber-50/20 pr-5">
                                                {elecPrice.toLocaleString()} ₫
                                            </td>

                                            {/* Tổng phải trả */}
                                            <td className="px-3 py-3.5 text-center bg-indigo-50/20">
                                                <span className="inline-block bg-indigo-50 text-indigo-700 font-black px-3.5 py-1 rounded-xl font-mono text-xs">
                                                    {total.toLocaleString()} ₫
                                                </span>
                                            </td>

                                            {/* Hành động */}
                                            <td className="px-3 py-3.5 text-center">
                                                {isEditing ? (
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            onClick={() => saveChanges(r.id)}
                                                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-1.5 rounded-lg transition-all shadow-sm shadow-emerald-500/20 cursor-pointer border-0"
                                                            title="Lưu"
                                                        >
                                                            <Check size={14} strokeWidth={2.5} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="bg-slate-400 hover:bg-slate-500 text-white p-1.5 rounded-lg transition-all cursor-pointer border-0"
                                                            title="Hủy"
                                                        >
                                                            <X size={14} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1 justify-center">
                                                        <button
                                                            onClick={() => startEdit(r)}
                                                            className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all cursor-pointer border-0"
                                                            title="Sửa"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(r.id)}
                                                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all cursor-pointer border-0"
                                                            title="Xóa"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-4">
                        {records.map((r) => {
                            const isEditing = editingId === r.id;
                            const displayData = isEditing ? tempData : r;
                            const waterUse = displayData.water_new - displayData.water_old;
                            const elecUse = displayData.electric_new - displayData.electric_old;
                            const waterPrice = waterUse * 8000;
                            const elecPrice = elecUse * 3500;
                            const total = waterPrice + elecPrice + 1300000 + 10000;

                            return (
                                <div key={r.id} className="p-4 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.015)] rounded-2xl border border-slate-100 space-y-3.5 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                        {isEditing ? (
                                            <div className="flex flex-col gap-1 w-full">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ngày ghi nhận</label>
                                                <input
                                                    type="date"
                                                    value={tempData.date}
                                                    onChange={(e) => setTempData(prev => ({ ...prev, date: e.target.value }))}
                                                    className="border border-slate-200 bg-slate-50 focus:bg-white rounded-xl px-2.5 py-1 text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-mono"
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-1.5 text-slate-700 font-black text-sm">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    <span>Tháng {new Date(r.date).getMonth() + 1}/{new Date(r.date).getFullYear()}</span>
                                                </div>
                                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                                                    {new Date(r.date).toLocaleDateString('vi-VN')}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Water Details */}
                                    <div className="bg-blue-50/20 p-3 rounded-xl border border-blue-50/50 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold text-blue-800">
                                            <span className="flex items-center gap-1.5"><Droplet size={13} /> Nước sinh hoạt</span>
                                            <span className="font-mono bg-blue-100/70 text-blue-700 px-2 py-0.5 rounded-lg text-[10px] font-bold">{waterUse} m³</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-xs font-medium font-mono pt-1">
                                            {isEditing ? (
                                                <>
                                                    <div>
                                                        <label className="text-slate-400 text-[10px] font-bold block mb-1">Chỉ số cũ</label>
                                                        <input
                                                            type="number"
                                                            value={tempData.water_old}
                                                            onChange={(e) => setTempData(prev => ({ ...prev, water_old: e.target.value }))}
                                                            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-2 py-1 text-center text-xs font-mono font-semibold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-slate-400 text-[10px] font-bold block mb-1">Chỉ số mới</label>
                                                        <input
                                                            type="number"
                                                            value={tempData.water_new}
                                                            onChange={(e) => setTempData(prev => ({ ...prev, water_new: e.target.value }))}
                                                            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-2 py-1 text-center font-bold text-blue-600 focus:outline-none text-xs font-mono"
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-slate-500">Chỉ số cũ: <span className="text-slate-700 font-bold">{r.water_old}</span></div>
                                                    <div className="text-right text-slate-500">Chỉ số mới: <span className="text-blue-600 font-bold">{r.water_new}</span></div>
                                                </>
                                            )}
                                        </div>
                                        {!isEditing && (
                                            <div className="flex justify-between text-xs font-bold text-blue-900 pt-1.5 border-t border-blue-100/40 font-mono">
                                                <span className="font-sans font-medium text-slate-400 text-[10px]">Đơn giá: 8,000 ₫</span>
                                                <span>{waterPrice.toLocaleString()} ₫</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Electricity Details */}
                                    <div className="bg-amber-50/20 p-3 rounded-xl border border-amber-50/50 space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold text-amber-800">
                                            <span className="flex items-center gap-1.5"><Zap size={13} /> Điện năng tiêu thụ</span>
                                            <span className="font-mono bg-amber-100/70 text-amber-700 px-2 py-0.5 rounded-lg text-[10px] font-bold">{elecUse} kWh</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-xs font-medium font-mono pt-1">
                                            {isEditing ? (
                                                <>
                                                    <div>
                                                        <label className="text-slate-400 text-[10px] font-bold block mb-1">Chỉ số cũ</label>
                                                        <input
                                                            type="number"
                                                            value={tempData.electric_old}
                                                            onChange={(e) => setTempData(prev => ({ ...prev, electric_old: e.target.value }))}
                                                            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-2 py-1 text-center text-xs font-mono font-semibold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-slate-400 text-[10px] font-bold block mb-1">Chỉ số mới</label>
                                                        <input
                                                            type="number"
                                                            value={tempData.electric_new}
                                                            onChange={(e) => setTempData(prev => ({ ...prev, electric_new: e.target.value }))}
                                                            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-2 py-1 text-center font-bold text-amber-600 focus:outline-none text-xs font-mono"
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-slate-500">Chỉ số cũ: <span className="text-slate-700 font-bold">{r.electric_old}</span></div>
                                                    <div className="text-right text-slate-500">Chỉ số mới: <span className="text-amber-600 font-bold">{r.electric_new}</span></div>
                                                </>
                                            )}
                                        </div>
                                        {!isEditing && (
                                            <div className="flex justify-between text-xs font-bold text-amber-900 pt-1.5 border-t border-amber-100/40 font-mono">
                                                <span className="font-sans font-medium text-slate-400 text-[10px]">Đơn giá: 3,500 ₫</span>
                                                <span>{elecPrice.toLocaleString()} ₫</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Total Bill section */}
                                    <div className="bg-indigo-50/40 p-3 rounded-xl border border-indigo-50 space-y-1">
                                        <div className="flex justify-between items-center text-sm font-black text-indigo-900">
                                            <span>Tổng tiền phải trả:</span>
                                            <span className="text-indigo-600 font-black font-mono text-[15px]">{total.toLocaleString()} ₫</span>
                                        </div>
                                        <p className="text-[9px] text-indigo-500/80 font-bold tracking-tight">
                                            (Đã gồm: Tiền nhà 1.300.000₫ & Rác 10.000₫)
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex justify-end gap-2 pt-1 border-t border-slate-100/50">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => saveChanges(r.id)}
                                                    className="flex items-center justify-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-600 transition border-0"
                                                >
                                                    <Check size={14} strokeWidth={2.5} />
                                                    Lưu
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition border-0"
                                                >
                                                    <X size={14} strokeWidth={2.5} />
                                                    Hủy
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => startEdit(r)}
                                                    className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition border-0"
                                                >
                                                    <Edit2 size={13} />
                                                    Sửa
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(r.id)}
                                                    className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition border-0"
                                                >
                                                    <Trash2 size={13} />
                                                    Xóa
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default ExpenseDienNuoc;
