const path = require('path');
const fs = require('fs');
const LOG_DIR = '/Users/nguyenhat/HAgent/logs';

function readDotenvValue(name) {
  for (const file of ['.env', 'backend/.env']) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, file), 'utf8');
      const line = raw.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
      if (!line) continue;
      return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // Optional local env files may not exist.
    }
  }
  return '';
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || readDotenvValue('GROQ_API_KEY');

const HARDENED = {
  autorestart: true,
  max_restarts: 10,
  min_uptime: '30s',
  restart_delay: 5000,
  exp_backoff_restart_delay: 200,
  max_memory_restart: '1G',
  kill_timeout: 5000,
};

const DEFAULT_SERVICES = [
  'hagent-chatgpt2api',
  'hagent-fastapi',
  'hagent-searxng',
  'hagent-learn',
  'hagent-tts-edge',
  'hagent-telegram',
  'hagent-cron',
  'hagent-omni',
  'hagent-video-portal',
];

const ON_DEMAND_SERVICES = new Set([
  'hagent-tts-piper',
]);

const apps = [
    {
      name: 'hagent-chatgpt2api',
      cwd: '/Users/nguyenhat/HAgent/projects/chatgpt2api',
      script: '.venv/bin/python',
      args: "-m uvicorn api:create_app --factory --host 127.0.0.1 --port 3011",
      error_file: `${LOG_DIR}/chatgpt2api-error.log`,
      out_file: `${LOG_DIR}/chatgpt2api-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-fastapi',
      cwd: './backend',
      script: '.venv/bin/python',
      args: '-m uvicorn api.main:app --host 127.0.0.1 --port 8010',
      max_memory_restart: '2G',
      error_file: `${LOG_DIR}/fastapi-error.log`,
      out_file: `${LOG_DIR}/fastapi-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        HAGENT_HOME: '/Users/nguyenhat/HAgent/backend',
        PYTHONPATH: '.',
        SEARXNG_URL: 'http://127.0.0.1:8888',
      }
    },
    {
      name: 'hagent-searxng',
      cwd: '/Users/nguyenhat/HAgent/backend/searxng-lite',
      script: './start.sh',
      args: '',
      error_file: `${LOG_DIR}/searxng-error.log`,
      out_file: `${LOG_DIR}/searxng-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        SEARXNG_PM2_FOREGROUND: '1',
      }
    },
    {
      name: 'hagent-video-portal',
      cwd: '/Users/nguyenhat/HAgent/videodub-portal',
      script: '/Users/nguyenhat/HAgent/backend/.venv/bin/python',
      args: 'server.py',
      error_file: `${LOG_DIR}/video-portal-error.log`,
      out_file: `${LOG_DIR}/video-portal-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PORTAL_LISTEN_PORT: '8007',
        PORTAL_TARGET: 'http://127.0.0.1:8010',
      }
    }
  ];

module.exports = {
  apps: apps.map(a => ({
    ...HARDENED,
    ...a,
    autostart: ON_DEMAND_SERVICES.has(a.name) ? false : (a.autostart ?? true),
  })),
  DEFAULT_SERVICES,
  ON_DEMAND_SERVICES: [...ON_DEMAND_SERVICES],
};
