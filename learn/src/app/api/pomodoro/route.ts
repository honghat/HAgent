import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ sessions: 0, currentEndTime: 0, currentMode: 'work' });
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const row = await prisma.pomodoroSession.findUnique({ where: { userId_date: { userId: user.id, date } } });
    return Response.json({
      sessions: row?.sessions ?? 0,
      currentEndTime: Number(row?.currentEndTime ?? 0),
      currentMode: row?.currentMode ?? 'work',
    });
  } catch (e: unknown) {
    console.error('[pomodoro GET error]', e);
    return Response.json({ sessions: 0, currentEndTime: 0, currentMode: 'work' });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { date, sessions, currentEndTime, currentMode } = await req.json();
    const row = await prisma.pomodoroSession.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { 
        sessions: sessions !== undefined ? sessions : undefined, 
        currentEndTime: currentEndTime !== undefined ? currentEndTime : undefined, 
        currentMode: currentMode || undefined 
      },
      create: { userId: user.id, date, sessions: sessions || 0, currentEndTime: currentEndTime || 0, currentMode: currentMode || 'work' },
    });
    return Response.json({
      ...row,
      currentEndTime: Number(row.currentEndTime ?? 0),
    });
  } catch (e: unknown) {
    console.error('[pomodoro POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
