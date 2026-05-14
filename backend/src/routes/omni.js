import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import db from '../db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { sendGatewayMessage } from '../services/gateway/index.js';
import { sendTelegramWebMessageForUser } from '../services/telegram.js';

export const omniRouter = Router();
const omniEvents = new EventEmitter();
omniEvents.setMaxListeners(500);

export function notifyOmni(userId, payload = {}) {
  if (!userId) return;
  omniEvents.emit(`user:${userId}`, {
    type: 'change',
    at: Date.now(),
    ...payload,
  });
}

function friendlyPlaywrightError(err, feature) {
  const message = String(err?.message || err || '');
  if (message.includes("Executable doesn't exist") || message.includes('Please run the following command to download new browsers')) {
    return `${feature} cần Chromium của Playwright. Chạy: cd backend && npx playwright install chromium`;
  }
  return message;
}

function parseLastJsonLine(text) {
  const lines = String(text || '').trim().split('\n').reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

function friendlyZaloBridgeError(err) {
  const message = String(err?.message || err || '');
  if (message.includes("'NoneType' object is not subscriptable") ||
      message.includes('An error occurred while logging in') ||
      message.includes('Phiên Zalo hết hạn')) {
    return 'Phiên Zalo đã hết hạn hoặc cookie/IMEI không còn hợp lệ. Hãy quét QR Zalo lại rồi sync lại.';
  }
  return message;
}

const DEFAULT_AVATAR = 'https://chat.zalo.me/assets/default_avatar.png';
const HATAI_PYTHON = process.env.HATAI_PYTHON || '/Users/nguyenhat/miniconda3/envs/hatai_env/bin/python';
const DEFAULT_PYTHON = existsSync(HATAI_PYTHON) ? HATAI_PYTHON : 'python3';
const zaloQrSessions = new Map();
const zaloWebSessions = new Map();
const zaloListenerChildren = new Set();
const ZALO_WEB_POLL_MS = 30000;

function cleanupZaloListenerChildren() {
  for (const child of zaloListenerChildren) {
    try { child.kill(); } catch {}
  }
  zaloListenerChildren.clear();
}

process.once('exit', cleanupZaloListenerChildren);
process.once('SIGINT', () => {
  cleanupZaloListenerChildren();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanupZaloListenerChildren();
  process.exit(143);
});

function readJsonBody(raw = '') {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function captureZaloImei(session, value = '') {
  const imei = String(value || '').trim();
  if (!imei || imei === 'null' || imei === 'undefined') return '';
  session.imei = imei;
  return imei;
}

function captureZaloImeiFromUrl(session, rawUrl = '') {
  try {
    const url = new URL(rawUrl);
    return captureZaloImei(session, url.searchParams.get('imei'));
  } catch {
    return '';
  }
}

async function getZaloCookieHeader(context) {
  const cookies = await context.cookies();
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function readZaloPageImei(page) {
  return page.evaluate(() => {
    const keys = ['z_uuid', 'imei', 'zpw_imei', 'z_device_id', 'deviceId'];
    for (const key of keys) {
      const value = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
      if (value) return value;
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) || '';
        const value = storage.getItem(key) || '';
        if (/imei|uuid|device/i.test(key) && value) return value;
      }
    }
    const entries = performance.getEntriesByType('resource') || [];
    for (const entry of entries) {
      try {
        const url = new URL(entry.name);
        const imei = url.searchParams.get('imei');
        if (imei) return imei;
      } catch {}
    }
    return '';
  }).catch(() => '');
}

async function persistZaloSessionToken(userId, session) {
  const cookie = session.context ? await getZaloCookieHeader(session.context) : (session.cookie || '');
  const imei = session.imei || (session.page ? await readZaloPageImei(session.page) : '');
  if (imei) captureZaloImei(session, imei);
  const channel = ensureChannel({
    userId,
    platform: 'zalo',
    name: 'Zalo Personal',
    token: JSON.stringify({ cookie, imei: session.imei || '' }),
  });
  db.prepare('UPDATE omni_channels SET access_token = ?, is_active = 1, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify({ cookie, imei: session.imei || '' }), channel.id);
  return { channel, cookie, imei: session.imei || '' };
}

async function ingestZaloThreadPayload(userId, channel, threads = [], ownId = '') {
  let syncedConversations = 0;
  let syncedMessages = 0;
  const touchedConversationIds = new Set();

  for (const thread of threads) {
    const normalizedThread = thread.thread_id ? {
      threadId: thread.thread_id,
      name: thread.name,
      avatar: thread.avatar,
      text: thread.last_message,
      unreadCount: thread.unread,
      threadType: thread.thread_type,
    } : thread;
    const conv = upsertZaloConversation({ userId, channel, thread: normalizedThread });
    if (!conv) continue;
    syncedConversations += 1;

    const threadId = thread.thread_id || extractZaloThread(thread).threadId;
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    for (const rawMessage of messages) {
      const msg = rawMessage.external_id
        ? {
            externalId: rawMessage.external_id,
            externalCliId: rawMessage.cli_msg_id || rawMessage.external_cli_id || '',
            externalMsgType: rawMessage.msg_type || rawMessage.external_msg_type || 'webchat',
            authorId: rawMessage.author_id || '',
            authorName: rawMessage.author_name || '',
            senderType: ownId && String(rawMessage.author_id) === String(ownId) ? 'agent' : 'customer',
            content: rawMessage.content,
            createdAt: rawMessage.created_at,
          }
        : extractZaloMessage(rawMessage, new Set(ownId ? [String(ownId)] : []));
      if (!msg.content) continue;
      const result = db.prepare(`
        INSERT OR IGNORE INTO omni_messages (
          id, user_id, conversation_id, external_id, external_cli_id, external_msg_type,
          external_author_id, external_author_name, sender_type, content, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', COALESCE(?, datetime('now')))
      `).run(
        randomUUID(),
        userId,
        conv.id,
        msg.externalId || `${threadId}:${msg.content.slice(0, 80)}`,
        msg.externalCliId || '',
        msg.externalMsgType || 'webchat',
        msg.authorId || '',
        msg.authorName || '',
        msg.senderType,
        msg.content,
        msg.createdAt
          ? (Number.isFinite(Number(msg.createdAt)) ? new Date(Number(msg.createdAt)).toISOString() : new Date(msg.createdAt).toISOString())
          : null
      );
      if (result.changes) {
        syncedMessages += 1;
        touchedConversationIds.add(conv.id);
      }
    }
  }

  if (syncedConversations || syncedMessages) {
    notifyOmni(userId, {
      platform: 'zalo',
      conversation_ids: [...touchedConversationIds],
      reason: 'zalo-web',
    });
  }
  return { syncedConversations, syncedMessages };
}

function attachZaloWebWatch(session) {
  if (session.watchAttached) return;
  session.watchAttached = true;

  session.page.on('request', req => {
    captureZaloImeiFromUrl(session, req.url());
  });

  session.page.on('response', async response => {
    const url = response.url();
    captureZaloImeiFromUrl(session, url);
    if (!url.includes('chat.zalo.me/api/')) return;

    try {
      const data = await response.json();
      if (url.includes('/api/login/getLoginInfo')) {
        captureZaloImeiFromUrl(session, url);
        session.ownId = data?.data?.uid || session.ownId || '';
        await persistZaloSessionToken(session.userId, session);
        return;
      }

      if (url.includes('/api/getchatlist')) {
        const threads = data?.data?.childs || data?.data?.conversations || data?.childs || [];
        if (Array.isArray(threads) && threads.length) {
          const { channel } = await persistZaloSessionToken(session.userId, session);
          await ingestZaloThreadPayload(session.userId, channel, threads, session.ownId || '');
        }
      }

      if (url.includes('/api/getmsgs')) {
        const body = readJsonBody(response.request().postData() || '');
        const threadId = String(body.threadId || body.uid || body.id || '');
        const messages = data?.data?.msgs || data?.data?.messages || data?.msgs || [];
        if (threadId && Array.isArray(messages) && messages.length) {
          const { channel } = await persistZaloSessionToken(session.userId, session);
          const conv = upsertZaloConversation({
            userId: session.userId,
            channel,
            thread: { threadId, name: threadId, lastMessage: '', unread: 0 },
          });
          if (!conv) return;
          let changed = 0;
          for (const raw of messages) {
            const msg = extractZaloMessage(raw, new Set(session.ownId ? [String(session.ownId)] : []));
            if (!msg.content) continue;
            const result = db.prepare(`
              INSERT OR IGNORE INTO omni_messages (
                id, user_id, conversation_id, external_id, external_cli_id, external_msg_type,
                external_author_id, external_author_name, sender_type, content, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', COALESCE(?, datetime('now')))
            `).run(
              randomUUID(),
              session.userId,
              conv.id,
              msg.externalId || `${threadId}:${msg.content.slice(0, 80)}`,
              msg.externalCliId || '',
              msg.externalMsgType || 'webchat',
              msg.authorId || '',
              msg.authorName || '',
              msg.senderType,
              msg.content,
              msg.createdAt
                ? (Number.isFinite(Number(msg.createdAt)) ? new Date(Number(msg.createdAt)).toISOString() : new Date(msg.createdAt).toISOString())
                : null
            );
            changed += result.changes;
          }
          if (changed) notifyOmni(session.userId, { platform: 'zalo', conversation_id: conv.id, reason: 'zalo-web' });
        }
      }
    } catch {}
  });
}

async function stopZaloWebSession(userId) {
  const current = zaloWebSessions.get(userId);
  if (!current) return;
  zaloWebSessions.delete(userId);
  clearInterval(current.pollTimer);
  try { current.listener?.kill(); } catch {}
  try { await current.context?.close(); } catch {}
  try { await current.browser?.close(); } catch {}
}

async function activateZaloWebSession(userId, session) {
  await stopZaloWebSession(userId);
  session.userId = userId;
  if (session.page && session.context) attachZaloWebWatch(session);
  await persistZaloSessionToken(userId, session);

  session.pollTimer = setInterval(() => {
    syncZaloMessagesForUser(userId, { maxThreads: 12, maxMessages: 25 }).catch(err => {
      console.error(`[ZaloWeb] sync failed for ${userId}:`, err.message);
    });
  }, ZALO_WEB_POLL_MS);
  zaloWebSessions.set(userId, session);
  startZaloListener(session).catch(err => console.error('[ZaloWeb] listener start failed:', err.message));
  syncZaloMessagesForUser(userId, { maxThreads: 12, maxMessages: 25 }).catch(() => {});
}

function getZaloWebSession(userId) {
  return zaloWebSessions.get(userId);
}

function ensureZaloStoredSession(userId, cookie, imei) {
  if (zaloWebSessions.has(userId) || !cookie || !imei) return;
  const session = { userId, cookie, imei, restored: true };
  session.pollTimer = setInterval(() => {
    syncZaloMessagesForUser(userId, { maxThreads: 12, maxMessages: 25 }).catch(err => {
      console.error(`[ZaloWeb] restored sync failed for ${userId}:`, err.message);
    });
  }, ZALO_WEB_POLL_MS);
  zaloWebSessions.set(userId, session);
  startZaloListener(session).catch(err => console.error('[ZaloWeb] restored listener start failed:', err.message));
}

function ensureZaloRealtimeForUser(userId) {
  if (zaloWebSessions.has(userId)) return;
  const channel = db.prepare("SELECT access_token FROM omni_channels WHERE user_id = ? AND platform = 'zalo' AND is_active = 1").get(userId);
  const stored = parseZaloToken(channel?.access_token || '');
  ensureZaloStoredSession(userId, stored.cookie, stored.imei);
}

function normalizeMessageCreatedAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowToChannel(row) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    is_active: Boolean(row.is_active),
    auto_reply: Boolean(row.auto_reply),
    has_token: Boolean(row.access_token),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToConversation(row) {
  const date = row.updated_at ? new Date(`${row.updated_at}Z`) : null;
  const today = new Date();
  const sameDay = date && date.toDateString() === today.toDateString();
  const time = date
    ? sameDay
      ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    : '';

  const rawSender = row.custom_name || row.sender_name || row.external_sender_id;
  const isGroup = row.thread_type === 'group';
  const sender = isGroup && rawSender === row.external_sender_id
    ? `Nhóm Zalo ${String(row.external_sender_id || '').slice(-4)}`
    : rawSender;

  return {
    id: row.id,
    external_id: row.external_sender_id,
    sender,
    avatar: row.sender_avatar || DEFAULT_AVATAR,
    content: formatConversationPreview(row.latest_content || row.last_message || ''),
    time,
    channel: row.platform || 'web',
    thread_type: row.thread_type || 'user',
    unread: Number(row.unread_count || 0) > 0,
    unread_count: Number(row.unread_count || 0),
    is_pinned: Boolean(row.is_pinned),
    auto_reply: Boolean(row.auto_reply),
    auto_provider: row.auto_provider || '',
    updated_at: row.updated_at,
  };
}

function formatConversationPreview(content = '') {
  const raw = String(content || '');
  const media = parseMediaMarkers(raw);
  const text = raw
    .split('\n')
    .filter(line => !line.startsWith('__OMNI_MEDIA__'))
    .join(' ')
    .trim();
  const inlineImages = extractImageUrls(text);
  const textWithoutImages = text.replace(IMAGE_URL_RE, ' ').replace(/\s+/g, ' ').trim();
  if (isZaloStickerPayloadText(textWithoutImages || text)) return 'Sticker Zalo';
  if (textWithoutImages) return textWithoutImages;
  if (inlineImages.length) return inlineImages.length === 1 ? 'Ảnh' : `${inlineImages.length} ảnh`;
  if (media.length > 0) {
    if (media.length === 1) return mediaPreviewLabel(media[0]);
    return `${media.length} file phương tiện`;
  }
  return '';
}

function rowToMessage(row) {
  let reactions = {};
  try { reactions = JSON.parse(row.reactions || '{}') || {}; } catch {}
  return {
    id: row.id,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    external_id: row.external_id,
    external_cli_id: row.external_cli_id || '',
    external_msg_type: row.external_msg_type || '',
    external_author_id: row.external_author_id || '',
    external_author_name: row.external_author_name || '',
    sender_type: row.sender_type,
    content: row.content,
    status: row.status,
    is_pinned: Boolean(row.is_pinned),
    pinned_at: row.pinned_at,
    reply_to_id: row.reply_to_id || '',
    reply_to: row.reply_to_id ? {
      id: row.reply_to_id,
      sender_type: row.reply_sender_type || '',
      content: row.reply_content || '',
    } : null,
    reactions,
    created_at: row.created_at,
  };
}

function formatExternalReply(content = '') {
  const text = String(content || '')
    .split('\n')
    .filter(line => !line.startsWith('__OMNI_MEDIA__'))
    .join(' ')
    .trim();
  if (!text) return '';
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function todayHoChiMinhRange(now = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const start = new Date(Date.UTC(year, month, day) - offsetMs);
  const end = new Date(Date.UTC(year, month, day + 1) - offsetMs);
  return {
    day: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function ensureChannel({ userId, platform, name, token = '' }) {
  const normalized = String(platform || 'web').toLowerCase();
  let channel = db.prepare('SELECT * FROM omni_channels WHERE user_id = ? AND platform = ?').get(userId, normalized);
  if (channel) return channel;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO omni_channels (id, user_id, name, platform, access_token, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, userId, name || `${normalized} Channel`, normalized, token);
  channel = db.prepare('SELECT * FROM omni_channels WHERE id = ?').get(id);
  return channel;
}

function parseZaloToken(rawToken = '') {
  if (!rawToken) return { cookie: '', imei: '' };
  try {
    const parsed = JSON.parse(rawToken);
    return {
      cookie: parsed.cookie || rawToken,
      imei: parsed.imei || '',
    };
  } catch {
    return { cookie: rawToken, imei: '' };
  }
}

function buildZaloHeaders(cookie) {
  return {
    Cookie: cookie,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36',
    Referer: 'https://chat.zalo.me/',
    Origin: 'https://chat.zalo.me',
  };
}

function normalizeCookieInput(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      return normalizeCookieInput(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.cookies) ? raw.cookies : []);
  if (!list.length) return '';
  return list
    .map(item => {
      const name = item.name || item.key || item.Name;
      const value = item.value || item.Value;
      return name && value ? `${name}=${value}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

function extractFacebookId(cookie) {
  const match = String(cookie || '').match(/(?:^|;\s*)c_user=(\d+)/);
  return match?.[1] || '';
}

function splitCookiePairs(cookie) {
  return String(cookie || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const idx = item.indexOf('=');
      if (idx <= 0) return null;
      return {
        name: item.slice(0, idx).trim(),
        value: item.slice(idx + 1).trim(),
      };
    })
    .filter(Boolean);
}

function normalizeFacebookThreadHref(href = '') {
  const match = String(href).match(/\/messages\/(?:e2ee\/)?t\/([^/?#]+)/);
  return match?.[1] || '';
}

const FACEBOOK_JUNK_EXACT = new Set([
  'Được mã hóa đầu cuối',
  'Tắt thông báo',
  'Tìm kiếm',
  'File phương tiện và file',
  'Quyền riêng tư và hỗ trợ',
  'Bạn đã tạo nhóm này',
  'Nhập, Chi tiết cuộc trò chuyện',
  'Trang cá nhân',
  'Thông tin về đoạn chat',
  'Tùy chỉnh đoạn chat',
  'Chi tiết cuộc trò chuyện',
]);

function isFacebookJunkMessage(raw = '') {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (FACEBOOK_JUNK_EXACT.has(text)) return true;
  if (/^\d{1,2}:\d{2}(?:\s+\d{1,2}\s+Tháng\s+\d{1,2},\s+\d{4})?$/i.test(text)) return true;
  if (/tài khoản đã xác minh/i.test(text)) return true;
  if (/^Meta AI$/i.test(text)) return true;
  if (/^Nhập,\s*Chi tiết cuộc trò chuyện$/i.test(text)) return true;
  if (/^Tin nhắn và cuộc gọi được bảo mật bằng tính năng mã hóa đầu cuối/i.test(text)) return true;
  if (/^Chỉ những người tham gia đoạn chat này mới có thể đọc, nghe hoặc chia sẻ/i.test(text)) return true;
  if (/^Tìm hiểu thêm$/i.test(text)) return true;
  return false;
}

function sanitizeFacebookMessage(raw = '') {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (isFacebookJunkMessage(text)) return '';

  text = text.replace(/^Nhập,\s*/i, '').trim();

  // Format quoted reply wrappers into a readable quote block.
  let quote = text.match(/^Tin nhắn do (.+?) gửi lúc (.+?):\s*(.+)$/i);
  if (quote) {
    const author = quote[1].trim();
    const time = quote[2].trim();
    const payload = quote[3].trim();
    if (!payload) return '';
    return `↪ ${author} · ${time}\n${payload}`;
  }
  quote = text.match(/^Tin nhắn do (.+?) gửi:\s*(.+)$/i);
  if (quote) {
    const author = quote[1].trim();
    const payload = quote[2].trim();
    if (!payload) return '';
    return `↪ ${author}\n${payload}`;
  }

  // If Messenger wraps as "Tin nhắn do ...", but no payload -> drop.
  if (/^Tin nhắn do /i.test(text)) {
    const idx = text.indexOf(':');
    if (idx === -1) return '';
    text = text.slice(idx + 1).trim();
  }

  // Strip remaining wrappers.
  text = text
    .replace(/^Nhập,\s*/i, '')
    .replace(/^Bạn đã trả lời.*?:\s*/i, '')
    .replace(/^Bạn đã gửi:\s*/i, '')
    .replace(/^Bạn gửi:\s*/i, '')
    .replace(/^Đã phản hồi:\s*/i, '')
    .replace(/^Đã gửi$/i, '')
    .trim();

  if (!text) return '';
  if (isFacebookJunkMessage(text)) return '';
  if (/^(messenger|chat|đang hoạt động|nhập tin nhắn)$/i.test(text)) return '';
  return text;
}

const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|bmp|avif)(?:[?#][^\s"'<>]*)?/gi;

function extractImageUrls(text = '') {
  return [...String(text || '').matchAll(IMAGE_URL_RE)].map(match => match[0]);
}

function isImageUrl(value = '') {
  return /^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|bmp|avif)(?:[?#][^\s"'<>]*)?$/i.test(String(value || '').trim());
}

function parseMediaMarkers(content = '') {
  return String(content || '')
    .split('\n')
    .filter(line => line.startsWith('__OMNI_MEDIA__'))
    .map(line => {
      try { return JSON.parse(line.slice('__OMNI_MEDIA__'.length)); } catch { return null; }
    })
    .filter(Boolean);
}

function mediaPreviewLabel(item = {}) {
  if (item.type === 'sticker') return 'Sticker Zalo';
  if (item.type === 'image') return 'Ảnh';
  return item.label || 'File phương tiện';
}

function buildMediaMarkers(media = []) {
  return media
    .filter(item => item?.url || item?.type === 'sticker')
    .slice(0, 8)
    .map(item => {
      const payload = {
      type: item.type || 'file',
      label: item.label || '',
      };
      if (item.url) payload.url = item.url;
      if (item.emoji) payload.emoji = item.emoji;
      if (item.sticker_id !== undefined) payload.sticker_id = String(item.sticker_id);
      if (item.cat_id !== undefined) payload.cat_id = String(item.cat_id);
      if (item.sticker_type !== undefined) payload.sticker_type = String(item.sticker_type);
      return `__OMNI_MEDIA__${JSON.stringify(payload)}`;
    });
}

function cleanupFacebookJunkMessages(userId) {
  const legacyIds = db.prepare(`
    SELECT m.id
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ?
      AND ch.platform = 'facebook'
      AND (
        lower(m.content) LIKE 'tin nhắn do %'
        OR lower(m.content) LIKE 'nhập,%'
        OR lower(m.content) LIKE '%mã hóa đầu cuối%'
        OR lower(m.content) LIKE '%quyền riêng tư và hỗ trợ%'
        OR lower(m.content) LIKE '%chi tiết cuộc trò chuyện%'
        OR lower(m.content) LIKE '%tài khoản đã xác minh%'
      )
  `).all(userId).map(r => r.id);

  const allRows = db.prepare(`
    SELECT m.id, m.content, c.sender_name, c.custom_name
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ? AND ch.platform = 'facebook'
  `).all(userId);

  const junkIds = allRows
    .filter(row => {
      const content = String(row.content || '').trim().toLowerCase();
      const sender = String(row.custom_name || row.sender_name || '').trim().toLowerCase();
      if (sender && content === sender) return true;
      return isFacebookJunkMessage(row.content);
    })
    .map(row => row.id);

  const merged = [...new Set([...legacyIds, ...junkIds])];
  if (!merged.length) return 0;
  const stmt = db.prepare('DELETE FROM omni_messages WHERE id = ? AND user_id = ?');
  const tx = db.transaction((ids) => {
    for (const id of ids) stmt.run(id, userId);
  });
  tx(merged);
  return merged.length;
}

export async function syncFacebookMessagesForUser(userId, { maxThreads = 12, maxMessages = 30 } = {}) {
  cleanupFacebookJunkMessages(userId);
  const channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'facebook' AND is_active = 1").get(userId);
  if (!channel?.access_token) {
    throw new Error('Chưa có cookie Facebook. Hãy kết nối Facebook trước.');
  }

  let playwright;
  let chromium;
  try {
    playwright = await import('playwright');
    chromium = playwright.chromium || playwright.default?.chromium;
  } catch {
    throw new Error('Thiếu playwright. Cài playwright để bật đồng bộ Facebook.');
  }
  if (!chromium?.launch) throw new Error('Không tìm thấy Chromium launcher của Playwright.');

  const cookiePairs = splitCookiePairs(channel.access_token);
  if (!cookiePairs.length) throw new Error('Cookie Facebook không hợp lệ.');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new Error(friendlyPlaywrightError(err, 'Đồng bộ Facebook'));
  }
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await context.addCookies(cookiePairs.map(item => ({
      name: item.name,
      value: item.value,
      domain: '.facebook.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'None',
    })));

    await page.goto('https://www.facebook.com/messages/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const loginNeeded = await page.locator('input[name="email"]').first().isVisible().catch(() => false);
    if (loginNeeded) throw new Error('Cookie Facebook hết hạn hoặc chưa hợp lệ.');

    const threads = await page.evaluate((limit) => {
      const anchors = [...document.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]')];
      const out = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const nameEl = a.querySelector('span[dir="auto"]');
        const snippetEl = a.querySelector('span.x193iq5w, span[style*="line-clamp"], span');
        const avatarEl = a.querySelector('image, img');
        out.push({
          href,
          name: (nameEl?.textContent || '').trim(),
          snippet: (snippetEl?.textContent || '').trim(),
          avatar: avatarEl?.getAttribute('xlink:href') || avatarEl?.getAttribute('src') || '',
        });
      }
      const unique = [];
      const seen = new Set();
      for (const item of out) {
        if (!item.href || seen.has(item.href)) continue;
        seen.add(item.href);
        unique.push(item);
        if (unique.length >= limit) break;
      }
      return unique;
    }, Math.min(maxThreads, 30));

    let syncedConversations = 0;
    let syncedMessages = 0;
    const errors = [];
    const touchedConversationIds = new Set();

    for (const thread of threads) {
      try {
        const threadId = normalizeFacebookThreadHref(thread.href);
        if (!threadId) continue;

        let conv = db.prepare('SELECT * FROM omni_conversations WHERE user_id = ? AND channel_id = ? AND external_sender_id = ?').get(userId, channel.id, threadId);
        if (!conv) {
          const convId = randomUUID();
          db.prepare(`
            INSERT INTO omni_conversations (
              id, user_id, channel_id, external_sender_id, sender_name, sender_avatar,
              last_message, unread_count, thread_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'user')
          `).run(convId, userId, channel.id, threadId, thread.name || threadId, thread.avatar || '', thread.snippet || '');
          conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(convId);
        } else {
          db.prepare(`
            UPDATE omni_conversations
            SET sender_name = COALESCE(NULLIF(?, ''), sender_name),
                sender_avatar = COALESCE(NULLIF(?, ''), sender_avatar),
                last_message = COALESCE(NULLIF(?, ''), last_message),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(thread.name || '', thread.avatar || '', thread.snippet || '', conv.id);
        }
        syncedConversations += 1;

        const threadUrl = thread.href.startsWith('http') ? thread.href : `https://www.facebook.com${thread.href}`;
        await page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1800);

        const rows = await page.evaluate((limit) => {
          const main = document.querySelector('div[role="main"]');
          if (!main) return [];
          const rowNodes = [...main.querySelectorAll('div[role="row"]')].slice(-Math.max(limit * 4, 80));
          const out = [];
          for (const row of rowNodes) {
            const text = (row.innerText || '').trim();
            const media = [];
            for (const img of row.querySelectorAll('img[src], image[href], image[xlink\\:href]')) {
              const url = img.getAttribute('src') || img.getAttribute('href') || img.getAttribute('xlink:href') || '';
              if (!url || url.startsWith('data:image/svg+xml')) continue;
              media.push({ type: 'image', url, label: img.getAttribute('alt') || 'Ảnh' });
            }
            for (const link of row.querySelectorAll('a[href]')) {
              const href = link.href || link.getAttribute('href') || '';
              if (!href) continue;
              if (href.includes('/messages/t/') || href.includes('/messages/e2ee/t/')) continue;
              if (href.startsWith('https://www.facebook.com/profile.php')) continue;
              const label = (link.innerText || link.getAttribute('aria-label') || 'File phương tiện').trim();
              const type = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(href) ? 'image' : 'file';
              media.push({ type, url: href, label });
            }
            if ((!text && media.length === 0) || text.length > 1600) continue;
            const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
            if (!lines.length && media.length === 0) continue;
            const sender_type = (lines[0].includes('Bạn') || lines[0].includes('You')) ? 'agent' : 'customer';
            let content = lines.slice(1).join('\n').trim() || lines[0];
            const noiseMarker = 'Nhập, Tin nhắn do';
            const idxNoise = content.indexOf(noiseMarker);
            if (idxNoise !== -1) content = content.substring(0, idxNoise).trim();
            out.push({ sender_type, content, media });
          }
          return out.slice(-limit);
        }, Math.min(maxMessages, 80));

        for (const msg of rows) {
          const senderType = msg.sender_type === 'agent' ? 'agent' : 'customer';
          const parts = String(msg.content || '')
            .split('\n')
            .map(item => sanitizeFacebookMessage(item))
            .filter(Boolean);
          const mediaMarkers = buildMediaMarkers(msg.media);
          if (!parts.length && !mediaMarkers.length) continue;

          const senderName = String(conv.custom_name || conv.sender_name || '').trim().toLowerCase();
          const cleanedText = parts.filter(part => !(senderName && part.trim().toLowerCase() === senderName)).join('\n').trim();
          const cleaned = [cleanedText, ...mediaMarkers].filter(Boolean).join('\n');
          if (!cleaned) continue;
          if (senderType === 'customer') {
            const echoed = db.prepare(`
              SELECT 1
              FROM omni_messages
              WHERE user_id = ?
                AND conversation_id = ?
                AND sender_type = 'agent'
                AND content = ?
              ORDER BY datetime(created_at) DESC
              LIMIT 1
            `).get(userId, conv.id, cleaned);
            if (echoed) continue;
          }
          const externalId = `${threadId}:${msg.idx}:${senderType}:${cleaned.slice(0, 80)}`;
          const result = db.prepare(`
            INSERT OR IGNORE INTO omni_messages (
              id, user_id, conversation_id, external_id, sender_type, content, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'synced')
          `).run(randomUUID(), userId, conv.id, externalId, senderType, cleaned);
          if (result.changes) {
            syncedMessages += 1;
            touchedConversationIds.add(conv.id);
          }
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    const removedJunk = cleanupFacebookJunkMessages(userId);
    if (syncedConversations || syncedMessages || removedJunk) {
      notifyOmni(userId, {
        platform: 'facebook',
        conversation_ids: [...touchedConversationIds],
        reason: 'sync',
      });
    }
    return {
      synced_conversations: syncedConversations,
      synced_messages: syncedMessages,
      removed_junk: removedJunk,
      errors,
    };
  } finally {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
  }
}

export async function sendFacebookMessageForUser(userId, threadId, text) {
  const channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'facebook' AND is_active = 1").get(userId);
  if (!channel?.access_token) throw new Error('Chưa có cookie Facebook hoạt động.');
  if (!threadId) throw new Error('Thiếu threadId Facebook.');

  let playwright;
  let chromium;
  try {
    playwright = await import('playwright');
    chromium = playwright.chromium || playwright.default?.chromium;
  } catch {
    throw new Error('Thiếu playwright để gửi Facebook.');
  }
  if (!chromium?.launch) throw new Error('Không tìm thấy Chromium launcher của Playwright.');

  const cookiePairs = splitCookiePairs(channel.access_token);
  if (!cookiePairs.length) throw new Error('Cookie Facebook không hợp lệ.');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new Error(friendlyPlaywrightError(err, 'Gửi Facebook'));
  }
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await context.addCookies(cookiePairs.map(item => ({
      name: item.name,
      value: item.value,
      domain: '.facebook.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'None',
    })));

    await page.goto(`https://www.facebook.com/messages/t/${encodeURIComponent(String(threadId))}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);

    const loginNeeded = await page.locator('input[name="email"]').first().isVisible().catch(() => false);
    if (loginNeeded) throw new Error('Cookie Facebook hết hạn hoặc chưa hợp lệ.');

    const composer = page.locator('div[role="textbox"][contenteditable="true"]').first();
    await composer.waitFor({ state: 'visible', timeout: 12000 });
    await composer.click({ force: true });
    await composer.fill(String(text || ''));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);

    return { ok: true, platform: 'facebook', target: String(threadId) };
  } finally {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
  }
}

async function postZaloWebApi(cookie, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: buildZaloHeaders(cookie),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    throw new Error(`Zalo API ${res.status}: ${text.slice(0, 180)}`);
  }
  return data || {};
}

async function fetchZaloConversations(cookie, count = 30) {
  const data = await postZaloWebApi(cookie, 'https://chat.zalo.me/api/getchatlist', {
    type: 0,
    count,
    lastMsgId: 0,
  });
  return data?.data?.childs || data?.data?.conversations || data?.childs || [];
}

async function fetchZaloMessages(cookie, threadId, count = 30) {
  const data = await postZaloWebApi(cookie, 'https://chat.zalo.me/api/getmsgs', {
    threadId,
    type: 0,
    count,
    lastMsgId: 0,
  });
  return data?.data?.msgs || data?.data?.messages || data?.msgs || [];
}

export async function runZaloBridge({ cookie, imei }) {
  // Use relative or configurable paths
  const python = process.env.ZALO_SYNC_PYTHON || DEFAULT_PYTHON;
  const pythonPath = process.env.ZALO_SYNC_PYTHONPATH || '';
  const script = new URL('../scripts/zalo_sync_bridge.py', import.meta.url);
  
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    };
    if (pythonPath) env.PYTHONPATH = pythonPath;

    const child = execFile(python, [script.pathname], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      const data = parseLastJsonLine(stdout) || {};
      if (error) {
        const detail = data?.error || stderr?.trim() || stdout?.trim() || error.message;
        reject(new Error(detail));
        return;
      }
      if (data?.error) {
        reject(new Error(data.error));
        return;
      }
      resolve(data || {});
    });
    child.stdin.end(JSON.stringify({ cookie, imei }));
  });
}

function runZaloSendBridge({ cookie, imei, target, text, threadType = 'user' }) {
  const python = process.env.ZALO_SYNC_PYTHON || DEFAULT_PYTHON;
  const pythonPath = process.env.ZALO_SYNC_PYTHONPATH || '';
  const script = new URL('../scripts/zalo_send_bridge.py', import.meta.url);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    };
    if (pythonPath) env.PYTHONPATH = pythonPath;

    const child = execFile(python, [script.pathname], {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      const data = parseLastJsonLine(stdout) || {};
      if (error) {
        reject(new Error(data?.error || stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      if (data?.ok === false) {
        reject(new Error(data.error || 'Zalo web send failed'));
        return;
      }
      resolve(data || { ok: true });
    });
    child.stdin.end(JSON.stringify({ cookie, imei, target, text, thread_type: threadType }));
  });
}

function runZaloUndoBridge({ cookie, imei, target, msgId, cliMsgId = '', threadType = 'user' }) {
  const python = process.env.ZALO_SYNC_PYTHON || DEFAULT_PYTHON;
  const pythonPath = process.env.ZALO_SYNC_PYTHONPATH || '';
  const script = new URL('../scripts/zalo_undo_bridge.py', import.meta.url);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    };
    if (pythonPath) env.PYTHONPATH = pythonPath;

    const child = execFile(python, [script.pathname], {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      const data = parseLastJsonLine(stdout) || {};
      if (error) {
        reject(new Error(data?.error || stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      if (data?.ok === false) {
        reject(new Error(data.error || 'Zalo undo failed'));
        return;
      }
      resolve(data || { ok: true });
    });
    child.stdin.end(JSON.stringify({ cookie, imei, target, msg_id: msgId, cli_msg_id: cliMsgId, thread_type: threadType }));
  });
}

function runZaloReactionBridge({ cookie, imei, target, msgId, cliMsgId = '', msgType = 'webchat', emoji, threadType = 'user' }) {
  const python = process.env.ZALO_SYNC_PYTHON || DEFAULT_PYTHON;
  const pythonPath = process.env.ZALO_SYNC_PYTHONPATH || '';
  const script = new URL('../scripts/zalo_reaction_bridge.py', import.meta.url);

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    };
    if (pythonPath) env.PYTHONPATH = pythonPath;

    const child = execFile(python, [script.pathname], {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      const data = parseLastJsonLine(stdout) || {};
      if (error) {
        reject(new Error(data?.error || stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      if (data?.ok === false) {
        reject(new Error(data.error || 'Zalo reaction failed'));
        return;
      }
      resolve(data || { ok: true });
    });
    child.stdin.end(JSON.stringify({
      cookie,
      imei,
      target,
      msg_id: msgId,
      cli_msg_id: cliMsgId,
      msg_type: msgType || 'webchat',
      emoji,
      thread_type: threadType,
    }));
  });
}

function zaloListenerText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'message', 'body', 'title', 'href', 'url']) {
      const text = zaloListenerText(value[key]);
      if (text) return text;
    }
    if (('globalMsgId' in value || 'msgId' in value) && ('cliMsgId' in value || 'clientMsgId' in value) && !('href' in value) && !('url' in value)) return '';
    if ('id' in value && 'catId' in value && 'type' in value && !('text' in value) && !('href' in value) && !('url' in value)) return '';
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value || '').trim();
}

function pickZaloListenerField(value, keys) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const field = value[key];
    if (field !== undefined && field !== null && field !== '') return String(field);
  }
  return '';
}

function isZaloReactionPayload(value) {
  if (!value || typeof value !== 'object') return false;
  if ('rMsg' in value && ('rIcon' in value || 'rType' in value)) return true;
  if (value.content && typeof value.content === 'object' && isZaloReactionPayload(value.content)) return true;
  if (value.message && typeof value.message === 'object' && isZaloReactionPayload(value.message)) return true;
  return false;
}

function isZaloStickerPayload(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && ('id' in value || 'stickerId' in value)
    && ('catId' in value || 'cateId' in value || 'categoryId' in value)
    && ('type' in value || 'stickerType' in value)
    && !('text' in value)
    && !('message' in value)
    && !('href' in value)
    && !('url' in value)
  );
}

function parseJsonObjectText(text = '') {
  const raw = String(text || '').trim();
  if (!raw.startsWith('{') || !raw.endsWith('}')) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function isZaloStickerPayloadText(content = '') {
  return isZaloStickerPayload(parseJsonObjectText(content));
}

function collectZaloMedia(value, msgObj = {}) {
  const media = [];
  const seen = new Set();
  const addMedia = (item) => {
    const key = item.url || `sticker:${item.sticker_id}:${item.cat_id}:${item.sticker_type}`;
    if (seen.has(key)) return;
    seen.add(key);
    media.push(item);
  };
  const addUrl = (url, hintedType = '') => {
    const clean = String(url || '').trim();
    if (!/^https?:\/\//i.test(clean)) return;
    const type = hintedType || (isImageUrl(clean) ? 'image' : 'file');
    addMedia({ type, url: clean, label: type === 'image' ? 'Ảnh Zalo' : 'File Zalo' });
  };
  const visit = (node, depth = 0, typeHint = '') => {
    if (node === null || node === undefined || depth > 5) return;
    if (typeof node === 'string') {
      const parsed = parseJsonObjectText(node);
      if (parsed) {
        visit(parsed, depth + 1, typeHint);
        return;
      }
      addUrl(node, typeHint);
      for (const url of extractImageUrls(node)) addUrl(url, 'image');
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1, typeHint);
      return;
    }
    if (typeof node !== 'object') return;

    const msgType = String(node.msgType || node.type || typeHint || '').toLowerCase();
    const hintedType = /photo|image|picture|gif/.test(msgType) ? 'image' : '';
    if (isZaloStickerPayload(node)) {
      addMedia({
        type: 'sticker',
        label: 'Sticker Zalo',
        emoji: '🙂',
        sticker_id: node.id || node.stickerId || '',
        cat_id: node.catId || node.cateId || node.categoryId || '',
        sticker_type: node.type || node.stickerType || '',
      });
      return;
    }

    for (const key of ['href', 'url', 'thumb', 'thumbnail', 'preview', 'src', 'hdUrl', 'normalUrl', 'photoUrl', 'oriUrl', 'imageUrl', 'gifUrl', 'cover', 'fileUrl', 'downloadUrl', 'mediaUrl']) {
      addUrl(node[key], hintedType);
    }
    for (const child of Object.values(node)) visit(child, depth + 1, hintedType);
  };

  visit(value, 0, msgObj?.msgType || msgObj?.type || '');
  if (msgObj && msgObj !== value) visit(msgObj, 0, msgObj.msgType || msgObj.type || '');
  return media;
}

function normalizeZaloMessageContent(value, msgObj = {}) {
  const text = zaloListenerText(value || msgObj);
  const mediaMarkers = buildMediaMarkers(collectZaloMedia(value || msgObj, msgObj));
  const parts = [];
  if (text && !isZaloTechnicalPayloadText(text) && !isZaloStickerPayloadText(text)) {
    parts.push(text);
  }
  parts.push(...mediaMarkers);
  return parts.join('\n').trim();
}

function isZaloTechnicalPayloadText(content = '') {
  const text = String(content || '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return false;
  try {
    const data = JSON.parse(text);
    return Boolean(
      data
      && typeof data === 'object'
      && (
        (('globalMsgId' in data || 'msgId' in data) && ('cliMsgId' in data || 'clientMsgId' in data))
        || ('rMsg' in data && ('rIcon' in data || 'rType' in data))
      )
      && !('text' in data)
      && !('message' in data)
    );
  } catch {
    return false;
  }
}

function normalizeZaloListenerThreadId(event, ownId) {
  const msgObj = event.message_object && typeof event.message_object === 'object' ? event.message_object : {};
  const authorId = String(event.author_id || pickZaloListenerField(msgObj, ['uidFrom', 'fromId', 'authorId', 'senderId', 'ownerId']) || '').trim();
  const targetId = String(pickZaloListenerField(msgObj, ['idTo', 'threadId', 'toId', 'uid', 'id', 'userId']) || '').trim();
  const eventThreadId = String(event.thread_id || '').trim();
  const isSelf = (value) => !value || value === '0' || (ownId && value === ownId);

  if (!isSelf(eventThreadId)) return eventThreadId;
  if (isSelf(authorId) && !isSelf(targetId)) return targetId;
  if (!isSelf(authorId)) return authorId;
  if (!isSelf(targetId)) return targetId;
  return eventThreadId || targetId || authorId;
}

async function saveZaloListenerMessage(session, event) {
  if (isZaloReactionPayload(event.content) || isZaloReactionPayload(event.message_object)) return;
  const content = normalizeZaloMessageContent(event.content || event.message_object, event.message_object);
  if (!content) return;

  const { channel } = await persistZaloSessionToken(session.userId, session);
  const ownId = String(session.ownId || '').trim();
  const threadId = normalizeZaloListenerThreadId(event, ownId);
  if (!threadId) return;

  const authorId = String(event.author_id || '').trim();
  const senderType = ownId && (authorId === ownId || authorId === '0') ? 'agent' : 'customer';
  const msgObj = event.message_object && typeof event.message_object === 'object' ? event.message_object : {};
  const externalCliId = pickZaloListenerField(msgObj, ['cliMsgId', 'clientMsgId', 'cli_msg_id']);
  const externalMsgType = pickZaloListenerField(msgObj, ['msgType', 'type']) || 'webchat';
  const externalAuthorName = pickZaloListenerField(msgObj, ['dName', 'displayName', 'fromDName', 'senderName', 'name', 'zaloName'])
    || findZaloContactName(channel.id, authorId);
  const createdAt = normalizeMessageCreatedAt(pickZaloListenerField(msgObj, ['ts', 'time', 'createdTime', 'timestamp']));
  const conv = upsertZaloConversation({
    userId: session.userId,
    channel,
    thread: {
      threadId,
      name: threadId,
      lastMessage: content,
      unreadCount: senderType === 'customer' ? 1 : 0,
      threadType: String(event.thread_type || '').includes('group') ? 'group' : 'user',
    },
  });
  if (!conv) return;

  const externalId = String(event.mid || `${threadId}:${senderType}:${content.slice(0, 80)}`);
  if (senderType === 'agent') {
    const pending = db.prepare(`
      SELECT id
      FROM omni_messages
      WHERE conversation_id = ?
        AND user_id = ?
        AND sender_type = 'agent'
        AND content = ?
        AND (COALESCE(external_id, '') = '' OR external_id = ?)
        AND ABS(strftime('%s', created_at) - strftime('%s', ?)) <= 300
      ORDER BY CASE WHEN COALESCE(external_id, '') = '' THEN 0 ELSE 1 END ASC,
               datetime(created_at) DESC
      LIMIT 1
    `).get(conv.id, session.userId, content, externalId, createdAt || new Date().toISOString());
    if (pending) {
      db.prepare(`
        UPDATE omni_messages
        SET external_id = COALESCE(NULLIF(?, ''), external_id),
            external_cli_id = COALESCE(NULLIF(?, ''), external_cli_id),
            external_msg_type = COALESCE(NULLIF(?, ''), external_msg_type),
            external_author_id = COALESCE(NULLIF(?, ''), external_author_id),
            external_author_name = COALESCE(NULLIF(?, ''), external_author_name),
            status = 'synced',
            created_at = COALESCE(?, created_at)
        WHERE id = ? AND user_id = ?
      `).run(externalId, externalCliId, externalMsgType, authorId, externalAuthorName, createdAt, pending.id, session.userId);
      db.prepare(`
        UPDATE omni_conversations
        SET last_message = ?, unread_count = 0, updated_at = datetime(COALESCE(?, 'now'))
        WHERE id = ?
      `).run(content, createdAt, conv.id);
      notifyOmni(session.userId, {
        platform: 'zalo',
        conversation_id: conv.id,
        reason: 'zalo-listener-merge',
      });
      return;
    }
  }
  const result = db.prepare(`
    INSERT OR IGNORE INTO omni_messages (
      id, user_id, conversation_id, external_id, external_cli_id, external_msg_type,
      external_author_id, external_author_name, sender_type, content, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `).run(randomUUID(), session.userId, conv.id, externalId, externalCliId, externalMsgType, authorId, externalAuthorName, senderType, content, senderType === 'agent' ? 'synced' : 'received', createdAt);

  if (result.changes) {
    db.prepare(`
      UPDATE omni_conversations
      SET last_message = ?,
          unread_count = CASE WHEN ? = 'customer' THEN unread_count + 1 ELSE 0 END,
          updated_at = datetime(COALESCE(?, 'now'))
      WHERE id = ?
    `).run(content, senderType, createdAt, conv.id);
    notifyOmni(session.userId, {
      platform: 'zalo',
      conversation_id: conv.id,
      reason: 'zalo-listener',
    });
  }
}

async function startZaloListener(session) {
  if (session.listener) {
    try { session.listener.kill(); } catch {}
    session.listener = null;
  }

  const { cookie, imei } = await persistZaloSessionToken(session.userId, session);
  if (!cookie || !imei) return;

  const python = process.env.ZALO_SYNC_PYTHON || DEFAULT_PYTHON;
  const pythonPath = process.env.ZALO_SYNC_PYTHONPATH || '';
  const script = new URL('../scripts/zalo_listen_bridge.py', import.meta.url);
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  if (pythonPath) env.PYTHONPATH = pythonPath;

  const child = spawn(python, [script.pathname], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  zaloListenerChildren.add(child);
  session.listener = child;
  child.stdin.end(JSON.stringify({ cookie, imei }));

  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let event = null;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.event === 'ready') {
        session.ownId = event.own_id || session.ownId || '';
        continue;
      }
      if (event.event === 'message') {
        saveZaloListenerMessage(session, event).catch(err => {
          console.error('[ZaloWeb] listener message save failed:', err.message);
        });
      }
      if (event.event === 'error') {
        console.error('[ZaloWeb] listener error:', friendlyZaloBridgeError(event.error));
      }
    }
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) console.error('[ZaloWeb] listener stderr:', text);
  });
  child.on('exit', () => {
    zaloListenerChildren.delete(child);
    if (zaloWebSessions.get(session.userId) !== session) return;
    session.listener = null;
    setTimeout(() => {
      if (zaloWebSessions.get(session.userId) === session) {
        startZaloListener(session).catch(err => console.error('[ZaloWeb] listener restart failed:', err.message));
      }
    }, 5000);
  });
}

export async function sendZaloWebMessageForUser(userId, target, text, options = {}) {
  let session = getZaloWebSession(userId);
  if (!session) {
    const channel = db.prepare("SELECT access_token FROM omni_channels WHERE user_id = ? AND platform = 'zalo' AND is_active = 1").get(userId);
    const stored = parseZaloToken(channel?.access_token || '');
    ensureZaloStoredSession(userId, stored.cookie, stored.imei);
    session = getZaloWebSession(userId);
  }
  if (!session) throw new Error('Chưa có tab Zalo live. Hãy quét QR Zalo lại để mở tab theo dõi.');

  const { cookie, imei } = await persistZaloSessionToken(userId, session);
  if (!cookie) throw new Error('Tab Zalo live thiếu cookie. Hãy quét QR Zalo lại.');
  if (!imei) throw new Error('Tab Zalo live chưa bắt được IMEI. Hãy mở lại QR Zalo và chờ tab tải xong.');

  return runZaloSendBridge({
    cookie,
    imei,
    target,
    text,
    threadType: options.thread_type || options.threadType || 'user',
  });
}

function extractZaloThread(thread) {
  const threadId = String(thread.threadId || thread.uid || thread.id || thread.userId || '');
  const lastMessage = normalizeZaloMessageContent(thread.text || thread.lastMessage || thread.msg || '', thread);
  return {
    threadId,
    name: thread.name || thread.displayName || thread.zaloName || thread.dName || threadId || 'Zalo User',
    avatar: thread.avatar || thread.avt || thread.thumbnail || DEFAULT_AVATAR,
    lastMessage,
    unread: Number(thread.unreadCount || thread.unread || 0),
    threadType: thread.type === 1 || thread.threadType === 'group' ? 'group' : 'user',
  };
}

function extractZaloFriend(friend) {
  const friendId = String(friend.friend_id || friend.userId || friend.uid || friend.id || friend.user_id || '');
  return {
    friendId,
    name: String(friend.name || friend.displayName || friend.zaloName || friend.dName || friend.fullname || friend.fullName || friendId || '').trim(),
    avatar: String(friend.avatar || friend.avt || friend.thumbnail || friend.photo || '').trim(),
  };
}

function findZaloContactName(channelId, externalId) {
  if (!channelId || !externalId) return '';
  const row = db.prepare(`
    SELECT sender_name
    FROM omni_conversations
    WHERE channel_id = ? AND external_sender_id = ? AND COALESCE(sender_name, '') != ''
    LIMIT 1
  `).get(channelId, externalId);
  return row?.sender_name || '';
}

function extractZaloMessage(msg, ownIds = new Set()) {
  const externalId = String(msg.msgId || msg.id || msg.cliMsgId || msg.msg_id || '');
  const externalCliId = String(msg.cliMsgId || msg.clientMsgId || msg.cli_msg_id || '');
  const externalMsgType = String(msg.msgType || msg.type || 'webchat');
  const authorId = String(msg.uidFrom || msg.fromId || msg.authorId || msg.senderId || '');
  const authorName = String(msg.dName || msg.displayName || msg.fromDName || msg.senderName || msg.name || msg.zaloName || '');
  let content = normalizeZaloMessageContent(msg.content || msg.text || msg.message || msg.body || msg.href || msg.url || '', msg);
  if (!content && msg.msgType) content = `[${msg.msgType}]`;
  return {
    externalId,
    externalCliId,
    externalMsgType,
    authorId,
    authorName,
    senderType: ownIds.has(authorId) ? 'agent' : 'customer',
    content: String(content || '').trim(),
    createdAt: msg.ts || msg.time || msg.createdTime || null,
  };
}

function upsertZaloContact({ userId, channel, friend }) {
  const data = extractZaloFriend(friend);
  if (!data.friendId) return null;

  let conv = db.prepare('SELECT * FROM omni_conversations WHERE channel_id = ? AND external_sender_id = ?').get(channel.id, data.friendId);
  if (!conv) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO omni_conversations (
        id, user_id, channel_id, external_sender_id, sender_name, sender_avatar,
        last_message, unread_count, thread_type
      ) VALUES (?, ?, ?, ?, ?, ?, '', 0, 'user')
    `).run(id, userId, channel.id, data.friendId, data.name || data.friendId, data.avatar || '');
    conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(id);
  } else {
    db.prepare(`
      UPDATE omni_conversations
      SET sender_name = COALESCE(NULLIF(?, ''), sender_name),
          sender_avatar = COALESCE(NULLIF(?, ''), sender_avatar),
          thread_type = 'user'
      WHERE id = ?
    `).run(data.name || '', data.avatar || '', conv.id);
  }
  return db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(conv.id);
}

function upsertZaloConversation({ userId, channel, thread }) {
  const data = extractZaloThread(thread);
  if (!data.threadId) return null;

  let conv = db.prepare('SELECT * FROM omni_conversations WHERE channel_id = ? AND external_sender_id = ?').get(channel.id, data.threadId);
  if (!conv) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO omni_conversations (
        id, user_id, channel_id, external_sender_id, sender_name, sender_avatar,
        last_message, unread_count, thread_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, channel.id, data.threadId, data.name, data.avatar, data.lastMessage, data.unread, data.threadType);
    conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(id);
  } else {
    const nextName = data.name && data.name !== data.threadId ? data.name : (conv.sender_name || data.threadId);
    const nextAvatar = data.avatar && data.avatar !== DEFAULT_AVATAR ? data.avatar : (conv.sender_avatar || data.avatar || DEFAULT_AVATAR);
    db.prepare(`
      UPDATE omni_conversations
      SET sender_name = ?, sender_avatar = ?,
          last_message = COALESCE(NULLIF(?, ''), last_message),
          unread_count = ?,
          thread_type = ?,
          updated_at = CASE WHEN NULLIF(?, '') IS NULL THEN updated_at ELSE datetime('now') END
      WHERE id = ?
    `).run(nextName, nextAvatar, data.lastMessage, data.unread, data.threadType, data.lastMessage, conv.id);
  }
  return db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(conv.id);
}

export async function syncZaloMessagesForUser(userId, { maxThreads = 30, maxMessages = 30 } = {}) {
  const channel = db.prepare('SELECT * FROM omni_channels WHERE user_id = ? AND platform = ? AND is_active = 1').get(userId, 'zalo');
  if (!channel?.access_token) {
    throw new Error('Chưa có Zalo cookie. Hãy kết nối Zalo QR trước.');
  }

  let { cookie, imei } = parseZaloToken(channel.access_token);
  ensureZaloStoredSession(userId, cookie, imei);
  const liveSession = getZaloWebSession(userId);
  if (liveSession) {
    const persisted = await persistZaloSessionToken(userId, liveSession);
    cookie = persisted.cookie || cookie;
    imei = persisted.imei || imei;
  }
  if (!cookie) throw new Error('Zalo cookie trống. Hãy kết nối lại QR.');

  let threads = [];
  let friends = [];
  let ownId = '';
  try {
    const bridge = await runZaloBridge({ cookie, imei });
    threads = Array.isArray(bridge.threads) ? bridge.threads : [];
    friends = Array.isArray(bridge.friends) ? bridge.friends : [];
    ownId = bridge.own_id || '';
  } catch (bridgeError) {
    if (bridgeError.message.includes('Missing Zalo IMEI')) {
      throw bridgeError;
    }
    // Fallback kept for older sessions, but current Zalo often returns 404 here.
    try {
      threads = await fetchZaloConversations(cookie, maxThreads);
    } catch {
      throw new Error(`Không đồng bộ được Zalo qua zlapi: ${friendlyZaloBridgeError(bridgeError)}`);
    }
  }
  let syncedConversations = 0;
  let syncedContacts = 0;
  let syncedMessages = 0;
  const errors = [];
  const touchedConversationIds = new Set();
  const friendMap = new Map();

  for (const friend of friends) {
    const data = extractZaloFriend(friend);
    if (!data.friendId) continue;
    friendMap.set(data.friendId, data);
    try {
      if (upsertZaloContact({ userId, channel, friend })) syncedContacts += 1;
    } catch (err) {
      errors.push(err.message);
    }
  }

  for (const thread of threads.slice(0, maxThreads)) {
    try {
      const threadKey = String(thread.thread_id || thread.threadId || thread.uid || thread.id || thread.userId || thread.idTo || '');
      const isGroupThread = String(thread.thread_type || thread.threadType || '').toLowerCase() === 'group';
      const friend = isGroupThread ? null : friendMap.get(threadKey);
      const normalizedThread = thread.thread_id ? {
        threadId: thread.thread_id,
        name: friend?.name || thread.name,
        avatar: friend?.avatar || thread.avatar,
        text: thread.last_message,
        unreadCount: thread.unread,
        threadType: thread.thread_type,
      } : thread;
      const conv = upsertZaloConversation({ userId, channel, thread: normalizedThread });
      if (!conv) continue;
      syncedConversations += 1;

      const threadId = thread.thread_id || extractZaloThread(thread).threadId;
      let messages = Array.isArray(thread.messages) ? thread.messages : [];
      if (messages.length === 0 && !thread.thread_id) {
        try { messages = await fetchZaloMessages(cookie, threadId, maxMessages); } catch {}
      }
      for (const rawMessage of messages.slice(-maxMessages)) {
        const msg = rawMessage.external_id
          ? {
              externalId: rawMessage.external_id,
              externalCliId: rawMessage.cli_msg_id || rawMessage.external_cli_id || '',
              externalMsgType: rawMessage.msg_type || rawMessage.external_msg_type || 'webchat',
              authorId: rawMessage.author_id || '',
              authorName: rawMessage.author_name || '',
              senderType: ownId && String(rawMessage.author_id) === String(ownId) ? 'agent' : 'customer',
              content: normalizeZaloMessageContent(rawMessage.content, rawMessage),
              createdAt: rawMessage.created_at,
            }
          : extractZaloMessage(rawMessage, new Set(ownId ? [String(ownId)] : []));
        if (!msg.content) continue;
        const createdAt = msg.createdAt
          ? (Number.isFinite(Number(msg.createdAt)) ? new Date(Number(msg.createdAt)).toISOString() : new Date(msg.createdAt).toISOString())
          : null;
        if (msg.senderType === 'agent' && msg.externalId) {
          const pending = db.prepare(`
            SELECT id
            FROM omni_messages
            WHERE conversation_id = ?
              AND user_id = ?
              AND sender_type = 'agent'
              AND content = ?
              AND COALESCE(external_id, '') = ''
              AND ABS(strftime('%s', created_at) - strftime('%s', ?)) <= 300
            ORDER BY datetime(created_at) DESC
            LIMIT 1
          `).get(conv.id, userId, msg.content, createdAt || new Date().toISOString());
          if (pending) {
            const result = db.prepare(`
              UPDATE omni_messages
              SET external_id = ?,
                  external_cli_id = ?,
                  external_msg_type = ?,
                  external_author_id = ?,
                  external_author_name = ?,
                  status = 'synced',
                  created_at = COALESCE(?, created_at)
              WHERE id = ?
            `).run(msg.externalId, msg.externalCliId || '', msg.externalMsgType || 'webchat', msg.authorId || '', msg.authorName || '', createdAt, pending.id);
            if (result.changes) {
              db.prepare(`
                UPDATE omni_conversations
                SET last_message = ?,
                    unread_count = CASE WHEN ? = 'customer' THEN unread_count + 1 ELSE 0 END,
                    updated_at = datetime(COALESCE(?, 'now'))
                WHERE id = ?
              `).run(msg.content, msg.senderType, createdAt, conv.id);
              syncedMessages += 1;
              touchedConversationIds.add(conv.id);
            }
            continue;
          }
        }
        const id = randomUUID();
        const result = db.prepare(`
          INSERT OR IGNORE INTO omni_messages (
            id, user_id, conversation_id, external_id, external_cli_id, external_msg_type,
            external_author_id, external_author_name, sender_type, content, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', COALESCE(?, datetime('now')))
        `).run(
          id,
          userId,
          conv.id,
          msg.externalId || `${threadId}:${msg.content.slice(0, 80)}`,
          msg.externalCliId || '',
          msg.externalMsgType || 'webchat',
          msg.authorId || '',
          msg.authorName || '',
          msg.senderType,
          msg.content,
          createdAt
        );
        if (result.changes) {
          db.prepare(`
            UPDATE omni_conversations
            SET last_message = ?,
                unread_count = CASE WHEN ? = 'customer' THEN unread_count + 1 ELSE 0 END,
                updated_at = datetime(COALESCE(?, 'now'))
            WHERE id = ?
          `).run(msg.content, msg.senderType, createdAt, conv.id);
          syncedMessages += 1;
          touchedConversationIds.add(conv.id);
        }
      }
      const latest = db.prepare(`
        SELECT content, sender_type, created_at
        FROM omni_messages
        WHERE conversation_id = ? AND user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `).get(conv.id, userId);
      if (latest?.content) {
        db.prepare(`
          UPDATE omni_conversations
          SET last_message = ?,
              unread_count = CASE WHEN ? = 'agent' THEN 0 ELSE unread_count END,
              updated_at = datetime(COALESCE(?, 'now'))
          WHERE id = ?
        `).run(latest.content, latest.sender_type, latest.created_at, conv.id);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (syncedContacts || syncedConversations || syncedMessages) {
    notifyOmni(userId, {
      platform: 'zalo',
      conversation_ids: [...touchedConversationIds],
      reason: 'sync',
    });
  }

  return {
    synced_contacts: syncedContacts,
    synced_conversations: syncedConversations,
    synced_messages: syncedMessages,
    errors,
  };
}

async function cleanupZaloQrSession(sessionId) {
  const session = zaloQrSessions.get(sessionId);
  if (!session) return;
  zaloQrSessions.delete(sessionId);
  clearTimeout(session.timeout);
  try { await session.context?.close(); } catch {}
  try { await session.browser?.close(); } catch {}
}

export function upsertConversation({ userId, platform, externalSenderId, senderName, senderAvatar, content, threadType = 'user' }) {
  const channel = ensureChannel({ userId, platform, name: `${platform} Channel` });
  let conv = db.prepare('SELECT * FROM omni_conversations WHERE channel_id = ? AND external_sender_id = ?').get(channel.id, externalSenderId);

  if (!conv) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO omni_conversations (
        id, user_id, channel_id, external_sender_id, sender_name, sender_avatar,
        last_message, unread_count, thread_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, userId, channel.id, externalSenderId, senderName || externalSenderId, senderAvatar || '', content || '', threadType);
    conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(id);
  } else {
    db.prepare(`
      UPDATE omni_conversations
      SET sender_name = COALESCE(NULLIF(?, ''), sender_name),
          sender_avatar = COALESCE(NULLIF(?, ''), sender_avatar),
          last_message = ?,
          unread_count = unread_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(senderName || '', senderAvatar || '', content || '', conv.id);
  }

  const msgId = randomUUID();
  db.prepare(`
    INSERT INTO omni_messages (id, user_id, conversation_id, sender_type, content, status)
    VALUES (?, ?, ?, 'customer', ?, 'received')
  `).run(msgId, userId, conv.id, content || '');

  const next = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(conv.id);
  notifyOmni(userId, {
    platform,
    conversation_id: conv.id,
    message_id: msgId,
    reason: 'incoming',
  });
  return next;
}

omniRouter.post('/webhook', optionalAuth, (req, res) => {
  const userId = req.userId || req.body.user_id;
  const { platform = 'web', sender_name, senderName, sender_avatar, senderAvatar, external_sender_id, externalSenderId, content, thread_type } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'user_id or auth token required' });
  if (!content) return res.status(400).json({ error: 'content required' });

  const conv = upsertConversation({
    userId,
    platform,
    externalSenderId: external_sender_id || externalSenderId || `ext_${randomUUID().slice(0, 8)}`,
    senderName: sender_name || senderName,
    senderAvatar: sender_avatar || senderAvatar,
    content,
    threadType: thread_type || 'user',
  });
  res.json({ ok: true, conversation_id: conv.id });
});

omniRouter.use(requireAuth);

omniRouter.get('/events', (req, res) => {
  ensureZaloRealtimeForUser(req.userId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const eventName = `user:${req.userId}`;
  const send = (payload) => {
    res.write(`event: omni\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: ${Date.now()}\n\n`);
  }, 25000);

  send({ type: 'ready', at: Date.now() });
  omniEvents.on(eventName, send);

  req.on('close', () => {
    clearInterval(heartbeat);
    omniEvents.off(eventName, send);
    res.end();
  });
});

omniRouter.get('/channels', (req, res) => {
  const rows = db.prepare('SELECT * FROM omni_channels WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(rows.map(rowToChannel));
});

omniRouter.post('/channels', (req, res) => {
  const { platform, name, token = '', active = true, pin = '' } = req.body || {};
  if (!platform) return res.status(400).json({ error: 'platform required' });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO omni_channels (id, user_id, name, platform, access_token, is_active, pin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, platform) DO UPDATE SET
      name = excluded.name,
      access_token = excluded.access_token,
      is_active = excluded.is_active,
      pin = excluded.pin,
      updated_at = datetime('now')
  `).run(id, req.userId, name || `${platform} Channel`, String(platform).toLowerCase(), token, active ? 1 : 0, pin);

  notifyOmni(req.userId, { platform: String(platform).toLowerCase(), reason: 'channel' });
  res.json({ ok: true });
});

omniRouter.patch('/channels/:id', (req, res) => {
  const { auto_reply, is_active } = req.body || {};
  if (auto_reply !== undefined) {
    db.prepare('UPDATE omni_channels SET auto_reply = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(auto_reply ? 1 : 0, req.params.id, req.userId);
  }
  if (is_active !== undefined) {
    db.prepare('UPDATE omni_channels SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(is_active ? 1 : 0, req.params.id, req.userId);
  }
  res.json({ ok: true });
});

omniRouter.delete('/channels/:id', (req, res) => {
  const info = db.prepare('DELETE FROM omni_channels WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Channel not found' });
  res.json({ ok: true });
});

omniRouter.post('/sync/generate-code', (req, res) => {
  const id = randomUUID();
  const code = randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO omni_sync_codes (id, code, user_id) VALUES (?, ?, ?)').run(id, code, req.userId);
  res.json({ code, expires_in: 300 });
});

omniRouter.post('/sync/zalo/qr/start', async (req, res) => {
  let playwright;
  let chromium;
  try {
    playwright = await import('playwright');
    chromium = playwright.chromium || playwright.default?.chromium;
  } catch {
    return res.status(501).json({
      error: 'Zalo QR cần optional dependency playwright. Backend vẫn chạy bình thường; cài playwright để bật QR login.',
    });
  }
  if (!chromium?.launch) {
    return res.status(501).json({
      error: 'Không tìm thấy Chromium launcher trong Playwright. Hãy kiểm tra cài đặt playwright ở backend.',
    });
  }

  const sessionId = randomUUID();
  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const pendingSession = { userId: req.userId, browser, context, page, timeout: null };
    attachZaloWebWatch(pendingSession);
    await page.goto('https://chat.zalo.me/', { waitUntil: 'networkidle', timeout: 45000 });

    // Ensure we are on the QR tab
    try {
      const qrTabSelector = 'a:has-text("VỚI MÃ QR"), .tabs-header >> text="VỚI MÃ QR", text="VỚI MÃ QR"';
      if (await page.locator(qrTabSelector).isVisible()) {
        await page.click(qrTabSelector);
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('[ZaloWeb] QR Tab click skipped or failed:', e.message);
    }

    const qrSelector = '.login-qr canvas, .qr-container canvas, canvas, img[src*="qr"], img[src*="data:image"]';
    await page.waitForSelector(qrSelector, { state: 'visible', timeout: 30000 });

    let qr = '';
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const qrHandle = await page.$(qrSelector);
      if (!qrHandle) continue;

      const tagName = await qrHandle.evaluate(el => el.tagName.toLowerCase());
      qr = tagName === 'canvas'
        ? await qrHandle.evaluate(el => el.toDataURL('image/png'))
        : await qrHandle.getAttribute('src');

      if (qr && qr.length > 500) break; // QR should be a reasonably long data URL or URL
    }

    if (!qr || qr.length < 100) throw new Error('Không tìm thấy mã QR Zalo hợp lệ. Thử lại sau.');

    const timeout = setTimeout(() => {
      cleanupZaloQrSession(sessionId).catch(() => {});
    }, 5 * 60 * 1000);
    pendingSession.timeout = timeout;
    zaloQrSessions.set(sessionId, pendingSession);

    res.json({ session_id: sessionId, qr, expires_in: 300 });
  } catch (err) {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    res.status(500).json({ error: `Không tạo được QR Zalo: ${err.message}` });
  }
});

omniRouter.get('/sync/zalo/qr/:sessionId/status', async (req, res) => {
  const session = zaloQrSessions.get(req.params.sessionId);
  if (!session || session.userId !== req.userId) return res.status(404).json({ error: 'QR session not found or expired' });

  try {
    const cookies = await session.context.cookies();
    const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const loggedIn = cookie.includes('zpsid') || cookie.includes('zpw_sek');
    if (!loggedIn) return res.json({ status: 'waiting' });
    let imei = session.imei || await readZaloPageImei(session.page);
    for (let i = 0; !imei && i < 12; i += 1) {
      await session.page.waitForTimeout(500);
      imei = session.imei || await readZaloPageImei(session.page);
    }
    captureZaloImei(session, imei);

    const channel = ensureChannel({
      userId: req.userId,
      platform: 'zalo',
      name: 'Zalo Personal',
      token: JSON.stringify({ cookie, imei: session.imei || '' }),
    });
    db.prepare('UPDATE omni_channels SET access_token = ?, is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify({ cookie, imei: session.imei || '' }), channel.id);
    zaloQrSessions.delete(req.params.sessionId);
    clearTimeout(session.timeout);
    await activateZaloWebSession(req.userId, session);
    let sync = null;
    try {
      sync = await syncZaloMessagesForUser(req.userId, { maxThreads: 20, maxMessages: 20 });
    } catch (err) {
      sync = { error: err.message };
    }
    res.json({ status: 'connected', channel_id: channel.id, imei: Boolean(session.imei), live: true, sync });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

omniRouter.delete('/sync/zalo/qr/:sessionId', async (req, res) => {
  const session = zaloQrSessions.get(req.params.sessionId);
  if (session && session.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  await cleanupZaloQrSession(req.params.sessionId);
  res.json({ ok: true });
});

omniRouter.get('/conversations', (req, res) => {
  ensureZaloRealtimeForUser(req.userId);
  const rows = db.prepare(`
    SELECT c.*, ch.platform, m.id AS latest_message_id, m.content AS latest_content
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    LEFT JOIN omni_messages m ON m.id = (
      SELECT id FROM omni_messages
      WHERE conversation_id = c.id
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    )
    WHERE c.user_id = ?
      AND NOT (ch.platform = 'zalo' AND m.id IS NULL AND COALESCE(c.last_message, '') = '')
    ORDER BY c.is_pinned DESC,
             CASE WHEN m.id IS NULL AND COALESCE(c.last_message, '') = '' THEN 0 ELSE 1 END DESC,
             datetime(c.updated_at) DESC,
             lower(c.sender_name) ASC
  `).all(req.userId);
  res.json(rows.map(rowToConversation).filter(c => c.sender && !String(c.sender).includes('<bound method')));
});

omniRouter.get('/contacts', (req, res) => {
  ensureZaloRealtimeForUser(req.userId);
  const platform = String(req.query.platform || 'zalo').toLowerCase();
  const rows = db.prepare(`
    SELECT c.*, ch.platform, m.id AS latest_message_id, m.content AS latest_content
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    LEFT JOIN omni_messages m ON m.id = (
      SELECT id FROM omni_messages
      WHERE conversation_id = c.id
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    )
    WHERE c.user_id = ?
      AND (? = 'all' OR ch.platform = ?)
    ORDER BY lower(COALESCE(NULLIF(c.custom_name, ''), c.sender_name, c.external_sender_id)) ASC
  `).all(req.userId, platform, platform);
  res.json(rows
    .map(row => ({
      ...rowToConversation(row),
      has_conversation: Boolean(row.latest_message_id || row.last_message || row.latest_content),
    }))
    .filter(c => c.sender && !String(c.sender).includes('<bound method')));
});

omniRouter.get('/stats/daily', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 14), 1), 90);
  const rows = db.prepare(`
    SELECT
      date(m.created_at) AS day,
      COUNT(*) AS total,
      SUM(CASE WHEN m.sender_type = 'customer' THEN 1 ELSE 0 END) AS customer,
      SUM(CASE WHEN m.sender_type = 'agent' THEN 1 ELSE 0 END) AS agent,
      SUM(CASE WHEN m.is_pinned = 1 THEN 1 ELSE 0 END) AS pinned,
      COUNT(DISTINCT m.conversation_id) AS conversations
    FROM omni_messages m
    WHERE m.user_id = ?
      AND datetime(m.created_at) >= datetime('now', ?)
    GROUP BY date(m.created_at)
    ORDER BY day ASC
  `).all(req.userId, `-${days - 1} days`);

  const byChannel = db.prepare(`
    SELECT
      date(m.created_at) AS day,
      ch.platform,
      COUNT(*) AS total
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ?
      AND datetime(m.created_at) >= datetime('now', ?)
    GROUP BY date(m.created_at), ch.platform
    ORDER BY day ASC, total DESC
  `).all(req.userId, `-${days - 1} days`);

  const byConversation = db.prepare(`
    SELECT
      date(m.created_at) AS day,
      c.id AS conversation_id,
      COALESCE(NULLIF(c.custom_name, ''), NULLIF(c.sender_name, ''), c.external_sender_id) AS sender,
      c.sender_avatar,
      ch.platform,
      COUNT(*) AS total,
      SUM(CASE WHEN m.sender_type = 'customer' THEN 1 ELSE 0 END) AS customer,
      SUM(CASE WHEN m.sender_type = 'agent' THEN 1 ELSE 0 END) AS agent,
      SUM(CASE WHEN m.is_pinned = 1 THEN 1 ELSE 0 END) AS pinned
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ?
      AND datetime(m.created_at) >= datetime('now', ?)
    GROUP BY date(m.created_at), c.id
    ORDER BY day DESC, total DESC, sender ASC
  `).all(req.userId, `-${days - 1} days`);

  res.json({
    days,
    totals: rows.map(row => ({
      day: row.day,
      total: Number(row.total || 0),
      customer: Number(row.customer || 0),
      agent: Number(row.agent || 0),
      pinned: Number(row.pinned || 0),
      conversations: Number(row.conversations || 0),
    })),
    by_channel: byChannel.map(row => ({
      day: row.day,
      platform: row.platform,
      total: Number(row.total || 0),
    })),
    by_conversation: byConversation.map(row => ({
      day: row.day,
      conversation_id: row.conversation_id,
      sender: row.sender,
      avatar: row.sender_avatar || DEFAULT_AVATAR,
      platform: row.platform,
      total: Number(row.total || 0),
      customer: Number(row.customer || 0),
      agent: Number(row.agent || 0),
      pinned: Number(row.pinned || 0),
    })),
  });
});

omniRouter.get('/stats/today', (req, res) => {
  const range = todayHoChiMinhRange();
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN sender_type = 'agent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN sender_type = 'customer' THEN 1 ELSE 0 END) AS received
    FROM omni_messages
    WHERE user_id = ?
      AND datetime(created_at) >= datetime(?)
      AND datetime(created_at) < datetime(?)
  `).get(req.userId, range.start, range.end);

  const byChannel = db.prepare(`
    SELECT
      ch.platform,
      COUNT(*) AS total,
      SUM(CASE WHEN m.sender_type = 'agent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN m.sender_type = 'customer' THEN 1 ELSE 0 END) AS received
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ?
      AND datetime(m.created_at) >= datetime(?)
      AND datetime(m.created_at) < datetime(?)
    GROUP BY ch.platform
    ORDER BY total DESC
  `).all(req.userId, range.start, range.end);

  const byConversation = db.prepare(`
    SELECT
      c.id AS conversation_id,
      COALESCE(NULLIF(c.custom_name, ''), c.sender_name, c.external_sender_id) AS sender,
      ch.platform,
      COUNT(*) AS total,
      SUM(CASE WHEN m.sender_type = 'agent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN m.sender_type = 'customer' THEN 1 ELSE 0 END) AS received
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.user_id = ?
      AND datetime(m.created_at) >= datetime(?)
      AND datetime(m.created_at) < datetime(?)
    GROUP BY c.id
    ORDER BY total DESC, sender ASC
  `).all(req.userId, range.start, range.end);

  res.json({
    day: range.day,
    sent: Number(totals?.sent || 0),
    received: Number(totals?.received || 0),
    total: Number(totals?.total || 0),
    by_channel: byChannel.map(row => ({
      platform: row.platform,
      sent: Number(row.sent || 0),
      received: Number(row.received || 0),
      total: Number(row.total || 0),
    })),
    by_conversation: byConversation.map(row => ({
      conversation_id: row.conversation_id,
      sender: row.sender,
      platform: row.platform,
      sent: Number(row.sent || 0),
      received: Number(row.received || 0),
      total: Number(row.total || 0),
    })),
  });
});

omniRouter.post('/sync/zalo/messages', async (req, res) => {
  try {
    const maxThreads = Math.min(Number(req.body?.maxThreads || 30), 100);
    const maxMessages = Math.min(Number(req.body?.maxMessages || 30), 100);
    const result = await syncZaloMessagesForUser(req.userId, { maxThreads, maxMessages });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

omniRouter.post('/sync/facebook/messages', async (req, res) => {
  try {
    const maxThreads = Math.min(Number(req.body?.maxThreads || 12), 30);
    const maxMessages = Math.min(Number(req.body?.maxMessages || 30), 80);
    const result = await syncFacebookMessagesForUser(req.userId, { maxThreads, maxMessages });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

omniRouter.post('/connect/facebook', (req, res) => {
  const cookie = normalizeCookieInput(req.body?.cookie || req.body?.appstate || req.body?.cookies || req.body);
  const pin = String(req.body?.pin || '').trim();
  if (!cookie) return res.status(400).json({ error: 'Facebook cookie required' });

  const fbId = extractFacebookId(cookie);
  if (!fbId) return res.status(400).json({ error: 'Facebook cookie thiếu c_user' });

  db.prepare(`
    INSERT INTO omni_channels (id, user_id, name, platform, access_token, is_active, pin)
    VALUES (?, ?, ?, 'facebook', ?, 1, ?)
    ON CONFLICT(user_id, platform) DO UPDATE SET
      name = excluded.name,
      access_token = excluded.access_token,
      is_active = 1,
      pin = excluded.pin,
      updated_at = datetime('now')
  `).run(randomUUID(), req.userId, `Facebook ${fbId}`, cookie, pin);

  notifyOmni(req.userId, { platform: 'facebook', reason: 'channel' });
  res.json({ ok: true, platform: 'facebook', facebook_id: fbId });
});

omniRouter.post('/conversations/read-all', (req, res) => {
  db.prepare('UPDATE omni_conversations SET unread_count = 0 WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

omniRouter.delete('/conversations', (req, res) => {
  const info = db.prepare('DELETE FROM omni_conversations WHERE user_id = ?').run(req.userId);
  res.json({ ok: true, deleted: info.changes });
});

omniRouter.get('/conversations/:convId/messages', (req, res) => {
  const conv = db.prepare('SELECT id FROM omni_conversations WHERE id = ? AND user_id = ?').get(req.params.convId, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare('UPDATE omni_conversations SET unread_count = 0 WHERE id = ?').run(req.params.convId);
  const rows = db.prepare(`
    SELECT m.*, r.content AS reply_content, r.sender_type AS reply_sender_type
    FROM omni_messages m
    LEFT JOIN omni_messages r ON r.id = m.reply_to_id AND r.user_id = m.user_id
    WHERE m.conversation_id = ? AND m.user_id = ?
    ORDER BY datetime(m.created_at) ASC
  `).all(req.params.convId, req.userId);
  res.json(rows.map(rowToMessage));
});

omniRouter.post('/conversations/:convId/messages', async (req, res) => {
  const { content, reply_to_id, replyToId: replyToIdInput } = req.body || {};
  const cleanContent = String(content || '').trim();
  if (!cleanContent) return res.status(400).json({ error: 'content required' });

  const conv = db.prepare(`
    SELECT c.*, ch.platform
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE c.id = ? AND c.user_id = ?
  `).get(req.params.convId, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const replyToId = String(reply_to_id || replyToIdInput || '').trim();
  const replyTo = replyToId
    ? db.prepare('SELECT id, content, sender_type FROM omni_messages WHERE id = ? AND conversation_id = ? AND user_id = ?').get(replyToId, conv.id, req.userId)
    : null;
  if (replyToId && !replyTo) return res.status(404).json({ error: 'Reply target not found' });

  const recentDuplicate = db.prepare(`
    SELECT m.*, r.content AS reply_content, r.sender_type AS reply_sender_type
    FROM omni_messages m
    LEFT JOIN omni_messages r ON r.id = m.reply_to_id AND r.user_id = m.user_id
    WHERE m.conversation_id = ?
      AND m.user_id = ?
      AND m.sender_type = 'agent'
      AND m.content = ?
      AND COALESCE(m.reply_to_id, '') = ?
      AND m.status NOT LIKE 'failed:%'
      AND datetime(m.created_at) >= datetime('now', '-5 seconds')
    ORDER BY datetime(m.created_at) DESC
    LIMIT 1
  `).get(conv.id, req.userId, cleanContent, replyTo?.id || '');
  if (recentDuplicate) {
    return res.json(rowToMessage(recentDuplicate));
  }

  const id = randomUUID();
  const outboundText = replyTo
    ? `Trả lời "${formatExternalReply(replyTo.content)}":\n${cleanContent}`
    : cleanContent;
  let status = 'sending';
  let sendMeta = {};
  db.prepare(`
    INSERT INTO omni_messages (
      id, user_id, conversation_id, sender_type, content, status, reply_to_id
    )
    VALUES (?, ?, ?, 'agent', ?, ?, ?)
  `).run(id, req.userId, conv.id, cleanContent, status, replyTo?.id || '');
  db.prepare('UPDATE omni_conversations SET last_message = ?, unread_count = 0, updated_at = datetime(\'now\') WHERE id = ?').run(cleanContent, conv.id);

  try {
    if (conv.platform === 'zalo') {
      sendMeta = await sendZaloWebMessageForUser(req.userId, conv.external_sender_id, outboundText, { thread_type: conv.thread_type || 'user' });
      if (sendMeta?.ok === false || sendMeta?.error) throw new Error(sendMeta.error || sendMeta.message || 'Zalo send failed');
    } else if (conv.platform === 'telegram') {
      sendMeta = await sendTelegramWebMessageForUser(req.userId, conv.external_sender_id, outboundText);
    } else if (conv.platform === 'facebook') {
      await sendGatewayMessage({
        platform: conv.platform,
        target: conv.external_sender_id,
        text: outboundText,
        options: { thread_type: conv.thread_type || 'user' },
      }, req.userId);
    }
    status = 'sent';
  } catch (err) {
    status = `failed: ${err.message}`;
  }

  db.prepare(`
    UPDATE omni_messages
    SET external_id = COALESCE(NULLIF(?, ''), external_id),
        external_cli_id = COALESCE(NULLIF(?, ''), external_cli_id),
        external_msg_type = COALESCE(NULLIF(?, ''), external_msg_type),
        status = ?
    WHERE id = ? AND user_id = ?
  `).run(
    sendMeta?.msg_id || '',
    sendMeta?.cli_msg_id || '',
    sendMeta?.msg_type || '',
    status,
    id,
    req.userId
  );

  notifyOmni(req.userId, {
    platform: conv.platform,
    conversation_id: conv.id,
    message_id: id,
    reason: 'outgoing',
  });
  res.json(rowToMessage(db.prepare(`
    SELECT m.*, r.content AS reply_content, r.sender_type AS reply_sender_type
    FROM omni_messages m
    LEFT JOIN omni_messages r ON r.id = m.reply_to_id AND r.user_id = m.user_id
    WHERE m.id = ?
  `).get(id)));
});

omniRouter.post('/conversations/:convId/rename', (req, res) => {
  const { custom_name, customName } = req.body || {};
  const name = custom_name || customName;
  if (!name) return res.status(400).json({ error: 'custom_name required' });
  const info = db.prepare('UPDATE omni_conversations SET custom_name = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(name, req.params.convId, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ ok: true, new_name: name });
});

omniRouter.post('/conversations/:convId/toggle-pin', (req, res) => {
  const conv = db.prepare(`
    SELECT c.is_pinned, ch.platform
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE c.id = ? AND c.user_id = ?
  `).get(req.params.convId, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const next = conv.is_pinned ? 0 : 1;
  db.prepare('UPDATE omni_conversations SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next, req.params.convId);
  notifyOmni(req.userId, {
    platform: conv.platform,
    conversation_id: req.params.convId,
    reason: 'pin-conversation',
  });
  res.json({ ok: true, is_pinned: Boolean(next) });
});

omniRouter.patch('/conversations/:convId/auto-reply', (req, res) => {
  const { auto_reply, auto_provider } = req.body || {};
  const conv = db.prepare('SELECT id FROM omni_conversations WHERE id = ? AND user_id = ?').get(req.params.convId, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const fields = [];
  const values = [];
  if (auto_reply !== undefined) {
    fields.push('auto_reply = ?');
    values.push(auto_reply ? 1 : 0);
  }
  if (auto_provider !== undefined) {
    fields.push('auto_provider = ?');
    values.push(String(auto_provider || '').trim());
  }
  if (fields.length === 0) return res.status(400).json({ error: 'auto_reply or auto_provider required' });

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE omni_conversations SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values, req.params.convId, req.userId);
  const row = db.prepare(`
    SELECT c.*, ch.platform, m.content AS latest_content
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    LEFT JOIN omni_messages m ON m.id = (
      SELECT id FROM omni_messages WHERE conversation_id = c.id ORDER BY datetime(created_at) DESC LIMIT 1
    )
    WHERE c.id = ? AND c.user_id = ?
  `).get(req.params.convId, req.userId);
  res.json(rowToConversation(row));
});

omniRouter.delete('/conversations/:convId', (req, res) => {
  const conv = db.prepare(`
    SELECT c.id, ch.platform
    FROM omni_conversations c
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE c.id = ? AND c.user_id = ?
  `).get(req.params.convId, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  db.prepare('DELETE FROM omni_messages WHERE conversation_id = ? AND user_id = ?').run(req.params.convId, req.userId);
  const info = db.prepare('DELETE FROM omni_conversations WHERE id = ? AND user_id = ?').run(req.params.convId, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Conversation not found' });
  notifyOmni(req.userId, {
    platform: conv.platform,
    conversation_id: req.params.convId,
    reason: 'delete-conversation',
  });
  res.json({ ok: true });
});

omniRouter.delete('/messages/:msgId', async (req, res) => {
  const msg = db.prepare(`
    SELECT m.id, m.conversation_id, m.external_id, m.external_cli_id, m.sender_type,
           c.external_sender_id, c.thread_type,
           ch.platform, ch.access_token
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.id = ? AND m.user_id = ?
  `).get(req.params.msgId, req.userId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  if (msg.platform === 'zalo') {
    if (msg.sender_type !== 'agent') {
      return res.status(400).json({ error: 'Zalo chỉ thu hồi được tin nhắn do mình gửi.' });
    }
    if (!msg.external_id) {
      return res.status(400).json({ error: 'Tin này chưa có msgId Zalo để thu hồi. Hãy sync Zalo rồi thử lại.' });
    }
    const { cookie, imei } = parseZaloToken(msg.access_token || '');
    if (!cookie || !imei) return res.status(400).json({ error: 'Thiếu cookie/IMEI Zalo để thu hồi.' });
    try {
      await runZaloUndoBridge({
        cookie,
        imei,
        target: msg.external_sender_id,
        msgId: msg.external_id,
        cliMsgId: msg.external_cli_id || '',
        threadType: msg.thread_type || 'user',
      });
    } catch (err) {
      return res.status(400).json({ error: `Không thu hồi được Zalo: ${err.message}` });
    }
  }

  const info = db.prepare('DELETE FROM omni_messages WHERE id = ? AND user_id = ?').run(req.params.msgId, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Message not found' });
  const latest = db.prepare(`
    SELECT content, sender_type, created_at
    FROM omni_messages
    WHERE conversation_id = ? AND user_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get(msg.conversation_id, req.userId);
  if (latest) {
    db.prepare(`
      UPDATE omni_conversations
      SET last_message = ?,
          unread_count = CASE WHEN ? = 'agent' THEN 0 ELSE unread_count END,
          updated_at = datetime(COALESCE(?, 'now'))
      WHERE id = ? AND user_id = ?
    `).run(latest.content, latest.sender_type, latest.created_at, msg.conversation_id, req.userId);
  } else {
    db.prepare(`
      UPDATE omni_conversations
      SET last_message = '', unread_count = 0, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(msg.conversation_id, req.userId);
  }
  notifyOmni(req.userId, {
    platform: msg.platform,
    conversation_id: msg.conversation_id,
    message_id: req.params.msgId,
    reason: 'delete-message',
  });
  res.json({ ok: true });
});

omniRouter.post('/messages/:msgId/reaction', async (req, res) => {
  const emoji = String(req.body?.emoji || '').trim().slice(0, 8);
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const msg = db.prepare(`
    SELECT m.id, m.reactions, m.conversation_id, m.external_id, m.external_cli_id, m.external_msg_type,
           c.external_sender_id, c.thread_type,
           ch.platform, ch.access_token
    FROM omni_messages m
    JOIN omni_conversations c ON c.id = m.conversation_id
    JOIN omni_channels ch ON ch.id = c.channel_id
    WHERE m.id = ? AND m.user_id = ?
  `).get(req.params.msgId, req.userId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  let reactions = {};
  try { reactions = JSON.parse(msg.reactions || '{}') || {}; } catch {}

  if (msg.platform === 'zalo') {
    if (!msg.external_id) {
      return res.status(400).json({ error: 'Tin này chưa có msgId Zalo để thả cảm xúc. Hãy sync Zalo rồi thử lại.' });
    }
    const { cookie, imei } = parseZaloToken(msg.access_token || '');
    if (!cookie || !imei) return res.status(400).json({ error: 'Thiếu cookie/IMEI Zalo để thả cảm xúc.' });
    try {
      const result = await runZaloReactionBridge({
        cookie,
        imei,
        target: msg.external_sender_id,
        msgId: msg.external_id,
        cliMsgId: msg.external_cli_id || '',
        msgType: msg.external_msg_type || 'webchat',
        emoji,
        threadType: msg.thread_type || 'user',
      });
      if (result?.cli_msg_id || result?.msg_type) {
        db.prepare(`
          UPDATE omni_messages
          SET external_cli_id = COALESCE(NULLIF(?, ''), external_cli_id),
              external_msg_type = COALESCE(NULLIF(?, ''), external_msg_type)
          WHERE id = ? AND user_id = ?
        `).run(result.cli_msg_id || '', result.msg_type || '', req.params.msgId, req.userId);
      }
      reactions = { [emoji]: 1 };
    } catch (err) {
      return res.status(400).json({ error: `Không thả được cảm xúc Zalo: ${err.message}` });
    }
  } else if (reactions[emoji]) {
    delete reactions[emoji];
  } else {
    reactions[emoji] = 1;
  }

  db.prepare('UPDATE omni_messages SET reactions = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(reactions), req.params.msgId, req.userId);
  notifyOmni(req.userId, {
    platform: msg.platform,
    conversation_id: msg.conversation_id,
    message_id: req.params.msgId,
    reason: 'reaction',
  });
  res.json({ ok: true, reactions });
});

omniRouter.post('/messages/:msgId/toggle-pin', (req, res) => {
  const msg = db.prepare('SELECT is_pinned FROM omni_messages WHERE id = ? AND user_id = ?').get(req.params.msgId, req.userId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const next = msg.is_pinned ? 0 : 1;
  db.prepare(`
    UPDATE omni_messages
    SET is_pinned = ?, pinned_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ? AND user_id = ?
  `).run(next, next, req.params.msgId, req.userId);
  res.json({ ok: true, is_pinned: Boolean(next) });
});

omniRouter.post('/simulate_webhook', (req, res) => {
  const conv = upsertConversation({
    userId: req.userId,
    platform: req.body.platform || 'web',
    externalSenderId: req.body.external_sender_id || `demo_${randomUUID().slice(0, 8)}`,
    senderName: req.body.sender_name || 'Demo Customer',
    senderAvatar: req.body.sender_avatar || '',
    content: req.body.content || 'Xin chào HAgent',
  });
  res.json({ ok: true, conversation_id: conv.id });
});
