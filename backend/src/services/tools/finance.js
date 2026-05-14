import * as cheerio from 'cheerio';

export async function fetchGoldPrice() {
  try {
    const url = 'https://giavang.doji.vn/trangchu.html';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return `Lỗi kết nối tới DOJI: ${res.status}`;
    const html = await res.text();
    const $ = cheerio.load(html);

    const rows = [];
    // Tìm các bảng giá (thường nằm trong các div có tiêu đề "Bảng giá tại...")
    $('table tr').each((i, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 3) {
        const type = $(cols[0]).text().trim();
        const buy = $(cols[1]).text().trim();
        const sell = $(cols[2]).text().trim();
        
        // Chỉ lấy các hàng có giá trị số (tránh lấy header hoặc hàng trống)
        if (type && buy && sell && !isNaN(parseInt(buy.replace(/,/g, '')))) {
          rows.push(`- ${type}: Mua ${buy} | Bán ${sell}`);
        }
      }
    });

    if (rows.length === 0) {
      // Fallback: nếu không tìm thấy bảng, thử tìm theo cấu trúc div/span nếu có
      return 'Không tìm thấy bảng giá trên trang DOJI. Có thể cấu trúc trang đã thay đổi.';
    }

    // Lấy thời gian cập nhật
    const updateTime = $('.time-update').text().trim() || 
                       $('body').text().match(/Cập nhật lúc:?\s*(\d{2}:\d{2}\s*\d{2}\/\d{2}\/\d{4})/i)?.[1] || 
                       new Date().toLocaleString('vi-VN');

    return `### GIÁ VÀNG DOJI (Nguồn: giavang.doji.vn)\nCập nhật: ${updateTime}\n\n` + rows.join('\n');
  } catch (e) {
    return `Lỗi khi lấy giá vàng từ DOJI: ${e.message}`;
  }
}

export async function currencyConvert({ amount, from, to }) {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'Không thể lấy tỷ giá.';
    const data = await res.json();
    const rates = data.rates;
    const currencyMap = {
      vnd: 'VND', usd: 'USD', eur: 'EUR', gbp: 'GBP',
      jpy: 'JPY', cny: 'CNY', krw: 'KRW', sgd: 'SGD',
      thb: 'THB', aud: 'AUD', cad: 'CAD', myr: 'MYR',
      hkd: 'HKD', chf: 'CHF',
    };
    const fromCurr = currencyMap[from.toLowerCase()];
    const toCurr = currencyMap[to.toLowerCase()];
    if (!fromCurr || !toCurr) return `Không hỗ trợ tiền tệ: ${from}/${to}`;
    const inUsd = parseFloat(amount) / rates[fromCurr];
    const result = inUsd * rates[toCurr];
    return `${amount} ${from.toUpperCase()} = ${result.toFixed(2)} ${to.toUpperCase()}
Tỷ giá: 1 USD = ${rates[fromCurr]} ${from.toUpperCase()}, 1 USD = ${rates[toCurr]} ${to.toUpperCase()}`;
  } catch {
    return 'Không thể lấy tỷ giá.';
  }
}
