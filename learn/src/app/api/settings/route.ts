import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

async function getOrCreate() {
  let s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.settings.create({ data: { id: 1 } });
  return s;
}

export async function GET() {
  try {
    // Bypassing Prisma Client types with RAW SQL for reading
    const results: any = await prisma.$queryRawUnsafe('SELECT * FROM "Settings" WHERE id = 1 LIMIT 1');
    const s = results[0];
    
    if (!s) {
      // Create if missing using raw
      await prisma.$executeRawUnsafe('INSERT INTO "Settings" (id, "aiServer", "aiHost", "aiProvider", "aiModel", "aiKey") VALUES (1, $1, $2, $3, $4, $5)', 
        'http://100.69.50.64:8080/v1', '100.69.50.64', 'local', 'default', '');
      return Response.json({ aiServer: 'http://100.69.50.64:8080/v1', aiHost: '100.69.50.64', aiProvider: 'local', aiModel: 'default' });
    }

    return Response.json({ 
      aiServer: s.aiServer, 
      aiHost: s.aiHost,
      aiProvider: s.aiProvider || 'local',
      aiModel: s.aiModel || 'default',
      aiKey: s.aiKey || ''
    });
  } catch (e) {
    console.error('[settings GET Raw SQL error]', e);
    return Response.json({ aiServer: 'http://100.69.50.64:8080/v1', aiHost: '100.69.50.64', aiProvider: 'local', aiModel: 'default', aiKey: '' });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { aiServer, aiHost, aiProvider, aiModel, aiKey } = body;
    const data = {
      aiServer: (aiServer || '').trim(),
      aiHost: (aiHost || '').trim(),
      aiProvider: (aiProvider || 'local').trim().toLowerCase(),
      aiModel: (aiModel || 'default').trim(),
      aiKey: (aiKey || '').trim()
    };

    // THE NUCLEAR OPTION: RAW SQL to bypass Prisma Client types forever
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Settings" (id, "aiServer", "aiHost", "aiProvider", "aiModel", "aiKey")
        VALUES (1, $1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          "aiServer" = EXCLUDED."aiServer",
          "aiHost" = EXCLUDED."aiHost",
          "aiProvider" = EXCLUDED."aiProvider",
          "aiModel" = EXCLUDED."aiModel",
          "aiKey" = EXCLUDED."aiKey"
      `, 
      data.aiServer, data.aiHost, data.aiProvider, data.aiModel, data.aiKey
      );
      return Response.json(data);
    } catch (rawError: any) {
      console.error('[CRITICAL SQL ERROR]:', rawError);
      return Response.json({ error: 'Database save failed: ' + rawError.message }, { status: 500 });
    }
  } catch (e: any) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
