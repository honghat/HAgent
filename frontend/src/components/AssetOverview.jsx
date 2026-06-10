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
                    {formatVNDCompact(amount, true)}
                </div>
                {amount >= 1000000 && (
                    <div className="text-[9px] text-slate-400 font-semibold mt-0.5 sm:mt-1 select-all">
                        {formatVND(amount)}
                    </div>
                )}
            </div>
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
                              ? 'bg-slate-900 text-white shadow-md border border-slate-800' 
                              : (isDifference ? 'bg-amber-50/30 border border-amber-200 shadow-sm' : 'bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)]');
 
                          return (
                              <div key={item.name} className={`rounded-2xl p-4 transition-all duration-200 ${cardClass}`}>
                                  <div className={`flex justify-between items-center pb-2 border-b border-dashed ${item.isTotal ? 'border-white/10' : 'border-slate-100'} mb-3`}>
                                      <h4 className={`text-sm font-black ${item.isTotal ? 'text-indigo-400' : 'text-slate-800'}`}>{item.name}</h4>
                                      <div className={`flex items-center space-x-1 font-bold text-xs ${diffClass}`}>
                                          {statusIcon}
                                          <span>{isDifference ? 'Lệch' : 'Khớp'}</span>
                                      </div>
                                  </div>
 
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div className={`border-r ${item.isTotal ? 'border-white/10' : 'border-slate-100'} pr-1 min-w-0`}>
                                          <p className={`${item.isTotal ? 'text-slate-400' : 'text-slate-500'} text-[10px] uppercase font-bold tracking-wider`}>Sổ sách (N1)</p>
                                          <div className="text-emerald-600 mt-1">
                                              {renderAmount(item.fmValue, item.isTotal)}
                                          </div>
                                      </div>
                                      <div className="pl-1 min-w-0">
                                          <p className={`${item.isTotal ? 'text-slate-400' : 'text-slate-500'} text-[10px] uppercase font-bold tracking-wider`}>Giao dịch (N2)</p>
                                          <div className="text-blue-600 mt-1">
                                              {renderAmount(item.txValue, item.isTotal)}
                                          </div>
                                      </div>
                                  </div>
 
                                  {isDifference && (
                                      <div className={`mt-3 pt-2 border-t ${item.isTotal ? 'border-white/10' : 'border-slate-100'}`}>
                                          <p className={`text-center font-bold text-xs ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                              Chênh lệch: {message}
                                          </p>
                                      </div>
                                  )}
                                  {!isDifference && item.isTotal && (
                                       <div className="mt-3 pt-2 border-t border-indigo-500/20">
                                          <p className="text-center font-bold text-xs text-emerald-400">
                                              Chênh lệch: Hai nguồn KHỚP nhau!
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
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
                    Cơ cấu tài sản hiện tại
                </h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center transition-all hover:scale-[1.02] hover:shadow-sm">
                        <div className="mx-auto w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-2.5">
                            <Wallet size={15} />
                        </div>
                        <div className="text-xs font-bold text-slate-500">Tiền mặt</div>
                        <div className="mt-2">{renderAmount(assets.cash)}</div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center transition-all hover:scale-[1.02] hover:shadow-sm">
                        <div className="mx-auto w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2.5">
                            <Building2 size={15} />
                        </div>
                        <div className="text-xs font-bold text-slate-500">Ngân hàng</div>
                        <div className="mt-2">{renderAmount(assets.bank)}</div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center transition-all hover:scale-[1.02] hover:shadow-sm">
                        <div className="mx-auto w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2.5">
                            <PiggyBank size={15} />
                        </div>
                        <div className="text-xs font-bold text-slate-500">Tiết kiệm</div>
                        <div className="mt-2">{renderAmount(assets.savings)}</div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-center transition-all hover:scale-[1.02] hover:shadow-sm">
                        <div className="mx-auto w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 mb-2.5">
                            <TrendingUp size={15} />
                        </div>
                        <div className="text-xs font-bold text-slate-500">Đầu tư</div>
                        <div className="mt-2">{renderAmount(assets.investments)}</div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 bg-slate-50/50 rounded-2xl px-4 py-5 text-center shadow-inner">
                    <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">TỔNG TÀI SẢN TÍNH TOÁN</div>
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
