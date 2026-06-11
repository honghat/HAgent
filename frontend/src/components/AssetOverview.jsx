import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Equal, CheckCircle, Wallet, Building2, PiggyBank } from 'lucide-react';

const AssetOverview = ({ user, token, fmData, viewMode = 'overview', showBalances = true }) => {
    const userId = user?.id;
    const [assets, setAssets] = useState({
        cash: 0,
        bank: 0,
        savings: 0,
        investments: 0,
        loading: true,
    });

    const INITIAL_SAVINGS = 0;
    const INITIAL_INVESTMENTS = 0;
    const INITIAL_CASH = 0;
    const INITIAL_BANK = 0;

    const fetchAssets = async () => {
        if (!userId || !token) {
            setAssets(prev => ({ ...prev, loading: false }));
            return;
        }

        try {
            const res = await fetch(`/api/expenses`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('Failed to fetch');
            const expenses = await res.json();

            // Tiền mặt (TM)
            const cashFromTransactions = expenses
                .filter(e => (e.expense_type === 'Thu' && e.payment_method === 'TM') || (e.expense_type === 'Rút' && e.payment_method === 'TM'))
                .reduce((s, e) => s + e.amount, 0) -
                expenses
                .filter(e => e.expense_type === 'Chi' && e.payment_method === 'TM')
                .reduce((s, e) => s + e.amount, 0);

            // Tiền ngân hàng (CK)
            const bankFromTransactions = expenses
                .filter(e => e.expense_type === 'Thu' && e.payment_method === 'CK')
                .reduce((s, e) => s + e.amount, 0) -
                expenses
                .filter(e => (e.expense_type === 'Chi' && e.payment_method === 'CK') || (e.expense_type === 'Rút' && e.payment_method === 'TM'))
                .reduce((s, e) => s + e.amount, 0);

            // Tiết kiệm
            const savingsFromTransactions = expenses
                .filter(e => e.category === 'Tiết kiệm' && e.expense_type === 'Chi')
                .reduce((s, e) => s + e.amount, 0) -
                expenses
                .filter(e => e.category === 'Tiết kiệm' && e.expense_type === 'Thu')
                .reduce((s, e) => s + e.amount, 0);

            // Đầu tư
            const investmentsFromTransactions = expenses
                .filter(e => e.category === 'Đầu tư' && e.expense_type === 'Chi')
                .reduce((s, e) => s + e.amount, 0) -
                expenses
                .filter(e => e.category === 'Đầu tư' && e.expense_type === 'Thu')
                .reduce((s, e) => s + e.amount, 0);

            setAssets({
                cash: Math.floor(cashFromTransactions + INITIAL_CASH),
                bank: Math.floor(bankFromTransactions + INITIAL_BANK),
                savings: Math.floor(savingsFromTransactions + INITIAL_SAVINGS),
                investments: Math.floor(investmentsFromTransactions + INITIAL_INVESTMENTS),
                loading: false,
            });
        } catch (err) {
            console.error('Lỗi tải tài sản:', err);
            setAssets(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        fetchAssets();
    }, [userId, token]);

    const formatVNDCompact = (amount, isCompact = false) => {
        if (amount === undefined || amount === null || isNaN(amount)) return "0 ₫";
        return `${amount.toLocaleString("vi-VN")} ₫`;
    };

    const formatVND = (num) => {
        if (!showBalances) return "••••••";
        return `${(num || 0).toLocaleString('vi-VN')} ₫`;
    };

    const renderAmount = (amount, isTotal = false) => {
        if (!showBalances) {
            return (
                <div className={`${isTotal ? "text-xl" : "text-sm"} font-extrabold text-slate-400 text-center mt-1 sm:mt-2`}>
                    ••••••
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center">
                <div className={`${isTotal ? "text-xl sm:text-3xl text-indigo-600" : "text-sm sm:text-lg text-slate-900"} font-extrabold text-center tracking-tight whitespace-nowrap`}>
                    {formatVNDCompact(amount, false)}
                </div>
            </div>
        );
    };

    if (assets.loading) {
        return (
            <div className="py-16 text-center">
                <div className="animate-pulse text-sm font-semibold text-slate-400">Đang tải tài sản...</div>
            </div>
        );
    }

    const total = assets.cash + assets.bank + assets.savings + assets.investments;

    const renderComparison = () => {
        const comparisonItems = [
            { name: 'Tiền mặt', fmValue: fmData?.cash || 0, txValue: assets.cash },
            { name: 'Ngân hàng', fmValue: fmData?.bank || 0, txValue: assets.bank },
            { name: 'Tiết kiệm', fmValue: fmData?.savings || 0, txValue: assets.savings },
            { name: 'Tổng cộng', fmValue: (fmData?.cash || 0) + (fmData?.bank || 0) + (fmData?.savings || 0), txValue: assets.cash + assets.bank + assets.savings, isTotal: true },
        ];

        return (
            <div className="space-y-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                    So sánh số dư tài sản
                </h3>

                {/* Desktop: bảng */}
                <div className="hidden lg:block overflow-hidden border border-slate-100 rounded-2xl">
                    <table className="min-w-full">
                        <thead className="bg-slate-50/80">
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <th className="px-5 py-3 text-left">Loại tài sản</th>
                                <th className="px-5 py-3 text-right">Sổ sách (N1)</th>
                                <th className="px-5 py-3 text-right">Giao dịch (N2)</th>
                                <th className="px-5 py-3 text-right">Chênh lệch</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                            {comparisonItems.map((item) => {
                                const diff = item.fmValue - item.txValue;
                                const isDiff = Math.abs(diff) > 1;
                                const diffColor = !isDiff ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-rose-500';
                                const Icon = !isDiff ? Equal : diff > 0 ? TrendingUp : TrendingDown;
                                return (
                                    <tr key={item.name} className={item.isTotal ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60 transition-colors'}>
                                        <td className={`px-5 py-3.5 whitespace-nowrap font-bold ${item.isTotal ? 'text-indigo-700' : 'text-slate-700'}`}>
                                            {item.name}
                                        </td>
                                        <td className="px-5 py-3.5 whitespace-nowrap text-right font-semibold text-slate-700 tabular-nums">
                                            {formatVND(item.fmValue)}
                                        </td>
                                        <td className="px-5 py-3.5 whitespace-nowrap text-right font-semibold text-slate-700 tabular-nums">
                                            {formatVND(item.txValue)}
                                        </td>
                                        <td className={`px-5 py-3.5 whitespace-nowrap text-right font-bold tabular-nums ${diffColor}`}>
                                            <span className="inline-flex items-center justify-end gap-1">
                                                <Icon size={13} />
                                                {formatVND(diff)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: cards */}
                <div className="lg:hidden space-y-3">
                    {comparisonItems.map((item) => {
                        const diff = item.fmValue - item.txValue;
                        const isDiff = Math.abs(diff) > 1;
                        const cardClass = item.isTotal
                            ? 'bg-slate-900 border border-slate-800'
                            : 'bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)]';
                        const lineColor = item.isTotal ? 'border-white/10' : 'border-slate-100';
                        const labelColor = item.isTotal ? 'text-slate-400' : 'text-slate-400';

                        return (
                            <div key={item.name} className={`rounded-2xl p-4 ${cardClass}`}>
                                <div className={`flex justify-between items-center pb-2.5 mb-3 border-b border-dashed ${lineColor}`}>
                                    <h4 className={`text-sm font-extrabold ${item.isTotal ? 'text-indigo-400' : 'text-slate-800'}`}>{item.name}</h4>
                                    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${!isDiff ? 'text-emerald-500' : diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {!isDiff ? <CheckCircle size={13} /> : diff > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                                        {!isDiff ? 'Khớp' : 'Lệch'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className={`border-r pr-2 min-w-0 ${lineColor}`}>
                                        <p className={`${labelColor} text-[10px] uppercase font-bold tracking-wider`}>Sổ sách (N1)</p>
                                        <div className="mt-1">{renderAmount(item.fmValue, item.isTotal)}</div>
                                    </div>
                                    <div className="pl-2 min-w-0">
                                        <p className={`${labelColor} text-[10px] uppercase font-bold tracking-wider`}>Giao dịch (N2)</p>
                                        <div className="mt-1">{renderAmount(item.txValue, item.isTotal)}</div>
                                    </div>
                                </div>

                                {isDiff && (
                                    <div className={`mt-3 pt-2.5 border-t ${lineColor}`}>
                                        <p className={`text-center font-bold text-xs ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            Chênh lệch: {formatVND(diff)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderOverview = () => {
        const cards = [
            { label: 'Tiền mặt', value: assets.cash, icon: Wallet, bg: 'bg-amber-50', fg: 'text-amber-600' },
            { label: 'Ngân hàng', value: assets.bank, icon: Building2, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
            { label: 'Tiết kiệm', value: assets.savings, icon: PiggyBank, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
            { label: 'Đầu tư', value: assets.investments, icon: TrendingUp, bg: 'bg-orange-50', fg: 'text-orange-600' },
        ];

        return (
            <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                    Cơ cấu tài sản hiện tại
                </h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {cards.map(({ label, value, icon: Icon, bg, fg }) => (
                        <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center transition-all hover:-translate-y-0.5 hover:shadow-sm">
                            <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center mb-2.5 ${bg} ${fg}`}>
                                <Icon size={15} />
                            </div>
                            <div className="text-xs font-bold text-slate-500">{label}</div>
                            <div className="mt-2">{renderAmount(value)}</div>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-50/60 rounded-2xl px-4 py-5 text-center border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tổng tài sản tính toán</div>
                    {renderAmount(total, true)}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full">
            {viewMode === 'comparison' ? renderComparison() : renderOverview()}
        </div>
    );
};

export default AssetOverview;
