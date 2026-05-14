import os from 'node:os';

export const tool = {
  name: 'get_system_info',
  desc: 'Thông tin hệ thống: RAM, CPU, OS, hostname, uptime.',
  when: 'User hỏi kiểm tra RAM, CPU, cấu hình máy, hệ thống — GỌI NGAY, không dùng bash.',
  args: { type: 'ram | cpu | os (tuỳ chọn, mặc định tất cả)' },
  label: 'Đang đọc thông tin hệ thống...',
  handler: handler,
};

export async function handler({ type } = {}) {
  switch (type) {
    case 'ram':
      return getRamInfo();
    case 'cpu':
      return getCpuInfo();
    case 'os':
      return getOsInfo();
    default:
      return `${getRamInfo()}\n\n${getCpuInfo()}\n\n${getOsInfo()}`;
  }
}

function getRamInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return [
    '**RAM:**',
    `- Tổng: ${(total / 1024 / 1024 / 1024).toFixed(1)} GB`,
    `- Đã dùng: ${(used / 1024 / 1024 / 1024).toFixed(1)} GB`,
    `- Còn trống: ${(free / 1024 / 1024 / 1024).toFixed(1)} GB`,
    `- Đã dùng: ${(used / total * 100).toFixed(1)}%`,
  ].join('\n');
}

function getCpuInfo() {
  const cpus = os.cpus();
  const model = cpus[0]?.model || 'N/A';
  const cores = cpus.length;
  const load = os.loadavg();
  return [
    '**CPU:**',
    `- Model: ${model}`,
    `- Số nhân: ${cores}`,
    `- Tải (1/5/15p): ${load.map(l => l.toFixed(1)).join(' / ')}`,
  ].join('\n');
}

function getOsInfo() {
  return [
    '**Hệ thống:**',
    `- OS: ${os.type()} ${os.release()}`,
    `- Hostname: ${os.hostname()}`,
    `- Uptime: ${Math.floor(os.uptime() / 3600)}h${Math.floor((os.uptime() % 3600) / 60)}m`,
    `- Platform: ${os.platform()} ${os.arch()}`,
  ].join('\n');
}
