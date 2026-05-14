import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return Response.json([]);
    const items = await prisma.roadmapItem.findMany({
      where: { userId: user.id, completed: true },
      select: { id: true }
    });
    return Response.json(items.map(i => i.id));
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, completed } = await req.json();
    const item = await prisma.roadmapItem.upsert({
      where: { userId_id: { userId: user.id, id } },
      update: { completed },
      create: { userId: user.id, id, completed },
    });
    return Response.json(item);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
