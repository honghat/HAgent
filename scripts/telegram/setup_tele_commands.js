const token = process.env.TELEGRAM_BOT_TOKEN;

async function callTelegramAPI(method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function setup() {
  console.log('Setting up commands...');
  const result = await callTelegramAPI('setMyCommands', {
    commands: [
      { command: 'start', description: 'Bắt đầu và xem hướng dẫn' },
      { command: 'new', description: 'Phiên chat mới (Xóa lịch sử)' },
      { command: 'status', description: 'Trạng thái hệ thống' },
      { command: 'thoitiet', description: 'Xem thời tiết' },
      { command: 'chuyenmohinh', description: 'Đổi AI (DeepSeek/Local)' },
      { command: 'giavang', description: 'Xem giá vàng' },
      { command: 'bat', description: 'Bật máy tính (WOL)' },
      { command: 'tat', description: 'Tắt máy tính (SSH)' },
      { command: 'rustdesk', description: 'Nút bật/tắt RustDesk' },
      { command: 'rustdesk_on', description: 'Bật RustDesk' },
      { command: 'rustdesk_off', description: 'Tắt RustDesk' },
      { command: 'chuyenclaude', description: 'Đổi Claude Mode' },
      { command: 'terminal', description: 'Claude Terminal' },
      { command: 'help', description: 'Trợ giúp' }
    ]
  });
  console.log('Result:', JSON.stringify(result, null, 2));
}

setup();
