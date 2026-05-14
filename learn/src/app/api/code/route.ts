import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json([]);
  try {
    const sessions = await prisma.codeSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return Response.json(sessions);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { type, track, input, output } = await req.json();
    const session = await prisma.codeSession.create({
      data: { type, track, input, output, userId: user.id },
    });
    return Response.json(session);
  } catch (e: unknown) {
    console.error('[code POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await req.json();
    await prisma.codeSession.delete({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
