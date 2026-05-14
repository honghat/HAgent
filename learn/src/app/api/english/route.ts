import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { computeNextReview, qualityFromScore } from '@/lib/srs';

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return Response.json([]);
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  try {
    const where = type ? { userId: user.id, type } : { userId: user.id };
    const lessons = await prisma.englishLesson.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 5000,
    });
    return Response.json(lessons);
  } catch { return Response.json([]); }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { type, content, metadata = {} } = await req.json();
    const lesson = await prisma.englishLesson.create({
      data: {
        type,
        content,
        metadata: JSON.stringify(metadata),
        userId: user.id,
        title: metadata.title || '',
        order: metadata.order || 0,
      },
    });
    return Response.json(lesson);
  } catch (e: unknown) {
    console.error('[english POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, completed, content, metadata, incrementLearnCount, quizScore, quizTotal } = await req.json();
    const data: any = {};
    if (completed !== undefined) data.completed = completed;
    if (content !== undefined) data.content = content;
    if (metadata !== undefined) {
      // Merge với metadata cũ để tránh mất field (vd: unit, unitTitle)
      const existing = await prisma.englishLesson.findUnique({
        where: { id, userId: user.id },
        select: { metadata: true },
      });
      let prevMeta: any = {};
      try { prevMeta = JSON.parse(existing?.metadata || '{}'); } catch {}
      const merged = { ...prevMeta, ...metadata };
      data.metadata = JSON.stringify(merged);
      if (merged.title) data.title = merged.title;
      if (merged.order !== undefined) data.order = merged.order;
    }
    if (incrementLearnCount) data.learnCount = { increment: 1 };

    if (typeof quizScore === 'number' && typeof quizTotal === 'number' && quizTotal > 0) {
      const prev = await prisma.englishLesson.findUnique({
        where: { id, userId: user.id },
        select: { intervalDays: true, easeFactor: true, reviewCount: true },
      });
      if (prev) {
        const q = qualityFromScore(quizScore, quizTotal);
        const next = computeNextReview(prev, q);
        data.intervalDays = next.intervalDays;
        data.easeFactor = next.easeFactor;
        data.reviewCount = next.reviewCount;
        data.nextReviewAt = next.nextReviewAt;
        data.lastReviewedAt = next.lastReviewedAt;
      }
    }

    const lesson = await prisma.englishLesson.update({
      where: { id, userId: user.id },
      data,
    });
    return Response.json(lesson);
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, ids } = await req.json();

    if (ids && Array.isArray(ids)) {
      await prisma.englishLesson.deleteMany({
        where: { id: { in: ids }, userId: user.id }
      });
    } else if (id) {
      await prisma.englishLesson.delete({ where: { id, userId: user.id } });
    }

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
