import React, { Suspense, lazy, useState } from "react";
import { Wallet, DollarSign, StickyNote, CheckSquare } from "lucide-react";

const ExpenseTracker = lazy(() => import("./ExpenseTracker"));
const AccountBalance = lazy(() => import("./AccountBalance"));
const PersonalNotes = lazy(() => import("./PersonalNotes"));
const PersonalTasks = lazy(() => import("./PersonalTasks"));

function TabLoading() {
    return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-200 animate-ping" />
                <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-xs font-semibold text-gray-400 tracking-wide">Đang tải dữ liệu...</p>
        </div>
    );
}

const TABS = [
    { id: "expenses", label: "Thu Chi", labelFull: "Thu Chi Cá Nhân", icon: DollarSign },
    { id: "balance", label: "Tài khoản", labelFull: "Tài Khoản & Tiết Kiệm", icon: Wallet },
    { id: "notes", label: "Ghi chú", labelFull: "Ghi Chú", icon: StickyNote },
    { id: "tasks", label: "Tasks", labelFull: "Công Việc", icon: CheckSquare },
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
        <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
            {/* Tab Bar */}
            <div className="shrink-0 border-b border-black/[0.08] bg-white/95 backdrop-blur-xl px-3 pt-2.5 pb-0 sm:px-4">
                <div className="flex items-end gap-0 overflow-x-auto no-scrollbar">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => selectTab(tab.id)}
                                className={`
                                    relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-xs font-bold
                                    transition-all duration-200 border-b-2
                                    ${isActive
                                        ? "border-indigo-600 text-indigo-600"
                                        : "border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200"
                                    }
                                `}
                            >
                                <Icon size={14} className={isActive ? "text-indigo-600" : "text-gray-400"} />
                                <span className="hidden sm:inline">{tab.labelFull}</span>
                                <span className="sm:hidden">{tab.label}</span>
                                {isActive && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600" />
                                )}
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
                    {activeTab === "notes" && <PersonalNotes token={token} />}
                    {activeTab === "tasks" && <PersonalTasks token={token} />}
                </Suspense>
            </div>
        </div>
    );
};

export default PersonalHub;
