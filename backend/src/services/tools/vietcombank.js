export async function fetchVietcombankRate() {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const url = `https://vietcombank.com.vn/api/exchangerates?date=${dateStr}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return 'Không thể lấy tỷ giá Vietcombank.';

    const data = await res.json();
    if (!data.Data || !data.Data.length) return 'Không có dữ liệu tỷ giá.';

    const updated = data.UpdatedDate
      ? new Date(data.UpdatedDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      : '';

    const lines = data.Data.map(r => {
      const cash = parseFloat(r.cash) > 0 ? `${parseFloat(r.cash).toLocaleString('vi-VN')}` : '-';
      const transfer = parseFloat(r.transfer) > 0 ? `${parseFloat(r.transfer).toLocaleString('vi-VN')}` : '-';
      const sell = parseFloat(r.sell) > 0 ? `${parseFloat(r.sell).toLocaleString('vi-VN')}` : '-';
      return `- **${r.currencyCode}** (${r.currencyName}): Mua TM ${cash} | CK ${transfer} | Bán ${sell}`;
    });

    return `## Tỷ giá Vietcombank${updated ? ` (${updated})` : ''}\n\n${lines.join('\n')}`;
  } catch {
    return 'Không thể lấy tỷ giá Vietcombank (lỗi kết nối).';
  }
}
