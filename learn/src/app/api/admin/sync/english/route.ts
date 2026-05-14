import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST() {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Lấy toàn bộ bài học của Admin
    const adminLessons = await prisma.englishLesson.findMany({
      where: { userId: user.id },
      select: { content: true, type: true }
    });

    // Tạo set để tra cứu nhanh (kết hợp type và content)
    const adminSet = new Set(adminLessons.map(l => `${l.type}|${l.content}`));

    // 2. Lấy toàn bộ bài học của các User khác
    const otherLessons = await prisma.englishLesson.findMany({
      where: { userId: { not: user.id } },
    });

    // 3. Lọc ra những bài chưa có ở Admin
    const toSync = otherLessons.filter(l => !adminSet.has(`${l.type}|${l.content}`));

    if (toSync.length === 0) {
      return Response.json({ count: 0, message: 'Dữ liệu đã đồng bộ, không có nội dung mới.' });
    }

    // 4. Lưu dữ liệu mới vào tài khoản Admin
    // Prisma createMany có thể dùng nếu DB hỗ trợ, ở đây dùng loop cho an toàn và xử lý metadata
    let syncCount = 0;
    for (const item of toSync) {
      await prisma.englishLesson.create({
        data: {
          type: item.type,
          content: item.content,
          metadata: item.metadata,
          title: item.title,
          order: item.order,
          completed: item.completed,
          userId: user.id, // Lưu cho Admin
        }
      });
      syncCount++;
    }

    return Response.json({ count: syncCount, message: `Đã đồng bộ thành công ${syncCount} nội dung mới.` });
  } catch (e: any) {
    console.error('[Sync Error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
