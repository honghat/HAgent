import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allLessons = await prisma.englishLesson.findMany({
      where: { userId: user.id }
    });

    // Grouping and logic
    const groups: Record<string, any[]> = {};
    for (const lesson of allLessons) {
      let metadata: any = {};
      try { metadata = JSON.parse(lesson.metadata || '{}'); } catch (e) {}
      
      const unit = String(metadata.unit || '0');
      const level = metadata.level || 'A2';
      const type = lesson.type;

      // Key for grouping (ignoring mode)
      const key = (type === 'vocab') 
        ? `unit-${unit}-level-${level}-type-${type}-word-${lesson.content}`
        : `unit-${unit}-level-${level}-type-${type}`;

      if (!groups[key]) groups[key] = [];
      groups[key].push(lesson);
    }

    const idsToDelete: number[] = [];
    
    // 1. First Pass: Normalize modes within each (unit, level) group
    for (const key in groups) {
      const group = groups[key];
      const modes = group.map(l => {
        try { return JSON.parse(l.metadata || '{}').mode || 'coder'; } catch { return 'coder'; }
      });
      const uniqueModes = [...new Set(modes)];
      
      if (uniqueModes.length > 1) {
        // Normalize all to 'coder' (the most common/default mode)
        for (const lesson of group) {
          let meta = {};
          try { meta = JSON.parse(lesson.metadata || '{}'); } catch {}
          if (meta.mode !== 'coder') {
            meta.mode = 'coder';
            await prisma.englishLesson.update({
              where: { id: lesson.id },
              data: { metadata: JSON.stringify(meta) }
            });
          }
        }
      }
    }

    // 2. Second Pass: Identify actual duplicates (same type, unit, level)
    // We re-fetch or just use the grouped data (now that modes are irrelevant for logical duplication)
    for (const key in groups) {
      const group = groups[key];
      if (group.length > 1) {
        group.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        const others = group.slice(1);
        idsToDelete.push(...others.map(o => o.id));
      }
    }

    if (idsToDelete.length > 0) {
      await prisma.englishLesson.deleteMany({
        where: { id: { in: idsToDelete }, userId: user.id }
      });
    }

    return Response.json({ 
      ok: true, 
      deletedCount: idsToDelete.length,
      message: `Đã dọn dẹp ${idsToDelete.length} bài học trùng lặp.`
    });

  } catch (e: any) {
    console.error('[Cleanup API Error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
