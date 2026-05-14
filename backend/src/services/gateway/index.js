import { GatewayRegistry, PLATFORM_LIMITS, redactSecrets, splitOutboundText } from './base.js';

export const gatewayRegistry = new GatewayRegistry();

gatewayRegistry.register({
  name: 'telegram',
  capabilities: ['text', 'status', 'long-message-split'],
  async status() {
    const { listActiveBots } = await import('../telegram.js');
    const bots = listActiveBots().map(bot => ({
      userId: bot.user_id,
      username: bot.bot_username,
      active: Boolean(bot.active),
      running: Boolean(bot.running),
    }));
    return {
      connected: bots.some(bot => bot.running),
      bots,
    };
  },
  async send({ userId, target, text, options }) {
    const { getBotStatus, sendTelegramMessage } = await import('../telegram.js');
    if (!target) throw new Error('Telegram target chat_id is required');
    const chunks = splitOutboundText(text, PLATFORM_LIMITS.telegram);
    const responses = [];
    for (const chunk of chunks) {
      const response = await sendTelegramMessage(userId, target, chunk, options);
      if (response?.ok === false) throw new Error(response.description || 'Telegram send failed');
      responses.push(response);
    }
    const status = getBotStatus(userId);
    return {
      ok: responses.every(r => r?.ok),
      platform: 'telegram',
      target: String(target),
      username: status.config?.bot_username || '',
      chunks: responses.length,
    };
  },
});

gatewayRegistry.register({
  name: 'zalo',
  capabilities: ['text', 'status', 'long-message-split'],
  async status() {
    const { getZaloStatus } = await import('../zalo.js');
    return getZaloStatus();
  },
  async send({ userId, target, text, options }) {
    if (!target) throw new Error('Zalo target user_id is required');
    const chunks = splitOutboundText(text, PLATFORM_LIMITS.zalo);
    const responses = [];
    for (const chunk of chunks) {
      let response;
      let webError = null;
      try {
        const { sendZaloWebMessageForUser } = await import('../../routes/omni.js');
        response = await sendZaloWebMessageForUser(userId, target, chunk, options);
      } catch (err) {
        webError = err;
        try {
          const { sendZaloMessage } = await import('../zalo.js');
          response = await sendZaloMessage(userId, target, chunk, options);
        } catch (fallbackErr) {
          throw webError || fallbackErr;
        }
      }
      if (response?.ok === false || response?.error) throw new Error(response.error || response.message || 'Zalo send failed');
      responses.push(response);
    }
    return {
      ok: responses.every(r => r?.ok !== false),
      platform: 'zalo',
      target: String(target),
      chunks: responses.length,
    };
  },
});

gatewayRegistry.register({
  name: 'facebook',
  capabilities: ['text', 'status', 'long-message-split'],
  async status() {
    return { connected: true, message: 'Facebook via web cookie' };
  },
  async send({ userId, target, text }) {
    const { sendFacebookMessageForUser } = await import('../../routes/omni.js');
    if (!target) throw new Error('Facebook target thread_id is required');
    const chunks = splitOutboundText(text, PLATFORM_LIMITS.default);
    const responses = [];
    for (const chunk of chunks) {
      responses.push(await sendFacebookMessageForUser(userId, target, chunk));
    }
    return {
      ok: responses.every(r => r?.ok !== false),
      platform: 'facebook',
      target: String(target),
      chunks: responses.length,
    };
  },
});

gatewayRegistry.register({
  name: 'discord',
  capabilities: ['text', 'status'],
  async status() {
    return { connected: false, message: 'Discord integration coming soon' };
  },
  async send({ text }) {
    console.log('[Discord Placeholder] Send:', text);
    return { ok: true, platform: 'discord' };
  },
});

export async function getGatewayStatus() {
  return gatewayRegistry.list();
}

export async function sendGatewayMessage(args, userId) {
  const platform = String(args.platform || '').trim().toLowerCase();
  const target = args.target || args.chat_id || args.user_id;
  const text = args.text || args.message || args.content;

  if (!platform) throw new Error('platform is required');
  if (!text) throw new Error('text/message/content is required');

  const result = await gatewayRegistry.send({
    platform,
    userId,
    target,
    text,
    options: args.options || {},
  });
  return redactSecrets(result);
}
