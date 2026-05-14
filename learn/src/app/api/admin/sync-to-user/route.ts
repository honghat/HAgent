import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const admin = await getSession();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { targetName, includeCode, includeEnglish, tracks, engTypes } = await req.json();
    if (!targetName) return NextResponse.json({ error: 'Thiếu tên người dùng' }, { status: 400 });
    if (!includeCode && !includeEnglish) return NextResponse.json({ error: 'Chọn ít nhất 1 loại nội dung' }, { status: 400 });

    const targetUser = await prisma.user.findFirst({ where: { name: targetName } });
    if (!targetUser) return NextResponse.json({ error: `Không tìm thấy user "${targetName}"` }, { status: 404 });
    if (targetUser.id === admin.id) return NextResponse.json({ error: 'Không thể đồng bộ cho chính mình' }, { status: 400 });

    let codeSynced = 0;
    let englishSynced = 0;

    // ── CODE / PROGRAMMING ──
    if (includeCode) {
      const where: any = { userId: admin.id };
      if (tracks && tracks.length > 0) where.track = { in: tracks };

      const adminLessons = await prisma.lesson.findMany({ where });
      const existingKeys = new Set(
        (await prisma.lesson.findMany({ where: { userId: targetUser.id }, select: { track: true, topic: true } }))
          .map(l => `${l.track}:${l.topic}`)
      );

      const toCreate = adminLessons
        .filter(l => !existingKeys.has(`${l.track}:${l.topic}`))
        .map(l => ({
          topic: l.topic,
          content: l.content,
          track: l.track,
          userId: targetUser.id,
          completed: false,
          learnCount: 0,
        }));

      if (toCreate.length > 0) {
        await prisma.lesson.createMany({ data: toCreate });
        codeSynced = toCreate.length;
      }
    }

    // ── ENGLISH ──
    if (includeEnglish) {
      const where: any = { userId: admin.id };
      if (engTypes && engTypes.length > 0) where.type = { in: engTypes };

      const adminLessons = await prisma.englishLesson.findMany({ where });
      const existingKeys = new Set(
        (await prisma.englishLesson.findMany({ where: { userId: targetUser.id }, select: { type: true, content: true } }))
          .map(l => `${l.type}:${l.content.slice(0, 100)}`)
      );

      const toCreate = adminLessons
        .filter(l => !existingKeys.has(`${l.type}:${l.content.slice(0, 100)}`))
        .map(l => ({
          type: l.type,
          content: l.content,
          metadata: l.metadata,
          title: l.title,
          order: l.order,
          userId: targetUser.id,
          completed: false,
          learnCount: 0,
        }));

      if (toCreate.length > 0) {
        await prisma.englishLesson.createMany({ data: toCreate });
        englishSynced = toCreate.length;
      }
    }

    const total = codeSynced + englishSynced;
    const parts = [];
    if (codeSynced > 0) parts.push(`${codeSynced} bài lập trình`);
    if (englishSynced > 0) parts.push(`${englishSynced} bài tiếng Anh`);

    if (total === 0) {
      return NextResponse.json({ ok: true, message: `"${targetName}" đã có đầy đủ nội dung được chọn.` });
    }

    return NextResponse.json({
      ok: true,
      message: `Đã truyền cho "${targetName}": ${parts.join(', ')}.`
    });

  } catch (error: any) {
    console.error('[sync-to-user]', error);
    return NextResponse.json({ error: 'Lỗi máy chủ: ' + error.message }, { status: 500 });
  }
}
