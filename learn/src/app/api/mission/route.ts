import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return Response.json({ startDate: Date.now(), totalHours: 0 });

    let cfg = await prisma.missionConfig.findUnique({ where: { userId: user.id } });
    if (!cfg) cfg = await prisma.missionConfig.create({ data: { userId: user.id } });

    const rawConfig: any = await prisma.$queryRaw`SELECT "totalHours" FROM "MissionConfig" WHERE "userId" = ${user.id}`;
    const totalHours = rawConfig?.[0]?.totalHours || 0;

    return Response.json({ startDate: cfg.startDate.getTime(), totalHours });
  } catch (e: unknown) {
    console.error('[mission GET error]', e);
    return Response.json({ startDate: Date.now(), totalHours: 0 });
  }
}
