import { getSession } from '@/lib/auth';
import { NodeSSH } from 'node-ssh';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { password, host = '100.69.50.64' } = await req.json();
  if (!password) return Response.json({ error: 'Cần mật khẩu sudo' }, { status: 400 });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host, username: 'hatnguyen', password, readyTimeout: 8000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256','diffie-hellman-group14-sha1','diffie-hellman-group1-sha1','ecdh-sha2-nistp256','ecdh-sha2-nistp384','ecdh-sha2-nistp521'],
        cipher: ['aes128-ctr','aes192-ctr','aes256-ctr','aes128-gcm','aes256-gcm','3des-cbc','aes128-cbc'],
        serverHostKey: ['ssh-rsa','ssh-dss','ecdsa-sha2-nistp256','ssh-ed25519'],
        hmac: ['hmac-sha2-256','hmac-sha2-512','hmac-sha1'],
      },
    });
    await ssh.execCommand(`echo '${password}' | sudo -S shutdown now`);
    ssh.dispose();
    return Response.json({ ok: true });
  } catch (e: unknown) {
    ssh.dispose();
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
