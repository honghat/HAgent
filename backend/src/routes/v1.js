import { Router } from 'express';
import db from '../db.js';
import {
  handleAnthropicMessages,
  handleOpenAIChatCompletion,
  listRouterModels,
} from '../services/router-proxy.js';

export const v1Router = Router();

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1'
    || ip === '::1'
    || ip === '::ffff:127.0.0.1'
    || ip.includes('localhost');
}

function verifyRouterAccess(req, res, next) {
  const configuredKey = process.env.HAGENT_ROUTER_API_KEY || process.env.HAGENT_API_KEY || '';
  const auth = req.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (configuredKey && bearer === configuredKey) return next();

  if (bearer) {
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(bearer);
    if (session) return next();
  }

  if (!configuredKey && isLocalRequest(req)) return next();

  return res.status(401).json({
    error: {
      type: 'authentication_error',
      message: 'Invalid or missing router API key',
    },
  });
}

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

v1Router.use(verifyRouterAccess);

v1Router.get('/models', (_req, res) => {
  res.json(listRouterModels());
});

v1Router.post('/chat/completions', async (req, res) => {
  try {
    if (req.body?.stream) {
      setSseHeaders(res);
      await handleOpenAIChatCompletion(req.body, res);
      return res.end();
    }

    const data = await handleOpenAIChatCompletion(req.body);
    res.json(data);
  } catch (err) {
    console.error('[V1 Chat Completions Error]', err);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: err.message,
      },
    });
  }
});

v1Router.post('/messages', async (req, res) => {
  try {
    if (req.body?.stream) {
      setSseHeaders(res);
      await handleAnthropicMessages(req.body, res);
      return res.end();
    }

    const data = await handleAnthropicMessages(req.body);
    res.json(data);
  } catch (err) {
    console.error('[V1 Messages Error]', err);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: err.message,
      },
    });
  }
});
