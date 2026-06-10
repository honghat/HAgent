import React, { useState, useEffect } from "react";
import { Calendar, Plus, Trash2, Edit2, Check, X } from "lucide-react"; 
import AssetOverview from "./AssetOverview"; 

const API_URL = "/api/balance";

const getOneYearFromNow = () => {
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);
    return oneYearLater.toISOString().split('T')[0];
};

const getToday = () => new Date().toISOString().split('T')[0];

const AccountBalance = ({ user, token }) => {
    const [accounts, setAccounts] = useState([]);
    const [balanceRecords, setBalanceRecords] = useState([]);
    const [savingsBooks, setSavingsBooks] = useState([]);
    const [activeTab, setActiveTab] = useState("comparison"); 
    const [comparisonRate, setComparisonRate] = useState("6.95"); 

    const [newAccount, setNewAccount] = useState({ name: "", balance: "" });
    const [newRecord, setNewRecord] = useState({
        account_id: "",
        date: getToday(),
        balance: "",
        note: ""
    });
    
    const [newBook, setNewBook] = useState({
        book_number: "",
        bank_name: "VCB", 
        amount: "",
        interest_rate: "",
        start_date: getToday(), 
        end_date: getOneYearFromNow(), 
        status: "active" 
    });

    const [editingAccount, setEditingAccount] = useState(null); 
    const [editingRecord, setEditingRecord] = useState(null); 
    const [editingBook, setEditingBook] = useState(null); 
    
    const [savingsFilters, setSavingsFilters] = useState({
        status: "active", 
        bank_name: "all", 
        due_this_month: false, 
        book_number_search: "", 
    });

    useEffect(() => {
        if (token) {
            fetchAccounts();
            fetchBalanceRecords();
            fetchSavingsBooks();
        }
    }, [token]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${API_URL}/accounts`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                setAccounts(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchBalanceRecords = async () => {
        try {
            const res = await fetch(`${API_URL}/balance-records`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                setBalanceRecords(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSavingsBooks = async () => {
        try {
            const res = await fetch(`${API_URL}/savings-books`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                setSavingsBooks(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    const addAccount = async () => {
        if (!newAccount.name || !newAccount.balance) return;
        try {
            await fetch(`${API_URL}/accounts`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newAccount.name,
                    balance: parseFloat(newAccount.balance)
                })
            });
            setNewAccount({ name: "", balance: "" });
            fetchAccounts();
        } catch (err) {
            console.error(err);
        }
    };

    const deleteAccount = async (id) => {
        if (!confirm("Xóa tài khoản?")) return;
        try {
            await fetch(`${API_URL}/accounts/${id}`, { 
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            fetchAccounts();
        } catch (err) {
            console.error(err);
        }
    };
    
    const startEditAccount = (account) => {
        setEditingAccount({
            ...account,
            balance: String(account.balance) 
        });
    };

    const saveEditAccount = async () => {
        if (!editingAccount || !editingAccount.name || !editingAccount.balance) return;
        try {
            await fetch(`${API_URL}/accounts/${editingAccount.id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: editingAccount.name,
                    balance: parseFloat(editingAccount.balance)
                })
            });
            setEditingAccount(null);
            fetchAccounts();
        } catch (err) {
            console.error(err);
        }
    };

    const cancelEditAccount = () => {
        setEditingAccount(null);
    };

    const addRecord = async () => {
        if (!newRecord.account_id || !newRecord.balance) return;
        try {
            await fetch(`${API_URL}/balance-records`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    account_id: parseInt(newRecord.account_id),
                    date: newRecord.date,
                    balance: parseFloat(newRecord.balance),
                    note: newRecord.note
                })
            });
            setNewRecord({
                account_id: "",
                date: getToday(),
                balance: "",
                note: ""
            });
            fetchBalanceRecords();
            fetchAccounts(); 
        } catch (err) {
            console.error(err);
        }
    };

    const deleteRecord = async (id) => {
        if (!confirm("Xóa bản ghi?")) return;
        try {
            await fetch(`${API_URL}/balance-records/${id}`, { 
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            fetchBalanceRecords();
        } catch (err) {
            console.error(err);
        }
    };
    
    const startEditRecord = (record) => {
        setEditingRecord({
            ...record,
            account_id: String(record.account_id),
            balance: String(record.balance)
        });
    };

    const saveEditRecord = async () => {
        if (!editingRecord || !editingRecord.account_id || !editingRecord.balance) return;
        try {
            await fetch(`${API_URL}/balance-records/${editingRecord.id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    account_id: parseInt(editingRecord.account_id),
                    date: editingRecord.date,
                    balance: parseFloat(editingRecord.balance),
                    note: editingRecord.note
                })
            });
            setEditingRecord(null);
            fetchBalanceRecords();
            fetchAccounts(); 
        } catch (err) {
            console.error(err);
        }
    };

    const cancelEditRecord = () => {
        setEditingRecord(null);
    };

    const addBook = async () => {
        if (!newBook.book_number || !newBook.bank_name || !newBook.amount) return;
        try {
            await fetch(`${API_URL}/savings-books`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    book_number: newBook.book_number,
                    bank_name: newBook.bank_name,
                    amount: parseFloat(newBook.amount),
                    interest_rate: parseFloat(newBook.interest_rate),
                    start_date: newBook.start_date,
                    end_date: newBook.end_date,
                    status: newBook.status
                })
            });
            setNewBook({
                book_number: "",
                bank_name: "VCB", 
                amount: "",
                interest_rate: "",
                start_date: getToday(),
                end_date: getOneYearFromNow(),
                status: "active" 
            });
            fetchSavingsBooks();
        } catch (err) {
            console.error(err);
        }
    };

    const deleteBook = async (id) => {
        if (!confirm("Xóa sổ tiết kiệm?")) return;
        try {
            await fetch(`${API_URL}/savings-books/${id}`, { 
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            fetchSavingsBooks();
        } catch (err) {
            console.error(err);
        }
    };

    const toggleBookStatus = async (book) => {
        try {
            await fetch(`${API_URL}/savings-books/${book.id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...book,
                    status: book.status === "active" ? "matured" : "active"
                })
            });
            fetchSavingsBooks();
        } catch (err) {
            console.error(err);
        }
    };

    const startEditBook = (book) => {
        setEditingBook({
            ...book,
            amount: String(book.amount),
            interest_rate: String(book.interest_rate),
        });
    };

    const saveEditBook = async () => {
        if (!editingBook || !editingBook.book_number || !editingBook.amount) return;
        try {
            await fetch(`${API_URL}/savings-books/${editingBook.id}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    book_number: editingBook.book_number,
                    bank_name: editingBook.bank_name,
                    amount: parseFloat(editingBook.amount),
                    interest_rate: parseFloat(editingBook.interest_rate),
                    start_date: editingBook.start_date,
                    end_date: editingBook.end_date,
                    status: editingBook.status
                })
            });
            setEditingBook(null);
            fetchSavingsBooks();
        } catch (err) {
            console.error(err);
        }
    };

    const cancelEditBook = () => {
        setEditingBook(null);
    };

    const calculateInterest = (amount, rate, startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        if (days <= 0) return 0; 
        const interest = amount * (rate / 100) * (days / 365);
        return Math.round(interest);
    };

    const calculateComparisonInterest = (book) => {
        const rate = parseFloat(comparisonRate);
        if (isNaN(rate) || book.status !== 'active') return 0;
        const today = getToday();
        const endDate = book.end_date;
        return calculateInterest(book.amount, rate, today, endDate);
    };

    const getDaysRemaining = (endDate) => {
        const end = new Date(endDate);
        const today = new Date();
        const days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        return days;
    };

    const filteredSavingsBooks = savingsBooks.filter(book => {
        if (savingsFilters.status !== "all" && book.status !== savingsFilters.status) {
            return false;
        }
        if (savingsFilters.bank_name !== "all" && book.bank_name !== savingsFilters.bank_name) {
            return false;
        }
        if (savingsFilters.due_this_month) {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            const maturityDate = new Date(book.end_date);
            if (maturityDate.getMonth() !== currentMonth || maturityDate.getFullYear() !== currentYear) {
                return false;
            }
        }
        if (savingsFilters.book_number_search && !book.book_number.toLowerCase().includes(savingsFilters.book_number_search.toLowerCase())) {
            return false;
        }
        return true;
    });

    const savingsBooksToRender = filteredSavingsBooks.slice().sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
    
    const totalSavingsBooksCount = filteredSavingsBooks.length; 
    const totalAmount = filteredSavingsBooks.reduce((s, b) => s + b.amount, 0); 
    
    const totalInterest = filteredSavingsBooks.reduce(
        (s, b) => s + calculateInterest(b.amount, b.interest_rate, b.start_date, b.end_date),
        0
    );
    
    const totalComparisonInterest = filteredSavingsBooks.reduce(
        (s, b) => s + (b.status === 'active' ? calculateComparisonInterest(b) : 0),
        0
    );

    const sortedAccounts = accounts.slice().sort((a, b) => b.balance - a.balance);
    const totalAccountBalance = accounts.reduce((s, a) => s + a.balance, 0);

    const balanceTM = accounts
        .filter(acc => acc.name.toLowerCase().includes('tm') || acc.name.toLowerCase().includes('tiền mặt'))
        .reduce((sum, acc) => sum + acc.balance, 0);
        
    const balanceCK = accounts
        .filter(acc => !acc.name.toLowerCase().includes('tm') && !acc.name.toLowerCase().includes('tiền mặt'))
        .reduce((sum, acc) => sum + acc.balance, 0);

    const totalSavings = totalAmount; 
    const totalInvestment = 0; 

    const fmAssetData = {
        cash: balanceTM,
        bank: balanceCK,
        savings: totalSavings,
        investments: totalInvestment,
        total: totalAccountBalance + totalAmount + totalInvestment,
    };

    return (
        <div className="w-full text-gray-900">
            <div className="bg-white rounded-lg shadow-sm border border-black/[0.08]">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 sm:p-6 text-white rounded-t-lg">
                    <h2 className="text-xl sm:text-2xl font-bold mb-1 text-white">Quản lý Tài chính</h2>
                    <p className="text-xs sm:text-sm text-white opacity-85">
                        Tổng tài sản ước tính: {fmAssetData.total.toLocaleString()} đ
                    </p>
                </div>

                <div className="border-b border-black/[0.08] flex overflow-x-auto bg-[#fbfbf9]">
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-4 sm:px-6 py-3 font-medium whitespace-nowrap text-xs transition-colors ${
                            activeTab === "overview"
                                ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        Tổng quan Tài sản
                    </button>
                    
                    <button
                        onClick={() => setActiveTab("comparison")}
                        className={`px-4 sm:px-6 py-3 font-medium whitespace-nowrap text-xs transition-colors ${
                            activeTab === "comparison"
                                ? "border-b-2 border-fuchsia-600 text-fuchsia-600 font-semibold"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        So sánh Nguồn
                    </button>
                    
                    <button
                        onClick={() => setActiveTab("balance")}
                        className={`px-4 sm:px-6 py-3 font-medium whitespace-nowrap text-xs transition-colors ${
                            activeTab === "balance"
                                ? "border-b-2 border-emerald-600 text-emerald-600 font-semibold"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        Số dư & Giao dịch
                    </button>
                    <button
                        onClick={() => setActiveTab("savings")}
                        className={`px-4 sm:px-6 py-3 font-medium whitespace-nowrap text-xs transition-colors ${
                            activeTab === "savings"
                                ? "border-b-2 border-emerald-600 text-emerald-600 font-semibold"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        Tiết kiệm
                    </button>
                </div>

                <div className="p-3 sm:p-6 bg-white">
                    {activeTab === "overview" && (
                        <AssetOverview 
                            user={user}
                            token={token}
                            viewMode="overview"
                            fmData={fmAssetData}
                        />
                    )}

                    {activeTab === "comparison" && (
                        <AssetOverview 
                            user={user}
                            token={token}
                            viewMode="comparison"
                            fmData={fmAssetData}
                        />
                    )}

                    {activeTab === "balance" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="font-semibold mb-3 text-sm sm:text-base border-b border-black/[0.04] pb-1">Tài khoản</h3>
                                
                                <div className="hidden sm:block overflow-x-auto border border-black/[0.08] rounded-xl shadow-sm">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-700">
                                                <th className="p-3 border-b border-black/[0.08] text-left">Tên</th>
                                                <th className="p-3 border-b border-black/[0.08] text-right">Số dư</th>
                                                <th className="p-3 border-b border-black/[0.08] text-center w-24">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.08]">
                                            {sortedAccounts.map(acc => {
                                                const isEditing = editingAccount && editingAccount.id === acc.id;

                                                if (isEditing) {
                                                    return (
                                                        <tr key={acc.id} className="bg-yellow-50/50">
                                                            <td className="p-3 border-b">
                                                                <input
                                                                    type="text"
                                                                    className="border border-black/[0.12] rounded px-2 py-1 w-full text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    value={editingAccount.name}
                                                                    onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 border-b text-right">
                                                                <input
                                                                    type="number"
                                                                    className="border border-black/[0.12] rounded px-2 py-1 w-full text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    value={editingAccount.balance}
                                                                    onChange={(e) => setEditingAccount({ ...editingAccount, balance: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 border-b text-center flex items-center justify-center space-x-1.5">
                                                                <button onClick={saveEditAccount} className="text-green-600 p-1.5 hover:bg-green-50 rounded transition-colors">
                                                                    <Check size={16} />
                                                                </button>
                                                                <button onClick={cancelEditAccount} className="text-gray-500 p-1.5 hover:bg-gray-100 rounded transition-colors">
                                                                    <X size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return (
                                                    <tr key={acc.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="p-3 text-gray-800 font-medium">{acc.name}</td>
                                                        <td className="p-3 text-right text-emerald-600 font-semibold">
                                                            {acc.balance.toLocaleString()} ₫
                                                        </td>
                                                        <td className="p-3 text-center flex items-center justify-center space-x-1.5">
                                                            <button onClick={() => startEditAccount(acc)} className="text-blue-500 p-1.5 hover:bg-blue-50 rounded transition-colors">
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button onClick={() => deleteAccount(acc.id)} className="text-red-500 p-1.5 hover:bg-red-550/10 rounded transition-colors">
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-emerald-50/40 font-bold text-emerald-900">
                                                <td className="p-3 text-left">TỔNG SỐ DƯ</td>
                                                <td className="p-3 text-right text-emerald-700">
                                                    {totalAccountBalance.toLocaleString()} ₫
                                                </td>
                                                <td className="p-3 text-center">—</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="sm:hidden space-y-2">
                                    {sortedAccounts.map(acc => {
                                        const isEditing = editingAccount && editingAccount.id === acc.id;

                                        if (isEditing) {
                                            return (
                                                <div key={acc.id} className="bg-yellow-50/50 p-3 rounded-lg border border-yellow-150 space-y-2">
                                                    <input
                                                        type="text"
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none"
                                                        placeholder="Tên tài khoản"
                                                        value={editingAccount.name}
                                                        onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                                                    />
                                                    <input
                                                        type="number"
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none"
                                                        placeholder="Số dư"
                                                        value={editingAccount.balance}
                                                        onChange={(e) => setEditingAccount({ ...editingAccount, balance: e.target.value })}
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={saveEditAccount} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold">
                                                            Lưu
                                                        </button>
                                                        <button onClick={cancelEditAccount} className="px-3 py-1 bg-gray-500 text-white rounded text-xs font-semibold">
                                                            Hủy
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={acc.id} className="bg-gray-50/50 p-3 rounded-lg border border-black/[0.06] flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold text-sm text-gray-800">{acc.name}</p>
                                                    <p className="text-emerald-600 font-semibold text-sm">{acc.balance.toLocaleString()} ₫</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => startEditAccount(acc)} className="text-blue-500 p-2 hover:bg-blue-50 rounded">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => deleteAccount(acc.id)} className="text-red-500 p-2 hover:bg-red-50 rounded">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center font-bold">
                                        <p className="text-sm text-emerald-800">TỔNG CỘNG</p>
                                        <p className="text-emerald-700">{totalAccountBalance.toLocaleString()} ₫</p>
                                    </div>
                                </div>
                                
                                <div className="bg-gray-50/50 p-3 rounded-xl border border-black/[0.04] mt-3">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            className="border border-black/[0.12] bg-white p-2 rounded flex-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            placeholder="Tên tài khoản mới (Ví dụ: Ngân hàng VCB, Tiền mặt)"
                                            value={newAccount.name}
                                            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                                        />
                                        <input
                                            className="border border-black/[0.12] bg-white p-2 rounded w-full sm:w-36 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            placeholder="Số dư khởi tạo"
                                            type="number"
                                            value={newAccount.balance}
                                            onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                                        />
                                        <button
                                            onClick={addAccount}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold transition-colors disabled:opacity-50"
                                            disabled={!newAccount.name || !newAccount.balance}
                                        >
                                            Thêm tài khoản
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold mb-3 text-sm sm:text-base border-b border-black/[0.04] pb-1">Lịch sử ghi nhận số dư</h3>
                                
                                <div className="bg-gray-50/50 p-3 rounded-xl border border-black/[0.04] mb-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                        <select
                                            className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                            value={newRecord.account_id}
                                            onChange={(e) => setNewRecord({ ...newRecord, account_id: e.target.value })}
                                        >
                                            <option value="">Chọn tài khoản</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="date"
                                            className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                            value={newRecord.date}
                                            onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                                        />
                                        <input
                                            type="number"
                                            className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                            placeholder="Số dư mới"
                                            value={newRecord.balance}
                                            onChange={(e) => setNewRecord({ ...newRecord, balance: e.target.value })}
                                        />
                                        <input
                                            className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                            placeholder="Ghi chú (ví dụ: Chốt tháng, Lương về)"
                                            value={newRecord.note}
                                            onChange={(e) => setNewRecord({ ...newRecord, note: e.target.value })}
                                        />
                                        <button
                                            onClick={addRecord}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition-colors disabled:opacity-50"
                                            disabled={!newRecord.account_id || !newRecord.balance}
                                        >
                                            Cập nhật số dư
                                        </button>
                                    </div>
                                </div>

                                <div className="hidden sm:block overflow-x-auto border border-black/[0.08] rounded-xl shadow-sm">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-700">
                                                <th className="p-3 border-b border-black/[0.08] text-left">Ngày</th>
                                                <th className="p-3 border-b border-black/[0.08] text-left">Tài khoản</th>
                                                <th className="p-3 border-b border-black/[0.08] text-right">Số dư ghi nhận</th>
                                                <th className="p-3 border-b border-black/[0.08] text-left">Ghi chú</th>
                                                <th className="p-3 border-b border-black/[0.08] text-center w-24">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.08]">
                                            {balanceRecords.map(rec => {
                                                const acc = accounts.find(a => a.id === rec.account_id);
                                                const isEditing = editingRecord && editingRecord.id === rec.id;

                                                if (isEditing) {
                                                    return (
                                                        <tr key={rec.id} className="bg-yellow-50/50">
                                                            <td className="p-3 border-b">
                                                                <input
                                                                    type="date"
                                                                    className="border border-black/[0.12] rounded px-2 py-1 w-full text-xs"
                                                                    value={editingRecord.date}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 border-b">
                                                                <select
                                                                    className="border border-black/[0.12] rounded p-1 w-full text-sm focus:outline-none"
                                                                    value={editingRecord.account_id}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, account_id: e.target.value })}
                                                                >
                                                                    {accounts.map(a => (
                                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="p-3 border-b text-right">
                                                                <input
                                                                    type="number"
                                                                    className="border border-black/[0.12] rounded px-2 py-1 w-full text-sm text-right focus:outline-none"
                                                                    value={editingRecord.balance}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, balance: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 border-b">
                                                                <input
                                                                    type="text"
                                                                    className="border border-black/[0.12] rounded px-2 py-1 w-full text-xs"
                                                                    value={editingRecord.note}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 border-b text-center flex items-center justify-center space-x-1.5">
                                                                <button onClick={saveEditRecord} className="text-green-600 p-1.5 hover:bg-green-50 rounded">
                                                                    <Check size={16} />
                                                                </button>
                                                                <button onClick={cancelEditRecord} className="text-gray-500 p-1.5 hover:bg-gray-100 rounded">
                                                                    <X size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return (
                                                    <tr key={rec.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="p-3 text-xs text-gray-500 font-mono">{rec.date}</td>
                                                        <td className="p-3 text-gray-800 font-medium">{acc?.name}</td>
                                                        <td className="p-3 text-right text-emerald-600 font-semibold">
                                                            {rec.balance.toLocaleString()} ₫
                                                        </td>
                                                        <td className="p-3 text-gray-600 text-xs">{rec.note}</td>
                                                        <td className="p-3 text-center flex items-center justify-center space-x-1.5">
                                                            <button onClick={() => startEditRecord(rec)} className="text-blue-500 p-1.5 hover:bg-blue-50 rounded">
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button onClick={() => deleteRecord(rec.id)} className="text-red-500 p-1.5 hover:bg-red-50 rounded">
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="sm:hidden space-y-2">
                                    {balanceRecords.map(rec => {
                                        const acc = accounts.find(a => a.id === rec.account_id);
                                        const isEditing = editingRecord && editingRecord.id === rec.id;

                                        if (isEditing) {
                                            return (
                                                <div key={rec.id} className="bg-yellow-50/50 p-3 rounded-lg border border-yellow-250 space-y-2">
                                                    <input
                                                        type="date"
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm"
                                                        value={editingRecord.date}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                                                    />
                                                    <select
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm"
                                                        value={editingRecord.account_id}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, account_id: e.target.value })}
                                                    >
                                                        {accounts.map(a => (
                                                            <option key={a.id} value={a.id}>{a.name}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number"
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm"
                                                        placeholder="Số dư"
                                                        value={editingRecord.balance}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, balance: e.target.value })}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="border border-black/[0.12] p-2 rounded w-full text-sm"
                                                        placeholder="Ghi chú"
                                                        value={editingRecord.note}
                                                        onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={saveEditRecord} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold">
                                                            Lưu
                                                        </button>
                                                        <button onClick={cancelEditRecord} className="px-3 py-1 bg-gray-500 text-white rounded text-xs font-semibold">
                                                            Hủy
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={rec.id} className="bg-gray-50/50 p-3 rounded-lg border border-black/[0.06]">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div>
                                                        <p className="text-xs text-gray-400 font-mono">{rec.date}</p>
                                                        <p className="font-semibold text-sm text-gray-800">{acc?.name}</p>
                                                        <p className="text-emerald-600 font-semibold text-sm">{rec.balance.toLocaleString()} ₫</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => startEditRecord(rec)} className="text-blue-500 p-2 hover:bg-blue-50 rounded">
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button onClick={() => deleteRecord(rec.id)} className="text-red-500 p-2 hover:bg-red-50 rounded">
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {rec.note && <p className="text-xs text-gray-500 mt-1 border-t border-black/[0.03] pt-1">Ghi chú: {rec.note}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "savings" && (
                        <div className="space-y-4">
                            <div className="bg-gray-50/50 p-3 rounded-xl border border-black/[0.04]">
                                <h3 className="font-semibold mb-3 text-sm">Thêm sổ tiết kiệm mới</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                                    <input
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        placeholder="Số sổ / Mã sổ"
                                        value={newBook.book_number}
                                        onChange={(e) => setNewBook({ ...newBook, book_number: e.target.value })}
                                    />
                                    <input
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        placeholder="Ngân hàng phát hành (Ví dụ: VCB, BIDV)"
                                        value={newBook.bank_name}
                                        onChange={(e) => setNewBook({ ...newBook, bank_name: e.target.value })}
                                    />
                                    <input
                                        type="number"
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        placeholder="Số tiền gốc"
                                        value={newBook.amount}
                                        onChange={(e) => setNewBook({ ...newBook, amount: e.target.value })}
                                    />
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        placeholder="Lãi suất năm % (Ví dụ: 5.5)"
                                        value={newBook.interest_rate}
                                        onChange={(e) => setNewBook({ ...newBook, interest_rate: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    <input
                                        type="date"
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        value={newBook.start_date} 
                                        onChange={(e) => setNewBook({ ...newBook, start_date: e.target.value })}
                                    />
                                    <input
                                        type="date"
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        value={newBook.end_date} 
                                        onChange={(e) => setNewBook({ ...newBook, end_date: e.target.value })}
                                    />
                                    <select
                                        className="border border-black/[0.12] bg-white p-2 rounded text-sm focus:outline-none"
                                        value={newBook.status}
                                        onChange={(e) => setNewBook({ ...newBook, status: e.target.value })}
                                    >
                                        <option value="active">Hoạt động</option>
                                        <option value="matured">Đã đáo hạn</option>
                                    </select>
                                    <button
                                        onClick={addBook}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold transition-colors disabled:opacity-50"
                                        disabled={!newBook.book_number || !newBook.bank_name || !newBook.amount}
                                    >
                                        Lưu thông tin sổ
                                    </button>
                                </div>
                            </div>
                            
                            <div className="bg-white p-3 rounded-xl border border-black/[0.08] shadow-sm">
                                <h3 className="font-semibold mb-2 text-sm">Bộ lọc & Công cụ so sánh lãi</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                    <div className="flex items-center space-x-2 border border-black/[0.1] px-2 py-1.5 rounded bg-blue-50/50">
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-12 p-0 text-sm font-bold text-blue-700 bg-transparent border-none focus:ring-0 focus:outline-none"
                                            value={comparisonRate}
                                            onChange={(e) => setComparisonRate(e.target.value)}
                                        />
                                        <span className="text-xs font-bold text-blue-700">% Lãi so sánh</span>
                                    </div>

                                    <input
                                        type="text"
                                        className="border border-black/[0.12] p-2 rounded text-xs focus:outline-none"
                                        placeholder="Tìm số sổ..."
                                        value={savingsFilters.book_number_search}
                                        onChange={(e) => setSavingsFilters({ ...savingsFilters, book_number_search: e.target.value })}
                                    />

                                    <select
                                        className="border border-black/[0.12] bg-white p-2 rounded text-xs focus:outline-none"
                                        value={savingsFilters.status}
                                        onChange={(e) => setSavingsFilters({ ...savingsFilters, status: e.target.value })}
                                    >
                                        <option value="all">— Trạng thái (Tất cả) —</option>
                                        <option value="active">Hoạt động</option>
                                        <option value="matured">Đã đáo hạn</option>
                                    </select>
                                    
                                    <select
                                        className="border border-black/[0.12] bg-white p-2 rounded text-xs focus:outline-none"
                                        value={savingsFilters.bank_name}
                                        onChange={(e) => setSavingsFilters({ ...savingsFilters, bank_name: e.target.value })}
                                    >
                                        <option value="all">— Ngân hàng (Tất cả) —</option>
                                        {[...new Set(savingsBooks.map(b => b.bank_name))].map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                    
                                    <label className="flex items-center space-x-2 px-2 py-1.5 border border-yellow-100 rounded bg-yellow-50/50 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={savingsFilters.due_this_month}
                                            onChange={(e) => setSavingsFilters({ ...savingsFilters, due_this_month: e.target.checked })}
                                            className="form-checkbox h-3.5 w-3.5 text-orange-600"
                                        />
                                        <span className="font-medium text-orange-800">Đáo hạn tháng này</span>
                                    </label>
                                </div>
                            </div>

                            <div className="hidden lg:block overflow-x-auto border border-black/[0.08] rounded-xl shadow-sm">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-700">
                                            <th className="p-3 border-b border-black/[0.08] text-left">Số sổ</th>
                                            <th className="p-3 border-b border-black/[0.08] text-left">NH</th>
                                            <th className="p-3 border-b border-black/[0.08] text-right">Số tiền</th>
                                            <th className="p-3 border-b border-black/[0.08] text-center">LS</th>
                                            <th className="p-3 border-b border-black/[0.08] text-center">Ngày gửi</th>
                                            <th className="p-3 border-b border-black/[0.08] text-center">Đáo hạn</th>
                                            <th className="p-3 border-b border-black/[0.08] text-right">Lãi gốc</th>
                                            <th className="p-3 border-b border-black/[0.08] text-right">Lãi SS ({comparisonRate}%)</th> 
                                            <th className="p-3 border-b border-black/[0.08] text-center">TT</th>
                                            <th className="p-3 border-b border-black/[0.08] text-center w-24">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.08]">
                                        {savingsBooksToRender.map(book => { 
                                            const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                            const comparisonInterest = calculateComparisonInterest(book);
                                            const daysLeft = getDaysRemaining(book.end_date);
                                            const isActive = book.status === "active";
                                            const isEditing = editingBook && editingBook.id === book.id;
                                            
                                            let comparisonClass = 'text-gray-500';
                                            if (isActive) {
                                                if (comparisonInterest > interest) {
                                                    comparisonClass = 'text-red-600 font-bold'; 
                                                } else if (comparisonInterest < interest) {
                                                    comparisonClass = 'text-emerald-600 font-bold'; 
                                                }
                                            }

                                            if (isEditing) {
                                                return (
                                                    <tr key={book.id} className="bg-yellow-50/50">
                                                        <td className="p-2 border-b">
                                                         <input type="text" className="border border-black/[0.12] rounded p-1 w-full text-xs font-mono" value={editingBook.book_number} onChange={(e) => setEditingBook({ ...editingBook, book_number: e.target.value })} />
                                                       </td>
                                                       <td className="p-2 border-b">
                                                         <input type="text" className="border border-black/[0.12] rounded p-1 w-full text-sm font-medium" value={editingBook.bank_name} onChange={(e) => setEditingBook({ ...editingBook, bank_name: e.target.value })} />
                                                       </td>
                                                        <td className="p-2 border-b text-right">
                                                          <input type="number" className="border border-black/[0.12] rounded p-1 w-full text-sm text-right" value={editingBook.amount} onChange={(e) => setEditingBook({ ...editingBook, amount: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <input type="number" step="0.1" className="border border-black/[0.12] rounded p-1 w-full text-sm text-center" value={editingBook.interest_rate} onChange={(e) => setEditingBook({ ...editingBook, interest_rate: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <input type="date" className="border border-black/[0.12] rounded p-1 w-full text-xs" value={editingBook.start_date} onChange={(e) => setEditingBook({ ...editingBook, start_date: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <input type="date" className="border border-black/[0.12] rounded p-1 w-full text-xs" value={editingBook.end_date} onChange={(e) => setEditingBook({ ...editingBook, end_date: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-right text-emerald-600 font-semibold">
                                                          {calculateInterest(parseFloat(editingBook.amount || 0), parseFloat(editingBook.interest_rate || 0), editingBook.start_date, editingBook.end_date).toLocaleString()}
                                                        </td>
                                                         <td className="p-2 border-b text-right text-blue-600 font-semibold">
                                                          {calculateComparisonInterest(editingBook).toLocaleString()}
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <select className="border border-black/[0.12] bg-white p-1 rounded text-xs" value={editingBook.status} onChange={(e) => setEditingBook({ ...editingBook, status: e.target.value })}>
                                                                <option value="active">HĐ</option>
                                                                <option value="matured">ĐH</option>
                                                            </select>
                                                        </td>
                                                        <td className="p-2 border-b text-center flex items-center justify-center space-x-1">
                                                          <button onClick={saveEditBook} className="text-green-600 p-1 hover:bg-green-150 rounded">
                                                                <Check size={16} />
                                                          </button>
                                                          <button onClick={cancelEditBook} className="text-gray-500 p-1 hover:bg-gray-200 rounded">
                                                                <X size={16} />
                                                          </button>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return (
                                                <tr key={book.id} className={`${isActive ? "hover:bg-gray-50/50" : "bg-gray-50/40 opacity-60"} transition-colors`}>
                                                    <td className="p-3 text-xs font-mono font-medium text-gray-700">{book.book_number}</td>
                                                    <td className="p-3 font-semibold text-gray-800">{book.bank_name}</td>
                                                    <td className="p-3 text-right text-blue-600 font-bold">
                                                        {book.amount.toLocaleString()} ₫
                                                    </td>
                                                    <td className="p-3 text-center font-bold text-gray-800">{book.interest_rate}%</td>
                                                    <td className="p-3 text-center text-xs text-gray-500 font-mono">{book.start_date}</td>
                                                    <td className="p-3 text-center font-mono">
                                                        <div className="text-xs font-medium text-gray-700">{book.end_date}</div>
                                                        {isActive && daysLeft > 0 && (
                                                            <div className="text-[10px] text-orange-600 font-semibold bg-orange-50 rounded px-1 inline-block mt-0.5">Còn {daysLeft} ngày</div>
                                                        )}
                                                        {isActive && daysLeft <= 0 && (
                                                            <div className="text-[10px] text-red-600 font-bold bg-red-50 rounded px-1.5 inline-block mt-0.5">Đáo hạn</div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right text-emerald-600 font-bold">
                                                        {Number(interest).toLocaleString()} ₫
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className={comparisonClass}>
                                                            {isActive ? `${Number(comparisonInterest).toLocaleString()} ₫` : '—'}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => toggleBookStatus(book)}
                                                            className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${
                                                                isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                                            }`}
                                                        >
                                                            {isActive ? "HĐ" : "ĐH"}
                                                        </button>
                                                    </td>
                                                    <td className="p-3 text-center flex items-center justify-center space-x-1.5">
                                                        <button onClick={() => startEditBook(book)} className="text-blue-500 p-1.5 hover:bg-blue-50 rounded">
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button onClick={() => deleteBook(book.id)} className="text-red-500 p-1.5 hover:bg-red-50 rounded">
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-emerald-50/40 font-bold text-emerald-950">
                                            <td className="p-3 text-left border-t" colSpan={2}>TỔNG ({totalSavingsBooksCount} Sổ)</td>
                                            <td className="p-3 text-right text-blue-700 border-t">
                                                {totalAmount.toLocaleString()} ₫
                                            </td>
                                            <td className="p-3 text-center border-t">—</td>
                                            <td className="p-3 text-center border-t">—</td>
                                            <td className="p-3 text-center border-t">—</td>
                                            <td className="p-3 text-right text-emerald-700 border-t">
                                                {totalInterest.toLocaleString()} ₫
                                            </td>
                                            <td className="p-3 text-right text-blue-700 border-t">
                                                {totalComparisonInterest.toLocaleString()} ₫
                                            </td>
                                            <td className="p-3 text-center border-t">—</td>
                                            <td className="p-3 text-center border-t">—</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="lg:hidden space-y-3">
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex justify-between items-center font-bold">
                                    <div>
                                        <p className="text-xs text-emerald-800">Tổng Số Sổ</p>
                                        <p className="text-base text-emerald-700">{totalSavingsBooksCount} sổ</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-emerald-800">Tổng Tiền Gốc</p>
                                        <p className="text-base text-blue-700">{totalAmount.toLocaleString()} ₫</p>
                                    </div>
                                </div>
                                
                                {savingsBooksToRender.map(book => {
                                    const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                    const comparisonInterest = calculateComparisonInterest(book);
                                    const daysLeft = getDaysRemaining(book.end_date);
                                    const isActive = book.status === "active";
                                    const isEditing = editingBook && editingBook.id === book.id;

                                    let comparisonClass = 'text-gray-500';
                                    if (isActive) {
                                        if (comparisonInterest > interest) {
                                            comparisonClass = 'text-red-600 font-bold'; 
                                        } else if (comparisonInterest < interest) {
                                            comparisonClass = 'text-emerald-600 font-bold'; 
                                        }
                                    }

                                    if (isEditing) {
                                        return (
                                            <div key={book.id} className="border border-yellow-200 rounded-lg p-3 bg-yellow-50/50 space-y-2">
                                                 <input type="text" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" placeholder="Số sổ" value={editingBook.book_number} onChange={(e) => setEditingBook({ ...editingBook, book_number: e.target.value })} />
                                                 <input type="text" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" placeholder="Ngân hàng" value={editingBook.bank_name} onChange={(e) => setEditingBook({ ...editingBook, bank_name: e.target.value })} />
                                                 <input type="number" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" placeholder="Số tiền" value={editingBook.amount} onChange={(e) => setEditingBook({ ...editingBook, amount: e.target.value })} />
                                                 <input type="number" step="0.1" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" placeholder="Lãi suất %" value={editingBook.interest_rate} onChange={(e) => setEditingBook({ ...editingBook, interest_rate: e.target.value })} />
                                                 <input type="date" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" value={editingBook.start_date} onChange={(e) => setEditingBook({ ...editingBook, start_date: e.target.value })} />
                                                 <input type="date" className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" value={editingBook.end_date} onChange={(e) => setEditingBook({ ...editingBook, end_date: e.target.value })} />
                                                 <select className="border border-black/[0.12] p-2 rounded w-full text-sm focus:outline-none" value={editingBook.status} onChange={(e) => setEditingBook({ ...editingBook, status: e.target.value })}>
                                                     <option value="active">Hoạt động</option>
                                                     <option value="matured">Đã đáo hạn</option>
                                                 </select>
                                                 <p className="pt-2 border-t border-dashed border-black/[0.08] text-xs text-gray-500">Lãi dự kiến: <span className="text-emerald-600 font-semibold">{calculateInterest(parseFloat(editingBook.amount || 0), parseFloat(editingBook.interest_rate || 0), editingBook.start_date, editingBook.end_date).toLocaleString()} đ</span></p>

                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={saveEditBook} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold">
                                                        Lưu
                                                    </button>
                                                    <button onClick={cancelEditBook} className="px-3 py-1 bg-gray-500 text-white rounded text-xs font-semibold">
                                                        Hủy
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={book.id} className={`border rounded-lg p-3 ${isActive ? "bg-white border-black/[0.08]" : "bg-gray-50 opacity-60 border-black/[0.04]"}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <p className="font-bold text-sm text-gray-800">{book.bank_name}</p>
                                                    <p className="text-xs text-gray-400 font-mono">{book.book_number}</p>
                                                </div>
                                                <div className="flex gap-1 items-center">
                                                    <button
                                                        onClick={() => toggleBookStatus(book)}
                                                        className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${
                                                            isActive ? "bg-green-50 text-green-700" : "bg-gray-200 text-gray-700"
                                                        }`}
                                                    >
                                                        {isActive ? "HĐ" : "ĐH"}
                                                    </button>
                                                    <button onClick={() => startEditBook(book)} className="text-blue-500 p-1 hover:bg-blue-50 rounded">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => deleteBook(book.id)} className="text-red-500 p-1 hover:bg-red-50 rounded">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                                <div>
                                                    <p className="text-gray-400">Số tiền gốc</p>
                                                    <p className="text-blue-600 font-semibold">{book.amount.toLocaleString()} ₫</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400">Lãi suất gốc</p>
                                                    <p className="font-semibold text-gray-700">{book.interest_rate}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400">Ngày gửi</p>
                                                    <p className="text-gray-600 font-mono">{book.start_date}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400">Đáo hạn</p>
                                                    <p className="text-gray-600 font-mono">{book.end_date}</p>
                                                    {isActive && daysLeft > 0 && (
                                                        <p className="text-[10px] text-orange-600 font-semibold">còn {daysLeft} ngày</p>
                                                    )}
                                                    {isActive && daysLeft <= 0 && (
                                                        <p className="text-[10px] text-red-600 font-bold bg-red-50 rounded px-1 inline-block mt-0.5">Đã đáo hạn</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-black/[0.04]">
                                                <p className="text-[10px] text-gray-400">Lãi gốc / Lãi SS ({comparisonRate}%)</p>
                                                <div className="grid grid-cols-2 gap-1 text-sm font-semibold">
                                                     <p className="text-emerald-600">{Number(interest).toLocaleString()} ₫</p>
                                                     <p className={comparisonClass}>{isActive ? `${Number(comparisonInterest).toLocaleString()} ₫` : '—'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountBalance;