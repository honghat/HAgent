const path = require('path');
const LOG_DIR = '/Users/nguyenhat/HAgent/logs';

module.exports = {
  apps: [
    {
      name: 'hagent-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start',
      error_file: `${LOG_DIR}/backend-error.log`,
      out_file: `${LOG_DIR}/backend-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PORT: 8004,
        NODE_ENV: 'production',
        HAGENT_HOME: '/Users/nguyenhat/HAgent/backend/agent/data',
        HAGENT_SKILLS_DIR: '/Users/nguyenhat/HAgent/backend/agent/app/skills',
        HAGENT_PYTHON_AGENT_AUTOSTART: 'false'
      }
    },
    {
      name: 'hagent-fastapi',
      cwd: './backend/agent/app',
      script: '../.venv/bin/python',
      args: '-m uvicorn api.main:app --host 127.0.0.1 --port 8010',
      error_file: `${LOG_DIR}/fastapi-error.log`,
      out_file: `${LOG_DIR}/fastapi-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        HAGENT_HOME: '/Users/nguyenhat/HAgent/backend/agent/data',
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-learn',
      cwd: './learn',
      script: 'npm',
      args: 'run dev',
      error_file: `${LOG_DIR}/learn-error.log`,
      out_file: `${LOG_DIR}/learn-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'hagent-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      error_file: `${LOG_DIR}/frontend-error.log`,
      out_file: `${LOG_DIR}/frontend-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: '9router',
      cwd: '/Users/nguyenhat/.local/lib/node_modules/9router/app',
      script: 'node',
      args: 'server.js',
      error_file: `${LOG_DIR}/9router-error.log`,
      out_file: `${LOG_DIR}/9router-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PORT: 20128,
        HOSTNAME: '0.0.0.0',
        HOME: '/Users/nguyenhat/HAgent/backend/agent/data/9router'
      }
    },
    {
      name: 'hagent-tts-edge',
      cwd: './tts',
      script: './.venv/bin/python',
      args: 'edge_tts_server.py',
      error_file: `${LOG_DIR}/tts-edge-error.log`,
      out_file: `${LOG_DIR}/tts-edge-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-tts-piper',
      cwd: './tts',
      script: './.venv/bin/python',
      args: 'piper_server.py',
      error_file: `${LOG_DIR}/tts-piper-error.log`,
      out_file: `${LOG_DIR}/tts-piper-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-tts-lux',
      cwd: './tts/LuxTTS',
      script: '../.venv/bin/python',
      args: 'server.py',
      error_file: `${LOG_DIR}/tts-lux-error.log`,
      out_file: `${LOG_DIR}/tts-lux-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-stt',
      cwd: './stt',
      script: './.venv/bin/python',
      args: 'whisper_server.py',
      error_file: `${LOG_DIR}/stt-error.log`,
      out_file: `${LOG_DIR}/stt-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-telegram',
      cwd: './backend/agent/app',
      script: 'telegram_bot.py',
      interpreter: '/Users/nguyenhat/HAgent/backend/agent/.venv/bin/python',
      error_file: `${LOG_DIR}/telegram-error.log`,
      out_file: `${LOG_DIR}/telegram-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        HAGENT_HOME: '/Users/nguyenhat/HAgent/backend/agent/data',
        PYTHONPATH: '.'
      }
    },
  ]
};

