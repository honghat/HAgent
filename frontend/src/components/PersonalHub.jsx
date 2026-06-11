import React, { Suspense, lazy, useState } from "react";
import { Wallet, DollarSign, StickyNote, CheckSquare, Utensils, Zap, Home } from "lucide-react";

const ExpenseTracker = lazy(() => import("./ExpenseTracker"));
const FoodTracker = lazy(() => import("./FoodTracker"));
const AccountBalance = lazy(() => import("./AccountBalance"));
const ExpenseDienNuoc = lazy(() => import("./ExpenseDienNuoc"));
const PersonalNotes = lazy(() => import("./PersonalNotes"));
const PersonalTasks = lazy(() => import("./PersonalTasks"));

function TabLoading() {
    return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="relative w-9 h-9">
                <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping" />
                <div className="w-9 h-9 rounded-full border-[2.5px] border-indigo-500/20 border-t-indigo-500 animate-spin" />
            </div>
            <p className="text-[11px] font-semibold text-slate-400 tracking-wide">Đang tải dữ liệu...</p>
        </div>
    );
}

const TABS = [
    { id: "expenses", label: "Thu Chi", icon: DollarSign },
    { id: "balance", label: "Tài khoản", icon: Wallet },
    { id: "food", label: "Ăn uống", icon: Utensils },
    { id: "diennuoc", label: "Tiền nhà", icon: Home },
    { id: "notes", label: "Ghi chú", icon: StickyNote },
    { id: "tasks", label: "Công việc", icon: CheckSquare },
];

const PersonalHub = ({ user, token }) => {
    const [activeTab, setActiveTab] = useState(
        () => localStorage.getItem("hagent_personal_tab") || "expenses"
    );

    const selectTab = (tabId) => {
        setActiveTab(tabId);
        localStorage.setItem("hagent_personal_tab", tabId);
    };

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-gradient-to-b from-slate-50/40 via-white to-white">
            {/* Tab Bar - glassmorphism */}
            <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl px-4 py-3 sm:px-6">
                <div className="inline-flex p-1 bg-slate-100/80 backdrop-blur rounded-2xl select-none overflow-x-auto no-scrollbar gap-1 ring-1 ring-slate-200/40">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => selectTab(tab.id)}
                                className={`
                                    relative flex shrink-0 items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-xl text-[12px] font-bold
                                    transition-all duration-300 select-none cursor-pointer
                                    ${isActive
                                        ? "bg-white text-indigo-600 shadow-[0_2px_8px_-2px_rgba(99,102,241,0.25)] ring-1 ring-indigo-100"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                                    }
                                `}
                            >
                                <Icon size={13} className={isActive ? "text-indigo-500" : "text-slate-400"} strokeWidth={2.5} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                <Suspense fallback={<TabLoading />}>
                    {activeTab === "expenses" && <ExpenseTracker user={user} token={token} />}
                    {activeTab === "balance" && <AccountBalance user={user} token={token} />}
                    {activeTab === "food" && <FoodTracker token={token} />}
                    {activeTab === "diennuoc" && <ExpenseDienNuoc user={user} token={token} />}
                    {activeTab === "notes" && <PersonalNotes token={token} />}
                    {activeTab === "tasks" && <PersonalTasks token={token} />}
                </Suspense>
            </div>
        </div>
    );
};

export default PersonalHub;
