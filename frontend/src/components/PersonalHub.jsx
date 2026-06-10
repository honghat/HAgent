import React, { Suspense, lazy, useState } from "react";
import { Wallet, DollarSign } from "lucide-react";

const ExpenseTracker = lazy(() => import("./ExpenseTracker"));
const AccountBalance = lazy(() => import("./AccountBalance"));

function TabLoading() {
    return (
        <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-500 py-20">
            Đang tải dữ liệu cá nhân...
        </div>
    );
}

const PersonalHub = ({ user, token }) => {
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem("hagent_personal_tab") || "expenses");

    const selectTab = (tabId) => {
        setActiveTab(tabId);
        localStorage.setItem("hagent_personal_tab", tabId);
    };

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
            {/* Header Tabs Navigation */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.12] bg-white/90 px-3 py-2.5 backdrop-blur-xl sm:px-4">
                <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl bg-gray-100 p-0.5 sm:inline-flex">
                    <button
                        onClick={() => selectTab("expenses")}
                        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition-all duration-200 ${
                            activeTab === "expenses"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "text-gray-500 hover:bg-white/70 hover:text-gray-900"
                        }`}
                    >
                        <DollarSign size={14} />
                        <span>Thu Chi Cá Nhân</span>
                    </button>
                    <button
                        onClick={() => selectTab("balance")}
                        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition-all duration-200 ${
                            activeTab === "balance"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "text-gray-500 hover:bg-white/70 hover:text-gray-900"
                        }`}
                    >
                        <Wallet size={14} />
                        <span>Tài Khoản & Tiết Kiệm</span>
                    </button>
                </div>
            </div>

            {/* Tab Contents */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                <Suspense fallback={<TabLoading />}>
                    {activeTab === "expenses" && (
                        <ExpenseTracker user={user} token={token} />
                    )}
                    {activeTab === "balance" && (
                        <AccountBalance user={user} token={token} />
                    )}
                </Suspense>
            </div>
        </div>
    );
};

export default PersonalHub;
