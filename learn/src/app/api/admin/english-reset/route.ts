import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function DELETE() {
  const user = await getSession();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { count } = await prisma.englishLesson.deleteMany({});
    return Response.json({ message: `✅ Đã xóa ${count} bản ghi tiếng Anh của tất cả user.` });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
