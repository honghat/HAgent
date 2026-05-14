import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return Response.json([]);
    const reports = await prisma.aIReport.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return Response.json(reports);
  } catch (e: unknown) {
    console.error('[ai-reports GET error]', e);
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { content } = await req.json();
    if (!content) return Response.json({ error: 'No content' }, { status: 400 });
    const date = new Date().toISOString().slice(0, 10);
    const report = await prisma.aIReport.create({
      data: { userId: user.id, date, content },
    });
    return Response.json(report);
  } catch (e: unknown) {
    console.error('[ai-reports POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '0');
    if (!id) return Response.json({ error: 'No id' }, { status: 400 });
    await prisma.aIReport.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    console.error('[ai-reports DELETE error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
