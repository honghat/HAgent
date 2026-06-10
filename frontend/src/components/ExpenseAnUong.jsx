import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader } from "lucide-react";

const API_URL = "/api/expenses/anuong";

const getWeekdayVN = (dateStr) => {
    const date = new Date(dateStr);
    const day = date.getDay(); // 0=CN, 6=Thứ 7
    const map = [
        "Chủ nhật",
        "Thứ hai",
        "Thứ ba",
        "Thứ tư",
        "Thứ năm",
        "Thứ sáu",
        "Thứ bảy"
    ];
    return map[day];
};

const ExpenseAnUong = ({ user, token }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");

    const debounceRef = useRef(null);

    const debounceUpdate = (callback, delay = 500) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(callback, delay);
    };

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
            }
        } catch (err) {
            console.error("Error fetching food records:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [token]);

    const handleAddDay = async () => {
        if (actionLoading) return;
        setActionLoading(true);
        const today = new Date().toISOString().split("T")[0];

        const newRec = {
            user_id: 0, // Backend overrides this
            date: today,
            sang: "",
            tien_sang: 0,
            sang_paid: false,
            trua: "",
            tien_trua: 0,
            trua_paid: false,
            toi: "",
            tien_toi: 0,
            toi_paid: false
        };

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(newRec)
            });

            if (res.ok) {
                const created = await res.json();
                setRecords((prev) => [created, ...prev]);
                showAlert("Đã thêm ngày ăn uống mới!");
            } else {
                showAlert("Không thể thêm ngày mới.");
            }
        } catch (err) {
            console.error(err);
            showAlert("Lỗi mạng khi thêm ngày.");
        } finally {
            setActionLoading(false);
        }
    };

    const updateField = async (id, field, value) => {
        // Optimistically update the UI to avoid lag
        setRecords(prev =>
            prev.map(r => (r.id === id ? { ...r, [field]: value } : r))
        );

        let finalValue = value;
        if (typeof value === "boolean") {
            finalValue = value;
        } else if (field === "date") {
            finalValue = value;
        } else if (["tien_sang", "tien_trua", "tien_toi"].includes(field)) {
            finalValue = parseFloat(value) || 0;
        } else {
            finalValue = value?.toString() || "";
        }

        try {
            const currentRecord = records.find(r => r.id === id);
            if (!currentRecord) return;

            const payload = {
                date: currentRecord.date,
                sang: currentRecord.sang || "",
                tien_sang: currentRecord.tien_sang || 0,
                sang_paid: currentRecord.sang_paid || false,
                trua: currentRecord.trua || "",
                tien_trua: currentRecord.tien_trua || 0,
                trua_paid: currentRecord.trua_paid || false,
                toi: currentRecord.toi || "",
                tien_toi: currentRecord.tien_toi || 0,
                toi_paid: currentRecord.toi_paid || false,
                [field]: finalValue
            };

            const res = await fetch(`${API_URL}/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                console.error("Failed to sync food field:", field);
                // Revert or refresh on failure
                fetchRecords();
            }
        } catch (err) {
            console.error("Network error on food field sync:", err);
            fetchRecords();
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Bạn có chắc muốn xóa ngày theo dõi này?")) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                setRecords(prev => prev.filter(r => r.id !== id));
                showAlert("Xóa thành công!");
            } else {
                showAlert("Không thể xóa bản ghi.");
            }
        } catch (err) {
            console.error(err);
            showAlert("Lỗi mạng khi xóa.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-black/[0.08]">
            {alertMessage && (
                <div className="mb-4 p-3 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold">
                    {alertMessage}
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Theo Dõi Ăn Uống</h2>
                <button
                    onClick={handleAddDay}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white px-5 py-2.5 rounded-xl font-bold shadow transition disabled:opacity-50"
                >
                    <Plus size={18} />
                    Thêm ngày
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500 flex items-center justify-center gap-2">
                    <Loader className="animate-spin" />
                    <span>Đang tải lịch sử ăn uống...</span>
                </div>
            ) : records.length === 0 ? (
                <div className="text-center py-20 text-gray-500 text-lg border border-dashed rounded-xl">
                    Chưa có nhật ký ăn uống. Hãy click "+ Thêm ngày" để tạo mới.
                </div>
            ) : (
                <>
                    {/* Desktop Table View */}
                    <div className="hidden lg:block overflow-x-auto border border-black/[0.08] rounded-xl shadow-sm">
                        <table className="w-full min-w-[1100px] text-sm text-left bg-white">
                            <thead className="bg-sky-50 text-gray-800 font-semibold border-b border-black/[0.08]">
                                <tr>
                                    <th className="p-3 w-24 text-center">Thứ</th>
                                    <th className="p-3 w-40 text-center">Ngày</th>
                                    <th className="p-3 w-52">Sáng (Món)</th>
                                    <th className="p-3 w-24 text-center">Tiền sáng</th>
                                    <th className="p-3 w-16 text-center">✓</th>
                                    <th className="p-3 w-52">Trưa (Món)</th>
                                    <th className="p-3 w-24 text-center">Tiền trưa</th>
                                    <th className="p-3 w-16 text-center">✓</th>
                                    <th className="p-3 w-52">Tối (Món)</th>
                                    <th className="p-3 w-24 text-center">Tiền tối</th>
                                    <th className="p-3 w-16 text-center">✓</th>
                                    <th className="p-3 w-16 text-center">Xóa</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[0.08]">
                                {records.map(r => {
                                    const weekday = getWeekdayVN(r.date);
                                    const isWeekend = weekday === "Thứ bảy" || weekday === "Chủ nhật";

                                    return (
                                        <tr
                                            key={r.id}
                                            className={`${isWeekend ? "bg-amber-50/20" : "bg-white"} hover:bg-gray-50/50 transition`}
                                        >
                                            {/* Weekday */}
                                            <td className="p-3 text-center font-bold text-gray-600">{weekday}</td>

                                            {/* Date input */}
                                            <td className="p-3 text-center">
                                                <input
                                                    type="date"
                                                    value={new Date(r.date).toISOString().split("T")[0]}
                                                    onChange={e => updateField(r.id, "date", e.target.value)}
                                                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white"
                                                />
                                            </td>

                                            {/* Breakfast Meal */}
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    defaultValue={r.sang || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "sang", val));
                                                    }}
                                                    placeholder="Ăn gì..."
                                                    className="border border-gray-300 rounded-lg px-2 py-1 w-full bg-white text-sm"
                                                />
                                            </td>

                                            {/* Breakfast Amount */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="number"
                                                    defaultValue={r.tien_sang || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "tien_sang", val));
                                                    }}
                                                    placeholder="0"
                                                    className="border border-gray-300 rounded-lg px-1 py-1 w-20 text-center bg-white text-sm"
                                                />
                                            </td>

                                            {/* Breakfast Paid Checkbox */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={r.sang_paid || false}
                                                    onChange={e => updateField(r.id, "sang_paid", e.target.checked)}
                                                    className="w-4 h-4 accent-green-600 cursor-pointer"
                                                />
                                            </td>

                                            {/* Lunch Meal */}
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    defaultValue={r.trua || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "trua", val));
                                                    }}
                                                    placeholder="Ăn gì..."
                                                    className="border border-gray-300 rounded-lg px-2 py-1 w-full bg-white text-sm"
                                                />
                                            </td>

                                            {/* Lunch Amount */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="number"
                                                    defaultValue={r.tien_trua || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "tien_trua", val));
                                                    }}
                                                    placeholder="0"
                                                    className="border border-gray-300 rounded-lg px-1 py-1 w-20 text-center bg-white text-sm"
                                                />
                                            </td>

                                            {/* Lunch Paid Checkbox */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={r.trua_paid || false}
                                                    onChange={e => updateField(r.id, "trua_paid", e.target.checked)}
                                                    className="w-4 h-4 accent-green-600 cursor-pointer"
                                                />
                                            </td>

                                            {/* Dinner Meal */}
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    defaultValue={r.toi || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "toi", val));
                                                    }}
                                                    placeholder="Ăn gì..."
                                                    className="border border-gray-300 rounded-lg px-2 py-1 w-full bg-white text-sm"
                                                />
                                            </td>

                                            {/* Dinner Amount */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="number"
                                                    defaultValue={r.tien_toi || ""}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        debounceUpdate(() => updateField(r.id, "tien_toi", val));
                                                    }}
                                                    placeholder="0"
                                                    className="border border-gray-300 rounded-lg px-1 py-1 w-20 text-center bg-white text-sm"
                                                />
                                            </td>

                                            {/* Dinner Paid Checkbox */}
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={r.toi_paid || false}
                                                    onChange={e => updateField(r.id, "toi_paid", e.target.checked)}
                                                    className="w-4 h-4 accent-green-600 cursor-pointer"
                                                />
                                            </td>

                                            {/* Delete Action */}
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleDelete(r.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card Layout */}
                    <div className="lg:hidden space-y-4">
                        {records.map(r => {
                            const weekday = getWeekdayVN(r.date);
                            const isWeekend = weekday === "Thứ bảy" || weekday === "Chủ nhật";

                            // Local state helpers to prevent screen flicker during debounce
                            const updateLocal = (field, value) => {
                                setRecords(prev =>
                                    prev.map(row => (row.id === r.id ? { ...row, [field]: value } : row))
                                );
                            };

                            return (
                                <div
                                    key={r.id}
                                    className={`p-4 rounded-xl border border-black/[0.08] shadow-sm space-y-3 ${
                                        isWeekend ? "bg-amber-50/25" : "bg-white"
                                    }`}
                                >
                                    <div className="flex justify-between items-center pb-2 border-b border-black/[0.06]">
                                        <span className="font-bold text-gray-800 text-base">{weekday}</span>
                                        <input
                                            type="date"
                                            value={new Date(r.date).toISOString().split("T")[0]}
                                            onChange={e => {
                                                const val = e.target.value;
                                                updateLocal("date", val);
                                                debounceUpdate(() => updateField(r.id, "date", val));
                                            }}
                                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white"
                                        />
                                    </div>

                                    {/* Breakfast Section */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs font-semibold text-gray-500">
                                            <span>Bữa Sáng</span>
                                            <span>Đã trả tiền?</span>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                value={r.sang || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("sang", val);
                                                    debounceUpdate(() => updateField(r.id, "sang", val));
                                                }}
                                                placeholder="Món ăn..."
                                                className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm flex-1 bg-white"
                                            />
                                            <input
                                                type="number"
                                                value={r.tien_sang || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("tien_sang", val);
                                                    debounceUpdate(() => updateField(r.id, "tien_sang", val));
                                                }}
                                                placeholder="VNĐ"
                                                className="border border-gray-300 rounded-lg px-1 py-1 text-sm w-20 text-center bg-white"
                                            />
                                            <input
                                                type="checkbox"
                                                checked={r.sang_paid || false}
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    updateLocal("sang_paid", checked);
                                                    updateField(r.id, "sang_paid", checked);
                                                }}
                                                className="w-5 h-5 accent-green-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Lunch Section */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs font-semibold text-gray-500">
                                            <span>Bữa Trưa</span>
                                            <span>Đã trả tiền?</span>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                value={r.trua || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("trua", val);
                                                    debounceUpdate(() => updateField(r.id, "trua", val));
                                                }}
                                                placeholder="Món ăn..."
                                                className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm flex-1 bg-white"
                                            />
                                            <input
                                                type="number"
                                                value={r.tien_trua || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("tien_trua", val);
                                                    debounceUpdate(() => updateField(r.id, "tien_trua", val));
                                                }}
                                                placeholder="VNĐ"
                                                className="border border-gray-300 rounded-lg px-1 py-1 text-sm w-20 text-center bg-white"
                                            />
                                            <input
                                                type="checkbox"
                                                checked={r.trua_paid || false}
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    updateLocal("trua_paid", checked);
                                                    updateField(r.id, "trua_paid", checked);
                                                }}
                                                className="w-5 h-5 accent-green-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Dinner Section */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs font-semibold text-gray-500">
                                            <span>Bữa Tối</span>
                                            <span>Đã trả tiền?</span>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                value={r.toi || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("toi", val);
                                                    debounceUpdate(() => updateField(r.id, "toi", val));
                                                }}
                                                placeholder="Món ăn..."
                                                className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm flex-1 bg-white"
                                            />
                                            <input
                                                type="number"
                                                value={r.tien_toi || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    updateLocal("tien_toi", val);
                                                    debounceUpdate(() => updateField(r.id, "tien_toi", val));
                                                }}
                                                placeholder="VNĐ"
                                                className="border border-gray-300 rounded-lg px-1 py-1 text-sm w-20 text-center bg-white"
                                            />
                                            <input
                                                type="checkbox"
                                                checked={r.toi_paid || false}
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    updateLocal("toi_paid", checked);
                                                    updateField(r.id, "toi_paid", checked);
                                                }}
                                                className="w-5 h-5 accent-green-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Delete button */}
                                    <div className="flex justify-end pt-1.5 border-t border-black/[0.04]">
                                        <button
                                            onClick={() => handleDelete(r.id)}
                                            className="text-red-500 hover:text-red-700 font-semibold text-sm hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                                        >
                                            Xóa ngày này
                                        </button>
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

export default ExpenseAnUong;
