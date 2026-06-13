import React from "react";
import { DollarSign, Calendar, Tag, CreditCard, Edit2, Trash2 } from "lucide-react";

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

            <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-1 pt-2 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                    <Calendar size={13} className="text-blue-500 shrink-0" />
                    <span>{new Date(expense.date).toLocaleDateString("vi-VN")}</span>
                </div>
                <div className="flex items-center gap-1 max-w-[120px] overflow-hidden">
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
                <div className="flex items-center gap-1">
                    <CreditCard size={13} className="text-violet-500 shrink-0" />
                    <span>{expense.payment_method === "TM" ? "Tiền mặt" : "CK"}</span>
                </div>
            </div>
        </div>
    );
};

export default ExpenseCard;
