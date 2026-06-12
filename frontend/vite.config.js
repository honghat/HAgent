import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const learnProxy = {
  target: 'http://127.0.0.1:8006',
  changeOrigin: true,
}

const disableHmr = process.env.HAGENT_DISABLE_HMR === '1'

const proxy = {
  '/learn': learnProxy,
  '/_next': learnProxy,
  '^/api/auth$': learnProxy,
  '/api/ai': learnProxy,
  '/api/ai-reports': learnProxy,
  '/api/code': learnProxy,
  '/api/logs': learnProxy,
  '/api/mission': learnProxy,
  '/api/novel': learnProxy,
  '/api/pomodoro': learnProxy,
  '/api/roadmap': learnProxy,
  '/api/settings': learnProxy,
  '/api/shutdown': learnProxy,
  '/api/stt': { target: 'http://127.0.0.1:8010', changeOrigin: true },
  '/api/tts': { target: 'http://127.0.0.1:8010', changeOrigin: true },
  '/api/users': learnProxy,
  '/api/wol': learnProxy,
  '/api': { target: 'http://127.0.0.1:8010', changeOrigin: true, ws: true },
  '/uploads': 'http://127.0.0.1:8010',
  '/audio_cache': 'http://127.0.0.1:8010',
  '/cache-images': 'http://127.0.0.1:8010',
}

export default defineConfig({
  build: {
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        terminal: resolve(__dirname, 'terminal.html'),
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3004,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    hmr: disableHmr ? false : undefined,
    proxy,
  },
  preview: {
    port: 3004,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    proxy,
  },
})
