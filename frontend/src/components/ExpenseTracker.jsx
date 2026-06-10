import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { Edit2, Trash2, Calendar, CreditCard, Tag, Check, X, Loader, Plus, Upload, BarChart2, DollarSign } from "lucide-react";

import ExpenseDienNuoc from "./ExpenseDienNuoc";
import ExpenseAnUong from "./ExpenseAnUong";

const API_URL = "/api/expenses";

// Custom Modal Component
const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl p-6 m-4 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-red-600">Xác nhận</h3>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                        Xác nhận Xóa
                    </button>
                </div>
            </div>
        </div>
    );
};

// Mobile Expense Card
const ExpenseCard = ({ expense, handleEdit, openDeleteModal }) => {
    const isIncome = expense.expense_type === "Thu";
    const amountColor = isIncome ? "text-green-600" : "text-red-600";
    const iconBg = isIncome ? "bg-green-50" : "bg-red-50";
    const iconColor = isIncome ? "text-green-600" : "text-red-600";

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-black/[0.08] flex flex-col space-y-2.5">
            <div className="flex items-start justify-between">
                <div className="flex items-center">
                    <div className={`p-2 rounded-full mr-3 ${iconBg}`}>
                        <DollarSign className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    <p className={`text-lg font-bold ${amountColor}`}>
                        {isIncome ? "+" : "-"}{expense.amount.toLocaleString()} ₫
                    </p>
                </div>
                <div className="flex space-x-1">
                    <button
                        onClick={() => handleEdit(expense)}
                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition"
                        title="Sửa"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        onClick={() => openDeleteModal(expense.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Xóa"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <p className="text-gray-800 font-semibold">{expense.description}</p>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-black/[0.04] text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-blue-500" />
                    <span>{new Date(expense.date).toLocaleDateString("vi-VN")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Tag size={13} className="text-purple-500" />
                    <span className="truncate">{expense.category}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-indigo-500" />
                    <span>{expense.payment_method === "TM" ? "Tiền mặt" : "Chuyển khoản"}</span>
                </div>
            </div>
        </div>
    );
};

const ExpenseTracker = ({ user, token }) => {
    const [expenses, setExpenses] = useState([]);
    const [id, setId] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState("Ăn uống");
    const [paymentMethod, setPaymentMethod] = useState("CK");
    const [expense_type, setType] = useState("Chi");

    // Filters
    const [filterCategory, setFilterCategory] = useState("");
    const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
    const [filterDescription, setFilterDescription] = useState("");
    const [selectedDay, setSelectedDay] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Navigation and Alerts
    const [activeTab, setActiveTab] = useState("expenses");
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState(null);

    const showAlertWithTimeout = (msg) => {
        setAlertMessage(msg);
        setTimeout(() => setAlertMessage(""), 3000);
    };

    const fetchExpenses = async () => {
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
                setExpenses(Array.isArray(data) ? data : []);
            } else {
                showAlertWithTimeout("Không thể tải danh sách chi tiêu.");
            }
        } catch (err) {
            console.error("Error fetching expenses:", err);
            showAlertWithTimeout("Lỗi kết nối khi tải chi tiêu.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const cleanAmount = parseFloat(amount.replace(/,/g, ""));
        if (!date || !description || isNaN(cleanAmount) || cleanAmount <= 0) {
            showAlertWithTimeout("Dữ liệu nhập không hợp lệ.");
            return;
        }

        const finalDescription = description.startsWith("Chi ") || description.startsWith("Thu ") || description.startsWith("Rút ") 
            ? description 
            : `${expense_type} ${description}`;

        const payload = {
            date,
            description: finalDescription,
            amount: cleanAmount,
            category,
            payment_method: paymentMethod,
            expense_type,
            userid: 0 // Backend automatically maps HAgent user ID from token
        };

        try {
            const method = id ? "PUT" : "POST";
            const url = id ? `${API_URL}/${id}` : `${API_URL}/`;

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchExpenses();
                resetForm();
                showAlertWithTimeout(id ? "Cập nhật thành công!" : "Thêm chi tiêu thành công!");
            } else {
                showAlertWithTimeout("Lỗi từ máy chủ khi lưu chi tiêu.");
            }
        } catch (err) {
            console.error(err);
            showAlertWithTimeout("Lỗi kết nối khi gửi dữ liệu.");
        }
    };

    const handleDelete = async (deleteId) => {
        try {
            const res = await fetch(`${API_URL}/${deleteId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                fetchExpenses();
                showAlertWithTimeout("Xóa chi tiêu thành công.");
            } else {
                showAlertWithTimeout("Lỗi khi xóa chi tiêu.");
            }
        } catch (err) {
            console.error(err);
            showAlertWithTimeout("Lỗi kết nối khi xóa.");
        }
    };

    const handleEdit = (expense) => {
        setId(expense.id);
        setDate(expense.date);
        setDescription(expense.description.replace(/^(Chi|Thu|Rút) /, ""));
        setAmount(expense.amount.toString());
        setCategory(expense.category);
        setPaymentMethod(expense.payment_method);
        setType(expense.expense_type);

        setTimeout(() => {
            document.getElementById("expense-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
    };

    const resetForm = () => {
        setId("");
        setDescription("");
        setAmount("");
        setCategory("Ăn uống");
        setPaymentMethod("CK");
        setType("Chi");
    };

    const openDeleteModal = (itemId) => {
        setExpenseToDelete(itemId);
        setIsModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (expenseToDelete) {
            handleDelete(expenseToDelete);
        }
        setIsModalOpen(false);
        setExpenseToDelete(null);
    };

    // Excel Import
    const formatExcelDate = (serialDate) => {
        const dateObj = new Date(Math.round((serialDate - 25569) * 86400 * 1000));
        return dateObj.toISOString().split("T")[0];
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fileType = file.name.split(".").pop().toLowerCase();
        if (!["xlsx", "xls"].includes(fileType)) {
            showAlertWithTimeout("Vui lòng chọn file Excel hợp lệ (.xlsx hoặc .xls)");
            return;
        }

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    showAlertWithTimeout("File Excel không có dữ liệu.");
                    return;
                }

                let success = 0;
                let failure = 0;

                for (const item of json) {
                    try {
                        const parsedDate = item.date 
                            ? (typeof item.date === "number" ? formatExcelDate(item.date) : item.date) 
                            : new Date().toISOString().split("T")[0];
                        
                        const parsedAmount = parseFloat(item.amount);
                        if (isNaN(parsedAmount) || parsedAmount <= 0) {
                            failure++;
                            continue;
                        }

                        const rawDesc = item.description?.toString().trim() || "Imported";
                        const typeVal = item.expense_type?.toString().trim() || "Chi";
                        const finalDesc = rawDesc.startsWith("Chi ") || rawDesc.startsWith("Thu ") || rawDesc.startsWith("Rút ") 
                            ? rawDesc 
                            : `${typeVal} ${rawDesc}`;

                        const payload = {
                            date: parsedDate,
                            description: finalDesc,
                            amount: parsedAmount,
                            category: item.category?.toString().trim() || "Khác",
                            payment_method: item.payment_method?.toString().trim() || "CK",
                            expense_type: typeVal,
                            userid: 0
                        };

                        const res = await fetch(`${API_URL}/`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify(payload)
                        });

                        if (res.ok) success++;
                        else failure++;
                    } catch (err) {
                        failure++;
                    }
                }

                showAlertWithTimeout(`Nhập dữ liệu thành công: ${success}, Thất bại: ${failure}`);
                fetchExpenses();
                e.target.value = "";
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.error(err);
            showAlertWithTimeout("Lỗi xử lý file Excel.");
        }
    };

    // Filter Logic
    const isWithinDateRange = (expenseDate) => {
        const dObj = new Date(expenseDate);
        const day = dObj.getDate();
        const month = dObj.getMonth() + 1;
        const year = dObj.getFullYear();

        return (
            (selectedDay === "" || day === parseInt(selectedDay)) &&
            (selectedMonth === "" || month === parseInt(selectedMonth)) &&
            (selectedYear === "" || year === parseInt(selectedYear))
        );
    };

    const filteredExpenses = expenses.filter((e) => {
        return (
            (filterCategory === "" || e.category === filterCategory) &&
            (filterPaymentMethod === "" || e.payment_method === filterPaymentMethod) &&
            isWithinDateRange(e.date) &&
            !["Tiết kiệm", "Đầu tư", "XL", "Rút tiền"].includes(e.category) &&
            (filterDescription === "" || e.description.toLowerCase().includes(filterDescription.toLowerCase()))
        );
    });

    // Totals calculations
    const totalFilteredAmount = filteredExpenses.reduce((sum, e) => {
        return e.expense_type === "Thu" ? sum + e.amount : sum - e.amount;
    }, 0);

    const totalIncome = filteredExpenses
        .filter((e) => e.expense_type === "Thu")
        .reduce((sum, e) => sum + e.amount, 0);

    const totalExpense = filteredExpenses
        .filter((e) => e.expense_type === "Chi")
        .reduce((sum, e) => sum + e.amount, 0);

    // Month summary cards
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const expensesThisMonth = expenses.filter((e) => {
        const dObj = new Date(e.date);
        return dObj.getMonth() + 1 === currentMonth && 
               dObj.getFullYear() === currentYear &&
               !["Tiết kiệm", "Rút tiền", "XL"].includes(e.category);
    });

    const totalExpensesThisMonth = expensesThisMonth.reduce((sum, e) => {
        return e.expense_type === "Thu" ? sum + e.amount : sum - e.amount;
    }, 0);
    const totalIncomeThisMonth = expensesThisMonth
        .filter((e) => e.expense_type === "Thu")
        .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenseThisMonth = expensesThisMonth
        .filter((e) => e.expense_type === "Chi")
        .reduce((sum, e) => sum + e.amount, 0);

    // Balance overview calculations
    const balanceTMRounded = Math.floor(
        expenses.filter((e) => e.expense_type === "Thu" && e.payment_method === "TM").reduce((s, e) => s + e.amount, 0) -
        expenses.filter((e) => e.expense_type === "Chi" && e.payment_method === "TM").reduce((s, e) => s + e.amount, 0) +
        expenses.filter((e) => e.expense_type === "Rút" && e.payment_method === "TM").reduce((s, e) => s + e.amount, 0)
    );

    const balanceCK = 
        expenses.filter((e) => e.expense_type === "Thu" && e.payment_method === "CK").reduce((s, e) => s + e.amount, 0) -
        expenses.filter((e) => e.expense_type === "Chi" && e.payment_method === "CK").reduce((s, e) => s + e.amount, 0) -
        expenses.filter((e) => e.expense_type === "Rút" && e.payment_method === "TM").reduce((s, e) => s + e.amount, 0);

    // Charts processing
    const filteredExpensesForChart = expenses.filter((e) => {
        const dObj = new Date(e.date);
        const chartYear = selectedYear ? parseInt(selectedYear) : currentYear;
        return (
            !["Tiết kiệm", "Rút tiền", "XL"].includes(e.category) &&
            dObj.getFullYear() === chartYear
        );
    });

    const monthlyCategoryData = filteredExpensesForChart
        .filter((e) => e.expense_type === "Chi")
        .reduce((acc, e) => {
            const dObj = new Date(e.date);
            const mYear = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, "0")}`;
            if (!acc[mYear]) acc[mYear] = { monthYear: mYear };
            acc[mYear][e.category] = (acc[mYear][e.category] || 0) + e.amount;
            return acc;
        }, {});

    const chartData = Object.values(monthlyCategoryData).sort((a, b) => a.monthYear.localeCompare(b.monthYear));

    const categoryColors = {
        "Ăn uống": "#82ca9d",
        "Tiền nhà": "#00ced1",
        "Mua sắm": "#ff7f50",
        "Biếu tặng": "#8884d8",
        "Đi lại": "#ffc658",
        "Vệ sinh-Sức khỏe": "#ffb6c1",
        "Sinh nhật": "#d0ed57",
        "Hớt tóc": "#a4de6c",
        "Đám cưới": "#ff69b4",
        "Tiền internet": "#4682b4",
        "Khác": "#a9a9a9"
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const monthData = chartData.find(d => d.monthYear === label);
            if (monthData) {
                const totalChi = Object.keys(monthData)
                    .filter(k => k !== "monthYear")
                    .reduce((sum, k) => sum + monthData[k], 0);

                const sorted = [...payload].sort((a, b) => b.value - a.value);

                return (
                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-lg text-sm space-y-1.5">
                        <p className="font-bold text-gray-800 text-center border-b pb-1 mb-2">{label}</p>
                        {sorted.map((entry, idx) => (
                            <div key={idx} className="flex justify-between gap-6 text-gray-600">
                                <span>{entry.name}:</span>
                                <span className="font-semibold text-gray-800">{(entry.value).toLocaleString()} ₫</span>
                            </div>
                        ))}
                        <p className="font-bold text-red-600 border-t pt-1.5 mt-2 text-center text-sm">
                            Tổng chi: {totalChi.toLocaleString()} ₫
                        </p>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div className="space-y-6">
            <ConfirmationModal
                isOpen={isModalOpen}
                message="Bạn có chắc chắn muốn xóa giao dịch này? Hành động này không thể hoàn tác."
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsModalOpen(false)}
            />

            {alertMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-xl">
                    {alertMessage}
                </div>
            )}

            {/* Main Tabs */}
            <div className="flex flex-wrap gap-2 justify-center bg-gray-100/60 p-1.5 rounded-2xl border border-black/[0.04] max-w-2xl mx-auto">
                {[
                    { id: "expenses", label: "Chi tiêu" },
                    { id: "anuong", label: "Ăn uống" },
                    { id: "dashboard", label: "Biểu đồ" },
                    { id: "diennuoc", label: "Điện nước" },
                    { id: "yearly", label: "Hàng năm" }
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition duration-200 ${
                            activeTab === t.id
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "text-gray-600 hover:bg-gray-200/50 hover:text-gray-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Chi Tiêu Tab */}
            {activeTab === "expenses" && (
                <>
                    {/* Balance widgets */}
                    <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Số dư ví ước tính</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 p-4 rounded-xl border border-blue-100">
                                <span className="text-xs font-semibold text-blue-600 block">Ví Tiền Mặt (TM)</span>
                                <span className="text-xl font-bold text-blue-800">{balanceTMRounded.toLocaleString()} ₫</span>
                            </div>
                            <div className="bg-gradient-to-br from-green-50/50 to-green-100/30 p-4 rounded-xl border border-green-100">
                                <span className="text-xs font-semibold text-green-600 block">Tài khoản Ngân hàng (CK)</span>
                                <span className="text-xl font-bold text-green-800">{balanceCK.toLocaleString()} ₫</span>
                            </div>
                        </div>
                    </div>

                    {/* Add/Edit transaction form */}
                    <form id="expense-form" onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">{id ? "Cập nhật Giao Dịch" : "Thêm Giao Dịch Mới"}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Ngày giao dịch</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Loại giao dịch</label>
                                <select
                                    value={expense_type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                                    required
                                >
                                    <option value="Chi">Chi tiêu</option>
                                    <option value="Thu">Thu nhập</option>
                                    <option value="Rút">Rút tiền mặt</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Mô tả chi tiết</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Nhập mô tả..."
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Số tiền (VNĐ)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={amount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (/^\d*$/.test(val)) setAmount(val);
                                    }}
                                    placeholder="Nhập số tiền..."
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm text-right bg-white"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Danh mục phân loại</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                                >
                                    <option value="Ăn uống">Ăn uống</option>
                                    <option value="Đi lại">Đi lại</option>
                                    <option value="Tiền nhà">Tiền nhà</option>
                                    <option value="Mua sắm">Mua sắm</option>
                                    <option value="Sinh nhật">Sinh nhật</option>
                                    <option value="Tiền internet">Tiền internet</option>
                                    <option value="Đám cưới">Đám cưới</option>
                                    <option value="Biếu tặng">Biếu tặng</option>
                                    <option value="Vệ sinh-Sức khỏe">Vệ sinh-Sức khỏe</option>
                                    <option value="Hớt tóc">Hớt tóc</option>
                                    <option value="Khác">Khác</option>
                                    <option value="Lương">Lương</option>
                                    <option value="Lãi">Lãi</option>
                                    <option value="Tiết kiệm">Tiết kiệm</option>
                                    <option value="Rút tiền">Rút tiền</option>
                                    <option value="XL">Xử lý số dư</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Hình thức thanh toán</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                                >
                                    <option value="TM">Tiền mặt</option>
                                    <option value="CK">Chuyển khoản</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2.5 pt-2">
                            {id && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
                                >
                                    Hủy bỏ
                                </button>
                            )}
                            <button
                                type="submit"
                                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition"
                            >
                                {id ? "Lưu thay đổi" : "Ghi nhận"}
                            </button>
                        </div>
                    </form>

                    {/* Filters & statistics */}
                    <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm space-y-5">
                        <h3 className="text-lg font-bold text-gray-800">Bộ lọc & Thống kê</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="grid grid-cols-3 gap-1 col-span-2 lg:col-span-1">
                                <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="p-2 border rounded-lg text-sm bg-white">
                                    <option value="">Ngày</option>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (<option key={d} value={d}>{d}</option>))}
                                </select>
                                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border rounded-lg text-sm bg-white">
                                    <option value="">Tháng</option>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<option key={m} value={m}>{m}</option>))}
                                </select>
                                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="p-2 border rounded-lg text-sm bg-white">
                                    <option value="">Năm</option>
                                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (<option key={y} value={y}>{y}</option>))}
                                </select>
                            </div>
                            <input
                                type="text"
                                placeholder="Lọc theo mô tả..."
                                value={filterDescription}
                                onChange={(e) => setFilterDescription(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm col-span-2 lg:col-span-1 bg-white"
                            />
                            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white col-span-1">
                                <option value="">Tất cả danh mục</option>
                                <option value="Ăn uống">Ăn uống</option>
                                <option value="Đi lại">Đi lại</option>
                                <option value="Tiền nhà">Tiền nhà</option>
                                <option value="Mua sắm">Mua sắm</option>
                                <option value="Sinh nhật">Sinh nhật</option>
                                <option value="Tiền internet">Tiền internet</option>
                                <option value="Đám cưới">Đám cưới</option>
                                <option value="Biếu tặng">Biếu tặng</option>
                                <option value="Vệ sinh-Sức khỏe">Vệ sinh-Sức khỏe</option>
                                <option value="Hớt tóc">Hớt tóc</option>
                                <option value="Khác">Khác</option>
                                <option value="Lương">Lương</option>
                                <option value="Lãi">Lãi</option>
                            </select>
                            <select value={filterPaymentMethod} onChange={(e) => setFilterPaymentMethod(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white col-span-1">
                                <option value="">Tất cả phương thức</option>
                                <option value="TM">Tiền mặt</option>
                                <option value="CK">Chuyển khoản</option>
                            </select>
                        </div>

                        {/* Filtered stats grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-black/[0.06] pt-5">
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <span className="text-xs font-bold text-gray-500 block">Số dư lọc</span>
                                <span className="text-lg font-bold text-blue-700">{(totalFilteredAmount).toLocaleString()} ₫</span>
                            </div>
                            <div className="bg-green-50/50 p-4 rounded-xl border border-green-100">
                                <span className="text-xs font-bold text-gray-500 block">Tổng Thu nhập lọc</span>
                                <span className="text-lg font-bold text-green-700">+{(totalIncome).toLocaleString()} ₫</span>
                            </div>
                            <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                                <span className="text-xs font-bold text-gray-500 block">Tổng Chi tiêu lọc</span>
                                <span className="text-lg font-bold text-red-700">-{(totalExpense).toLocaleString()} ₫</span>
                            </div>
                        </div>
                    </div>

                    {/* Transaction List */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-gray-800">Chi Tiêu Chi Tiết</h3>

                        {/* Mobile List */}
                        <div className="md:hidden space-y-3">
                            {filteredExpenses.length > 0 ? (
                                filteredExpenses.map((e) => (
                                    <ExpenseCard
                                        key={e.id}
                                        expense={e}
                                        handleEdit={handleEdit}
                                        openDeleteModal={openDeleteModal}
                                    />
                                ))
                            ) : (
                                <div className="text-center p-8 bg-white border border-dashed rounded-xl text-gray-500">
                                    Không tìm thấy chi tiêu nào phù hợp.
                                </div>
                            )}
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto max-h-[500px] border border-black/[0.08] rounded-xl shadow-sm bg-white">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 sticky top-0 border-b border-black/[0.08] text-gray-600 font-semibold z-10">
                                        <th className="p-3.5 text-center">Ngày</th>
                                        <th className="p-3.5 text-center">Loại</th>
                                        <th className="p-3.5">Mô tả</th>
                                        <th className="p-3.5 text-right">Số tiền</th>
                                        <th className="p-3.5 text-center">Danh mục</th>
                                        <th className="p-3.5 text-center">Phương thức</th>
                                        <th className="p-3.5 text-center">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/[0.08]">
                                    {filteredExpenses.length > 0 ? (
                                        filteredExpenses.map((e) => (
                                            <tr key={e.id} className="hover:bg-gray-50/50 transition">
                                                <td className="p-3 text-center">
                                                    {new Date(e.date).toLocaleDateString("vi-VN")}
                                                </td>
                                                <td className={`p-3 text-center font-semibold ${
                                                    e.expense_type === "Thu" ? "text-green-600" : "text-red-600"
                                                }`}>
                                                    {e.expense_type}
                                                </td>
                                                <td className="p-3 font-medium text-gray-800">{e.description}</td>
                                                <td className={`p-3 text-right font-bold ${
                                                    e.expense_type === "Thu" ? "text-green-600" : "text-red-600"
                                                }`}>
                                                    {e.expense_type === "Thu" ? "+" : "-"}{e.amount.toLocaleString()} ₫
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                                                        {e.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center text-gray-500 font-medium">
                                                    {e.payment_method === "TM" ? "Tiền mặt" : "CK"}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <button
                                                            onClick={() => handleEdit(e)}
                                                            className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition"
                                                            title="Sửa"
                                                        >
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => openDeleteModal(e.id)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                            title="Xóa"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="7" className="p-10 text-center text-gray-500 font-medium">
                                                Không có dữ liệu chi tiêu.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Import from Excel Widget */}
                    <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Upload size={18} className="text-indigo-600" />
                            <h3 className="text-lg font-bold text-gray-800">Nhập từ file Excel</h3>
                        </div>
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleImport}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-xl file:border-0
                                file:text-sm file:font-semibold
                                file:bg-indigo-50 file:text-indigo-700
                                hover:file:bg-indigo-100 file:cursor-pointer"
                        />
                    </div>
                </>
            )}

            {/* Ăn uống Tab */}
            {activeTab === "anuong" && (
                <ExpenseAnUong user={user} token={token} />
            )}

            {/* Biểu đồ Tab */}
            {activeTab === "dashboard" && (
                <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <BarChart2 className="text-indigo-600" />
                            Biểu Đồ Chi Tiêu
                        </h2>
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold text-gray-500">Chọn Năm:</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                            >
                                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Monthly stats cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <span className="text-xs font-bold text-gray-500 block">Số dư (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-blue-700">{(totalExpensesThisMonth).toLocaleString()} ₫</span>
                        </div>
                        <div className="bg-green-50/50 p-4 rounded-xl border border-green-100">
                            <span className="text-xs font-bold text-gray-500 block">Tổng thu (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-green-700">+{(totalIncomeThisMonth).toLocaleString()} ₫</span>
                        </div>
                        <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                            <span className="text-xs font-bold text-gray-500 block">Tổng chi (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-red-700">-{(totalExpenseThisMonth).toLocaleString()} ₫</span>
                        </div>
                    </div>

                    {/* Recharts Stacked Bar Chart */}
                    <div className="bg-gray-50/50 p-4 rounded-xl border border-black/[0.04]">
                        <h4 className="text-sm font-bold text-gray-700 mb-6">Chi tiêu phân loại theo tháng (Năm {selectedYear})</h4>
                        <div className="w-full h-[320px]">
                            {chartData.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                    Không có dữ liệu chi tiêu trong năm {selectedYear}.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis
                                            dataKey="monthYear"
                                            tickFormatter={(val) => {
                                                const [y, m] = val.split("-");
                                                return `${m}/${y}`;
                                            }}
                                            stroke="#6B7280"
                                            fontSize={12}
                                        />
                                        <YAxis
                                            tickFormatter={(val) => `${(val / 1e6).toFixed(1)}M`}
                                            stroke="#6B7280"
                                            fontSize={12}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                        {Object.keys(categoryColors).map((cat) => (
                                            <Bar
                                                key={cat}
                                                dataKey={cat}
                                                stackId="a"
                                                fill={categoryColors[cat]}
                                                name={cat}
                                                radius={[2, 2, 0, 0]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Điện nước Tab */}
            {activeTab === "diennuoc" && (
                <ExpenseDienNuoc user={user} token={token} />
            )}

            {/* Yearly breakdown Tab */}
            {activeTab === "yearly" && (
                <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-black/[0.04]">
                        <h2 className="text-xl font-bold text-gray-800">Thống Kê Hàng Năm</h2>
                        <span className="text-xs text-gray-500 font-medium italic">Đơn vị tính: Triệu đồng (M)</span>
                    </div>

                    <div className="overflow-x-auto border border-black/[0.08] rounded-xl">
                        <table className="w-full min-w-[700px] text-sm text-left bg-white">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-black/[0.08]">
                                <tr>
                                    <th className="p-3.5 sticky left-0 bg-gray-50 border-r border-black/[0.08] w-40">Danh mục</th>
                                    {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                        .sort((a, b) => b - a)
                                        .map(y => (
                                            <th key={y} className="p-3.5 text-center font-bold w-24">{y}</th>
                                        ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[0.08] text-gray-700">
                                {/* Chi tiêu rows */}
                                {["Ăn uống", "Tiền nhà", "Đi lại", "Biếu tặng", "Mua sắm", "Vệ sinh-Sức khỏe", "Hớt tóc", "Tiền internet", "Đám cưới", "Sinh nhật", "Khác"].map((cat, idx) => (
                                    <tr key={cat} className={`${idx % 2 === 0 ? "bg-gray-50/20" : "bg-white"} hover:bg-rose-50/20 transition`}>
                                        <td className="p-3 font-semibold text-gray-800 sticky left-0 bg-inherit border-r border-black/[0.08]">{cat}</td>
                                        {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                            .sort((a, b) => b - a)
                                            .map(y => {
                                                const amt = expenses
                                                    .filter(e => new Date(e.date).getFullYear() === y && e.category === cat && e.expense_type === "Chi")
                                                    .reduce((s, e) => s + e.amount, 0);
                                                return (
                                                    <td key={y} className="p-3 text-right text-red-600 font-semibold">
                                                        {amt > 0 ? `-${(amt / 1e6).toFixed(1)}M` : "—"}
                                                    </td>
                                                );
                                            })}
                                    </tr>
                                ))}

                                {/* TỔNG CHI row */}
                                <tr className="bg-red-50/30 font-bold border-t-2 border-red-200">
                                    <td className="p-3.5 sticky left-0 bg-inherit border-r border-black/[0.08] text-red-700">TỔNG CHI</td>
                                    {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                        .sort((a, b) => b - a)
                                        .map(y => {
                                            const total = expenses
                                                .filter(e => new Date(e.date).getFullYear() === y && e.expense_type === "Chi" && !["Tiết kiệm", "XL", "Rút tiền", "Đầu tư"].includes(e.category))
                                                .reduce((s, e) => s + e.amount, 0);
                                            return (
                                                <td key={y} className="p-3.5 text-right text-red-700 font-extrabold">
                                                    {(total / 1e6).toFixed(1)}M
                                                </td>
                                            );
                                        })}
                                </tr>

                                {/* Thu nhập rows */}
                                {["Lương", "Lãi", "Khác"].map((cat, idx) => (
                                    <tr key={cat} className={`${idx % 2 === 0 ? "bg-gray-50/20" : "bg-white"} hover:bg-green-50/20 transition`}>
                                        <td className="p-3 font-semibold text-gray-800 sticky left-0 bg-inherit border-r border-black/[0.08]">{cat}</td>
                                        {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                            .sort((a, b) => b - a)
                                            .map(y => {
                                                const amt = expenses
                                                    .filter(e => new Date(e.date).getFullYear() === y && e.category === cat && e.expense_type === "Thu")
                                                    .reduce((s, e) => s + e.amount, 0);
                                                return (
                                                    <td key={y} className="p-3 text-right text-green-600 font-semibold">
                                                        {amt > 0 ? `+${(amt / 1e6).toFixed(1)}M` : "—"}
                                                    </td>
                                                );
                                            })}
                                    </tr>
                                ))}

                                {/* TỔNG THU row */}
                                <tr className="bg-green-50/30 font-bold border-t-2 border-green-200">
                                    <td className="p-3.5 sticky left-0 bg-inherit border-r border-black/[0.08] text-green-700">TỔNG THU</td>
                                    {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                        .sort((a, b) => b - a)
                                        .map(y => {
                                            const total = expenses
                                                .filter(e => new Date(e.date).getFullYear() === y && e.expense_type === "Thu" && !["Tiết kiệm", "XL", "Rút tiền", "Đầu tư"].includes(e.category))
                                                .reduce((s, e) => s + e.amount, 0);
                                            return (
                                                <td key={y} className="p-3.5 text-right text-green-700 font-extrabold">
                                                    {(total / 1e6).toFixed(1)}M
                                                </td>
                                            );
                                        })}
                                </tr>

                                {/* CÒN LẠI row */}
                                <tr className="bg-indigo-600 text-white font-extrabold">
                                    <td className="p-4 sticky left-0 bg-inherit border-r border-black/[0.12]">CÒN LẠI</td>
                                    {Array.from(new Set(expenses.map(e => new Date(e.date).getFullYear())))
                                        .sort((a, b) => b - a)
                                        .map(y => {
                                            const thu = expenses.filter(e => new Date(e.date).getFullYear() === y && e.expense_type === "Thu" && !["Tiết kiệm", "XL", "Rút tiền", "Đầu tư"].includes(e.category)).reduce((s, e) => s + e.amount, 0);
                                            const chi = expenses.filter(e => new Date(e.date).getFullYear() === y && e.expense_type === "Chi" && !["Tiết kiệm", "XL", "Rút tiền", "Đầu tư"].includes(e.category)).reduce((s, e) => s + e.amount, 0);
                                            const diff = thu - chi;
                                            return (
                                                <td key={y} className="p-4 text-center font-black">
                                                    {diff >= 0 ? `+${(diff / 1e6).toFixed(1)}M` : `${(diff / 1e6).toFixed(1)}M`}
                                                </td>
                                            );
                                        })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseTracker;
