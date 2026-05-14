export async function get_silver_price() {
  try {
    const urls = [
      { name: 'BẠC DOJI 99.9 - 1 LƯỢNG', url: 'https://giabac.doji.vn/data/DataBac9991Luong.txt' },
      { name: 'BẠC DOJI 99.9 - 1 KG', url: 'https://giabac.doji.vn/data/DataBac9991Kg.txt' }
    ];

    const results = [];
    let updateTime = '';

    for (const item of urls) {
      const res = await fetch(item.url + '?t=' + Date.now(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          const [buy, sell, time] = lastLine.split('|');
          if (buy && sell) {
            const formatPrice = (val) => parseInt(val).toLocaleString('vi-VN');
            results.push(`- ${item.name}: Mua ${formatPrice(buy)} | Bán ${formatPrice(sell)}`);
            updateTime = time || updateTime;
            
            // Add derived types (5 Lượng = 5 * 1 Lượng)
            if (item.name.includes('1 LƯỢNG')) {
              results.push(`- BẠC DOJI 99.9 - 5 LƯỢNG: Mua ${formatPrice(parseInt(buy)*5)} | Bán ${formatPrice(parseInt(sell)*5)}`);
            }
          }
        }
      }
    }

    if (results.length === 0) return 'Không thể lấy dữ liệu giá bạc từ DOJI.';

    return `### GIÁ BẠC DOJI (Nguồn: giabac.doji.vn)\nCập nhật: ${updateTime}\n\n` + results.join('\n');
  } catch (e) {
    return `Lỗi khi lấy giá bạc từ DOJI: ${e.message}`;
  }
}
