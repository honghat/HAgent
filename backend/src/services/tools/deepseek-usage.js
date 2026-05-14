const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

export const tool = {
  name: 'get_deepseek_usage',
  desc: 'Kiểm tra số dư tài khoản DeepSeek API (balance, trạng thái). Có cảnh báo nếu dưới ngưỡng.',
  when: 'User hỏi kiểm tra token DeepSeek, số dư, usage, balance.',
  args: { warnThreshold: 'ngưỡng cảnh báo USD (mặc định 1.0)' },
  label: 'Đang kiểm tra DeepSeek balance...',
  handler,
};

export async function handler({ warnThreshold } = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return '❌ DEEPSEEK_API_KEY chưa được cấu hình.';

  const res = await fetch(DEEPSEEK_BALANCE_URL, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return `❌ Lỗi API DeepSeek: ${res.status} ${res.statusText}`;

  const data = await res.json();
  if (!data.is_available) return '❌ Tài khoản DeepSeek không khả dụng.';

  const threshold = warnThreshold !== undefined ? parseFloat(warnThreshold) : 1.0;
  const lines = [];
  const alerts = [];

  for (const b of data.balance_infos) {
    const balance = parseFloat(b.total_balance);
    lines.push(`- **${b.currency}:** Tổng \`$${balance}\` (Nạp: \`$${b.topped_up_balance}\`, Tặng: \`$${b.granted_balance}\`)`);
    if (balance < threshold) {
      alerts.push(`⚠️ **${b.currency}** còn \`$${balance}\` — dưới ngưỡng \`$${threshold}\`!`);
    }
  }

  const result = [
    '**💰 DeepSeek Balance**',
    ...lines,
    `\n_Trạng thái: ${data.is_available ? '✅ Khả dụng' : '❌ Không khả dụng'}_`,
  ];

  if (alerts.length) result.push('\n' + alerts.join('\n'));

  return result.join('\n');
}
