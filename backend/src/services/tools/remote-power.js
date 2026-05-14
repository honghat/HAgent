import dgram from 'node:dgram';
import { execSync } from 'node:child_process';

const MAC = process.env.WOL_MAC || '9c:6b:00:17:93:7a';
const BROADCAST = process.env.WOL_BROADCAST || '192.168.1.255';
const WOL_PORT = parseInt(process.env.WOL_PORT || '9', 10);
const SSH_HOST = process.env.SSH_REMOTE_HOST || '100.69.50.64';
const SSH_USER = process.env.SSH_REMOTE_USER || 'hatnguyen';

function buildMagicPacket(mac) {
  const hex = mac.replace(/[:\-]/g, '');
  const macBytes = Buffer.from(hex, 'hex');
  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 1; i <= 16; i++) macBytes.copy(packet, i * 6);
  return packet;
}

function sendWOL() {
  return new Promise((resolve, reject) => {
    const packet = buildMagicPacket(MAC);
    const socket = dgram.createSocket('udp4');
    socket.once('error', err => { socket.close(); reject(err); });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, WOL_PORT, BROADCAST, err => {
        socket.close();
        if (err) reject(err);
        else resolve('✅ Đã gửi tín hiệu Wake-on-LAN. Máy tính sẽ khởi động trong vài giây.');
      });
    });
  });
}

async function sshExec(command) {
  const password = process.env.SSH_PASSWORD;
  if (!password) return '❌ Chưa cấu hình SSH_PASSWORD trong .env';
  try {
    const result = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 ${SSH_USER}@${SSH_HOST} '${command}'`,
      { timeout: 15000, encoding: 'utf8' }
    );
    return (result || '').trim() || '✅ Lệnh đã chạy thành công.';
  } catch (e) {
    const msg = e.stdout || e.stderr || e.message || '';
    return `❌ Lỗi SSH: ${msg.slice(0, 500)}`;
  }
}

async function handler(args) {
  const action = args.action || 'wol';

  switch (action) {
    case 'wol':
    case 'wake':
      return await sendWOL();

    case 'shutdown':
      return await sshExec(`echo '${process.env.SSH_PASSWORD || ''}' | sudo -S shutdown now`);

    case 'reboot':
      return await sshExec(`echo '${process.env.SSH_PASSWORD || ''}' | sudo -S reboot`);

    case 'status':
      return await sshExec('uptime');

    case 'sleep':
      return await sshExec('pmset sleepnow');

    default:
      return 'Hành động: wol, shutdown, reboot, status, sleep';
  }
}

export const tool = {
  name: 'remote_power',
  desc: 'Điều khiển máy tính từ xa: bật (WOL), tắt, khởi động lại, xem trạng thái.',
  when: 'User muốn bật/tắt/khởi động máy tính từ xa, remote desktop, wake computer, shutdown server.',
  args: { action: 'wol | shutdown | reboot | status | sleep' },
  handler,
  label: 'Đang điều khiển máy tính từ xa...',
};
