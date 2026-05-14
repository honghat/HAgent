import { getSession } from '@/lib/auth';
import dgram from 'dgram';

const MAC = '9c:6b:00:17:93:7a';

function buildMagicPacket(mac: string): Buffer {
  const hex = mac.replace(/[:\-]/g, '');
  const macBytes = Buffer.from(hex, 'hex');
  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 1; i <= 16; i++) macBytes.copy(packet, i * 6);
  return packet;
}

export async function POST() {
  const user = await getSession();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  return new Promise<Response>(resolve => {
    const packet = buildMagicPacket(MAC);
    const socket = dgram.createSocket('udp4');
    socket.once('error', err => {
      socket.close();
      resolve(Response.json({ error: err.message }, { status: 500 }));
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, 9, '192.168.1.255', err => {
        socket.close();
        if (err) resolve(Response.json({ error: err.message }, { status: 500 }));
        else resolve(Response.json({ ok: true }));
      });
    });
  });
}
