const _jobs = new Map();
let _jobIdCounter = 0;

function parseCron(expr) {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return null;
  const expand = (part, min, max) => {
    if (part === '*') return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    const vals = [];
    for (const seg of part.split(',')) {
      if (seg.includes('/')) {
        const [range, step] = seg.split('/');
        const [s, e] = range === '*' ? [min, max] : range.split('-').map(Number);
        for (let i = s; i <= (e || max); i += Number(step)) vals.push(i);
      } else if (seg.includes('-')) {
        const [s, e] = seg.split('-').map(Number);
        for (let i = s; i <= e; i++) vals.push(i);
      } else vals.push(Number(seg));
    }
    return [...new Set(vals)];
  };
  return {
    minute: expand(parts[0], 0, 59),
    hour: expand(parts[1], 0, 23),
    dayOfMonth: expand(parts[2], 1, 31),
    month: expand(parts[3], 1, 12),
    dayOfWeek: expand(parts[4], 0, 6),
  };
}

function checkMatch(schedule, now) {
  return schedule.minute.includes(now.getMinutes())
    && schedule.hour.includes(now.getHours())
    && schedule.dayOfMonth.includes(now.getDate())
    && schedule.month.includes(now.getMonth() + 1)
    && schedule.dayOfWeek.includes(now.getDay());
}

export function cronCreate({ cron, prompt, recurring = true } = {}) {
  try {
    if (!cron || !prompt) return 'Cần cron expression và prompt.';
    const schedule = parseCron(cron);
    if (!schedule) return 'Cron expression không hợp lệ. Dùng định dạng: "phút giờ ngày tháng thứ" (vd: "0 9 * * 1-5" = 9h sáng các ngày trong tuần).';

    const id = ++_jobIdCounter;

    const timer = setInterval(() => {
      const now = new Date();
      if (checkMatch(schedule, now)) {
        _jobs.get(id)?.fires.push({ time: now.toISOString(), fired: true });
      }
    }, 60000);

    _jobs.set(id, { id, cron, prompt, recurring, timer, fires: [], createdAt: new Date().toISOString() });
    return `Cron job #${id} created: "${cron}" — "${prompt.slice(0, 50)}"`;
  } catch (e) {
    return `Lỗi: ${e.message}`;
  }
}

export function cronDelete({ id } = {}) {
  if (!id) {
    for (const [jid, job] of _jobs) { clearInterval(job.timer); }
    _jobs.clear();
    return 'Đã xóa tất cả cron jobs.';
  }
  const job = _jobs.get(Number(id));
  if (!job) return `Không tìm thấy cron job #${id}`;
  clearInterval(job.timer);
  _jobs.delete(Number(id));
  return `Đã xóa cron job #${id}`;
}

export function cronList() {
  if (!_jobs.size) return 'Chưa có cron job nào.';
  return [..._jobs.values()].map(j =>
    `#${j.id}: "${j.cron}" — ${j.prompt.slice(0, 40)} [fires: ${j.fires.length}] ${j.createdAt}`
  ).join('\n');
}
