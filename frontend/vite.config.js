import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const learnProxy = {
  target: 'http://127.0.0.1:8006',
  changeOrigin: true,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3004,
    host: true,
    allowedHosts: ['hatai.io.vn'],
    proxy: {
      '/learn': learnProxy,
      '/_next': learnProxy,
      '^/api/auth$': learnProxy,
      '/api/admin': learnProxy,
      '/api/ai': learnProxy,
      '/api/ai-reports': learnProxy,
      '/api/code': learnProxy,
      '/api/english': learnProxy,
      '/api/lessons': learnProxy,
      '/api/logs': learnProxy,
      '/api/mindmap': learnProxy,
      '/api/mission': learnProxy,
      '/api/novel': learnProxy,
      '/api/pomodoro': learnProxy,
      '/api/roadmap': learnProxy,
      '/api/settings': learnProxy,
      '/api/shutdown': learnProxy,
      '/api/stt': learnProxy,
      '/api/tts': learnProxy,
      '/api/users': learnProxy,
      '/api/wol': learnProxy,
      '/uploads': { target: 'http://127.0.0.1:8004', changeOrigin: true },
      '/v1': { target: 'http://127.0.0.1:8004', changeOrigin: true },
      '/api/video': { target: 'http://127.0.0.1:8004', changeOrigin: true },
      '/api': 'http://127.0.0.1:8004',
    },
  },
})
