import './dotenv-config.js';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { wikiRouter } from './routes/wiki.js';
import { webRouter } from './routes/web.js';
import { telegramRouter } from './routes/telegram.js';
import { agentsRouter } from './routes/agents.js';
import { servicesRouter } from './routes/services.js';
import { skillsRouter } from './routes/skills.js';
import { omniRouter } from './routes/omni.js';
import { jobHunterRouter } from './routes/job-hunter.js';
import { educationAnimationRouter } from '../video/routes/education_animation.js';
import { workspaceRouter } from './routes/workspace.js';
import { workspaceAgentRouter } from './routes/workspace-agent.js';
import { taskRouter as videoTaskRouter } from '../video/routes/unified/tasks.js';
import { publishRouter as videoPublishRouter } from '../video/routes/unified/publish.js';
import { youtubeAuthRouter as videoYoutubeAuthRouter } from '../video/routes/unified/youtubeAuth.js';
import { v1Router } from './routes/v1.js';
import { autoStartBots } from './services/telegram.js';
import { autoStartAgents } from './services/agent-worker.js';
import { startDeepSeekMonitor } from './services/deepseek-monitor.js';
import { loadMcpServers } from './services/mcp/client.js';
import { pythonAgentProxy, startPythonAgent } from './services/python-agent.js';
import './services/tools/vision.js';
import { initVideoQueue } from '../video/services/core/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 8004;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/providers/:name/health', async (req, res) => {
  const { name } = req.params;
  try {
    const { PROVIDER_CONFIGS } = await import('./services/provider-config.js');
    const config = PROVIDER_CONFIGS[name];
    if (!config) return res.status(404).json({ error: 'Provider not found' });

    if (config.baseURL && (config.baseURL.includes('localhost') || config.baseURL.includes('127.0.0.1') || config.baseURL.includes('100.'))) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        const pingUrl = config.baseURL.endsWith('/v1') ? `${config.baseURL}/models` : `${config.baseURL}/v1/models`;
        const response = await fetch(pingUrl, { signal: controller.signal });
        clearTimeout(timeout);
        console.log(`[Health] ${name} -> ${pingUrl} status: ${response.status}`);
        return res.json({ status: response.ok ? 'ok' : 'error' });
      } catch (err) {
        clearTimeout(timeout);
        console.error(`[Health] ${name} ping failed: ${err.message}`);
        return res.json({ status: 'error', detail: err.message });
      }
    }
    // External providers (OpenAI, Anthropic, Gemini, DeepSeek) are assumed OK if we have an API key
    return res.json({ status: config.apiKey ? 'ok' : 'error' });
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code param');
  try {
    const { exchangeGoogleCode } = await import('./services/tools/google.js');
    const result = await exchangeGoogleCode(code);
    res.send(`<h2>${result.message}</h2><p>Có thể đóng tab này.</p>`);
  } catch (e) {
    res.status(500).send(`<h2>Lỗi: ${e.message}</h2>`);
  }
});

// Auth first
app.use('/api/auth', authRouter);

// Python agent is now mounted behind the main JS backend, so the frontend only
// talks to one origin while the richer Python loop remains available.
app.use('/api/sessions', pythonAgentProxy());
app.use('/api/paste', pythonAgentProxy());
app.use('/api/config', pythonAgentProxy());

// OpenAI/Anthropic-compatible router for coding tools and external chat clients.
app.use('/v1', v1Router);

// Video routes (specific prefixes)
app.use('/api/video/tasks', videoTaskRouter);
app.use('/api/video/publish', videoPublishRouter);
app.use('/api/video/auth/youtube', videoYoutubeAuthRouter);

// Routers with specific prefixes in index
app.use('/api/wiki', wikiRouter);
app.use('/api/services', servicesRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/omni', omniRouter);
app.use('/api/job-hunter', jobHunterRouter);
app.use('/api/education-animation', educationAnimationRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api', workspaceAgentRouter);

// Routers that include their own resource name in their internal routes (registered at /api)
app.use('/api', agentsRouter);
app.use('/api', skillsRouter);
app.use('/api', chatRouter);
app.use('/api', webRouter);

app.use('/uploads', (req, res, next) => {
  console.log(`[Static] Requesting: ${req.url}`);
  next();
}, express.static(path.resolve(__dirname, '..', '..', 'data', 'uploads')));

const server = app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  startPythonAgent();
  autoStartBots().then(() => console.log('Telegram bots auto-started'));
  autoStartAgents().then(n => console.log(`Agent workers auto-started: ${n}`));
  if (process.env.OMNI_WORKER_ENABLED === 'true') {
    const { startOmniWorker } = await import('./services/omni-worker.js');
    startOmniWorker().then(() => console.log('OmniWorker started (Auto-sync & Auto-reply)'));
  } else {
    console.log('OmniWorker disabled. Set OMNI_WORKER_ENABLED=true to enable auto-sync & auto-reply.');
  }
  loadMcpServers().then(() => console.log('MCP servers initialized'));
  initVideoQueue();
  startDeepSeekMonitor();
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Cổng ${PORT} đang bị chiếm. Đang thử dọn dẹp và khởi động lại sau 2 giây...`);
    try {
      const { execSync } = await import('child_process');
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`);
    } catch {}
    setTimeout(() => {
      server.listen(PORT, '0.0.0.0');
    }, 2000);
  } else {
    console.error('❌ Lỗi khởi động server:', err);
    process.exit(1);
  }
});
