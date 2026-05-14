import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, setCookieHeader, clearCookieHeader, getSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json({ user: null });
  return Response.json({ user });
}

export async function POST(req: Request) {
  const { action, name, email, password } = await req.json();

  if (action === 'register') {
    const autoEmail = email || `${name.toLowerCase().replace(/\s+/g,'.')}.${Date.now()}@newhat.local`;
    const exists = await prisma.user.findFirst({ where: { OR: [{ name }, { email: autoEmail }] } });
    if (exists) return Response.json({ error: 'Tên đã tồn tại' }, { status: 400 });
    const hash = await bcrypt.hash(password, 10);
    const count = await prisma.user.count();
    // Người dùng đầu tiên = admin + approved tự động
    const role = count === 0 ? 'admin' : 'user';
    const status = count === 0 ? 'approved' : 'pending';
    const user = await prisma.user.create({ data: { name, email: autoEmail, password: hash, role, status } });
    if (status === 'pending') return Response.json({ pending: true });
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
    const response = NextResponse.json({ 
      ok: true, 
      token, // Trả về token để client tự lưu nếu cần
      user: { id: user.id, name: user.name, role: user.role } 
    });
    response.headers.set('Set-Cookie', setCookieHeader(token));
    return response;
  }

  if (action === 'login') {
    const identifier = name || email;
    const user = await prisma.user.findFirst({ where: { OR: [{ name: identifier }, { email: identifier }] } });
    console.log(`API: Login attempt for ${identifier} - Found: ${!!user}`);
    if (!user) return Response.json({ error: 'Tên không tồn tại' }, { status: 401 });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return Response.json({ error: 'Sai mật khẩu' }, { status: 401 });
    if (user.status === 'pending') return Response.json({ error: 'Tài khoản chờ admin duyệt' }, { status: 403 });
    if (user.status === 'rejected') return Response.json({ error: 'Tài khoản bị từ chối' }, { status: 403 });
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
    const cookieValue = setCookieHeader(token);
    const response = NextResponse.json({ 
      ok: true, 
      token, // Trả về token để client tự lưu nếu cần
      user: { id: user.id, name: user.name, role: user.role } 
    });
    response.headers.set('Set-Cookie', cookieValue);
    return response;
  }

  if (action === 'logout') {
    const response = NextResponse.json({ ok: true });
    response.headers.set('Set-Cookie', clearCookieHeader());
    return response;
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
