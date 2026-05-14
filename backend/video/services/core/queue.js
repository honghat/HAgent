import db from '../../../src/db.js';

const taskQueue = [];
let workerBusy = false;

// SSE clients per task
export const clients = new Map();

// Worker function — set externally
let runTaskFn = null;
export function setRunTask(fn) { runTaskFn = fn; }

export function enqueue(taskId) {
  taskQueue.push(taskId);
  pump();
}

export function makeSender(taskId) {
  let logArr = [];
  try {
    const row = db.prepare('SELECT progress FROM video_tasks WHERE id=?').get(taskId);
    if (row?.progress) logArr = JSON.parse(row.progress);
    if (!Array.isArray(logArr)) logArr = [];
  } catch { logArr = []; }

  return (msg) => {
    const line = typeof msg === 'string' ? msg : JSON.stringify(msg);
    console.log(`[video-task ${taskId}] ${line}`);
    logArr.push({ t: Date.now(), m: line });
    if (logArr.length > 500) logArr = logArr.slice(-500);
    db.prepare('UPDATE video_tasks SET progress=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(logArr), Date.now(), taskId);
    const list = clients.get(taskId) || [];
    list.forEach(c => {
      try { c.res.write(`data: ${JSON.stringify({ message: line })}\n\n`); } catch {}
    });
  };
}

async function pump() {
  if (workerBusy || taskQueue.length === 0) return;
  workerBusy = true;
  const taskId = taskQueue.shift();
  try {
    if (runTaskFn) await runTaskFn(taskId);
  } catch (e) {
    console.error('[Video Queue] pump error', e);
  } finally {
    workerBusy = false;
    pump();
  }
}
