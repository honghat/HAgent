import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseLsofOutput(stdout) {
  const rows = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const ports = [];

  for (const line of rows) {
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const [command, pid, user, fd, type, device, sizeOff, node, ...nameParts] = parts;
    const name = nameParts.join(' ');
    const match = name.match(/(?:^|:)(\d+)(?:\s|\(|$)/);
    if (!match) continue;

    ports.push({
      command,
      pid: Number(pid),
      user,
      fd,
      type,
      device,
      sizeOff,
      protocol: node,
      name,
      port: Number(match[1]),
    });
  }

  return ports.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

async function getProcessDetails(pid) {
  const details = {
    pid,
    fullCommand: '',
    cwd: '',
  };

  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], {
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
    details.fullCommand = stdout.trim();
  } catch (_err) {
    details.fullCommand = '';
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
    details.cwd = stdout
      .split('\n')
      .find(line => line.startsWith('n'))
      ?.slice(1)
      .trim() || '';
  } catch (_err) {
    details.cwd = '';
  }

  return details;
}

async function enrichPorts(ports) {
  const uniquePids = [...new Set(ports.map(item => item.pid).filter(Boolean))];
  const details = await Promise.all(uniquePids.map(pid => getProcessDetails(pid)));
  const byPid = new Map(details.map(item => [item.pid, item]));

  return ports.map(item => {
    const processDetails = byPid.get(item.pid) || {};
    return {
      ...item,
      fullCommand: processDetails.fullCommand || item.command,
      cwd: processDetails.cwd || '',
    };
  });
}

export async function listListeningPorts() {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });

    const ports = await enrichPorts(parseLsofOutput(stdout));

    return {
      ok: true,
      ports,
      scannedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err.code === 1 && !err.stdout) {
      return { ok: true, ports: [], scannedAt: new Date().toISOString() };
    }
    throw new Error(`Không đọc được danh sách port: ${err.message}`);
  }
}

export async function killPortProcess({ pid, signal = 'SIGTERM' }) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    throw new Error('PID không hợp lệ');
  }

  const allowedSignals = new Set(['SIGTERM', 'SIGKILL']);
  if (!allowedSignals.has(signal)) {
    throw new Error('Signal không hợp lệ');
  }

  try {
    process.kill(numericPid, signal);
    return { ok: true, message: `Đã gửi ${signal} tới PID ${numericPid}` };
  } catch (err) {
    throw new Error(`Không dừng được PID ${numericPid}: ${err.message}`);
  }
}
