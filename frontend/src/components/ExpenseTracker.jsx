import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { Edit2, Trash2, Calendar, CreditCard, Tag, Check, X, Loader, Plus, Upload, BarChart2, DollarSign, Wallet, Landmark } from "lucide-react";

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
const ExpenseCard = ({ expense, handleEdit, openDeleteModal, categoryColors }) => {
    const isIncome = expense.expense_type === "Thu";
    const amountColor = isIncome ? "text-emerald-600" : "text-rose-600";
    const iconBg = isIncome ? "bg-emerald-50" : "bg-rose-50";
    const iconColor = isIncome ? "text-emerald-600" : "text-rose-600";

    return (
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col space-y-2.5 hover:shadow-md transition duration-200">
            <div className="flex items-start justify-between">
                <div className="flex items-center">
                    <div className={`p-2 rounded-full mr-3 ${iconBg}`}>
                        <DollarSign className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <p className={`text-base font-extrabold tracking-tight whitespace-nowrap ${amountColor}`}>
                        {isIncome ? "+" : "-"}{expense.amount.toLocaleString()}&nbsp;₫
                    </p>
                </div>
                <div className="flex space-x-1">
                    <button
                        onClick={() => handleEdit(expense)}
                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition"
                        title="Sửa"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        onClick={() => openDeleteModal(expense.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Xóa"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <p className="text-sm text-slate-800 font-semibold">{expense.description}</p>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-blue-500" />
                    <span>{new Date(expense.date).toLocaleDateString("vi-VN")}</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <Tag size={13} className="text-indigo-500 shrink-0" />
                    <span 
                        className="truncate px-1.5 py-0.5 rounded font-bold text-[10px]"
                        style={{
                            backgroundColor: `${categoryColors?.[expense.category] || "#6b7280"}15`,
                            color: categoryColors?.[expense.category] || "#6b7280"
                        }}
                    >
                        {expense.category}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-violet-500" />
                    <span>{expense.payment_method === "TM" ? "Tiền mặt" : "Chuyển khoản"}</span>
                </div>
            </div>
        </div>
    );
};

const ExpenseTracker = ({ user, token }) => {
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [id, setId] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState("Ăn uống");
    const [paymentMethod, setPaymentMethod] = useState("CK");
    const [expense_type, setType] = useState("Chi");

    // Category CRUD state
    const [catName, setCatName] = useState("");
    const [catColor, setCatColor] = useState("#6366f1");
    const [catIcon, setCatIcon] = useState("");
    const [catSortOrder, setCatSortOrder] = useState(0);
    const [editingCategory, setEditingCategory] = useState(null);
    const [isCatModalOpen, setIsCatModalOpen] = useState(false);
    const [catToDelete, setCatToDelete] = useState(null);

    // Filters
    const [filterCategory, setFilterCategory] = useState("");
    const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
    const [filterDescription, setFilterDescription] = useState("");
    const [selectedDay, setSelectedDay] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Navigation and Alerts
    const [activeTab, setActiveTab] = useState("expenses");
    const [dashboardSubTab, setDashboardSubTab] = useState("compare");
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState(null);

    const showAlertWithTimeout = (msg) => {
        setAlertMessage(msg);
        setTimeout(() => setAlertMessage(""), 3000);
    };

    const fetchCategories = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/categories`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Error fetching categories:", err);
        }
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
        fetchCategories();
    }, [token]);

    useEffect(() => {
        if (categories.length > 0 && !id) {
            // Set initial category to the first fetched category if none selected or if resetting
            setCategory(categories[0].name);
        }
    }, [categories]);

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
        setCategory(categories[0]?.name || "Ăn uống");
        setPaymentMethod("CK");
        setType("Chi");
    };

    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        if (!catName.trim()) return;

        const payload = {
            name: catName.trim(),
            color: catColor,
            icon: "",
            sort_order: catSortOrder,
            is_default: false
        };

        try {
            const method = editingCategory ? "PUT" : "POST";
            const url = editingCategory 
                ? `${API_URL}/categories/${editingCategory.id}` 
                : `${API_URL}/categories`;

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchCategories();
                resetCategoryForm();
                showAlertWithTimeout(editingCategory ? "Cập nhật danh mục thành công!" : "Thêm danh mục thành công!");
            } else {
                showAlertWithTimeout("Lỗi khi lưu danh mục.");
            }
        } catch (err) {
            console.error(err);
            showAlertWithTimeout("Lỗi kết nối khi gửi dữ liệu danh mục.");
        }
    };

    const handleEditCategory = (cat) => {
        setEditingCategory(cat);
        setCatName(cat.name);
        setCatColor(cat.color);
        setCatIcon("");
        setCatSortOrder(cat.sort_order || 0);
    };

    const handleDeleteCategory = async (catId) => {
        try {
            const res = await fetch(`${API_URL}/categories/${catId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                fetchCategories();
                showAlertWithTimeout("Xóa danh mục thành công.");
            } else {
                showAlertWithTimeout("Lỗi khi xóa danh mục.");
            }
        } catch (err) {
            console.error(err);
            showAlertWithTimeout("Lỗi kết nối khi xóa danh mục.");
        }
    };

    const openDeleteCategoryModal = (cat) => {
        setCatToDelete(cat);
        setIsCatModalOpen(true);
    };

    const handleConfirmDeleteCategory = () => {
        if (catToDelete) {
            handleDeleteCategory(catToDelete.id);
        }
        setIsCatModalOpen(false);
        setCatToDelete(null);
    };

    const resetCategoryForm = () => {
        setEditingCategory(null);
        setCatName("");
        setCatColor("#6366f1");
        setCatIcon("");
        setCatSortOrder(0);
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

    const monthlyIncomeCategoryData = filteredExpensesForChart
        .filter((e) => e.expense_type === "Thu")
        .reduce((acc, e) => {
            const dObj = new Date(e.date);
            const mYear = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, "0")}`;
            if (!acc[mYear]) acc[mYear] = { monthYear: mYear };
            acc[mYear][e.category] = (acc[mYear][e.category] || 0) + e.amount;
            return acc;
        }, {});

    const monthlyCompareData = filteredExpensesForChart.reduce((acc, e) => {
        const dObj = new Date(e.date);
        const mYear = `${dObj.getFullYear()}-${(dObj.getMonth() + 1).toString().padStart(2, "0")}`;
        if (!acc[mYear]) acc[mYear] = { monthYear: mYear, "Thu": 0, "Chi": 0 };
        if (e.expense_type === "Thu") {
            acc[mYear]["Thu"] += e.amount;
        } else if (e.expense_type === "Chi") {
            acc[mYear]["Chi"] += e.amount;
        }
        return acc;
    }, {});

    const selectCategories = categories.length > 0 
        ? categories 
        : [
            { name: "Ăn uống", color: "#82ca9d", icon: "" },
            { name: "Đi lại", color: "#ffc658", icon: "" },
            { name: "Tiền nhà", color: "#00ced1", icon: "" },
            { name: "Mua sắm", color: "#ff7f50", icon: "" },
            { name: "Vệ sinh-Sức khỏe", color: "#ffb6c1", icon: "" },
            { name: "Tiền internet", color: "#4682b4", icon: "" },
            { name: "Sinh nhật", color: "#d0ed57", icon: "" },
            { name: "Đám cưới", color: "#ff69b4", icon: "" },
            { name: "Biếu tặng", color: "#8884d8", icon: "" },
            { name: "Hớt tóc", color: "#a4de6c", icon: "" },
            { name: "Lương", color: "#16a34a", icon: "" },
            { name: "Lãi", color: "#15803d", icon: "" },
            { name: "Tiết kiệm", color: "#7c3aed", icon: "" },
            { name: "Rút tiền", color: "#9333ea", icon: "" },
            { name: "Khác", color: "#a9a9a9", icon: "" }
        ];

    const categoryColors = {};
    selectCategories.forEach((cat) => {
        categoryColors[cat.name] = cat.color;
    });

    const chiCats = selectCategories
        .filter((cat) => !["Lương", "Lãi", "Tiết kiệm", "Rút tiền", "XL", "Đầu tư"].includes(cat.name))
        .map((cat) => cat.name);

    const thuCats = selectCategories
        .filter((cat) => ["Lương", "Lãi", "Khác"].includes(cat.name))
        .map((cat) => cat.name);

    const chartData = Object.values(monthlyCategoryData).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    const chartIncomeData = Object.values(monthlyIncomeCategoryData).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    const chartCompareData = Object.values(monthlyCompareData).sort((a, b) => b.monthYear.localeCompare(a.monthYear));

    const renderLegend = (props) => {
        const { payload } = props;
        return (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-5 text-[11px] text-gray-500 font-bold">
                {payload.map((entry, index) => (
                    <div key={`item-${index}`} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span>{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            if (dashboardSubTab === "compare") {
                const thuItem = payload.find(p => p.dataKey === "Thu");
                const chiItem = payload.find(p => p.dataKey === "Chi");
                const thuVal = thuItem ? thuItem.value : 0;
                const chiVal = chiItem ? chiItem.value : 0;
                const diff = thuVal - chiVal;
                
                return (
                    <div className="bg-white/90 backdrop-blur-md p-4 border border-gray-100 rounded-xl shadow-xl text-sm space-y-1.5">
                        <p className="font-bold text-gray-800 text-center border-b pb-1 mb-2">{label}</p>
                        <div className="flex justify-between gap-6 text-emerald-600 font-medium whitespace-nowrap">
                            <span>Tổng thu:</span>
                            <span className="font-bold">{thuVal.toLocaleString()}&nbsp;₫</span>
                        </div>
                        <div className="flex justify-between gap-6 text-red-500 font-medium whitespace-nowrap">
                            <span>Tổng chi:</span>
                            <span className="font-bold">{chiVal.toLocaleString()}&nbsp;₫</span>
                        </div>
                        <div className={`flex justify-between gap-6 border-t pt-1.5 mt-2 font-bold whitespace-nowrap ${diff >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
                            <span>Chênh lệch:</span>
                            <span>{diff >= 0 ? "+" : ""}{diff.toLocaleString()}&nbsp;₫</span>
                        </div>
                    </div>
                );
            }

            const isIncome = dashboardSubTab === "income_cat";
            const currentDataset = isIncome ? chartIncomeData : chartData;
            const monthData = currentDataset.find(d => d.monthYear === label);
            
            if (monthData) {
                const totalVal = Object.keys(monthData)
                    .filter(k => k !== "monthYear")
                    .reduce((sum, k) => sum + monthData[k], 0);

                const sorted = [...payload].sort((a, b) => b.value - a.value);

                return (
                    <div className="bg-white/90 backdrop-blur-md p-4 border border-gray-100 rounded-xl shadow-xl text-sm space-y-1.5">
                        <p className="font-bold text-gray-800 text-center border-b pb-1 mb-2">{label}</p>
                        {sorted.map((entry, idx) => (
                            <div key={idx} className="flex justify-between gap-6 text-gray-600 whitespace-nowrap">
                                <span>{entry.name}:</span>
                                <span className="font-semibold text-gray-800">{(entry.value).toLocaleString()}&nbsp;₫</span>
                            </div>
                        ))}
                        <p className={`font-bold border-t pt-1.5 mt-2 text-center text-sm whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-red-500"}`}>
                            {isIncome ? "Tổng thu" : "Tổng chi"}: {totalVal.toLocaleString()}&nbsp;₫
                        </p>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 px-1 sm:px-0">
            <ConfirmationModal
                isOpen={isModalOpen}
                message="Bạn có chắc chắn muốn xóa giao dịch này? Hành động này không thể hoàn tác."
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsModalOpen(false)}
            />

            <ConfirmationModal
                isOpen={isCatModalOpen}
                message={`Bạn có chắc chắn muốn xóa danh mục "${catToDelete?.name || ""}"? Hành động này không thể hoàn tác.`}
                onConfirm={handleConfirmDeleteCategory}
                onCancel={() => setIsCatModalOpen(false)}
            />

            {alertMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-xl">
                    {alertMessage}
                </div>
            )}

            {/* Main Tabs */}
            <div className="flex flex-wrap gap-1 justify-center bg-slate-100/80 p-1 rounded-xl max-w-3xl mx-auto border border-slate-200/40 backdrop-blur-sm">
                {[
                    { id: "expenses", label: "Chi tiêu" },
                    { id: "anuong", label: "Ăn uống" },
                    { id: "dashboard", label: "Biểu đồ" },
                    { id: "diennuoc", label: "Điện nước" },
                    { id: "yearly", label: "Hàng năm" },
                    { id: "categories", label: "Danh mục" }
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-200 ${
                            activeTab === t.id
                                ? "bg-white text-slate-800 shadow-sm border border-slate-200/30"
                                : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Chi Tiêu Tab */}
            {activeTab === "expenses" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Side: Balance & Form */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* ── Balance Cards ── */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-white to-slate-50/50 p-4 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tiền Mặt</p>
                                    <p className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                                        {balanceTMRounded.toLocaleString()}&nbsp;
                                        <span className="text-xs font-semibold text-slate-400">₫</span>
                                    </p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">Ví tiền mặt (TM)</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                                    <Wallet size={20} />
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-white to-slate-50/50 p-4 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ngân Hàng</p>
                                    <p className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                                        {balanceCK.toLocaleString()}&nbsp;
                                        <span className="text-xs font-semibold text-slate-400">₫</span>
                                    </p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">Tài khoản chuyển khoản (CK)</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                                    <Landmark size={20} />
                                </div>
                            </div>
                        </div>

                        {/* ── Add / Edit Form ── */}
                        <form
                            id="expense-form"
                            onSubmit={handleSubmit}
                            className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm hover:shadow-md transition-shadow duration-300"
                        >
                            {/* Form Header */}
                            <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    {id ? "Cập nhật Giao Dịch" : "Thêm Giao Dịch Mới"}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {id ? "Sửa thông tin giao dịch đã chọn" : "Ghi nhận thu chi vào sổ cá nhân"}
                                </p>
                            </div>

                            <div className="p-4 space-y-3.5">
                                {/* Transaction type selector */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Loại giao dịch</p>
                                    <div className="flex gap-2">
                                        {[
                                            { v: "Chi", label: "Chi tiêu", active: "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-500/10" },
                                            { v: "Thu", label: "Thu nhập", active: "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/10" },
                                            { v: "Rút", label: "Rút tiền", active: "bg-indigo-500 border-indigo-500 text-white shadow-md shadow-indigo-500/10" }
                                        ].map(t => (
                                            <button
                                                key={t.v}
                                                type="button"
                                                onClick={() => setType(t.v)}
                                                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all duration-300 ${
                                                    expense_type === t.v
                                                        ? t.active
                                                        : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100 hover:text-slate-700"
                                                }`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 1: Date + Amount */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ngày</label>
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Số tiền (₫)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={amount}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (/^\d*$/.test(val)) setAmount(val);
                                                }}
                                                placeholder="0"
                                                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 pr-8 text-sm font-bold text-right text-slate-800 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all"
                                                required
                                            />
                                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-300">₫</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mô tả</label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Nhập mô tả giao dịch..."
                                        className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-700 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all"
                                        required
                                    />
                                </div>

                                {/* Row 2: Category + Payment method */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Danh mục</label>
                                        <select
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-700 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all"
                                        >
                                            {selectCategories.map((cat) => (
                                                <option key={cat.id || cat.name} value={cat.name}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Thanh toán</label>
                                        <div className="flex h-10 gap-1.5">
                                            {[{ v: "TM", label: "Tiền mặt" }, { v: "CK", label: "CK" }].map(m => (
                                                <button
                                                    key={m.v}
                                                    type="button"
                                                    onClick={() => setPaymentMethod(m.v)}
                                                    className={`flex-1 rounded-xl text-xs font-bold border transition-all duration-300 ${
                                                        paymentMethod === m.v
                                                            ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10"
                                                            : "bg-slate-50 border-slate-200/80 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                                    }`}
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2.5 pt-1">
                                    {id && (
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="flex-1 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-[0.98]"
                                        >
                                            Hủy bỏ
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        className={`flex-1 h-10 flex items-center justify-center rounded-xl text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] ${
                                            expense_type === "Thu" ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10" :
                                            expense_type === "Rút" ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/10" :
                                            "bg-rose-600 hover:bg-rose-700 shadow-rose-500/10"
                                        }`}
                                    >
                                        {id ? "Lưu thay đổi" : (
                                            expense_type === "Thu" ? "Ghi thu nhập" :
                                            expense_type === "Rút" ? "Ghi rút tiền" :
                                            "Ghi chi tiêu"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {/* Import from Excel Widget (grouped in left panel) */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition duration-300">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-500">
                                    <Upload size={15} />
                                </div>
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Nhập từ file Excel</h3>
                            </div>
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleImport}
                                className="block w-full text-xs text-slate-500
                                    file:mr-4 file:py-1.5 file:px-3
                                    file:rounded-xl file:border-0
                                    file:text-xs file:font-semibold
                                    file:bg-slate-100 file:text-slate-700
                                    hover:file:bg-slate-200 file:cursor-pointer transition"
                            />
                        </div>
                    </div>

                    {/* Right Side: Filters & List */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* ── Filters & Stats ── */}
                        <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden hover:shadow-md transition duration-300">
                        {/* Filter bar */}
                        <div className="px-4 pt-3.5 pb-3 border-b border-black/[0.05]">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">Bộ lọc</p>
                            <div className="flex flex-wrap gap-2">
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                                    <span className="text-[10px] font-bold text-gray-400">NG</span>
                                    <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none">
                                        <option value="">—</option>
                                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                                    <span className="text-[10px] font-bold text-gray-400">TH</span>
                                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none">
                                        <option value="">—</option>
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                                    <span className="text-[10px] font-bold text-gray-400">NĂM</span>
                                    <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none">
                                        <option value="">—</option>
                                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="flex-1 min-w-[120px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300">
                                    <option value="">Tất cả danh mục</option>
                                    {selectCategories.map((cat) => (
                                        <option key={cat.id || cat.name} value={cat.name}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                                <select value={filterPaymentMethod} onChange={(e) => setFilterPaymentMethod(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                                    <option value="">Tất cả</option>
                                    <option value="TM">Tiền mặt</option>
                                    <option value="CK">CK</option>
                                </select>
                                <input
                                    type="text"
                                    placeholder="Tìm mô tả..."
                                    value={filterDescription}
                                    onChange={(e) => setFilterDescription(e.target.value)}
                                    className="flex-1 min-w-[130px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                                />
                            </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/50">
                            <div className="px-4 py-4 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Số dư</p>
                                <p className={`mt-1.5 text-lg font-extrabold tracking-tight tabular-nums whitespace-nowrap ${
                                    totalFilteredAmount >= 0 ? "text-indigo-600" : "text-rose-600"
                                }`}>{totalFilteredAmount >= 0 ? "+" : ""}{totalFilteredAmount.toLocaleString()}&nbsp;<span className="text-xs font-semibold">₫</span></p>
                            </div>
                            <div className="px-4 py-4 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Thu nhập</p>
                                <p className="mt-1.5 text-lg font-extrabold tracking-tight tabular-nums text-emerald-600 whitespace-nowrap">+{totalIncome.toLocaleString()}&nbsp;<span className="text-xs font-semibold">₫</span></p>
                            </div>
                            <div className="px-4 py-4 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Chi tiêu</p>
                                <p className="mt-1.5 text-lg font-extrabold tracking-tight tabular-nums text-rose-500 whitespace-nowrap">-{totalExpense.toLocaleString()}&nbsp;<span className="text-xs font-semibold">₫</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Transaction List */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Chi Tiêu Chi Tiết</h3>

                        {/* Mobile List */}
                        <div className="md:hidden space-y-3">
                            {filteredExpenses.length > 0 ? (
                                filteredExpenses.map((e) => (
                                    <ExpenseCard
                                        key={e.id}
                                        expense={e}
                                        handleEdit={handleEdit}
                                        openDeleteModal={openDeleteModal}
                                        categoryColors={categoryColors}
                                    />
                                ))
                            ) : (
                                <div className="text-center p-8 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                                    Không tìm thấy chi tiêu nào phù hợp.
                                </div>
                            )}
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto max-h-[500px] border border-slate-200/60 rounded-xl shadow-sm bg-white">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 backdrop-blur-sm sticky top-0 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider z-10">
                                        <th className="p-3.5 text-center">Ngày</th>
                                        <th className="p-3.5 text-center">Loại</th>
                                        <th className="p-3.5">Mô tả</th>
                                        <th className="p-3.5 text-right">Số tiền</th>
                                        <th className="p-3.5 text-center">Danh mục</th>
                                        <th className="p-3.5 text-center">Phương thức</th>
                                        <th className="p-3.5 text-center">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredExpenses.length > 0 ? (
                                        filteredExpenses.map((e) => (
                                            <tr key={e.id} className="hover:bg-slate-50/40 transition-colors">
                                                <td className="p-3 text-center text-slate-500 font-medium">
                                                    {new Date(e.date).toLocaleDateString("vi-VN")}
                                                </td>
                                                <td className={`p-3 text-center font-bold text-xs ${
                                                    e.expense_type === "Thu" ? "text-emerald-600" : "text-rose-600"
                                                }`}>
                                                    {e.expense_type}
                                                </td>
                                                <td className="p-3 font-semibold text-slate-800">{e.description}</td>
                                                <td className={`p-3 text-right font-extrabold tracking-tight whitespace-nowrap ${
                                                    e.expense_type === "Thu" ? "text-emerald-600" : "text-rose-600"
                                                }`}>
                                                    {e.expense_type === "Thu" ? "+" : "-"}{e.amount.toLocaleString()}&nbsp;₫
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span 
                                                        className="px-2.5 py-1 rounded-full text-xs font-bold"
                                                        style={{
                                                            backgroundColor: `${categoryColors[e.category] || "#6b7280"}15`,
                                                            color: categoryColors[e.category] || "#6b7280"
                                                        }}
                                                    >
                                                        {e.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center text-slate-500 font-semibold text-xs">
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
                </div>
            </div>
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
                            Biểu Đồ Tài Chính
                        </h2>
                        
                        {/* Dashboard Sub Tabs */}
                        <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-xl border border-black/[0.04] w-fit">
                            {[
                                { id: "compare", label: "So sánh Thu/Chi" },
                                { id: "expense_cat", label: "Chi tiêu phân loại" },
                                { id: "income_cat", label: "Thu nhập phân loại" }
                            ].map((sub) => (
                                <button
                                    key={sub.id}
                                    type="button"
                                    onClick={() => setDashboardSubTab(sub.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition duration-150 ${
                                        dashboardSubTab === sub.id
                                            ? "bg-white text-indigo-600 shadow-sm border border-black/[0.02]"
                                            : "text-gray-500 hover:text-gray-700 hover:bg-white/40"
                                    }`}
                                >
                                    {sub.label}
                                </button>
                            ))}
                        </div>

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
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 whitespace-nowrap">
                            <span className="text-xs font-bold text-gray-500 block">Số dư (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-blue-700">{(totalExpensesThisMonth).toLocaleString()}&nbsp;₫</span>
                        </div>
                        <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 whitespace-nowrap">
                            <span className="text-xs font-bold text-gray-500 block">Tổng thu (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-green-700">+{(totalIncomeThisMonth).toLocaleString()}&nbsp;₫</span>
                        </div>
                        <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 whitespace-nowrap">
                            <span className="text-xs font-bold text-gray-500 block">Tổng chi (tháng {currentMonth})</span>
                            <span className="text-lg font-bold text-red-700">-{(totalExpenseThisMonth).toLocaleString()}&nbsp;₫</span>
                        </div>
                    </div>

                    {/* Recharts Bar Chart Container */}
                    <div className="bg-gray-50/50 p-4 rounded-xl border border-black/[0.04]">
                        <h4 className="text-sm font-bold text-gray-700 mb-6">
                            {dashboardSubTab === "compare" ? "So sánh Thu/Chi theo tháng" :
                             dashboardSubTab === "income_cat" ? "Thu nhập phân loại theo tháng" :
                             "Chi tiêu phân loại theo tháng"} (Năm {selectedYear})
                        </h4>
                        <div className="w-full h-[320px]">
                            {(() => {
                                let activeData = chartCompareData;
                                let emptyMessage = `Không có dữ liệu thu chi trong năm ${selectedYear}.`;

                                if (dashboardSubTab === "expense_cat") {
                                    activeData = chartData;
                                    emptyMessage = `Không có dữ liệu chi tiêu trong năm ${selectedYear}.`;
                                } else if (dashboardSubTab === "income_cat") {
                                    activeData = chartIncomeData;
                                    emptyMessage = `Không có dữ liệu thu nhập trong năm ${selectedYear}.`;
                                }

                                if (activeData.length === 0) {
                                    return (
                                        <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                            {emptyMessage}
                                        </div>
                                    );
                                }

                                if (dashboardSubTab === "compare") {
                                    return (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartCompareData}>
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
                                                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 10 }} />
                                                <Legend content={renderLegend} />
                                                <Bar dataKey="Thu" fill="#10b981" name="Tổng thu" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="Chi" fill="#ef4444" name="Tổng chi" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    );
                                }

                                const barsList = dashboardSubTab === "income_cat" ? thuCats : chiCats;

                                return (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={activeData}>
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
                                            <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 10 }} />
                                            <Legend content={renderLegend} />
                                            {barsList.map((cat) => (
                                                <Bar
                                                    key={cat}
                                                    dataKey={cat}
                                                    stackId="a"
                                                    fill={categoryColors[cat] || "#6b7280"}
                                                    name={cat}
                                                    radius={[2, 2, 0, 0]}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                );
                            })()}
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
                                {chiCats.map((cat, idx) => (
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
                                {thuCats.map((cat, idx) => (
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

            {/* Category Management Tab */}
            {activeTab === "categories" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Add/Edit Category Form */}
                    <div className="bg-white p-6 rounded-2xl border border-black/[0.08] shadow-sm space-y-4 h-fit">
                        <div className="pb-3 border-b border-slate-100">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                                {editingCategory ? "Chỉnh Sửa Danh Mục" : "Thêm Danh Mục Mới"}
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                {editingCategory ? "Cập nhật thông tin danh mục chi tiêu" : "Tạo danh mục phân loại thu chi mới"}
                            </p>
                        </div>
                        
                        <form onSubmit={handleCategorySubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tên danh mục</label>
                                <input
                                    type="text"
                                    value={catName}
                                    onChange={(e) => setCatName(e.target.value)}
                                    placeholder="Ví dụ: Cà phê, Mỹ phẩm..."
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">Màu sắc</label>
                                <div className="flex items-center gap-3 w-full">
                                    <div className="relative w-10 h-10 rounded-xl border border-slate-200 shadow-sm shrink-0 overflow-hidden" style={{ backgroundColor: catColor }}>
                                        <input
                                            type="color"
                                            value={catColor}
                                            onChange={(e) => setCatColor(e.target.value)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1 grid grid-cols-8 gap-1.5 p-1.5 bg-gray-50 rounded-xl border border-gray-200">
                                        {[
                                            "#22c55e", "#10b981", "#14b8a6", "#06b6d4", 
                                            "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", 
                                            "#d946ef", "#ec4899", "#f43f5e", "#e11d48",
                                            "#ef4444", "#f97316", "#f59e0b", "#eab308",
                                            "#84cc16", "#65748b", "#475569", "#78716c",
                                            "#4d7c0f", "#0369a1", "#b91c1c", "#6b7280"
                                        ].map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setCatColor(c)}
                                                className={`w-5 h-5 rounded-full hover:scale-110 transition ${catColor === c ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Thứ tự hiển thị</label>
                                <input
                                    type="number"
                                    value={catSortOrder}
                                    onChange={(e) => setCatSortOrder(parseInt(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                {editingCategory && (
                                    <button
                                        type="button"
                                        onClick={resetCategoryForm}
                                        className="flex-1 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition"
                                    >
                                        Hủy
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    className="flex-1 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-indigo-600/10 hover:bg-indigo-700 transition"
                                >
                                    {editingCategory ? "Cập nhật" : "Thêm danh mục"}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Category List */}
                    <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                        <div className="pb-3 border-b border-slate-100">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Danh Sách Danh Mục</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Tất cả danh mục hiện có phục vụ cho việc nhập và phân tích chi tiêu</p>
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                            {categories.map((cat) => (
                                <div 
                                    key={cat.id} 
                                    className="py-3 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div 
                                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                                            style={{
                                                backgroundColor: cat.color || "#6b7280",
                                                boxShadow: `0 0 0 4px ${(cat.color || "#6b7280")}18`
                                            }}
                                        />
                                        <div>
                                            <p className="font-semibold text-sm text-slate-800">{cat.name}</p>
                                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{cat.color}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEditCategory(cat)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                            title="Sửa"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => openDeleteCategoryModal(cat)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                            title="Xóa"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseTracker;