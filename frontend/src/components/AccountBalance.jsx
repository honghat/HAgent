import React, { useState, useEffect } from "react";
import { 
    Calendar, Plus, Trash2, Edit2, Check, X, 
    Eye, EyeOff, Wallet, PiggyBank, CreditCard, 
    PieChart, ArrowLeftRight, ChevronDown, ChevronUp, 
    SlidersHorizontal, Filter, ArrowUpRight, ArrowDownLeft, 
    Building2, RefreshCw, CalendarRange
} from "lucide-react"; 
import AssetOverview from "./AssetOverview"; 

const API_URL = "/api/balance";

const getOneYearFromNow = () => {
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);
    return oneYearLater.toISOString().split('T')[0];
};

const getToday = () => new Date().toISOString().split('T')[0];

const formatVNDCompact = (amount, isCompact = true) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "0 ₫";
    if (!isCompact) {
        return `${amount.toLocaleString("vi-VN")} ₫`;
    }
    const absVal = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (absVal >= 1000000000) {
        const val = absVal / 1000000000;
        return `${sign}${parseFloat(val.toFixed(2))} Tỷ ₫`;
    }
    if (absVal >= 1000000) {
        const val = absVal / 1000000;
        return `${sign}${parseFloat(val.toFixed(1))} Tr ₫`;
    }
    if (absVal >= 1000) {
        const val = absVal / 1000;
        return `${sign}${parseFloat(val.toFixed(0))}K ₫`;
    }
    return `${sign}${absVal.toLocaleString("vi-VN")} ₫`;
};

const formatVND = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "0 ₫";
    return `${amount.toLocaleString("vi-VN")} ₫`;
};

const getCardStyle = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes("vcb") || lower.includes("vietcombank")) {
        return {
            bg: "bg-emerald-50 text-emerald-700 border-emerald-100",
            badge: "bg-emerald-100 text-emerald-800 border-emerald-200/50",
            logo: "VCB",
            icon: Building2
        };
    }
    if (lower.includes("bidv")) {
        return {
            bg: "bg-blue-50 text-blue-700 border-blue-100",
            badge: "bg-blue-100 text-blue-800 border-blue-200/50",
            logo: "BIDV",
            icon: Building2
        };
    }
    if (lower.includes("tcb") || lower.includes("techcombank") || lower.includes("techcom")) {
        return {
            bg: "bg-red-50 text-red-700 border-red-100",
            badge: "bg-red-100 text-red-800 border-red-200/50",
            logo: "TCB",
            icon: Building2
        };
    }
    if (lower.includes("acb")) {
        return {
            bg: "bg-sky-50 text-sky-700 border-sky-100",
            badge: "bg-sky-100 text-sky-800 border-sky-200/50",
            logo: "ACB",
            icon: Building2
        };
    }
    if (lower.includes("mbb") || lower.includes("mbbank") || lower.includes("mb")) {
        return {
            bg: "bg-indigo-50 text-indigo-700 border-indigo-100",
            badge: "bg-indigo-100 text-indigo-800 border-indigo-200/50",
            logo: "MB",
            icon: Building2
        };
    }
    if (lower.includes("tm") || lower.includes("tiền mặt") || lower.includes("cash")) {
        return {
            bg: "bg-amber-50 text-amber-700 border-amber-100",
            badge: "bg-amber-100 text-amber-800 border-amber-200/50",
            logo: "TM",
            icon: Wallet
        };
    }
    // Default
    return {
        bg: "bg-slate-50 text-slate-700 border-slate-200",
        badge: "bg-slate-100 text-slate-800 border-slate-200/50",
        logo: name.slice(0, 3).toUpperCase(),
        icon: CreditCard
    };
};

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

    // Custom UI state
    const [showBalances, setShowBalances] = useState(() => localStorage.getItem("hagent_show_balances") !== "false");
    const [showAddAccountForm, setShowAddAccountForm] = useState(false);
    const [showAddRecordForm, setShowAddRecordForm] = useState(false);
    const [showAddBookForm, setShowAddBookForm] = useState(false);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const getRecordChange = (rec) => {
        const sameAccRecs = balanceRecords
            .filter(r => r.account_id === rec.account_id)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const idx = sameAccRecs.findIndex(r => r.id === rec.id);
        if (idx > 0) {
            return rec.balance - sameAccRecs[idx - 1].balance;
        }
        return null;
    };

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

    const BALANCE_TABS = [
        { id: "overview", label: "Tổng quan", icon: PieChart },
        { id: "comparison", label: "So sánh", icon: ArrowLeftRight },
        { id: "balance", label: "Số dư", icon: Wallet },
        { id: "savings", label: "Tiết kiệm", icon: PiggyBank },
    ];

    return (
        <div className="w-full text-slate-900 space-y-0">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-black/[0.04] overflow-hidden">
                {/* Modern Privacy Carbon Header */}
                <div className="relative bg-slate-900 px-5 pt-6 pb-6 sm:px-8 sm:pt-7 sm:pb-7 text-white overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tổng tài sản ước tính</p>
                            {showBalances ? (
                                <div className="flex flex-col gap-0.5">
                                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                                        {formatVNDCompact(fmAssetData.total, true)}
                                    </h2>
                                    <span className="text-[10px] font-semibold text-slate-400 tracking-wide">
                                        ({formatVND(fmAssetData.total)})
                                    </span>
                                </div>
                            ) : (
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-500 tracking-widest">••••••</h2>
                            )}
                        </div>
                        <button 
                            onClick={() => {
                                const next = !showBalances;
                                setShowBalances(next);
                                localStorage.setItem("hagent_show_balances", String(next));
                            }} 
                            className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl border border-white/10 transition-all text-slate-350"
                            title={showBalances ? "Ẩn số dư" : "Hiện số dư"}
                        >
                            {showBalances ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>

                    {/* Compact layout with tiny indicators */}
                    <div className="mt-5 pt-5 border-t border-white/10 flex justify-between items-center text-xs">
                        <div className="flex-1 flex flex-col items-center sm:items-start min-w-0">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> TM
                            </span>
                            <span className="font-extrabold text-white mt-1 truncate max-w-full">
                                {showBalances ? formatVNDCompact(fmAssetData.cash, true) : "••••"}
                            </span>
                        </div>
                        <div className="w-px h-6 bg-white/10 shrink-0" />
                        <div className="flex-1 flex flex-col items-center sm:items-start pl-3 min-w-0">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ngân hàng
                            </span>
                            <span className="font-extrabold text-white mt-1 truncate max-w-full">
                                {showBalances ? formatVNDCompact(fmAssetData.bank, true) : "••••"}
                            </span>
                        </div>
                        <div className="w-px h-6 bg-white/10 shrink-0" />
                        <div className="flex-1 flex flex-col items-center sm:items-start pl-3 min-w-0">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Tiết kiệm
                            </span>
                            <span className="font-extrabold text-white mt-1 truncate max-w-full">
                                {showBalances ? formatVNDCompact(fmAssetData.savings, true) : "••••"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Segmented iOS-style Tab Bar */}
                <div className="bg-slate-50/80 border-b border-black/[0.04] p-2">
                    <div className="flex p-0.5 bg-slate-200/60 rounded-xl max-w-lg mx-auto sm:mx-0 select-none overflow-x-auto no-scrollbar gap-0.5">
                        {BALANCE_TABS.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                                        isActive
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    <Icon size={13} className={isActive ? "text-indigo-600" : "text-slate-400"} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-4 sm:p-6 bg-white">
                    {activeTab === "overview" && (
                        <AssetOverview 
                            user={user}
                            token={token}
                            viewMode="overview"
                            fmData={fmAssetData}
                            showBalances={showBalances}
                        />
                    )}

                    {activeTab === "comparison" && (
                        <AssetOverview 
                            user={user}
                            token={token}
                            viewMode="comparison"
                            fmData={fmAssetData}
                            showBalances={showBalances}
                        />
                    )}

                    {activeTab === "balance" && (
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">Danh sách tài khoản</h3>
                                </div>
                                
                                {/* Desktop Table for Accounts */}
                                <div className="hidden sm:block overflow-hidden border border-black/[0.05] rounded-2xl shadow-sm bg-white">
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500">
                                                <th className="p-3.5 font-bold uppercase tracking-wider text-left pl-5">Tên tài khoản</th>
                                                <th className="p-3.5 font-bold uppercase tracking-wider text-right pr-5">Số dư khả dụng</th>
                                                <th className="p-3.5 font-bold uppercase tracking-wider text-center w-28">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.04]">
                                            {sortedAccounts.map(acc => {
                                                const isEditing = editingAccount && editingAccount.id === acc.id;
                                                const cardStyle = getCardStyle(acc.name);

                                                if (isEditing) {
                                                    return (
                                                        <tr key={acc.id} className="bg-amber-50/30">
                                                            <td className="p-3 pl-5">
                                                                <input
                                                                    type="text"
                                                                    className="border border-slate-250 bg-white px-2.5 py-1.5 rounded-lg w-full text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    value={editingAccount.name}
                                                                    onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 text-right pr-5">
                                                                <input
                                                                    type="number"
                                                                    className="border border-slate-250 bg-white px-2.5 py-1.5 rounded-lg w-full max-w-[200px] text-xs font-semibold text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    value={editingAccount.balance}
                                                                    onChange={(e) => setEditingAccount({ ...editingAccount, balance: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 text-center flex items-center justify-center space-x-1.5">
                                                                <button onClick={saveEditAccount} className="text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors">
                                                                    <Check size={14} className="stroke-[2.5]" />
                                                                </button>
                                                                <button onClick={cancelEditAccount} className="text-slate-500 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                                                    <X size={14} className="stroke-[2.5]" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return (
                                                    <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="p-3.5 pl-5 flex items-center gap-2.5">
                                                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${cardStyle.badge} border border-black/[0.03]`}>
                                                                {cardStyle.logo}
                                                            </span>
                                                            <span className="text-slate-800 font-semibold">{acc.name}</span>
                                                        </td>
                                                        <td className="p-3.5 text-right pr-5 text-emerald-605 font-black whitespace-nowrap">
                                                            {showBalances ? `${acc.balance.toLocaleString()} ₫` : "••••••"}
                                                        </td>
                                                        <td className="p-3.5 text-center">
                                                            <div className="flex items-center justify-center space-x-1">
                                                                <button onClick={() => startEditAccount(acc)} className="text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                    <Edit2 size={13} />
                                                                </button>
                                                                <button onClick={() => deleteAccount(acc.id)} className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-emerald-50/20 font-bold text-emerald-950">
                                                <td className="p-4 pl-5 text-left text-[10px] text-slate-400 uppercase tracking-wider">TỔNG SỐ DƯ TÀI KHOẢN</td>
                                                <td className="p-4 text-right pr-5 text-emerald-700 font-black text-sm whitespace-nowrap">
                                                    {showBalances ? `${totalAccountBalance.toLocaleString()} ₫` : "••••••"}
                                                </td>
                                                <td className="p-4 text-center">—</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile vertical list of accounts */}
                                <div className="sm:hidden space-y-2.5">
                                    {sortedAccounts.map(acc => {
                                        const isEditing = editingAccount && editingAccount.id === acc.id;
                                        const cardStyle = getCardStyle(acc.name);

                                        if (isEditing) {
                                            return (
                                                <div key={acc.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm animate-slide-down">
                                                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Chỉnh sửa tài khoản</p>
                                                    <input
                                                        type="text"
                                                        className="border border-slate-200 bg-white px-3 py-2 rounded-xl w-full text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                        placeholder="Tên tài khoản"
                                                        value={editingAccount.name}
                                                        onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                                                    />
                                                    <input
                                                        type="number"
                                                        className="border border-slate-200 bg-white px-3 py-2 rounded-xl w-full text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                        placeholder="Số dư"
                                                        value={editingAccount.balance}
                                                        onChange={(e) => setEditingAccount({ ...editingAccount, balance: e.target.value })}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button onClick={saveEditAccount} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
                                                            Lưu
                                                        </button>
                                                        <button onClick={cancelEditAccount} className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all">
                                                            Hủy
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div 
                                                key={acc.id} 
                                                className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.015)] transition-all active:scale-[0.99] hover:bg-slate-50/50"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-[10px] shadow-sm border shrink-0 ${cardStyle.bg}`}>
                                                        {cardStyle.logo.slice(0, 3)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-bold text-slate-800 truncate">{acc.name}</h4>
                                                        <p className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">Tài khoản thanh toán</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2.5 shrink-0 pl-2">
                                                    <div className="text-right">
                                                        <div className="text-xs font-black text-slate-900 tracking-tight">
                                                            {showBalances ? formatVNDCompact(acc.balance, true) : "••••••"}
                                                        </div>
                                                        {showBalances && acc.balance >= 1000000 && (
                                                            <div className="text-[8px] text-slate-400 font-semibold mt-0.5">
                                                                {formatVND(acc.balance)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="flex gap-0.5 border-l border-slate-100 pl-1.5 ml-1">
                                                        <button onClick={() => startEditAccount(acc)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button onClick={() => deleteAccount(acc.id)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Small Mobile Total Account Balance Row */}
                                    <div className="flex items-center justify-between p-3.5 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tổng số dư tài khoản</span>
                                        <span className="text-xs font-black text-slate-850">
                                            {showBalances ? formatVNDCompact(totalAccountBalance, false) : "••••••"}
                                        </span>
                                    </div>
                                </div>

                                {/* Collapsible Form Thêm Tài Khoản */}
                                <div className="mt-3">
                                    <button 
                                        onClick={() => setShowAddAccountForm(!showAddAccountForm)}
                                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <Plus size={14} className="stroke-[2.5]" />
                                            <span>Thêm tài khoản mới</span>
                                        </span>
                                        {showAddAccountForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {showAddAccountForm && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 mt-2 space-y-3 shadow-md animate-slide-down">
                                            <input
                                                className="border border-slate-200 bg-slate-50 focus:bg-white px-3 py-2.5 rounded-xl w-full text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                                                placeholder="Tên tài khoản (VD: Vietcombank, Tiền mặt)"
                                                value={newAccount.name}
                                                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    className="border border-slate-200 bg-slate-50 focus:bg-white px-3 py-2.5 rounded-xl flex-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                                                    placeholder="Số dư khởi tạo"
                                                    type="number"
                                                    value={newAccount.balance}
                                                    onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                                                />
                                                <button
                                                    onClick={() => {
                                                        addAccount();
                                                        setShowAddAccountForm(false);
                                                    }}
                                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 shadow-sm shrink-0"
                                                    disabled={!newAccount.name || !newAccount.balance}
                                                >
                                                    Lưu
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Collapsible Form Ghi Nhận Số Dư & Timeline */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] p-4 mt-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhật ký số dư</h4>
                                    <button 
                                        onClick={() => setShowAddRecordForm(!showAddRecordForm)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-605 rounded-lg text-xs font-bold transition-all"
                                    >
                                        <RefreshCw size={12} className="stroke-[2.5]" />
                                        <span>{showAddRecordForm ? "Đóng" : "Ghi nhận số dư"}</span>
                                    </button>
                                </div>

                                {showAddRecordForm && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-200 shadow-inner mb-4 animate-slide-down">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tài khoản</label>
                                            <select
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none transition-all"
                                                value={newRecord.account_id}
                                                onChange={(e) => setNewRecord({ ...newRecord, account_id: e.target.value })}
                                            >
                                                <option value="">Chọn tài khoản</option>
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ngày ghi nhận</label>
                                            <input
                                                type="date"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none transition-all"
                                                value={newRecord.date}
                                                onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Số dư mới (₫)</label>
                                            <input
                                                type="number"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none transition-all"
                                                placeholder="Số dư mới"
                                                value={newRecord.balance}
                                                onChange={(e) => setNewRecord({ ...newRecord, balance: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ghi chú</label>
                                            <input
                                                type="text"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-500 focus:border-indigo-500 focus:outline-none transition-all"
                                                placeholder="Ví dụ: Chốt tháng, Lương về"
                                                value={newRecord.note}
                                                onChange={(e) => setNewRecord({ ...newRecord, note: e.target.value })}
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                addRecord();
                                                setShowAddRecordForm(false);
                                            }}
                                            className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 shadow-sm"
                                            disabled={!newRecord.account_id || !newRecord.balance}
                                        >
                                            Cập nhật
                                        </button>
                                    </div>
                                )}

                                {/* Desktop Records Table */}
                                <div className="hidden sm:block overflow-hidden border border-black/[0.05] rounded-2xl shadow-sm bg-white mt-1">
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-605">
                                                <th className="p-3 font-bold uppercase tracking-wider text-left pl-5">Ngày</th>
                                                <th className="p-3 font-bold uppercase tracking-wider text-left">Tài khoản</th>
                                                <th className="p-3 font-bold uppercase tracking-wider text-right">Số dư ghi nhận</th>
                                                <th className="p-3 font-bold uppercase tracking-wider text-left pl-5">Biến động</th>
                                                <th className="p-3 font-bold uppercase tracking-wider text-left pl-5">Ghi chú</th>
                                                <th className="p-3 font-bold uppercase tracking-wider text-center w-24">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.04]">
                                            {balanceRecords.map(rec => {
                                                const acc = accounts.find(a => a.id === rec.account_id);
                                                const isEditing = editingRecord && editingRecord.id === rec.id;
                                                const change = getRecordChange(rec);

                                                if (isEditing) {
                                                    return (
                                                        <tr key={rec.id} className="bg-yellow-50/50">
                                                            <td className="p-3 pl-5">
                                                                <input
                                                                    type="date"
                                                                    className="border border-slate-200 rounded px-2 py-1 w-full text-xs font-semibold"
                                                                    value={editingRecord.date}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3">
                                                                <select
                                                                    className="border border-slate-200 rounded p-1 w-full text-xs font-semibold focus:outline-none"
                                                                    value={editingRecord.account_id}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, account_id: e.target.value })}
                                                                >
                                                                    {accounts.map(a => (
                                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="p-3 text-right">
                                                                <input
                                                                    type="number"
                                                                    className="border border-slate-200 rounded px-2 py-1.5 w-full text-xs font-bold text-right focus:outline-none"
                                                                    value={editingRecord.balance}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, balance: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 pl-5">—</td>
                                                            <td className="p-3 pl-5">
                                                                <input
                                                                    type="text"
                                                                    className="border border-slate-200 rounded px-2 py-1 w-full text-xs font-semibold"
                                                                    value={editingRecord.note}
                                                                    onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="p-3 text-center flex items-center justify-center space-x-1.5">
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
                                                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="p-3 pl-5 text-slate-500 font-mono font-semibold">{rec.date}</td>
                                                        <td className="p-3 text-slate-800 font-semibold">{acc?.name}</td>
                                                        <td className="p-3 text-right text-emerald-600 font-black whitespace-nowrap">
                                                            {showBalances ? `${rec.balance.toLocaleString()} ₫` : "••••••"}
                                                        </td>
                                                        <td className="p-3 pl-5">
                                                            {change !== null ? (
                                                                change > 0 ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                                        <ArrowUpRight size={10} className="stroke-[3]" />
                                                                        +{showBalances ? `${change.toLocaleString()} ₫` : "•••"}
                                                                    </span>
                                                                ) : change < 0 ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                                                        <ArrowDownLeft size={10} className="stroke-[3]" />
                                                                        {showBalances ? `${change.toLocaleString()} ₫` : "•••"}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 font-semibold">—</span>
                                                                )
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">Khởi tạo</span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 pl-5 text-slate-500 font-semibold">{rec.note || "—"}</td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex items-center justify-center space-x-1">
                                                                <button onClick={() => startEditRecord(rec)} className="text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg">
                                                                    <Edit2 size={13} />
                                                                </button>
                                                                <button onClick={() => deleteRecord(rec.id)} className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg">
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Timeline Records */}
                                <div className="sm:hidden mt-4 pl-3.5 relative border-l border-slate-200 ml-2 space-y-4">
                                    {balanceRecords.map(rec => {
                                        const acc = accounts.find(a => a.id === rec.account_id);
                                        const isEditing = editingRecord && editingRecord.id === rec.id;
                                        const change = getRecordChange(rec);
                                        
                                        // Determine timeline point color
                                        let pointBg = "bg-slate-300";
                                        if (change !== null) {
                                            pointBg = change > 0 ? "bg-emerald-500" : change < 0 ? "bg-rose-500" : "bg-slate-400";
                                        }

                                        if (isEditing) {
                                            return (
                                                <div key={rec.id} className="relative bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm animate-slide-down">
                                                    <div className="absolute -left-[19px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white ring-4 ring-indigo-500/20 bg-indigo-500" />
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Ngày ghi nhận</label>
                                                        <input
                                                            type="date"
                                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                                                            value={editingRecord.date}
                                                            onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tài khoản</label>
                                                        <select
                                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                                                            value={editingRecord.account_id}
                                                            onChange={(e) => setEditingRecord({ ...editingRecord, account_id: e.target.value })}
                                                        >
                                                            {accounts.map(a => (
                                                                <option key={a.id} value={a.id}>{a.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Số dư mới</label>
                                                        <input
                                                            type="number"
                                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold focus:border-indigo-500 focus:outline-none"
                                                            value={editingRecord.balance}
                                                            onChange={(e) => setEditingRecord({ ...editingRecord, balance: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Ghi chú</label>
                                                        <input
                                                            type="text"
                                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                                                            value={editingRecord.note}
                                                            onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={saveEditRecord} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">Lưu</button>
                                                        <button onClick={cancelEditRecord} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold">Hủy</button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={rec.id} className="relative pl-3">
                                                {/* Timeline node */}
                                                <div className={`absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-4 ${change > 0 ? "ring-emerald-500/10" : change < 0 ? "ring-rose-500/10" : "ring-slate-400/10"} ${pointBg}`} />
                                                
                                                <div className="flex justify-between items-start gap-1">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-mono font-bold">{rec.date}</span>
                                                        <h5 className="font-bold text-slate-800 text-xs mt-0.5">{acc?.name}</h5>
                                                        <p className="text-emerald-700 font-black text-xs mt-0.5">
                                                            {showBalances ? formatVNDCompact(rec.balance, true) : "••••••"}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <div className="flex gap-0.5">
                                                            <button onClick={() => startEditRecord(rec)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors">
                                                                <Edit2 size={11} />
                                                            </button>
                                                            <button onClick={() => deleteRecord(rec.id)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-colors">
                                                                <Trash2 size={11} />
                                                            </button>
                                                        </div>
                                                        {change !== null ? (
                                                            change > 0 ? (
                                                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                                    <ArrowUpRight size={8} className="stroke-[3]" />
                                                                    +{showBalances ? formatVNDCompact(change, true) : "•••"}
                                                                </span>
                                                            ) : change < 0 ? (
                                                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                                                    <ArrowDownLeft size={8} className="stroke-[3]" />
                                                                    {showBalances ? formatVNDCompact(change, true) : "•••"}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] text-slate-400 font-semibold">—</span>
                                                            )
                                                        ) : (
                                                            <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">Khởi tạo</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {rec.note && (
                                                    <p className="text-[9px] text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100 mt-1 max-w-[90%] font-medium">
                                                        {rec.note}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "savings" && (
                        <div className="space-y-4 animate-fade-in">
                            {/* Actions Header for Savings */}
                            <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
                                <button
                                    onClick={() => setShowAddBookForm(!showAddBookForm)}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                >
                                    <Plus size={14} className="stroke-[2.5]" />
                                    <span>Thêm sổ tiết kiệm mới</span>
                                </button>
                                
                                <button
                                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2.5 px-4 border rounded-xl text-xs font-bold transition-all ${
                                        showFilterPanel || savingsFilters.due_this_month || savingsFilters.book_number_search || savingsFilters.bank_name !== "all" || savingsFilters.status !== "active"
                                            ? "border-indigo-600 bg-indigo-50/50 text-indigo-700"
                                            : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                    }`}
                                >
                                    <SlidersHorizontal size={13} />
                                    <span>Bộ lọc & So sánh</span>
                                    {showFilterPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                            </div>

                            {/* Collapsible Form Thêm Sổ */}
                            {showAddBookForm && (
                                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/60 space-y-4 shadow-sm animate-slide-down">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhập thông tin sổ tiết kiệm mới</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Số sổ / Mã sổ</label>
                                            <input
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
                                                placeholder="Mã sổ..."
                                                value={newBook.book_number}
                                                onChange={(e) => setNewBook({ ...newBook, book_number: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ngân hàng phát hành</label>
                                            <input
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
                                                placeholder="VCB, BIDV, Techcombank..."
                                                value={newBook.bank_name}
                                                onChange={(e) => setNewBook({ ...newBook, bank_name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Số tiền gốc (₫)</label>
                                            <input
                                                type="number"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                                                placeholder="Số tiền gốc..."
                                                value={newBook.amount}
                                                onChange={(e) => setNewBook({ ...newBook, amount: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Lãi suất (% / năm)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                                                placeholder="5.5"
                                                value={newBook.interest_rate}
                                                onChange={(e) => setNewBook({ ...newBook, interest_rate: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ngày gửi</label>
                                            <input
                                                type="date"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
                                                value={newBook.start_date} 
                                                onChange={(e) => setNewBook({ ...newBook, start_date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ngày đáo hạn</label>
                                            <input
                                                type="date"
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
                                                value={newBook.end_date} 
                                                onChange={(e) => setNewBook({ ...newBook, end_date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Trạng thái</label>
                                            <select
                                                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 focus:border-indigo-500 focus:outline-none"
                                                value={newBook.status}
                                                onChange={(e) => setNewBook({ ...newBook, status: e.target.value })}
                                            >
                                                <option value="active">Hoạt động</option>
                                                <option value="matured">Đã đáo hạn</option>
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                onClick={() => {
                                                    addBook();
                                                    setShowAddBookForm(false);
                                                }}
                                                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                                disabled={!newBook.book_number || !newBook.bank_name || !newBook.amount}
                                            >
                                                Lưu thông tin
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Collapsible Filter Panel */}
                            {showFilterPanel && (
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-3 animate-slide-down">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bộ lọc nâng cao & So sánh lãi suất</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                        <div className="flex items-center space-x-2 border border-blue-205 bg-blue-50/40 px-3 py-1.5 rounded-xl">
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-10 p-0 text-xs font-bold text-blue-700 bg-transparent border-none focus:ring-0 focus:outline-none"
                                                value={comparisonRate}
                                                onChange={(e) => setComparisonRate(e.target.value)}
                                            />
                                            <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">% Lãi so sánh</span>
                                        </div>

                                        <input
                                            type="text"
                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-slate-350 focus:border-indigo-500 focus:outline-none transition-all"
                                            placeholder="Tìm số sổ..."
                                            value={savingsFilters.book_number_search}
                                            onChange={(e) => setSavingsFilters({ ...savingsFilters, book_number_search: e.target.value })}
                                        />

                                        <select
                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-slate-350 focus:border-indigo-500 focus:outline-none transition-all"
                                            value={savingsFilters.status}
                                            onChange={(e) => setSavingsFilters({ ...savingsFilters, status: e.target.value })}
                                        >
                                            <option value="all">— Trạng thái (Tất cả) —</option>
                                            <option value="active">Hoạt động</option>
                                            <option value="matured">Đã đáo hạn</option>
                                        </select>
                                        
                                        <select
                                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-slate-350 focus:border-indigo-500 focus:outline-none transition-all"
                                            value={savingsFilters.bank_name}
                                            onChange={(e) => setSavingsFilters({ ...savingsFilters, bank_name: e.target.value })}
                                        >
                                            <option value="all">— Ngân hàng (Tất cả) —</option>
                                            {[...new Set(savingsBooks.map(b => b.bank_name))].map(bank => (
                                                <option key={bank} value={bank}>{bank}</option>
                                            ))}
                                        </select>
                                        
                                        <label className="flex items-center space-x-2 px-3 py-1.5 border border-orange-100 rounded-xl bg-orange-50/40 text-xs cursor-pointer hover:bg-orange-50/70 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={savingsFilters.due_this_month}
                                                onChange={(e) => setSavingsFilters({ ...savingsFilters, due_this_month: e.target.checked })}
                                                className="form-checkbox h-3.5 w-3.5 text-orange-600 rounded border-slate-200 focus:ring-orange-500/30"
                                            />
                                            <span className="font-bold text-orange-850 text-[9px] uppercase tracking-wide">Đáo hạn tháng này</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Desktop Savings Table */}
                            <div className="hidden lg:block overflow-hidden border border-black/[0.05] rounded-2xl shadow-sm bg-white">
                                <table className="w-full border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600">
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-left pl-5">Số sổ</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-left">Ngân hàng</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-right">Số tiền gốc</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-center">Lãi suất</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-center">Gửi / Đáo hạn</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-right">Lãi thực</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-right">Lãi SS ({comparisonRate}%)</th> 
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-center">Trạng thái</th>
                                            <th className="p-3.5 font-bold uppercase tracking-wider text-center w-24">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.04]">
                                        {savingsBooksToRender.map(book => { 
                                            const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                            const comparisonInterest = calculateComparisonInterest(book);
                                            const daysLeft = getDaysRemaining(book.end_date);
                                            const isActive = book.status === "active";
                                            const isEditing = editingBook && editingBook.id === book.id;
                                            const cardStyle = getCardStyle(book.bank_name);
                                            
                                            let comparisonClass = 'text-slate-400 font-bold';
                                            if (isActive) {
                                                if (comparisonInterest > interest) {
                                                    comparisonClass = 'text-rose-500 font-extrabold'; 
                                                } else if (comparisonInterest < interest) {
                                                    comparisonClass = 'text-emerald-600 font-extrabold'; 
                                                }
                                            }

                                            if (isEditing) {
                                                return (
                                                    <tr key={book.id} className="bg-yellow-50/50">
                                                        <td className="p-2 border-b">
                                                          <input type="text" className="border border-slate-200 rounded px-2 py-1 w-full text-xs font-semibold" value={editingBook.book_number} onChange={(e) => setEditingBook({ ...editingBook, book_number: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b">
                                                          <input type="text" className="border border-slate-200 rounded px-2 py-1.5 w-full text-xs font-semibold" value={editingBook.bank_name} onChange={(e) => setEditingBook({ ...editingBook, bank_name: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-right">
                                                          <input type="number" className="border border-slate-200 rounded px-2 py-1.5 w-full text-xs font-bold text-right focus:outline-none" value={editingBook.amount} onChange={(e) => setEditingBook({ ...editingBook, amount: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <input type="number" step="0.1" className="border border-slate-200 rounded px-2 py-1.5 w-full max-w-[70px] text-xs font-bold text-center focus:outline-none" value={editingBook.interest_rate} onChange={(e) => setEditingBook({ ...editingBook, interest_rate: e.target.value })} />
                                                        </td>
                                                        <td className="p-2 border-b text-center" colSpan={2}>
                                                          <div className="flex items-center justify-center gap-1">
                                                              <input type="date" className="border border-slate-200 rounded p-1 text-xs" value={editingBook.start_date} onChange={(e) => setEditingBook({ ...editingBook, start_date: e.target.value })} />
                                                              <span>→</span>
                                                              <input type="date" className="border border-slate-200 rounded p-1 text-xs" value={editingBook.end_date} onChange={(e) => setEditingBook({ ...editingBook, end_date: e.target.value })} />
                                                          </div>
                                                        </td>
                                                        <td className="p-2 border-b text-right text-emerald-605 font-extrabold">
                                                          {calculateInterest(parseFloat(editingBook.amount || 0), parseFloat(editingBook.interest_rate || 0), editingBook.start_date, editingBook.end_date).toLocaleString()}
                                                        </td>
                                                        <td className="p-2 border-b text-center">
                                                          <select className="border border-slate-200 bg-white p-1 rounded text-xs" value={editingBook.status} onChange={(e) => setEditingBook({ ...editingBook, status: e.target.value })}>
                                                                <option value="active">Hoạt động</option>
                                                                <option value="matured">Đáo hạn</option>
                                                            </select>
                                                        </td>
                                                        <td className="p-2 border-b text-center flex items-center justify-center space-x-1.5 mt-1">
                                                          <button onClick={saveEditBook} className="text-emerald-605 p-1.5 hover:bg-emerald-50 rounded-lg">
                                                                <Check size={14} className="stroke-[2.5]" />
                                                          </button>
                                                          <button onClick={cancelEditBook} className="text-slate-500 p-1.5 hover:bg-slate-100 rounded-lg">
                                                                <X size={14} className="stroke-[2.5]" />
                                                          </button>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return (
                                                <tr key={book.id} className={`${isActive ? "hover:bg-slate-50/50" : "bg-slate-50/40 opacity-60"} transition-colors`}>
                                                    <td className="p-3.5 pl-5 text-slate-500 font-mono font-semibold">{book.book_number}</td>
                                                    <td className="p-3.5 font-semibold text-slate-800 flex items-center gap-2">
                                                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${cardStyle.badge} border border-black/[0.03]`}>
                                                            {cardStyle.logo.slice(0,3)}
                                                        </span>
                                                        <span>{book.bank_name}</span>
                                                    </td>
                                                    <td className="p-3.5 text-right text-indigo-950 font-black whitespace-nowrap">
                                                        {showBalances ? `${book.amount.toLocaleString()} ₫` : "••••••"}
                                                    </td>
                                                    <td className="p-3.5 text-center font-bold text-slate-700">{book.interest_rate}%</td>
                                                    <td className="p-3.5 text-center">
                                                        <div className="font-mono text-slate-500">{book.start_date} → {book.end_date}</div>
                                                        {isActive && daysLeft > 0 && (
                                                            <div className="text-[10px] text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full inline-block mt-1">Còn {daysLeft} ngày</div>
                                                        )}
                                                        {isActive && daysLeft <= 0 && (
                                                            <div className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full inline-block mt-1 animate-pulse">Đáo hạn</div>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5 text-right text-emerald-600 font-black whitespace-nowrap">
                                                        {showBalances ? `${Number(interest).toLocaleString()} ₫` : "••••••"}
                                                    </td>
                                                    <td className="p-3.5 text-right whitespace-nowrap">
                                                        <div className={comparisonClass}>
                                                            {isActive ? (showBalances ? `${Number(comparisonInterest).toLocaleString()} ₫` : "••••••") : '—'}
                                                        </div>
                                                    </td>
                                                    <td className="p-3.5 text-center">
                                            <button onClick={() => deleteBook(book.id)} className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg">
                                                                <Trash2 size={13} />
                                                            </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-slate-50/50 font-bold text-slate-800">
                                            <td className="p-4 pl-5 text-left text-[10px] text-slate-400 uppercase tracking-wider" colSpan={2}>TỔNG ({totalSavingsBooksCount} Sổ)</td>
                                            <td className="p-4 text-right text-indigo-950 font-black text-sm whitespace-nowrap">
                                                {showBalances ? `${totalAmount.toLocaleString()} ₫` : "••••••"}
                                            </td>
                                            <td className="p-4 text-center">—</td>
                                            <td className="p-4 text-center">—</td>
                                            <td className="p-4 text-right text-emerald-700 font-black text-sm whitespace-nowrap">
                                                {showBalances ? `${totalInterest.toLocaleString()} ₫` : "••••••"}
                                            </td>
                                            <td className="p-4 text-right text-indigo-950 font-black text-sm whitespace-nowrap">
                                                {showBalances ? `${totalComparisonInterest.toLocaleString()} ₫` : "••••••"}
                                            </td>
                                            <td className="p-4 text-center">—</td>
                                            <td className="p-4 text-center">—</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile cards tiết kiệm — thiết kế chứng chỉ tiền gửi cao cấp */}
                            <div className="lg:hidden space-y-4">
                                {/* Summary mini-cards */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100 text-center shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Sổ hoạt động</p>
                                        <p className="text-lg font-black text-slate-800">{savingsBooksToRender.filter(b => b.status === "active").length} / {totalSavingsBooksCount}</p>
                                    </div>
                                    <div className="bg-indigo-50/20 p-3 rounded-2xl border border-indigo-100/50 text-center shadow-sm">
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">Tổng tiền gốc</p>
                                        <p className="text-sm font-black text-indigo-700 truncate leading-tight mt-0.5">
                                            {showBalances ? formatVNDCompact(totalAmount, true) : "••••••"}
                                        </p>
                                    </div>
                                </div>

                                {savingsBooksToRender.map(book => {
                                    const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                    const comparisonInterest = calculateComparisonInterest(book);
                                    const daysLeft = getDaysRemaining(book.end_date);
                                    const isActive = book.status === "active";
                                    const isEditing = editingBook && editingBook.id === book.id;
                                    
                                    const dStart = new Date(book.start_date);
                                    const dEnd = new Date(book.end_date);
                                    const totalDays = Math.max(1, Math.ceil((dEnd - dStart) / (1000 * 60 * 60 * 24)));
                                    const elapsedDays = Math.max(0, Math.ceil((new Date() - dStart) / (1000 * 60 * 60 * 24)));
                                    const progressPct = isActive ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 100;
                                    
                                    const cardStyle = getCardStyle(book.bank_name);

                                    let comparisonClass = 'text-slate-400 font-bold';
                                    if (isActive) {
                                        comparisonClass = comparisonInterest > interest ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold';
                                    }

                                    if (isEditing) {
                                        return (
                                            <div key={book.id} className="bg-amber-50/40 p-4 rounded-2xl border border-amber-200 space-y-3 shadow-sm animate-slide-down">
                                                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Chỉnh sửa sổ tiết kiệm</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input type="text" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs col-span-2 focus:outline-none" placeholder="Mã số sổ" value={editingBook.book_number} onChange={(e) => setEditingBook({ ...editingBook, book_number: e.target.value })} />
                                                    <input type="text" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs col-span-2 focus:outline-none" placeholder="Ngân hàng" value={editingBook.bank_name} onChange={(e) => setEditingBook({ ...editingBook, bank_name: e.target.value })} />
                                                    <input type="number" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs focus:outline-none" placeholder="Số tiền gốc" value={editingBook.amount} onChange={(e) => setEditingBook({ ...editingBook, amount: e.target.value })} />
                                                    <input type="number" step="0.1" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs focus:outline-none" placeholder="Lãi suất %" value={editingBook.interest_rate} onChange={(e) => setEditingBook({ ...editingBook, interest_rate: e.target.value })} />
                                                    <input type="date" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs focus:outline-none" value={editingBook.start_date} onChange={(e) => setEditingBook({ ...editingBook, start_date: e.target.value })} />
                                                    <input type="date" className="border border-slate-205 bg-white px-3 py-2 rounded-xl text-xs focus:outline-none" value={editingBook.end_date} onChange={(e) => setEditingBook({ ...editingBook, end_date: e.target.value })} />
                                                    <select className="border border-slate-250 bg-white px-3 py-2 rounded-xl text-xs col-span-2 focus:outline-none" value={editingBook.status} onChange={(e) => setEditingBook({ ...editingBook, status: e.target.value })}>
                                                        <option value="active">Hoạt động</option>
                                                        <option value="matured">Đáo hạn</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                    <button onClick={saveEditBook} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm">Lưu</button>
                                                    <button onClick={cancelEditBook} className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold">Hủy</button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={book.id}
                                            className={`bg-white rounded-2xl border-y border-r border-l-4 shadow-[0_2px_8px_rgba(0,0,0,0.015)] overflow-hidden transition-all duration-300 relative ${
                                                isActive ? "border-slate-150 border-l-indigo-600" : "border-slate-100 border-l-slate-400 opacity-60"
                                            }`}
                                        >
                                            <div className="p-4 pb-2 flex justify-between items-center">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[9px] border shadow-sm ${cardStyle.bg}`}>
                                                        {cardStyle.logo.slice(0,2)}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-800 text-xs">{book.bank_name}</span>
                                                        <p className="text-[9px] text-slate-400 font-mono tracking-wider font-semibold">{book.book_number}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => toggleBookStatus(book)}
                                                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                                            isActive 
                                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                                                : "bg-slate-100 text-slate-500 border-slate-200"
                                                        }`}
                                                    >
                                                        {isActive ? "Hoạt động" : "Đáo hạn"}
                                                    </button>
                                                    <div className="flex gap-0.5 border-l border-slate-100 pl-1.5">
                                                        <button onClick={() => startEditBook(book)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600"><Edit2 size={11} /></button>
                                                        <button onClick={() => deleteBook(book.id)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500"><Trash2 size={11} /></button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="px-4 pb-2 flex justify-between items-baseline">
                                                {showBalances ? (
                                                    <div className="flex flex-col">
                                                        <h4 className="text-base font-black text-slate-900 tracking-tight">
                                                            {formatVNDCompact(book.amount, true)}
                                                        </h4>
                                                        {book.amount >= 1000000 && (
                                                            <span className="text-[8px] text-slate-400 font-semibold mt-0.5">
                                                                ({formatVND(book.amount)})
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <h4 className="text-base font-black text-slate-400">••••••</h4>
                                                )}
                                                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                                                    Lãi: <strong className="text-indigo-600">{book.interest_rate}%</strong>
                                                </span>
                                            </div>

                                            <div className="px-4 py-1.5 space-y-1">
                                                <div className="flex justify-between text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                                                    <span>Tiến độ đáo hạn</span>
                                                    <span>{progressPct}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            !isActive ? "bg-slate-400" : daysLeft <= 0 ? "bg-red-500 animate-pulse" : "bg-indigo-600"
                                                        }`}
                                                        style={{ width: `${progressPct}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="mt-2 grid grid-cols-2 border-t border-slate-100 bg-slate-50/50 text-[10px] py-2 font-semibold text-slate-600">
                                                <div className="px-4 py-0.5 border-r border-slate-100">
                                                    <span className="text-[8px] uppercase tracking-wider text-slate-400 block mb-0.5">Thời gian gửi</span>
                                                    <span className="font-mono text-slate-700">{book.start_date} → {book.end_date}</span>
                                                    {isActive && (
                                                        <div className="mt-0.5">
                                                            {daysLeft > 0 ? (
                                                                <span className="text-[8px] font-extrabold text-orange-600 bg-orange-50 px-1 py-0.2 rounded">còn {daysLeft} ngày</span>
                                                            ) : (
                                                                <span className="text-[8px] font-extrabold text-red-600 bg-red-50 px-1.5 py-0.2 rounded animate-pulse">đến hạn rút</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="px-4 py-0.5">
                                                    <span className="text-[8px] uppercase tracking-wider text-slate-400 block mb-0.5">Lãi thu về / So sánh</span>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-emerald-700">Lãi: {showBalances ? formatVNDCompact(interest, true) : "•••"}</span>
                                                        <span className={comparisonClass}>
                                                            SS: {isActive ? (showBalances ? formatVNDCompact(comparisonInterest, true) : "•••") : "—"}
                                                        </span>
                                                    </div>
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