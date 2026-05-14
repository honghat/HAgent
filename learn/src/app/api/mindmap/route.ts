import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json([]);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const topic = searchParams.get('topic');
    const where: { userId: number; date?: string; topic?: string } = { userId: user.id };
    if (date) where.date = date;
    if (topic) where.topic = topic;
    const notes = await prisma.mindmapNote.findMany({
      where,
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
    });
    return Response.json(notes);
  } catch (e) {
    console.error('[mindmap GET]', e);
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { title, topic, markdown, date } = await req.json();
    const note = await prisma.mindmapNote.create({
      data: {
        userId: user.id,
        date: date || new Date().toISOString().slice(0, 10),
        topic: topic || '',
        title: title || 'Không tiêu đề',
        markdown: markdown || '',
      },
    });
    return Response.json(note);
  } catch (e) {
    console.error('[mindmap POST]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, title, topic, markdown, date } = await req.json();
    if (!id) return Response.json({ error: 'No id' }, { status: 400 });
    const updated = await prisma.mindmapNote.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(title !== undefined && { title }),
        ...(topic !== undefined && { topic }),
        ...(markdown !== undefined && { markdown }),
        ...(date !== undefined && { date }),
      },
    });
    return Response.json(updated);
  } catch (e) {
    console.error('[mindmap PUT]', e);
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
    await prisma.mindmapNote.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[mindmap DELETE]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
