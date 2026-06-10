import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Equal, CheckCircle } from 'lucide-react';

const AssetOverview = ({ user, token, fmData, viewMode = 'overview' }) => {
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

    const formatVND = (num) => (num || 0).toLocaleString('vi-VN');
    
    const renderAmount = (amount, isTotal = false) => {
        const str = formatVND(amount);
        const mobileValueClass = `text-sm font-bold text-gray-800 text-right min-w-0 break-words`;
        
        if (isTotal) {
            return (
                <>
                    <div className="sm:hidden text-center text-sm font-extrabold text-indigo-600 break-words min-w-0">
                        {str} ₫
                    </div>
                    <div className="hidden sm:block text-4xl md:text-5xl font-extrabold text-indigo-600">
                        {str} ₫
                    </div>
                </>
            );
        }

        return (
            <>
                <div className={`sm:hidden block ${mobileValueClass}`}>
                    <span className="inline-block whitespace-nowrap">{str}</span>
                </div>
                <div className="hidden sm:block text-2xl md:text-3xl font-bold text-gray-800 mt-3">
                    {str} ₫
                </div>
            </>
        );
    };

    if (assets.loading) {
        return (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div className="animate-pulse text-gray-500 text-lg">Đang tải tài sản...</div>
            </div>
        );
    }

    const total = assets.cash + assets.bank + assets.savings + assets.investments;
  
    const renderComparison = () => {
        const comparisonItems = [
            { 
                name: 'Tiền mặt (TM)', 
                fmValue: fmData?.cash || 0,
                txValue: assets.cash,
                color: 'blue' 
            },
            { 
                name: 'Ngân hàng (CK)', 
                fmValue: fmData?.bank || 0,
                txValue: assets.bank,
                color: 'green' 
            },
            { 
                name: 'Tiết kiệm', 
                fmValue: fmData?.savings || 0,
                txValue: assets.savings,
                color: 'purple' 
            },
            { 
                name: 'TỔNG CỘNG', 
                fmValue: (fmData?.cash || 0) + (fmData?.bank || 0) + (fmData?.savings || 0), 
                txValue: assets.cash + assets.bank + assets.savings, 
                color: 'indigo', 
                isTotal: true 
            },
        ];

        return (
            <div className="space-y-4">
                <h3 className="text-xl md:text-2xl font-bold text-fuchsia-700 mb-4 text-center">
                    So Sánh Số Dư Tài Sản
                </h3>
                
                <div className="hidden lg:block overflow-x-auto border border-black/[0.08] rounded-xl shadow-sm">
                    <table className="min-w-full divide-y divide-black/[0.08]">
                        <thead className="bg-fuchsia-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-fuchsia-600 uppercase tracking-wider border-r border-black/[0.08]">
                                    Loại Tài Sản
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-green-600 uppercase tracking-wider border-r border-black/[0.08]">
                                    Nguồn 1: Tài khoản/Sổ Sách
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-blue-600 uppercase tracking-wider border-r border-black/[0.08]">
                                    Nguồn 2: Tính từ Giao Dịch
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Chênh Lệch (N1 - N2)
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-black/[0.08] text-sm">
                            {comparisonItems.map((item) => {
                                const diff = item.fmValue - item.txValue;
                                const isDifference = Math.abs(diff) > 1;
                                
                                let diffClass = 'text-gray-500';
                                let icon = <Equal size={16} />;
                                let message = "Khớp";
                                
                                if (isDifference) {
                                    if (diff > 0) {
                                        diffClass = 'text-green-600 font-bold';
                                        icon = <TrendingUp size={16} />;
                                        message = `Số dư Cao Hơn ${formatVND(diff)} ₫`;
                                    } else {
                                        diffClass = 'text-red-600 font-bold';
                                        icon = <TrendingDown size={16} />;
                                        message = `Số dư Thấp Hơn ${formatVND(Math.abs(diff))} ₫`;
                                    }
                                }
                                
                                const rowClass = item.isTotal 
                                    ? 'bg-fuchsia-100 font-bold' 
                                    : (isDifference ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50');

                                return (
                                    <tr key={item.name} className={rowClass}>
                                        <td className={`px-6 py-4 whitespace-nowrap font-medium text-${item.color}-700 border-r border-black/[0.08]`}>
                                            {item.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-green-600 border-r border-black/[0.08]">
                                            {formatVND(item.fmValue)} ₫
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-blue-600 border-r border-black/[0.08]">
                                            {formatVND(item.txValue)} ₫
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-center ${diffClass}`}>
                                            <span className="flex items-center justify-center space-x-1">
                                                {icon}
                                                <span>{formatVND(diff)} ₫</span>
                                            </span>
                                            {isDifference && <div className='text-xs text-gray-500'>({message})</div>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                <div className="lg:hidden space-y-4">
                    {comparisonItems.map((item) => {
                         const diff = item.fmValue - item.txValue;
                         const isDifference = Math.abs(diff) > 1;

                         let diffClass = 'text-gray-500';
                         let statusIcon = <CheckCircle size={18} className="text-green-500" />;
                         let message = "Khớp";

                         if (isDifference) {
                             if (diff > 0) {
                                 diffClass = 'text-green-600';
                                 statusIcon = <TrendingUp size={18} className="text-green-600" />;
                                 message = `N1 > N2 (${formatVND(diff)} ₫)`;
                             } else {
                                 diffClass = 'text-red-600';
                                 statusIcon = <TrendingDown size={18} className="text-red-600" />;
                                 message = `N1 < N2 (${formatVND(diff)} ₫)`;
                             }
                         }

                         const cardClass = item.isTotal 
                             ? 'bg-fuchsia-100 border-2 border-fuchsia-400 shadow-lg' 
                             : (isDifference ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-black/[0.08]');

                         return (
                             <div key={item.name} className={`rounded-xl p-4 transition duration-300 ${cardClass}`}>
                                 <div className="flex justify-between items-center pb-2 border-b border-dashed border-black/[0.08] mb-3">
                                     <h4 className={`text-lg font-extrabold text-${item.color}-700`}>{item.name}</h4>
                                     <div className={`flex items-center space-x-1 font-semibold text-sm ${diffClass}`}>
                                         {statusIcon}
                                         {isDifference ? 'Lệch' : 'Khớp'}
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 gap-2 text-sm">
                                     <div className="border-r border-black/[0.08] pr-1 min-w-0">
                                         <p className="text-gray-500 text-xs">Tài khoản/Sổ (N1)</p>
                                         <div className="text-green-600">
                                             {renderAmount(item.fmValue, item.isTotal)}
                                         </div>
                                     </div>
                                     <div className="pl-1 min-w-0">
                                         <p className="text-gray-500 text-xs">Giao Dịch (N2)</p>
                                         <div className="text-blue-600">
                                             {renderAmount(item.txValue, item.isTotal)}
                                         </div>
                                     </div>
                                 </div>

                                 {isDifference && (
                                     <div className="mt-3 pt-2 border-t border-black/[0.08]">
                                         <p className={`text-center font-bold text-sm ${diff > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                             Chênh lệch: {message}
                                         </p>
                                     </div>
                                 )}
                                 {!isDifference && item.isTotal && (
                                      <div className="mt-3 pt-2 border-t border-fuchsia-300">
                                         <p className="text-center font-bold text-sm text-green-700">
                                             Chênh lệch: Hai nguồn dữ liệu KHỚP nhau!
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
        return (
            <>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
                    Tổng Quan Tài Sản
                </h2>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 text-center hover:scale-105 transition">
                        <div className="text-blue-600 font-semibold">Tiền mặt</div>
                        {renderAmount(assets.cash)}
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200 text-center hover:scale-105 transition">
                        <div className="text-green-600 font-semibold">Ngân hàng</div>
                        {renderAmount(assets.bank)}
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200 text-center hover:scale-105 transition">
                        <div className="text-purple-600 font-semibold">Tiết kiệm</div>
                        {renderAmount(assets.savings)}
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-200 text-center hover:scale-105 transition">
                        <div className="text-orange-600 font-semibold">Đầu tư</div>
                        {renderAmount(assets.investments)}
                    </div>
                </div>

                <div className="mt-10 pt-8 border-t-4 border-indigo-300 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl px-8 py-6 text-center">
                    <div className="text-xl font-bold text-indigo-700 mb-2">Tổng tài sản</div>
                    {renderAmount(total, true)}
                </div>
            </>
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border border-black/[0.08]">
            {viewMode === 'comparison' ? renderComparison() : renderOverview()}
        </div>
    );
};

export default AssetOverview;
