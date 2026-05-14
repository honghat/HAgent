import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const { newPassword } = await req.json();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return Response.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  return Response.json({ ok: true });
}
