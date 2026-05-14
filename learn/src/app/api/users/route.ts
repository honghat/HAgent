import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
  return Response.json(users);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { id, status, role, name, email, password } = await req.json();
  const data: any = {};
  if (status) data.status = status;
  if (role) data.role = role;
  if (name) data.name = name;
  if (email) data.email = email;
  if (password) data.password = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await req.json();
  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
