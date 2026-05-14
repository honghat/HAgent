module.exports = {
  apps: [
    {
      name: 'hagent-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start',
      env: {
        PORT: 8004,
        NODE_ENV: 'production',
        HAGENT_HOME: '/Users/nguyenhat/HAgent/backend/agent/runtime',
        HAGENT_SKILLS_DIR: '/Users/nguyenhat/HAgent/backend/agent/app/skills'
      }
    },
    {
      name: 'hagent-learn',
      cwd: './learn',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'hagent-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: '9router',
      cwd: './9router',
      script: './cli.js',
      args: '-p 20128 -n --skip-update',
      env: {
        HOME: '/Users/nguyenhat/HAgent/.hagent'
      }
    },
    {
      name: 'hagent-tts-edge',
      cwd: './tts',
      script: './.venv/bin/python',
      args: 'edge_tts_server.py',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-tts-piper',
      cwd: './tts',
      script: './.venv/bin/python',
      args: 'piper_server.py',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'hagent-tts-lux',
      cwd: './tts/LuxTTS',
      script: '../.venv/bin/python',
      args: 'server.py',
      env: {
        PYTHONPATH: '..'
      }
    },
    {
      name: 'hagent-stt',
      cwd: './stt',
      script: './.venv/bin/python',
      args: 'whisper_server.py',
      env: {
        PYTHONPATH: '.'
      }
    }
  ]
};
