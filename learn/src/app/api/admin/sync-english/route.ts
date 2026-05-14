import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const admin = await getSession();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện hành động này' }, { status: 401 });
    }

    const { targetName } = await req.json();
    if (!targetName) {
      return NextResponse.json({ error: 'Thiếu tên người dùng mục tiêu' }, { status: 400 });
    }

    // 1. Tìm người dùng mục tiêu
    const targetUser = await prisma.user.findFirst({
      where: { name: targetName }
    });

    if (!targetUser) {
      return NextResponse.json({ error: `Không tìm thấy người dùng có tên "${targetName}"` }, { status: 404 });
    }

    if (targetUser.id === admin.id) {
      return NextResponse.json({ error: 'Không thể đồng bộ cho chính mình' }, { status: 400 });
    }

    // 2. Lấy danh sách bài học của Admin
    const adminLessons = await prisma.englishLesson.findMany({
      where: { userId: admin.id }
    });

    if (adminLessons.length === 0) {
      return NextResponse.json({ error: 'Admin hiện chưa có bài học nào để đồng bộ' }, { status: 400 });
    }

    // 3. Lấy danh sách bài học hiện tại của targetUser để tránh trùng
    const existingLessons = await prisma.englishLesson.findMany({
      where: { userId: targetUser.id },
      select: { title: true, type: true }
    });

    const existingKeys = new Set(existingLessons.map(l => `${l.type}:${l.title}`));

    // 4. Lọc ra các bài học chưa có
    const lessonsToCreate = adminLessons
      .filter(l => !existingKeys.has(`${l.type}:${l.title}`))
      .map(l => ({
        type: l.type,
        content: l.content,
        metadata: l.metadata,
        title: l.title,
        order: l.order,
        userId: targetUser.id,
        completed: false,
        learnCount: 0
      }));

    if (lessonsToCreate.length === 0) {
      return NextResponse.json({ ok: true, message: 'Người dùng này đã có đầy đủ bài học từ Admin' });
    }

    // 5. Tạo bài học mới cho targetUser
    await prisma.englishLesson.createMany({
      data: lessonsToCreate
    });

    return NextResponse.json({ 
      ok: true, 
      count: lessonsToCreate.length,
      message: `Đã đồng bộ thành công ${lessonsToCreate.length} bài học cho ${targetName}` 
    });

  } catch (error: any) {
    console.error('Sync English Lessons Error:', error);
    return NextResponse.json({ error: 'Lỗi máy chủ khi đồng bộ dữ liệu' }, { status: 500 });
  }
}
