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

    const mask = (v) => showBalances ? v : "••••••";
    const fmtFull = (n) => n == null ? "0 ₫" : `${n.toLocaleString("vi-VN")} ₫`;

    return (
        <div className="w-full flex flex-col gap-4">

            {/* ── Tabs ── */}
            <div className="flex p-0.5 bg-slate-200/60 rounded-xl select-none overflow-x-auto no-scrollbar gap-0.5 max-w-fit mx-auto">
                {BALANCE_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-4 rounded-lg text-xs font-bold transition-all duration-200 select-none cursor-pointer ${
                                isActive ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
                            }`}
                        >
                            <Icon size={13} className={isActive ? "text-indigo-600" : "text-slate-400"} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Header tổng quan ── */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Tổng tài sản</p>
                        <p className="text-2xl font-black text-gray-900">
                            {mask(formatVNDCompact(fmAssetData.total, true))}
                        </p>
                        {showBalances && (
                            <p className="text-xs text-gray-400 mt-0.5">{fmtFull(fmAssetData.total)}</p>
                        )}
                    </div>
                    <button
                        onClick={() => { const n = !showBalances; setShowBalances(n); localStorage.setItem("hagent_show_balances", String(n)); }}
                        className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        {showBalances ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: "Tiền mặt", value: fmAssetData.cash, dot: "bg-amber-400" },
                        { label: "Ngân hàng", value: fmAssetData.bank, dot: "bg-emerald-400" },
                        { label: "Tiết kiệm", value: fmAssetData.savings, dot: "bg-indigo-400" },
                    ].map(item => (
                        <div key={item.label} className="bg-gray-50 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{item.label}</span>
                            </div>
                            <p className="text-xs font-black text-gray-800 truncate">
                                {mask(formatVNDCompact(item.value, true))}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Nội dung tab ── */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">

                {/* Tổng quan */}
                {activeTab === "overview" && (
                    <div className="p-4">
                        <AssetOverview user={user} token={token} viewMode="overview" fmData={fmAssetData} showBalances={showBalances} />
                    </div>
                )}

                {/* So sánh */}
                {activeTab === "comparison" && (
                    <div className="p-4">
                        <AssetOverview user={user} token={token} viewMode="comparison" fmData={fmAssetData} showBalances={showBalances} />
                    </div>
                )}

                {/* Số dư */}
                {activeTab === "balance" && (
                    <div className="flex flex-col">
                        {/* Account list */}
                        <div className="divide-y divide-gray-50">
                            {sortedAccounts.map(acc => {
                                const cs = getCardStyle(acc.name);
                                const isEditing = editingAccount && editingAccount.id === acc.id;
                                if (isEditing) return (
                                    <div key={acc.id} className="flex items-center gap-2 px-4 py-3 bg-indigo-50/40">
                                        <input className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-white" value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})} />
                                        <input type="number" className="w-32 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:border-indigo-400 bg-white" value={editingAccount.balance} onChange={e => setEditingAccount({...editingAccount, balance: e.target.value})} />
                                        <button onClick={saveEditAccount} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check size={14} /></button>
                                        <button onClick={cancelEditAccount} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={14} /></button>
                                    </div>
                                );
                                return (
                                    <div key={acc.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group">
                                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[9px] font-black shrink-0 border ${cs.bg}`}>{cs.logo.slice(0,3)}</span>
                                        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{acc.name}</span>
                                        <span className="text-sm font-black text-gray-900">{mask(fmtFull(acc.balance))}</span>
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button onClick={() => startEditAccount(acc)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"><Edit2 size={12} /></button>
                                            <button onClick={() => deleteAccount(acc.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tổng số dư</span>
                                <span className="text-sm font-black text-gray-800">{mask(fmtFull(totalAccountBalance))}</span>
                            </div>
                        </div>

                        {/* Add account form */}
                        <div className="border-t border-gray-100 px-4 py-3">
                            <button onClick={() => setShowAddAccountForm(!showAddAccountForm)} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                                <Plus size={13} /> Thêm tài khoản
                                {showAddAccountForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {showAddAccountForm && (
                                <div className="flex gap-2 mt-2.5">
                                    <input className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-gray-50" placeholder="Tên tài khoản" value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} />
                                    <input type="number" className="w-28 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:border-indigo-400 bg-gray-50" placeholder="Số dư" value={newAccount.balance} onChange={e => setNewAccount({...newAccount, balance: e.target.value})} />
                                    <button onClick={() => { addAccount(); setShowAddAccountForm(false); }} disabled={!newAccount.name || !newAccount.balance} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">Lưu</button>
                                </div>
                            )}
                        </div>

                        {/* Balance records */}
                        <div className="border-t border-gray-100">
                            <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nhật ký số dư</span>
                                <button onClick={() => setShowAddRecordForm(!showAddRecordForm)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                    <RefreshCw size={11} /> Ghi nhận {showAddRecordForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>
                            </div>

                            {showAddRecordForm && (
                                <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                                    <select className="col-span-2 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" value={newRecord.account_id} onChange={e => setNewRecord({...newRecord, account_id: e.target.value})}>
                                        <option value="">Chọn tài khoản</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                    <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" value={newRecord.date} onChange={e => setNewRecord({...newRecord, date: e.target.value})} />
                                    <input type="number" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-right bg-gray-50 focus:outline-none focus:border-indigo-400" placeholder="Số dư mới" value={newRecord.balance} onChange={e => setNewRecord({...newRecord, balance: e.target.value})} />
                                    <input className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" placeholder="Ghi chú..." value={newRecord.note} onChange={e => setNewRecord({...newRecord, note: e.target.value})} />
                                    <button onClick={() => { addRecord(); setShowAddRecordForm(false); }} disabled={!newRecord.account_id || !newRecord.balance} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Lưu</button>
                                </div>
                            )}

                            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                                {balanceRecords.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).map(rec => {
                                    const acc = accounts.find(a => a.id === rec.account_id);
                                    const change = getRecordChange(rec);
                                    const isEditing = editingRecord && editingRecord.id === rec.id;
                                    if (isEditing) return (
                                        <div key={rec.id} className="flex flex-wrap gap-2 px-4 py-2.5 bg-indigo-50/30">
                                            <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} />
                                            <input type="number" className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-right bg-white focus:outline-none" value={editingRecord.balance} onChange={e => setEditingRecord({...editingRecord, balance: e.target.value})} />
                                            <input className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" value={editingRecord.note} onChange={e => setEditingRecord({...editingRecord, note: e.target.value})} />
                                            <button onClick={saveEditRecord} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check size={13} /></button>
                                            <button onClick={cancelEditRecord} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={13} /></button>
                                        </div>
                                    );
                                    return (
                                        <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group">
                                            <span className="text-[10px] font-mono text-gray-400 shrink-0 w-20">{rec.date}</span>
                                            <span className="flex-1 text-xs text-gray-600 truncate">{acc?.name}{rec.note ? ` · ${rec.note}` : ""}</span>
                                            {change !== null && (
                                                <span className={`text-[10px] font-bold shrink-0 ${change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-500" : "text-gray-400"}`}>
                                                    {change > 0 ? "+" : ""}{mask(formatVNDCompact(change, true))}
                                                </span>
                                            )}
                                            <span className="text-xs font-bold text-gray-800 shrink-0">{mask(formatVNDCompact(rec.balance, true))}</span>
                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                                                <button onClick={() => startEditRecord(rec)} className="p-1 text-gray-400 hover:text-indigo-600"><Edit2 size={11} /></button>
                                                <button onClick={() => deleteRecord(rec.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tiết kiệm */}
                {activeTab === "savings" && (
                    <div className="flex flex-col">
                        {/* Summary chips */}
                        <div className="flex gap-2 px-4 py-3 flex-wrap">
                            <div className="flex-1 min-w-[120px] bg-indigo-50 rounded-xl px-3 py-2">
                                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">Tổng gốc</p>
                                <p className="text-sm font-black text-indigo-800">{mask(formatVNDCompact(totalAmount, true))}</p>
                            </div>
                            <div className="flex-1 min-w-[120px] bg-emerald-50 rounded-xl px-3 py-2">
                                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Tổng lãi</p>
                                <p className="text-sm font-black text-emerald-700">{mask(formatVNDCompact(totalInterest, true))}</p>
                            </div>
                            <div className="flex-1 min-w-[80px] bg-gray-50 rounded-xl px-3 py-2 text-center">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sổ</p>
                                <p className="text-sm font-black text-gray-700">{totalSavingsBooksCount}</p>
                            </div>
                        </div>

                        {/* Filter bar */}
                        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap border-t border-gray-50 pt-3">
                            <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-indigo-400" value={savingsFilters.status} onChange={e => setSavingsFilters({...savingsFilters, status: e.target.value})}>
                                <option value="all">Tất cả</option>
                                <option value="active">Đang gửi</option>
                                <option value="matured">Đáo hạn</option>
                            </select>
                            <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-indigo-400" value={savingsFilters.bank_name} onChange={e => setSavingsFilters({...savingsFilters, bank_name: e.target.value})}>
                                <option value="all">Tất cả NH</option>
                                {[...new Set(savingsBooks.map(b => b.bank_name))].map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <input className="w-24 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-indigo-400" placeholder="Số sổ..." value={savingsFilters.book_number_search} onChange={e => setSavingsFilters({...savingsFilters, book_number_search: e.target.value})} />
                            <div className="flex items-center gap-1.5 ml-auto">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={savingsFilters.due_this_month} onChange={e => setSavingsFilters({...savingsFilters, due_this_month: e.target.checked})} className="rounded border-gray-300" />
                                    Tháng này
                                </label>
                            </div>
                            <button onClick={() => setShowAddBookForm(!showAddBookForm)} className="flex items-center gap-1 ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                <Plus size={13} /> Thêm {showAddBookForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                        </div>

                        {/* Add book form */}
                        {showAddBookForm && (
                            <div className="px-4 pb-4 grid grid-cols-2 gap-2 border-t border-gray-50 pt-3">
                                {[
                                    { ph: "Số sổ", key: "book_number" },
                                    { ph: "Ngân hàng", key: "bank_name" },
                                ].map(f => (
                                    <input key={f.key} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" placeholder={f.ph} value={newBook[f.key]} onChange={e => setNewBook({...newBook, [f.key]: e.target.value})} />
                                ))}
                                <input type="number" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" placeholder="Số tiền gốc" value={newBook.amount} onChange={e => setNewBook({...newBook, amount: e.target.value})} />
                                <input type="number" step="0.1" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" placeholder="Lãi suất %/năm" value={newBook.interest_rate} onChange={e => setNewBook({...newBook, interest_rate: e.target.value})} />
                                <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" value={newBook.start_date} onChange={e => setNewBook({...newBook, start_date: e.target.value})} />
                                <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400" value={newBook.end_date} onChange={e => setNewBook({...newBook, end_date: e.target.value})} />
                                <button onClick={() => { addBook(); setShowAddBookForm(false); }} disabled={!newBook.book_number || !newBook.amount} className="col-span-2 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Lưu sổ tiết kiệm</button>
                            </div>
                        )}

                        {/* Savings book Desktop Table View */}
                        <div className="hidden md:block overflow-hidden border border-slate-100 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.015)] m-4">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <th className="px-4 py-3">NH / Số sổ</th>
                                        <th className="px-4 py-3">Số tiền</th>
                                        <th className="px-4 py-3">Lãi suất</th>
                                        <th className="px-4 py-3">Tiền lãi</th>
                                        <th className="px-4 py-3">Kỳ hạn</th>
                                        <th className="px-4 py-3">Trạng thái</th>
                                        <th className="px-4 py-3 text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {savingsBooksToRender.map((book) => {
                                        const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                        const daysLeft = getDaysRemaining(book.end_date);
                                        const isActive = book.status === "active";
                                        const isEditing = editingBook && editingBook.id === book.id;
                                        const cs = getCardStyle(book.bank_name);
                                        const dStart = new Date(book.start_date), dEnd = new Date(book.end_date);
                                        const totalDays = Math.max(1, Math.ceil((dEnd - dStart) / 86400000));
                                        const elapsed = Math.max(0, Math.ceil((new Date() - dStart) / 86400000));
                                        const pct = isActive ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 100;

                                        if (isEditing) {
                                            return (
                                                <tr key={book.id} className="bg-indigo-50/20">
                                                    <td className="px-4 py-2" colSpan={7}>
                                                        <div className="flex gap-2 items-center flex-wrap">
                                                            <input className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-28" placeholder="Số sổ" value={editingBook.book_number} onChange={e => setEditingBook({...editingBook, book_number: e.target.value})} />
                                                            <input className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-24" placeholder="Ngân hàng" value={editingBook.bank_name} onChange={e => setEditingBook({...editingBook, bank_name: e.target.value})} />
                                                            <input type="number" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-28 text-right" placeholder="Số tiền" value={editingBook.amount} onChange={e => setEditingBook({...editingBook, amount: e.target.value})} />
                                                            <input type="number" step="0.1" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-16 text-right" placeholder="Lãi suất" value={editingBook.interest_rate} onChange={e => setEditingBook({...editingBook, interest_rate: e.target.value})} />
                                                            <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-32" value={editingBook.start_date} onChange={e => setEditingBook({...editingBook, start_date: e.target.value})} />
                                                            <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-32" value={editingBook.end_date} onChange={e => setEditingBook({...editingBook, end_date: e.target.value})} />
                                                            <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-28" value={editingBook.status} onChange={e => setEditingBook({...editingBook, status: e.target.value})}>
                                                                <option value="active">Đang gửi</option>
                                                                <option value="matured">Đáo hạn</option>
                                                            </select>
                                                            <div className="flex gap-1 ml-auto">
                                                                <button onClick={saveEditBook} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Lưu</button>
                                                                <button onClick={cancelEditBook} className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return (
                                            <tr key={book.id} className={`hover:bg-slate-50/30 transition-colors group ${!isActive ? "opacity-60" : ""}`}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0 border ${cs.bg}`}>{cs.logo.slice(0,3)}</span>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-800">{book.bank_name}</span>
                                                            <span className="font-mono text-[10px] text-slate-400">#{book.book_number}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-black text-slate-900 whitespace-nowrap">{mask(fmtFull(book.amount))}</td>
                                                <td className="px-4 py-3 font-semibold text-slate-500 whitespace-nowrap">{book.interest_rate}%/năm</td>
                                                <td className="px-4 py-3 font-bold text-emerald-600 whitespace-nowrap">+{mask(fmtFull(interest))}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-mono text-slate-500">{book.start_date} → {book.end_date}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {isActive ? (
                                                                daysLeft <= 0 ? (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 animate-pulse">Đáo hạn</span>
                                                                ) : daysLeft <= 30 ? (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">Còn {daysLeft}d</span>
                                                                ) : (
                                                                    <span className="text-[9px] font-semibold text-slate-500">Còn {daysLeft} ngày</span>
                                                                )
                                                            ) : (
                                                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Đã đóng</span>
                                                            )}
                                                        </div>
                                                        {isActive && (
                                                            <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all ${daysLeft <= 0 ? "bg-red-400 animate-pulse" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => toggleBookStatus(book)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition" title={isActive ? "Đóng sổ" : "Mở lại sổ"}><RefreshCw size={12} /></button>
                                                        <button onClick={() => startEditBook(book)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition" title="Sửa sổ"><Edit2 size={12} /></button>
                                                        <button onClick={() => deleteBook(book.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Xóa sổ"><Trash2 size={12} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Savings book Mobile Card View */}
                        <div className="block md:hidden divide-y divide-gray-50">
                            {savingsBooksToRender.map(book => {
                                const interest = calculateInterest(book.amount, book.interest_rate, book.start_date, book.end_date);
                                const daysLeft = getDaysRemaining(book.end_date);
                                const isActive = book.status === "active";
                                const isEditing = editingBook && editingBook.id === book.id;
                                const cs = getCardStyle(book.bank_name);
                                const dStart = new Date(book.start_date), dEnd = new Date(book.end_date);
                                const totalDays = Math.max(1, Math.ceil((dEnd - dStart) / 86400000));
                                const elapsed = Math.max(0, Math.ceil((new Date() - dStart) / 86400000));
                                const pct = isActive ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 100;

                                if (isEditing) return (
                                    <div key={book.id} className="p-4 bg-indigo-50/30 grid grid-cols-2 gap-2">
                                        <input className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" placeholder="Số sổ" value={editingBook.book_number} onChange={e => setEditingBook({...editingBook, book_number: e.target.value})} />
                                        <input className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" placeholder="Ngân hàng" value={editingBook.bank_name} onChange={e => setEditingBook({...editingBook, bank_name: e.target.value})} />
                                        <input type="number" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" placeholder="Số tiền" value={editingBook.amount} onChange={e => setEditingBook({...editingBook, amount: e.target.value})} />
                                        <input type="number" step="0.1" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" placeholder="Lãi suất" value={editingBook.interest_rate} onChange={e => setEditingBook({...editingBook, interest_rate: e.target.value})} />
                                        <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" value={editingBook.start_date} onChange={e => setEditingBook({...editingBook, start_date: e.target.value})} />
                                        <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" value={editingBook.end_date} onChange={e => setEditingBook({...editingBook, end_date: e.target.value})} />
                                        <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" value={editingBook.status} onChange={e => setEditingBook({...editingBook, status: e.target.value})}>
                                            <option value="active">Đang gửi</option>
                                            <option value="matured">Đáo hạn</option>
                                        </select>
                                        <div className="flex gap-2">
                                            <button onClick={saveEditBook} className="flex-1 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Lưu</button>
                                            <button onClick={cancelEditBook} className="flex-1 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                                        </div>
                                    </div>
                                );

                                return (
                                    <div key={book.id} className={`px-4 py-3.5 hover:bg-gray-50 transition-colors group ${!isActive ? "opacity-60" : ""}`}>
                                        <div className="flex items-start gap-3">
                                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[9px] font-black shrink-0 border ${cs.bg}`}>{cs.logo.slice(0,3)}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-gray-800">{book.bank_name} <span className="font-mono text-gray-400">#{book.book_number}</span></span>
                                                    {isActive && daysLeft <= 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse">Đáo hạn</span>}
                                                    {isActive && daysLeft > 0 && daysLeft <= 30 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Còn {daysLeft}d</span>}
                                                    {!isActive && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Đã đóng</span>}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                    <span className="text-sm font-black text-gray-900">{mask(fmtFull(book.amount))}</span>
                                                    <span className="text-xs text-gray-400">{book.interest_rate}%/năm</span>
                                                    <span className="text-xs text-emerald-600 font-semibold">+{mask(formatVNDCompact(interest, true))}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{book.start_date} → {book.end_date}</p>
                                                {isActive && (
                                                    <div className="mt-1.5">
                                                        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${daysLeft <= 0 ? "bg-red-400 animate-pulse" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <button onClick={() => toggleBookStatus(book)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg transition-colors"><RefreshCw size={11} /></button>
                                                <button onClick={() => startEditBook(book)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"><Edit2 size={11} /></button>
                                                <button onClick={() => deleteBook(book.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={11} /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* So sánh lãi */}
                        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2 bg-gray-50/50">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lãi so sánh</span>
                            <input type="number" step="0.01" className="w-14 text-xs font-bold text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-lg px-2 py-1 focus:outline-none text-center" value={comparisonRate} onChange={e => setComparisonRate(e.target.value)} />
                            <span className="text-xs text-gray-400">%/năm →</span>
                            <span className="text-xs font-black text-indigo-700">{mask(formatVNDCompact(totalComparisonInterest, true))}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountBalance;
