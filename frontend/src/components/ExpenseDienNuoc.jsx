import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check, X, Loader } from "lucide-react";

const API_URL = "/api/expenses/diennuoc";

const ExpenseDienNuoc = ({ user, token }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [tempData, setTempData] = useState({});
    const [actionLoading, setActionLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");

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
                setRecords((prev) => prev.filter((x) => x.id !== id));
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
        <div className="py-6 px-4 bg-white rounded-2xl shadow-sm border border-black/[0.08]">
            {alertMessage && (
                <div className="mb-4 p-3 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold">
                    {alertMessage}
                </div>
            )}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Theo Dõi Điện – Nước</h2>
                <button
                    onClick={handleAddMonth}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow transition-all duration-200 disabled:opacity-50"
                >
                    <Plus size={18} />
                    Thêm tháng
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500 flex items-center justify-center gap-2">
                    <Loader className="animate-spin" />
                    <span>Đang tải dữ liệu...</span>
                </div>
            ) : records.length === 0 ? (
                <div className="text-center py-20 text-gray-500 text-lg border border-dashed rounded-xl">
                    Chưa có dữ liệu điện nước. Bấm nút "Thêm tháng" để bắt đầu.
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto border border-black/[0.08] rounded-xl">
                        <table className="w-full min-w-[1000px] bg-white text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-black/[0.08]">
                                <tr>
                                    <th className="px-4 py-3.5 text-center">#</th>
                                    <th className="px-4 py-3.5 text-center">Ngày</th>
                                    <th className="px-4 py-3.5 text-center">Nước cũ</th>
                                    <th className="px-4 py-3.5 text-center">Nước mới</th>
                                    <th className="px-4 py-3.5 text-center">Tiêu thụ (m³)</th>
                                    <th className="px-4 py-3.5 text-center">Tiền nước (8.000₫/m³)</th>
                                    <th className="px-4 py-3.5 text-center">Điện cũ</th>
                                    <th className="px-4 py-3.5 text-center">Điện mới</th>
                                    <th className="px-4 py-3.5 text-center">Tiêu thụ (kWh)</th>
                                    <th className="px-4 py-3.5 text-center">Tiền điện (3.500₫/kWh)</th>
                                    <th className="px-4 py-3.5 text-center">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[0.08]">
                                {records.map((r, i) => {
                                    const isEditing = editingId === r.id;
                                    const displayData = isEditing ? tempData : r;
                                    const waterUse = displayData.water_new - displayData.water_old;
                                    const elecUse = displayData.electric_new - displayData.electric_old;

                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50/50 transition">
                                            <td className="px-4 py-4 text-center font-semibold text-gray-500">{i + 1}</td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="date"
                                                    value={isEditing ? tempData.date : new Date(r.date).toISOString().split("T")[0]}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, date: e.target.value }));
                                                    }}
                                                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="number"
                                                    value={displayData.water_old}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, water_old: e.target.value }));
                                                    }}
                                                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-center bg-white"
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="number"
                                                    value={displayData.water_new}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, water_new: e.target.value }));
                                                    }}
                                                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-center font-bold text-blue-700 bg-white"
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center font-bold text-blue-600 bg-blue-50/30">{waterUse}</td>
                                            <td className="px-4 py-4 text-center font-bold text-blue-700 bg-blue-50/50">{(waterUse * 8000).toLocaleString()} ₫</td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="number"
                                                    value={displayData.electric_old}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, electric_old: e.target.value }));
                                                    }}
                                                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-center bg-white"
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="number"
                                                    value={displayData.electric_new}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, electric_new: e.target.value }));
                                                    }}
                                                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-center font-bold text-red-700 bg-white"
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center font-bold text-red-600 bg-red-50/30">{elecUse}</td>
                                            <td className="px-4 py-4 text-center font-bold text-red-700 bg-red-50/50">{(elecUse * 3500).toLocaleString()} ₫</td>
                                            <td className="px-4 py-4 text-center">
                                                {isEditing ? (
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            onClick={() => saveChanges(r.id)}
                                                            className="bg-green-500 hover:bg-green-600 text-white p-1.5 rounded-lg transition"
                                                            title="Lưu"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="bg-gray-400 hover:bg-gray-500 text-white p-1.5 rounded-lg transition"
                                                            title="Hủy"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDelete(r.id)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition"
                                                        title="Xóa"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
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

                            return (
                                <div key={r.id} className="p-4 bg-white shadow rounded-xl border border-black/[0.08] space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-gray-700">Ngày ghi nhận:</span>
                                        <input
                                            type="date"
                                            value={isEditing ? tempData.date : new Date(r.date).toISOString().split("T")[0]}
                                            onChange={(e) => {
                                                if (!isEditing) startEdit(r);
                                                setTempData(prev => ({ ...prev, date: e.target.value }));
                                            }}
                                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white"
                                        />
                                    </div>

                                    {/* Water Details */}
                                    <div className="bg-blue-50/30 p-3 rounded-lg border border-blue-100/50 space-y-2">
                                        <div className="text-sm font-bold text-blue-800">Nước sinh hoạt:</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-gray-500 text-xs block">Chỉ số cũ</label>
                                                <input
                                                    type="number"
                                                    value={displayData.water_old}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, water_old: e.target.value }));
                                                    }}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-center bg-white text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-gray-500 text-xs block">Chỉ số mới</label>
                                                <input
                                                    type="number"
                                                    value={displayData.water_new}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, water_new: e.target.value }));
                                                    }}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-center font-bold text-blue-700 bg-white text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-blue-800 pt-1.5 border-t border-blue-100/50">
                                            <span>Tiêu thụ: {waterUse} m³</span>
                                            <span>Tiền: {(waterUse * 8000).toLocaleString()} ₫</span>
                                        </div>
                                    </div>

                                    {/* Electricity Details */}
                                    <div className="bg-red-50/30 p-3 rounded-lg border border-red-100/50 space-y-2">
                                        <div className="text-sm font-bold text-red-800">Điện năng tiêu thụ:</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-gray-500 text-xs block">Chỉ số cũ</label>
                                                <input
                                                    type="number"
                                                    value={displayData.electric_old}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, electric_old: e.target.value }));
                                                    }}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-center bg-white text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-gray-500 text-xs block">Chỉ số mới</label>
                                                <input
                                                    type="number"
                                                    value={displayData.electric_new}
                                                    onChange={(e) => {
                                                        if (!isEditing) startEdit(r);
                                                        setTempData(prev => ({ ...prev, electric_new: e.target.value }));
                                                    }}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-center font-bold text-red-700 bg-white text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-red-800 pt-1.5 border-t border-red-100/50">
                                            <span>Tiêu thụ: {elecUse} kWh</span>
                                            <span>Tiền: {(elecUse * 3500).toLocaleString()} ₫</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex justify-end gap-2 pt-2">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => saveChanges(r.id)}
                                                    className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold"
                                                >
                                                    <Check size={14} />
                                                    Lưu
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="flex items-center gap-1 bg-gray-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold"
                                                >
                                                    <X size={14} />
                                                    Hủy
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleDelete(r.id)}
                                                className="flex items-center gap-1 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-100 transition"
                                            >
                                                <Trash2 size={14} />
                                                Xóa bản ghi
                                            </button>
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
