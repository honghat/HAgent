const token = '8632522003:AAEtdta05B4xUzCPQA9-bQ4QmIFvuc1Y1z4';

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
  console.log('Force updating commands with explicit scope...');
  const result = await callTelegramAPI('setMyCommands', {
    commands: [
      { command: 'start', description: 'Chào mừng & Hướng dẫn' },
      { command: 'new', description: 'Làm mới Chat' },
      { command: 'status', description: 'Trạng thái Hệ thống' },
      { command: 'thoitiet', description: 'Xem Thời tiết' },
      { command: 'chuyenmohinh', description: 'Đổi AI (DeepSeek/Local)' },
      { command: 'giavang', description: 'Xem Giá vàng' },
      { command: 'bat', description: 'Bật máy (WOL)' },
      { command: 'tat', description: 'Tắt máy (SSH)' },
      { command: 'rustdesk', description: 'Nút bật/tắt RustDesk' },
      { command: 'rustdesk_on', description: 'Bật RustDesk' },
      { command: 'rustdesk_off', description: 'Tắt RustDesk' },
      { command: 'chuyenclaude', description: 'Claude Proxy' },
      { command: 'terminal', description: 'Claude Terminal' },
      { command: 'help', description: 'Trợ giúp' }
    ],
    scope: { type: 'all_private_chats' }
  });
  console.log('Result:', JSON.stringify(result, null, 2));
}

setup();
