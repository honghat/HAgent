import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import db from '../db.js';
import { chatStream, extract } from './llm.js';
import { dedupAndSave } from './wiki-store.js';
import { controlService } from './service-manager.js';
import { decideAndExecuteTools } from './tools/index.js';
import { getProviderClient } from './provider-config.js';
import { getWeather } from './tools/weather.js';
import { notifyOmni, upsertConversation } from '../routes/omni.js';
import { buildHagentContinuationTurn, extractTelegramReplyText, isShortConfirmation } from './hagent/context.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    bot_token TEXT NOT NULL,
    bot_username TEXT DEFAULT '',
    webhook_url TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS telegram_qr_sessions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    chat_id TEXT DEFAULT '',
    bot_username TEXT DEFAULT '',
    deep_link TEXT DEFAULT '',
    status TEXT DEFAULT 'waiting',
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS telegram_chat_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    bot_username TEXT DEFAULT '',
    sender_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_chat_links_bot_chat
    ON telegram_chat_links(bot_username, chat_id);
`);

const bots = new Map();
const telegramWebQrSessions = new Map();
const pendingTelegramAccessRequests = new Map();
export const events = new EventEmitter();

function toSqlIso(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

async function cleanupTelegramWebQrSession(sessionId) {
  const session = telegramWebQrSessions.get(sessionId);
  if (!session) return;
  telegramWebQrSessions.delete(sessionId);
  clearTimeout(session.timeout);
  try { await session.context?.close(); } catch {}
  try { await session.browser?.close(); } catch {}
}

async function extractTelegramWebQr(page) {
  await page.goto('https://web.telegram.org/k/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);

  const qrLoginText = page.getByText(/log in by qr|qr code|mã qr/i).first();
  if (await qrLoginText.isVisible({ timeout: 2500 }).catch(() => false)) {
    await qrLoginText.click().catch(() => {});
    await page.waitForTimeout(800);
  }

  const selector = 'canvas.qr-canvas, div[class*="qr"] canvas, canvas, img[src^="data:image"]';
  await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
  const handle = await page.$(selector);
  if (!handle) throw new Error('Không tìm thấy QR Telegram Web.');

  const tag = await handle.evaluate(el => el.tagName.toLowerCase());
  if (tag === 'canvas') {
    return handle.evaluate(el => el.toDataURL('image/png'));
  }
  const src = await handle.getAttribute('src');
  if (src) return src;
  const buffer = await handle.screenshot({ type: 'png' });
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function isTelegramWebLoggedIn(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const hasLoginText = /log in|phone number|qr code|scan/i.test(text);
    const hasChatUi = Boolean(
      document.querySelector('#column-left')
      || document.querySelector('.chatlist')
      || document.querySelector('.sidebar-left')
      || document.querySelector('[data-peer-id]')
      || document.querySelector('input[placeholder*="Search"]')
    );
    return hasChatUi && !hasLoginText;
  }).catch(() => false);
}

function parseTelegramWebToken(raw = '') {
  try {
    const data = JSON.parse(raw || '{}');
    if (data?.source !== 'telegram-web') return null;
    return data;
  } catch {
    return null;
  }
}

function findLiveTelegramWebSession(userId) {
  for (const [sessionId, session] of telegramWebQrSessions.entries()) {
    if (session.userId === userId && session.page) return { sessionId, session };
  }
  return null;
}

async function openTelegramWebFromStoredToken(tokenData) {
  let playwright;
  let chromium;
  try {
    playwright = await import('playwright');
    chromium = playwright.chromium || playwright.default?.chromium;
  } catch {
    throw new Error('Đồng bộ Telegram Web cần Playwright.');
  }
  if (!chromium?.launch) throw new Error('Không tìm thấy Chromium launcher của Playwright.');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const cookies = Array.isArray(tokenData.cookies) ? tokenData.cookies : [];
  if (cookies.length) {
    await context.addCookies(cookies).catch(() => {});
  }
  const storage = tokenData.storage || {};
  await context.addInitScript(({ local, session }) => {
    try {
      for (const [key, value] of Object.entries(local || {})) window.localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(session || {})) window.sessionStorage.setItem(key, value);
    } catch {}
  }, {
    local: storage.local || {},
    session: storage.session || {},
  });
  const page = await context.newPage();
  await page.goto('https://web.telegram.org/k/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.chatlist-chat[data-peer-id], #column-left, .chatlist', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { browser, context, page };
}

async function getTelegramWebSyncPage(userId, tokenData) {
  // Sync from a fresh restored context; the live QR browser can still be mid-transition.
  const restored = await openTelegramWebFromStoredToken(tokenData);
  if (!await isTelegramWebLoggedIn(restored.page)) {
    try { await restored.context.close(); } catch {}
    try { await restored.browser.close(); } catch {}
    throw new Error('Phiên Telegram Web chưa restore được. Hãy quét QR Telegram lại rồi sync ngay.');
  }
  return {
    page: restored.page,
    close: async () => {
      try { await restored.context.close(); } catch {}
      try { await restored.browser.close(); } catch {}
    },
  };
}

function compactTelegramText(text = '') {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^(edited|seen|views?|online|last seen)$/i.test(line))
    .join('\n')
    .trim();
}

async function scrapeTelegramWebThreads(page, maxThreads = 12) {
  await page.waitForSelector('.chatlist-chat[data-peer-id], .chatlist-chat, [data-peer-id]', { timeout: 20000 }).catch(() => {});
  return page.evaluate((limit) => {
    const primary = Array.from(document.querySelectorAll('.chatlist-top .chatlist-chat[data-peer-id]'));
    const fallback = Array.from(document.querySelectorAll('.chatlist-chat[data-peer-id]'));
    const candidates = primary.length ? primary : fallback;
    const rows = [];
    const seen = new Set();

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 32) continue;
      const peerId = el.getAttribute('data-peer-id') || el.getAttribute('href')?.replace(/^#/, '') || '';
      if (!peerId || seen.has(peerId)) continue;
      const name = el.querySelector('.peer-title')?.textContent?.trim()
        || (el.innerText || el.textContent || '').split('\n').map(line => line.trim()).filter(Boolean)[1]
        || peerId;
      seen.add(peerId);
      rows.push({ peerId, name });
      if (rows.length >= limit) break;
    }

    return rows;
  }, Math.min(maxThreads, 50));
}

async function scrapeTelegramWebMessages(page, maxMessages = 30) {
  await page.waitForSelector('.bubble, .message, [class*="bubble"]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  return page.evaluate((limit) => {
    const candidates = [
      ...document.querySelectorAll('.bubbles .bubble'),
      ...document.querySelectorAll('.bubble'),
    ];
    const unique = [];
    const seen = new Set();
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 12) continue;
      const raw = (el.innerText || el.textContent || '').trim();
      if (!raw) continue;
      const cls = String(el.className || '');
      const key = `${cls}:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lines = raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/^\d{1,2}:\d{2}$/.test(line));
      const content = lines.join('\n').trim();
      if (!content || content.length > 3000) continue;
      unique.push({
        content,
        senderType: /\bis-out\b|\boutgoing\b|\bown\b|\bis-sent\b/i.test(cls) ? 'agent' : 'customer',
      });
    }
    return unique.slice(-limit);
  }, Math.min(maxMessages, 80));
}

async function openTelegramWebConversation(page, peerId) {
  const target = String(peerId || '').trim();
  if (!target) throw new Error('Thiếu Telegram peer id.');

  let clicked = false;
  const peerSelector = `.chatlist-chat[data-peer-id="${target.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
  await page.waitForSelector(`${peerSelector}, a[href="#${target.replaceAll('"', '\\"')}"]`, { timeout: 15000 }).catch(() => {});
  const peerRow = page.locator(peerSelector).first();
  if (await peerRow.count().catch(() => 0)) {
    await peerRow.click({ force: true }).then(() => { clicked = true; }).catch(() => {});
  }
  if (!clicked) {
    const hrefRow = page.locator(`a[href="#${target.replaceAll('"', '\\"')}"]`).first();
    if (await hrefRow.count().catch(() => 0)) {
      await hrefRow.click({ force: true }).then(() => { clicked = true; }).catch(() => {});
    }
  }

  if (!clicked) {
    await page.goto(`https://web.telegram.org/k/#${encodeURIComponent(target)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  await page.waitForSelector('.chat-input, .input-message-container, .topbar, [contenteditable="true"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function focusTelegramWebComposer(page) {
  const focused = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll(
      '.input-message-input, .input-message-container [contenteditable="true"], [contenteditable="true"]'
    ));
    const editor = candidates.find(el => {
      const rect = el.getBoundingClientRect();
      const cls = String(el.className || '');
      return rect.width > 80
        && rect.height > 16
        && rect.x > 380
        && !el.closest('.btn-menu')
        && (/input-message|message/i.test(cls) || el.getAttribute('contenteditable') === 'true');
    });
    if (!editor) return false;
    editor.focus();
    return true;
  }).catch(() => false);

  if (focused) return true;

  const clickedStart = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, .chat-input-control-button'));
    const button = buttons.find(el => {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || '').trim();
      return rect.width > 20 && rect.height > 20 && rect.x > 380 && /^START$/i.test(text);
    });
    if (!button) return false;
    button.click();
    return true;
  }).catch(() => false);

  if (clickedStart) {
    await page.waitForTimeout(1200);
    return focusTelegramWebComposer(page);
  }

  return false;
}

async function clickTelegramWebSend(page) {
  const clicked = await page.evaluate(() => {
    const selectors = [
      '.btn-send',
      '.btn-send-container button',
      'button[aria-label*="Send" i]',
      'button[title*="Send" i]',
    ];
    for (const selector of selectors) {
      const button = Array.from(document.querySelectorAll(selector)).find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 20 && rect.height > 20 && rect.x > 380;
      });
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);
  if (clicked) return true;
  await page.keyboard.press('Enter');
  return true;
}

function senderNameFromMessage(msg) {
  return [
    msg.from?.first_name,
    msg.from?.last_name,
  ].filter(Boolean).join(' ').trim() || msg.from?.username || msg.chat?.first_name || msg.chat?.username || String(msg.chat?.id || '');
}

function telegramReplyOptions(msg) {
  const messageId = msg?.message_id;
  if (!messageId) return {};
  return {
    reply_parameters: {
      message_id: messageId,
      allow_sending_without_reply: true,
    },
  };
}

function getRunningBotUsername(userId) {
  return bots.get(userId)?.username || '';
}

export function resolveTelegramQrUserId(fallbackUserId = '') {
  const configured = process.env.HAGENT_TELEGRAM_USER_ID || process.env.TELEGRAM_USER_ID || '';
  if (configured) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(configured);
    if (user?.id) return user.id;
  }

  const primary = db.prepare(`
    SELECT id
    FROM users
    WHERE lower(username) = 'hat'
       OR lower(display_name) IN ('hat nguyen', 'hat nguyên', 'anh hạt')
    ORDER BY CASE WHEN lower(username) = 'hat' THEN 0 ELSE 1 END,
             datetime(created_at) ASC
    LIMIT 1
  `).get();
  return primary?.id || fallbackUserId;
}

function upsertTelegramConfigForUser(userId, token, username) {
  const existing = db.prepare('SELECT * FROM telegram_config WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare("UPDATE telegram_config SET bot_token = ?, bot_username = ?, active = 1, updated_at = datetime('now') WHERE user_id = ?").run(token, username, userId);
    return;
  }
  db.prepare('INSERT INTO telegram_config (user_id, bot_token, bot_username) VALUES (?, ?, ?)').run(userId, token, username);
}

function upsertTelegramOmniChannel({ userId, username, chatId, senderName }) {
  let channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'telegram'").get(userId);
  const accessToken = JSON.stringify({
    bot_username: username || '',
    chat_id: String(chatId || ''),
    sender_name: senderName || '',
    linked_at: new Date().toISOString(),
  });
  if (!channel) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO omni_channels (id, user_id, name, platform, access_token, is_active)
      VALUES (?, ?, 'Telegram Bot', 'telegram', ?, 1)
    `).run(id, userId, accessToken);
    channel = db.prepare('SELECT * FROM omni_channels WHERE id = ?').get(id);
  } else {
    db.prepare(`
      UPDATE omni_channels
      SET name = 'Telegram Bot',
          access_token = ?,
          is_active = 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(accessToken, channel.id);
  }

  let conv = db.prepare('SELECT * FROM omni_conversations WHERE channel_id = ? AND external_sender_id = ?').get(channel.id, String(chatId));
  if (!conv) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO omni_conversations (
        id, user_id, channel_id, external_sender_id, sender_name, last_message,
        unread_count, thread_type
      ) VALUES (?, ?, ?, ?, ?, 'Telegram đã kết nối qua QR', 0, 'user')
    `).run(id, userId, channel.id, String(chatId), senderName || String(chatId));
    conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(id);
  } else {
    db.prepare(`
      UPDATE omni_conversations
      SET sender_name = COALESCE(NULLIF(?, ''), sender_name),
          last_message = 'Telegram đã kết nối qua QR',
          unread_count = 0,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(senderName || '', conv.id);
  }

  db.prepare(`
    INSERT INTO telegram_chat_links (id, user_id, chat_id, bot_username, sender_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bot_username, chat_id) DO UPDATE SET
      user_id = excluded.user_id,
      sender_name = excluded.sender_name,
      updated_at = datetime('now')
  `).run(randomUUID(), userId, String(chatId), username || '', senderName || '');

  notifyOmni(userId, {
    platform: 'telegram',
    conversation_id: conv.id,
    reason: 'telegram-qr',
  });

  return { channel, conversation: conv };
}

function resolveTelegramLinkedUserId(defaultUserId, chatId, username = '') {
  const linked = db.prepare(`
    SELECT user_id
    FROM telegram_chat_links
    WHERE chat_id = ?
      AND (bot_username = ? OR ? = '')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get(String(chatId), username || '', username || '');
  return linked?.user_id || defaultUserId;
}

function getTelegramChatLink(userId, chatId, username = '') {
  return db.prepare(`
    SELECT *
    FROM telegram_chat_links
    WHERE user_id = ?
      AND chat_id = ?
      AND (bot_username = ? OR ? = '')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get(userId, String(chatId), username || '', username || '');
}

function countTelegramChatLinks(userId, username = '') {
  return db.prepare(`
    SELECT COUNT(*) AS c
    FROM telegram_chat_links
    WHERE user_id = ?
      AND (bot_username = ? OR ? = '')
  `).get(userId, username || '', username || '')?.c || 0;
}

function getTelegramOwnerChatId(userId, username = '', excludeChatId = '') {
  const row = db.prepare(`
    SELECT chat_id
    FROM telegram_chat_links
    WHERE user_id = ?
      AND chat_id != ?
      AND (bot_username = ? OR ? = '')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get(userId, String(excludeChatId || ''), username || '', username || '');
  return row?.chat_id || '';
}

function authorizeTelegramChat({ userId, chatId, botUsername, senderName }) {
  db.prepare(`
    INSERT INTO telegram_chat_links (id, user_id, chat_id, bot_username, sender_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bot_username, chat_id) DO UPDATE SET
      user_id = excluded.user_id,
      sender_name = excluded.sender_name,
      updated_at = datetime('now')
  `).run(randomUUID(), userId, String(chatId), botUsername || '', senderName || '');
}

async function requestTelegramAccessApproval({ token, ownerUserId, requesterChatId, requesterName, botUsername }) {
  if (getTelegramChatLink(ownerUserId, requesterChatId, botUsername)) return true;

  const ownerChatId = getTelegramOwnerChatId(ownerUserId, botUsername, requesterChatId);
  if (!ownerChatId) {
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: requesterChatId,
      text: 'Telegram này chưa được cấp quyền truy cập HAgent. Hãy kết nối tài khoản chủ trong HAgent trước.',
    }).catch(() => {});
    return false;
  }

  const id = randomUUID().slice(0, 10);
  pendingTelegramAccessRequests.set(id, {
    id,
    ownerUserId,
    requesterChatId: String(requesterChatId),
    requesterName,
    botUsername,
    createdAt: Date.now(),
  });

  await callTelegramAPI(token, 'sendMessage', {
    chat_id: ownerChatId,
    text: `Yêu cầu truy cập HAgent\n\nNgười gửi: ${requesterName || requesterChatId}\nChat ID: ${requesterChatId}\n\nCho phép người này dùng bot?`,
    reply_markup: {
      inline_keyboard: [[
        { text: 'Cho phép', callback_data: `tgacc:allow:${id}` },
        { text: 'Từ chối', callback_data: `tgacc:deny:${id}` },
      ]],
    },
  }).catch(() => {});

  await callTelegramAPI(token, 'sendMessage', {
    chat_id: requesterChatId,
    text: 'Yêu cầu truy cập đã được gửi tới chủ HAgent. Tôi sẽ phản hồi sau khi được duyệt.',
  }).catch(() => {});

  return false;
}

async function handleTelegramAccessCallback(token, callbackQuery, defaultUserId) {
  const data = callbackQuery?.data || '';
  const match = data.match(/^tgacc:(allow|deny):([A-Za-z0-9_-]+)$/);
  if (!match) return false;

  const [, action, id] = match;
  const request = pendingTelegramAccessRequests.get(id);
  const ownerChatId = callbackQuery.message?.chat?.id;
  if (!request) {
    await callTelegramAPI(token, 'answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'Yêu cầu đã hết hạn hoặc đã được xử lý.',
      show_alert: true,
    }).catch(() => {});
    return true;
  }

  const ownerUserId = resolveTelegramLinkedUserId(defaultUserId, ownerChatId, request.botUsername);
  if (ownerUserId !== request.ownerUserId) {
    await callTelegramAPI(token, 'answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'Bạn không có quyền duyệt yêu cầu này.',
      show_alert: true,
    }).catch(() => {});
    return true;
  }

  pendingTelegramAccessRequests.delete(id);

  if (action === 'allow') {
    authorizeTelegramChat({
      userId: request.ownerUserId,
      chatId: request.requesterChatId,
      botUsername: request.botUsername,
      senderName: request.requesterName,
    });
    await callTelegramAPI(token, 'editMessageText', {
      chat_id: ownerChatId,
      message_id: callbackQuery.message.message_id,
      text: `Đã cấp quyền Telegram cho ${request.requesterName || request.requesterChatId}.`,
    }).catch(() => {});
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: request.requesterChatId,
      text: 'Bạn đã được cấp quyền truy cập HAgent. Gửi lại yêu cầu để bắt đầu.',
    }).catch(() => {});
  } else {
    await callTelegramAPI(token, 'editMessageText', {
      chat_id: ownerChatId,
      message_id: callbackQuery.message.message_id,
      text: `Đã từ chối quyền Telegram cho ${request.requesterName || request.requesterChatId}.`,
    }).catch(() => {});
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: request.requesterChatId,
      text: 'Yêu cầu truy cập HAgent đã bị từ chối.',
    }).catch(() => {});
  }

  await callTelegramAPI(token, 'answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
  }).catch(() => {});
  return true;
}

async function completeTelegramQrLogin({ code, msg, defaultUserId, token }) {
  const row = db.prepare(`
    SELECT *
    FROM telegram_qr_sessions
    WHERE code = ?
      AND status = 'waiting'
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(code);
  if (!row) return false;

  const chatId = String(msg.chat?.id || '');
  if (!chatId) return false;

  const fallbackUsername = getRunningBotUsername(defaultUserId);
  let username = row.bot_username || fallbackUsername;
  if (!username) {
    const me = await callTelegramAPI(token, 'getMe');
    if (me.ok) username = me.result?.username || '';
  }

  const senderName = senderNameFromMessage(msg);
  upsertTelegramConfigForUser(row.user_id, token, username);
  upsertTelegramOmniChannel({
    userId: row.user_id,
    username,
    chatId,
    senderName,
  });

  db.prepare(`
    UPDATE telegram_qr_sessions
    SET chat_id = ?,
        bot_username = COALESCE(NULLIF(?, ''), bot_username),
        status = 'connected',
        used_at = datetime('now')
    WHERE id = ?
  `).run(chatId, username || '', row.id);

  await callTelegramAPI(token, 'sendMessage', {
    chat_id: chatId,
    text: '<b>✅ ĐÃ KẾT NỐI THÀNH CÔNG!</b>\n\nHương vị HAgent đã sẵn sàng phục vụ bạn ngay trên Telegram. Hãy thử gửi một yêu cầu bất kỳ hoặc gõ /help để xem danh sách lệnh.',
    parse_mode: 'HTML'
  }).catch(() => {});

  events.emit('qr_connected', { userId: row.user_id, chatId, username });
  return true;
}

function cleanForTelegram(text) {
  if (!text) return '';
  return text
    .replace(/^#+\s+(.*)$/gm, '\n$1\n') // headers become distinct lines
    .replace(/^\s*[\*\-]\s+/gm, '• ')   // convert lists to bullet points
    .replace(/\*\*(.*?)\*\*/g, '$1')    // remove bold
    .replace(/__(.*?)__/g, '$1')        // remove underline
    .replace(/\*(.*?)\*/g, '$1')        // remove italic
    .replace(/_(.*?)_/g, '$1')          // remove italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // remove code blocks
    .replace(/~~(.*?)~~/g, '$1')        // remove strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // convert links to just text
    .replace(/>\s+(.*)/gm, '$1')        // remove blockquotes
    .replace(/[-*_]{3,}/g, '')          // remove horizontal rules
    .replace(/^\|(.+)\|$/gm, (m) => {
      const cells = m.split('|').filter(c => c.trim()).map(c => c.trim());
      return cells.join('  │  ');
    })
    .replace(/^[|:\-\s]+$/gm, '')       // remove empty table rows
    .replace(/\n{3,}/g, '\n\n')         // normalize spacing
    .trim();
}

function formatForTelegram(text) {
  if (!text) return '';
  let result = text;

  // Extract metrics if present
  let metrics = '';
  const metricsMatch = result.match(/\n\n---\n⏱️.*\s*$/);
  if (metricsMatch) {
    metrics = metricsMatch[0].replace(/---/g, '━━━').replace(/\*\*/g, '').trim();
    result = result.replace(metricsMatch[0], '');
  }

  // Pre-process markdown elements to HTML
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#+\s+(.*)$/gm, '<b>$1</b>')
    .replace(/^\s*[\*\-]\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/---/g, '━━━━━━');

  if (metrics) {
    result += `\n\n<i>${metrics}</i>`;
  }
  return result;
}

function telegramProgressText(kind, detail = '') {
  const suffix = detail ? `\n└ ${detail}` : '';
  switch (kind) {
    case 'thinking':
      return `🤔 Đang phân tích yêu cầu...${suffix}`;
    case 'tool':
      return `🛠️ Đang xử lý nghiệp vụ...${suffix}`;
    case 'finalizing':
      return `✍️ Đang soạn câu trả lời...${suffix}`;
    default:
      return `🔄 Đang xử lý...${suffix}`;
  }
}

function listMessages(sessionId) {
  return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
}

function getToolEmoji(name) {
  const emojis = {
    'web_search': '🔍',
    'google_search': '🌐',
    'terminal': '🖥️',
    'read_file': '📂',
    'write_file': '💾',
    'patch': '🔧',
    'image_generate': '🖼️',
    'browser_navigate': '🌍',
    'browser_click': '🖱️',
    'browser_type': '⌨️',
    'vision_analyze': '📸',
    'text_to_speech': '🎙️',
    'skill_view': '📘',
    'skill_manage': '🛠️',
    'execute_code': '⚡',
    'delegate_task': '🤝',
    'clarify': '💬',
    'memory': '🧠',
    'todo': '📋',
    'process': '⚙️',
    'weather': '🌤️',
    'gold_price': '💰',
    'news': '📰',
    'system': '📟'
  };
  return emojis[name] || '📦';
}

function toolStatusDetail(data = {}) {
  const label = data.label || data.name || 'tool';
  const emoji = getToolEmoji(data.name);
  return `${emoji} ${String(label).replace(/\.\.\.$/, '').slice(0, 80)}`;
}

function sanitizeTelegramProgressLine(text = '') {
  const clean = String(text || '')
    .replace(/THINKING_END|THINKING|TOOL_CALLS_END|TOOL_CALLS|DONE/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{[\s\S]*?\}/g, '')
    .replace(/<\|?tool_call\|?>[\s\S]*?(?=<\|?tool_call\|?>|$)/g, '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map(line => line.replace(/^[-•\d.\s]+/, '').trim())
    .filter(Boolean)
    .find(line => !/^(đang thực thi|bước|step|tool_call|args|name|content)$/i.test(line));

  if (!clean) return '';
  return clean.length > 110 ? `${clean.slice(0, 107)}...` : clean;
}

function renderTelegramProgress({ phase = 'working', modelLabel = '', activities = [] } = {}) {
  let header = '<b>⏳ HAGENT ĐANG XỬ LÝ</b>';
  if (phase === 'thinking') header = '<b>🧠 HAGENT ĐANG PHÂN TÍCH</b>';
  if (phase === 'tool') header = '<b>⚙️ HAGENT ĐANG THỰC THI</b>';
  if (phase === 'finalizing') header = '<b>✍️ HAGENT ĐANG HOÀN TẤT</b>';

  const lines = [header];
  if (modelLabel) lines.push(`<i>🤖 Trợ lý: ${modelLabel}</i>`);

  const recent = activities.slice(-5);
  if (recent.length) {
    lines.push('');
    for (const item of recent) {
      const isDone = item.includes(' xong');
      const icon = isDone ? '✅' : '○';
      lines.push(`${icon} ${item}`);
    }
  } else {
    lines.push('', '<i>○ Đang chuẩn bị môi trường...</i>');
  }

  return lines.join('\n').slice(0, 950);
}

function professionalTelegramSystem(modelLabel) {
  return `[TELEGRAM HAGENT GATEWAY MODE]
Telegram must have the same task competence as web chat. Do not behave like a lightweight chatbot.
- Preserve conversation context and infer the active task from recent messages, replies, and confirmations.
- If the user replies "ok", "ừ", "được", "yes", "tiếp", "chạy đi", "chạy lại", treat it as approval/continuation of the immediately previous actionable proposal. Continue with tools; do not answer only "Ok".
- Use the same tool persistence as Hagent/web chat: inspect, act, verify, and only then finalize.
- Telegram formatting is just the delivery layer. It must not reduce reasoning depth, tool use, or task completion quality.
- Final replies should be mobile-readable, but still concrete: what was done, what changed, what was verified, and any blocker.
- Do not expose hidden chain-of-thought. Progress updates may summarize observable actions and tool names.
- If the user replies to a specific Telegram message, prioritize that quoted message as the immediate context.
Model đang dùng: ${modelLabel}.`;
}

function isWeakTelegramFinal(text = '') {
  const clean = cleanForTelegram(text).toLowerCase().trim();
  if (!clean) return true;
  if (clean.length > 160) return false;
  return /^(ok|okay|hello|hi|xin chào|chào|mình đây|tôi đây|đã rõ|rõ|👍|ok 👍)([\s.!…-]|$)/i.test(clean)
    || /cần .* kiểm tra|cần .* chạy|muốn .* tiếp|không\?/i.test(clean);
}

function isShortTelegramConfirmation(text = '') {
  return isShortConfirmation(text);
}

function buildTelegramUserTurn(text, history = [], msg = null) {
  return buildHagentContinuationTurn({
    text,
    history,
    replyText: extractTelegramReplyText(msg),
    platform: 'telegram',
  });
}

async function callTelegramAPI(token, method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function runRustDeskCommand(enabled) {
  return new Promise(async (resolve, reject) => {
    const { execFile } = await import('node:child_process');
    const script = enabled ? '/usr/local/sbin/hagent-rustdesk-on' : '/usr/local/sbin/hagent-rustdesk-off';
    execFile('/usr/bin/sudo', ['-n', script], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || 'Command failed').trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function setRustDeskEnabled(enabled) {
  await runRustDeskCommand(enabled);
}

export async function sendTelegramMessage(userId, chatId, text, options = {}) {
  const config = db.prepare('SELECT * FROM telegram_config WHERE user_id = ? AND active = 1').get(userId);
  const token = options.token || config?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Chưa kết nối Telegram bot.');

  return callTelegramAPI(token, 'sendMessage', {
    chat_id: chatId,
    text: String(text || ''),
    ...(options.parse_mode ? { parse_mode: options.parse_mode } : {}),
    ...(options.disable_web_page_preview !== undefined ? { disable_web_page_preview: options.disable_web_page_preview } : {}),
    ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

export async function sendTelegramWebMessageForUser(userId, peerId, text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('Nội dung Telegram trống.');

  const channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'telegram' AND is_active = 1").get(userId);
  const tokenData = parseTelegramWebToken(channel?.access_token || '');
  if (!channel || !tokenData) {
    throw new Error('Chưa có phiên Telegram Web. Hãy quét QR Telegram trước.');
  }

  const { page, close } = await getTelegramWebSyncPage(userId, tokenData);
  try {
    await openTelegramWebConversation(page, peerId);
    if (!await focusTelegramWebComposer(page)) {
      throw new Error('Không tìm thấy ô nhập Telegram Web. Có thể bot/chat đang bị chặn hoặc cần bấm START.');
    }
    await page.keyboard.insertText(cleanText);
    await page.waitForTimeout(250);
    await clickTelegramWebSend(page);
    await page.waitForTimeout(1200);
    return {
      ok: true,
      peer_id: String(peerId || ''),
      source: 'telegram-web',
    };
  } finally {
    await close();
  }
}

export async function syncTelegramWebMessagesForUser(userId, { maxThreads = 12, maxMessages = 30 } = {}) {
  const channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'telegram' AND is_active = 1").get(userId);
  const tokenData = parseTelegramWebToken(channel?.access_token || '');
  if (!channel || !tokenData) {
    throw new Error('Chưa có phiên Telegram Web. Hãy quét QR Telegram trước.');
  }

  const { page, close } = await getTelegramWebSyncPage(userId, tokenData);
  let syncedConversations = 0;
  let syncedMessages = 0;
  const errors = [];
  const touchedConversationIds = new Set();

  try {
    const threads = await scrapeTelegramWebThreads(page, maxThreads);
    if (!threads.length) throw new Error('Không đọc được danh sách hội thoại Telegram Web.');

    for (const thread of threads) {
      try {
        const peerSelector = `.chatlist-chat[data-peer-id="${String(thread.peerId).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
        const row = page.locator(peerSelector).first();
        if (await row.count()) {
          await row.click({ force: true });
        } else {
          await page.locator(`a[href="#${String(thread.peerId).replaceAll('"', '\\"')}"]`).first().click({ force: true });
        }
        await page.waitForTimeout(1800);
        const title = await page.evaluate((fallback) => {
          const selectors = [
            '.topbar .peer-title',
            '.chat-info .peer-title',
            '.person .peer-title',
            '[class*="peer-title"]',
            'header h3',
          ];
          for (const selector of selectors) {
            const text = document.querySelector(selector)?.textContent?.trim();
            if (text) return text;
          }
          return fallback;
        }, thread.name).catch(() => thread.name);
        const externalId = String(thread.peerId || title || randomUUID());
        const name = String(title || thread.name || externalId).trim();
        const messages = (await scrapeTelegramWebMessages(page, maxMessages))
          .map(msg => ({
            ...msg,
            content: compactTelegramText(msg.content),
          }))
          .filter(msg => msg.content);

        let conv = db.prepare('SELECT * FROM omni_conversations WHERE channel_id = ? AND external_sender_id = ?').get(channel.id, externalId);
        const lastMessage = messages.at(-1)?.content || '';
        if (!conv) {
          const convId = randomUUID();
          db.prepare(`
            INSERT INTO omni_conversations (
              id, user_id, channel_id, external_sender_id, sender_name, last_message,
              unread_count, thread_type
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'user')
          `).run(convId, userId, channel.id, externalId, name, lastMessage);
          conv = db.prepare('SELECT * FROM omni_conversations WHERE id = ?').get(convId);
        } else {
          db.prepare(`
            UPDATE omni_conversations
            SET sender_name = COALESCE(NULLIF(?, ''), sender_name),
                last_message = COALESCE(NULLIF(?, ''), last_message),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(name, lastMessage, conv.id);
        }
        syncedConversations += 1;

        for (let index = 0; index < messages.length; index += 1) {
          const msg = messages[index];
          const externalMsgId = `${externalId}:${msg.senderType}:${index}:${msg.content.slice(0, 120)}`;
          const result = db.prepare(`
            INSERT OR IGNORE INTO omni_messages (
              id, user_id, conversation_id, external_id, sender_type, content, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'synced')
          `).run(randomUUID(), userId, conv.id, externalMsgId, msg.senderType === 'agent' ? 'agent' : 'customer', msg.content);
          if (result.changes) {
            syncedMessages += 1;
            touchedConversationIds.add(conv.id);
          }
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (syncedConversations || syncedMessages) {
      notifyOmni(userId, {
        platform: 'telegram',
        conversation_ids: [...touchedConversationIds],
        reason: 'telegram-web-sync',
      });
    }

    return {
      synced_conversations: syncedConversations,
      synced_messages: syncedMessages,
      errors,
    };
  } finally {
    await close();
  }
}

export async function startTelegramQrLogin(userId) {
  if (!userId) throw new Error('Missing userId');
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  let playwright;
  let chromium;
  try {
    playwright = await import('playwright');
    chromium = playwright.chromium || playwright.default?.chromium;
  } catch {
    throw new Error('Telegram Web QR cần Playwright. Hãy cài playwright trong backend.');
  }
  if (!chromium?.launch) throw new Error('Không tìm thấy Chromium launcher của Playwright.');

  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const qr = await extractTelegramWebQr(page);
    const timeout = setTimeout(() => {
      cleanupTelegramWebQrSession(id).catch(() => {});
    }, 5 * 60 * 1000);
    telegramWebQrSessions.set(id, { userId, browser, context, page, timeout, expiresAt });

    db.prepare(`
      INSERT INTO telegram_qr_sessions (id, code, user_id, bot_username, deep_link, status, expires_at)
      VALUES (?, ?, ?, '', 'https://web.telegram.org/k/', 'waiting', ?)
    `).run(id, id, userId, toSqlIso(expiresAt));

    return {
      session_id: id,
      qr,
      source: 'telegram-web',
      expires_in: 300,
    };
  } catch (err) {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    throw new Error(`Không tạo được QR Telegram Web: ${err.message}`);
  }
}

export async function getTelegramQrLoginStatus(userId, sessionId) {
  const row = db.prepare('SELECT * FROM telegram_qr_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!row) return null;

  const expiresAt = new Date(`${String(row.expires_at || '').replace(' ', 'T')}Z`).getTime();
  if (row.status === 'waiting' && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    db.prepare("UPDATE telegram_qr_sessions SET status = 'expired' WHERE id = ?").run(row.id);
    cleanupTelegramWebQrSession(row.id).catch(() => {});
    return {
      status: 'expired',
      session_id: row.id,
    };
  }

  const session = telegramWebQrSessions.get(sessionId);
  if (row.status === 'waiting' && session?.page && await isTelegramWebLoggedIn(session.page)) {
    const storage = await session.page.evaluate(() => {
      const local = {};
      const sessionStorageDump = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        local[key] = window.localStorage.getItem(key);
      }
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        sessionStorageDump[key] = window.sessionStorage.getItem(key);
      }
      return { local, session: sessionStorageDump };
    }).catch(() => ({ local: {}, session: {} }));
    const cookies = await session.context.cookies().catch(() => []);
    let channel = db.prepare("SELECT * FROM omni_channels WHERE user_id = ? AND platform = 'telegram'").get(userId);
    const token = JSON.stringify({
      source: 'telegram-web',
      cookies,
      storage,
      linked_at: new Date().toISOString(),
    });
    if (!channel) {
      const channelId = randomUUID();
      db.prepare(`
        INSERT INTO omni_channels (id, user_id, name, platform, access_token, is_active)
        VALUES (?, ?, 'Telegram Web', 'telegram', ?, 1)
      `).run(channelId, userId, token);
    } else {
      db.prepare(`
        UPDATE omni_channels
        SET name = 'Telegram Web',
            access_token = ?,
            is_active = 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(token, channel.id);
    }
    db.prepare(`
      UPDATE telegram_qr_sessions
      SET status = 'connected',
          used_at = datetime('now')
      WHERE id = ?
    `).run(row.id);
    notifyOmni(userId, { platform: 'telegram', reason: 'telegram-web-qr' });
    return {
      status: 'connected',
      session_id: row.id,
      connected_at: new Date().toISOString(),
    };
  }

  return {
    status: row.status || 'waiting',
    session_id: row.id,
    connected_at: row.used_at,
  };
}

export async function cancelTelegramQrLogin(userId, sessionId) {
  const info = db.prepare(`
    UPDATE telegram_qr_sessions
    SET status = 'cancelled'
    WHERE id = ?
      AND user_id = ?
      AND status = 'waiting'
  `).run(sessionId, userId);
  await cleanupTelegramWebQrSession(sessionId);
  return { ok: true, changed: info.changes };
}

async function handleMessage(token, msg, userId) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (!text.trim()) return;
  let omniConv = null;
  const senderName = senderNameFromMessage(msg);
  const botUsername = getRunningBotUsername(userId) || db.prepare('SELECT bot_username FROM telegram_config WHERE user_id = ? AND active = 1').get(userId)?.bot_username || '';

  const qrLoginMatch = text.trim().match(/^\/start\s+hagent_([A-Za-z0-9_-]+)$/i);
  if (qrLoginMatch) {
    const connected = await completeTelegramQrLogin({
      code: qrLoginMatch[1],
      msg,
      defaultUserId: userId,
      token,
    });
    if (!connected) {
      await callTelegramAPI(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Mã QR Telegram đã hết hạn hoặc không hợp lệ. Hãy tạo mã mới trong HAgent.',
      });
    }
    return;
  }

  const linkedUserId = resolveTelegramLinkedUserId(userId, chatId, botUsername);
  const hasAnyTelegramLink = countTelegramChatLinks(linkedUserId, botUsername) > 0;
  const isAuthorizedTelegramChat = Boolean(getTelegramChatLink(linkedUserId, chatId, botUsername));

  if (!isAuthorizedTelegramChat) {
    if (!hasAnyTelegramLink) {
      authorizeTelegramChat({ userId: linkedUserId, chatId, botUsername, senderName });
    } else {
      await requestTelegramAccessApproval({
        token,
        ownerUserId: linkedUserId,
        requesterChatId: chatId,
        requesterName: senderName,
        botUsername,
      });
      return;
    }
  }

  userId = linkedUserId;

  // Sync to OmniChat
  try {
    omniConv = upsertConversation({
      userId,
      platform: 'telegram',
      externalSenderId: String(chatId),
      senderName,
      content: text,
    });
  } catch (err) {
    console.error('[Telegram Omni Sync Error]', err.message);
  }

  // /start
  if (/^\/start(?:\s|$)/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: '<b>🚀 CHÀO MỪNG BẠN ĐẾN VỚI HAGENT</b>\n\n' +
        'Tôi là <b>Trợ lý AI đa năng</b> của bạn, sẵn sàng hỗ trợ công việc, lập trình và tra cứu thông tin chuyên sâu.\n\n' +
        '<b>🛠 DANH SÁCH LỆNH:</b>\n' +
        '✨ <code>/new</code> — Bắt đầu phiên chat mới\n' +
        '📊 <code>/status</code> — Kiểm tra hệ thống\n' +
        '🌤 <code>/thoitiet</code> — Dự báo thời tiết\n' +
        '💰 <code>/giavang</code> — Tỷ giá & Giá vàng\n' +
        '📰 <code>/tinmoi</code> — Tin tức mới nhất\n\n' +
        '<b>🖥 ĐIỀU KHIỂN HỆ THỐNG:</b>\n' +
        '🤖 <code>/chuyenmohinh</code> — Đổi AI (DeepSeek/Local)\n' +
        '⚡ <code>/terminal</code> — Claude Terminal (Qwen)\n' +
        '💻 <code>/bat</code> — Bật máy tính (WOL)\n' +
        '🔌 <code>/tat</code> — Tắt máy tính (SSH)\n' +
        '🟢 <code>/rustdesk_on</code> — Bật RustDesk\n\n' +
        '<i>Gửi tin nhắn bất kỳ để bắt đầu hội thoại!</i>',
      parse_mode: 'HTML'
    });
    return;
  }

  // /new
  if (text === '/new') {
    db.prepare('DELETE FROM messages WHERE session_id = ? AND user_id = ?').run(`tg-${chatId}`, userId);
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: '✨ Đã làm mới phiên chat. Bạn có thể bắt đầu yêu cầu mới!'
    });
    return;
  }

  // /chuyenmohinh — khớp cả gõ tay lẫn bấm phím tắt
  if (/^\/?(chuyen(mohinh|mo\s*hinh|mô\s*hình|model)?|chuyenmohinh)$/i.test(text.trim())) {
    const providers = ['lmstudio', 'lmstudio_local', 'ollama', 'llamacpp', 'deepseek'];
    const userRow = db.prepare('SELECT default_provider FROM users WHERE id = ?').get(userId);
    const current = userRow?.default_provider || 'deepseek';
    const currentIndex = providers.indexOf(current);
    const next = providers[currentIndex === -1 || currentIndex === providers.length - 1 ? 0 : currentIndex + 1];

    const labels = {
      lmstudio_local: 'LM Studio (Local)',
      lmstudio: 'LM Studio (Remote)',
      ollama: 'Ollama (Remote)',
      llamacpp: 'Llama.cpp (Remote)',
      deepseek: 'DeepSeek'
    };

    // Cập nhật default_provider trong DB để đồng bộ với frontend
    db.prepare('UPDATE users SET default_provider = ? WHERE id = ?').run(next, userId);

    db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider) VALUES (?, ?, ?, ?, ?, ?)').run(
      `tg-${chatId}-${Date.now()}`, `tg-${chatId}`, userId, 'assistant', `✅ Đã chuyển sang mô hình: ${labels[next]}`, next
    );
    await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `✅ Đã chuyển sang mô hình: *${labels[next]}*`, parse_mode: 'Markdown' });
    return;
  }

  // /chuyenclaude
  if (/^\/chuyenclaude$/i.test(text.trim())) {
    const modes = ['deepseek', 'ollama', 'lmstudio', 'llamacpp', 'lmstudio_local'];
    const currentMode = db.prepare('SELECT claude_mode FROM users WHERE id = ?').get(userId)?.claude_mode || 'deepseek';
    const currentIndex = modes.indexOf(currentMode);
    const nextMode = modes[currentIndex === -1 || currentIndex === modes.length - 1 ? 0 : currentIndex + 1];

    const { applyClaudeMode } = await import('../services/claude-settings.js');
    const result = applyClaudeMode(nextMode);
    if (!result.ok) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `Lỗi: ${result.error || 'Unknown error'}` });
      return;
    }
    db.prepare('UPDATE users SET claude_mode = ? WHERE id = ?').run(nextMode, userId);

    await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: `✅ Đã chuyển Claude sang: *${result.label}*\n\nGõ /terminal để mở Terminal với mô hình này.`,
      parse_mode: 'Markdown'
    });
    return;
  }

  // /terminal
  if (/^\/terminal/i.test(text.trim())) {
    const currentMode = db.prepare('SELECT claude_mode FROM users WHERE id = ?').get(userId)?.claude_mode || 'deepseek';
    const { CLAUDE_PROXY_CONFIGS } = await import('../services/claude-settings.js');
    const config = CLAUDE_PROXY_CONFIGS[currentMode];

    const workingDir = process.cwd();
    const tgToken = process.env.CLAUDE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
    const exportCmd = `export TELEGRAM_BOT_TOKEN="${tgToken}" && export ANTHROPIC_BASE_URL="${config.baseURL}" && export ANTHROPIC_API_KEY="${config.apiKey}" && export ANTHROPIC_MODEL="${config.model}" && cd "${workingDir}" && claude "Calling plugin:telegram:telegram" --channels plugin:telegram@claude-plugins-official`;

    try {
      const { exec } = await import('node:child_process');
      // Escape quotes for AppleScript
      const escapedCmd = exportCmd.replace(/"/g, '\\"');
      const appleScript = `osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escapedCmd}"'`;

      console.log('[Magic Terminal] Running:', appleScript);
      exec(appleScript, (err) => {
        if (err) console.error('[Terminal Error]', err);
      });

      await callTelegramAPI(token, 'sendMessage', {
        chat_id: chatId,
        text: `🚀 *Đang tự động mở Terminal...*\nMô hình: *${config.label}*\n\nNếu không thấy Terminal bật lên, hãy copy lệnh này:\n\`${exportCmd}\``,
        parse_mode: 'Markdown'
      });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', {
        chat_id: chatId,
        text: `❌ Lỗi mở Terminal: ${e.message}\n\nLệnh thủ công:\n\`${exportCmd}\``,
        parse_mode: 'Markdown'
      });
    }
    return;
  }

  // /rustdesk
  if (/^\/rustdesk$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: 'RustDesk:',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Bật RustDesk', callback_data: 'rustdesk_on' },
          { text: 'Tắt RustDesk', callback_data: 'rustdesk_off' },
        ]]
      }
    });
    return;
  }

  // /rustdesk_on
  if (/^\/?rustdesk_on$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      await setRustDeskEnabled(true);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: '✅ Đã bật RustDesk và private server.' });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi bật RustDesk: ${e.message}` });
    }
    return;
  }

  // /rustdesk_off
  if (/^\/?rustdesk_off$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      await setRustDeskEnabled(false);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: '✅ Đã tắt RustDesk, service nền và private server.' });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi tắt RustDesk: ${e.message}` });
    }
    return;
  }

  // /thoitiet
  if (/^\/thoitiet/i.test(text)) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    const location = text.replace(/^\/thoitiet\s*/i, '').trim() || undefined;
    const weatherResult = await getWeather({ location });
    await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: weatherResult });
    return;
  }

  // /giavang
  if (/^\/giavang/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await fetch('https://webapi.dantri.com.vn/gia-vang');
      const data = await res.json();

      const btmh = data.find(s => s.source === 'btmh') || data[0];
      const items = btmh?.last?.prices || [];
      const lines = items.slice(0, 6).map(item =>
        `▪️ ${item.type}: Mua ${Number(item.buyPrice).toLocaleString('vi-VN')} — Bán ${Number(item.sellPrice).toLocaleString('vi-VN')} VNĐ`
      );

      const reply = lines.length
        ? `💰 Giá vàng hôm nay (Nguồn: Dân Trí):\n\n${lines.join('\n')}`
        : '⚠️ Không lấy được giá vàng, thử lại sau.';
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: reply });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi lấy giá vàng: ${e.message}` });
    }
    return;
  }

  // /bat (Wake-on-LAN)
  if (/^\/bat/i.test(text)) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const { default: dgram } = await import('node:dgram');
      const mac = process.env.WOL_MAC || '9c:6b:00:17:93:7a';
      const broadcast = process.env.WOL_BROADCAST || '192.168.1.255';
      const port = parseInt(process.env.WOL_PORT || '9', 10);
      const hex = mac.replace(/[:\-]/g, '');
      const macBytes = Buffer.from(hex, 'hex');
      const packet = Buffer.alloc(102);
      packet.fill(0xff, 0, 6);
      for (let i = 1; i <= 16; i++) macBytes.copy(packet, i * 6);
      await new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.once('error', e => { socket.close(); reject(e); });
        socket.bind(() => {
          socket.setBroadcast(true);
          socket.send(packet, 0, packet.length, port, broadcast, err => {
            socket.close();
            if (err) reject(err); else resolve();
          });
        });
      });
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: '✅ Đã gửi tín hiệu Wake-on-LAN. Máy tính sẽ khởi động...' });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi: ${e.message}` });
    }
    return;
  }

  // /tat (SSH shutdown)
  if (/^\/tat/i.test(text)) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const { execSync } = await import('node:child_process');
      const host = process.env.SSH_REMOTE_HOST || '100.69.50.64';
      const user = process.env.SSH_REMOTE_USER || 'hatnguyen';
      const pwd = process.env.SSH_PASSWORD;
      if (!pwd) throw new Error('Chua cau hinh SSH_PASSWORD');
      execSync(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 ${user}@${host} 'echo "${pwd}" | sudo -S shutdown now'`, { timeout: 15000 });
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: '✅ Đã gửi lệnh tắt máy từ xa.' });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Loi tat may: ${e.message}` });
    }
    return;
  }

  // /lmstudio
  if (/^\/(lmstudio|llmstudio|llm\s*studio)$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await controlService('lmstudio', userId);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: res.message });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi: ${e.message}` });
    }
    return;
  }

  // /ollama
  if (/^\/ollama$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await controlService('ollama', userId);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: res.message });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi: ${e.message}` });
    }
    return;
  }

  // /lmstudio_local
  if (/^\/(lmstudio|llmstudio|llm\s*studio)[_\s]*local$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await controlService('lmstudio_local', userId);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: res.message });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi bật Local: ${e.message}` });
    }
    return;
  }

  // /off (Stop all remote services)
  if (/^\/(off|stopall)$/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await controlService('off', userId);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: res.message });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi khi tắt dịch vụ: ${e.message}` });
    }
    return;
  }

  // /llamacpp
  if (/^\/llamacpp/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const res = await controlService('llamacpp', userId);
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: res.message });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi bật Llama-cpp: ${e.message}` });
    }
    return;
  }

  // /tinmoi
  if (/^\/tinmoi/i.test(text.trim())) {
    text = 'Hãy đọc tin tức mới nhất trên VnExpress và tóm tắt lại các sự kiện nổi bật nhất hiện nay.';
    // Cho phép luồng xử lý trôi xuống logic chat thông thường của AI
  }

  // /terminal
  if (/^\/terminal/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const { openClaudeTelegram } = await import('./tools/claude.js');
      const result = await openClaudeTelegram();
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: result });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi: ${e.message}` });
    }
    return;
  }

  // /deepseek
  if (/^\/deepseek/i.test(text.trim())) {
    await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    try {
      const { openClaudeDeepSeek } = await import('./tools/claude.js');
      const result = await openClaudeDeepSeek();
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: result });
    } catch (e) {
      await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: `❌ Lỗi: ${e.message}` });
    }
    return;
  }

  // /status
  if (/^\/status/i.test(text.trim())) {
    const status = getBotStatus(userId);
    const reply = `<b>📊 TRẠNG THÁI HỆ THỐNG</b>\n\n` +
      `<b>🤖 Trạng thái:</b> ${status.connected ? '🟢 Đang chạy' : '🔴 Đã dừng'}\n` +
      `<b>🔑 User ID:</b> <code>${userId.substring(0, 8)}...</code>\n` +
      `<b>🛰 Bot:</b> @${botUsername}\n` +
      `<b>📅 Thời gian:</b> <code>${new Date().toLocaleString('vi-VN')}</code>\n\n` +
      `<i>HAgent đã sẵn sàng phục vụ!</i>`;
    await callTelegramAPI(token, 'sendMessage', { chat_id: chatId, text: reply, parse_mode: 'HTML' });
    return;
  }

  // Chat thường — delegate to Python agent (same as web frontend Chat.jsx)
  await callTelegramAPI(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });

  try {
    const sessionId = `tg-${chatId}`;

    const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId);
    if (!session) {
      db.prepare('INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)').run(sessionId, userId, `[Te] ${text.slice(0, 50)}`);
    }

    const userRow = db.prepare('SELECT default_provider FROM users WHERE id = ?').get(userId);
    const providerName = userRow?.default_provider || 'deepseek';
    const config = getProviderClient(providerName, userId);
    // Show "Provider (model-name)" so the user knows the exact model being used
    const modelLabel = config.model
      ? `${config.label || config.name} (${config.model})`
      : (config.label || config.name);

    // Declare collected BEFORE pushTelegramActivity so the closure captures it correctly
    let collected = '';
    let replyMessageId = '';
    let totalUsage = {};

    const initialRes = await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: renderTelegramProgress({ phase: 'thinking', modelLabel }),
      ...telegramReplyOptions(msg),
    });
    const messageIdToEdit = initialRes.result?.message_id;

    let lastProgressUpdate = 0;
    const progressActivities = [];

    const pushTelegramActivity = async (line, phase = 'working', force = false) => {
      if (line) {
        const clean = sanitizeTelegramProgressLine(line);
        if (clean && progressActivities[progressActivities.length - 1] !== clean) {
          progressActivities.push(clean);
          if (progressActivities.length > 8) progressActivities.shift();
        }
      }
      if (!messageIdToEdit) return;
      const now = Date.now();
      if (!force && now - lastProgressUpdate < 2500) return;
      
      let textToEdit = renderTelegramProgress({ phase, modelLabel, activities: progressActivities });
      if (collected) {
        const safeText = cleanForTelegram(collected).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        textToEdit += '\n\n' + safeText + ' ✍️...';
      }
      
      await callTelegramAPI(token, 'editMessageText', {
        chat_id: chatId,
        message_id: messageIdToEdit,
        text: textToEdit.slice(0, 4000),
        parse_mode: 'HTML',
      }).catch(() => { });
      lastProgressUpdate = now;
    };

    // Call Python agent SSE endpoint (same pipeline as web frontend Chat.jsx)
    const { getPythonAgentBaseUrl } = await import('./python-agent.js');
    const agentUrl = `${getPythonAgentBaseUrl()}/api/sessions/${sessionId}/messages`;

    // Resolve auth token for this userId
    const sessionToken = db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(userId)?.id || 'hat';

    const history = listMessages(sessionId);
    const turn = await buildTelegramUserTurn(text, history, msg);
    const systemInstr = professionalTelegramSystem(modelLabel);
    const enrichedMessage = `${systemInstr}\n\n${turn}`;

    const agentRes = await fetch(agentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        content: enrichedMessage,
        provider: providerName,
        model: config.model,
      }),
    });

    if (!agentRes.ok) {
      const errBody = await agentRes.text().catch(() => 'Unknown error');
      throw new Error(`Python agent error ${agentRes.status}: ${errBody}`);
    }

    // Stream the SSE response from Python agent
    // (collected, replyMessageId, totalUsage declared above before pushTelegramActivity)
    const decoder = new TextDecoder();
    let sseBuffer = '';

    for await (const chunk of agentRes.body) {
      sseBuffer += decoder.decode(chunk, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          switch (data.type) {
            case 'think':
              if (data.content) {
                const line = sanitizeTelegramProgressLine(data.content);
                if (line) {
                  await pushTelegramActivity(line, 'thinking', !data.append);
                }
              }
              break;
            case 'tool':
              if (data.status === 'start') {
                await pushTelegramActivity(toolStatusDetail(data), 'tool', true);
              } else if (data.status === 'done') {
                await pushTelegramActivity(`${toolStatusDetail(data)} xong`, 'tool', true);
              }
              break;
            case 'content':
              collected += data.content || '';
              await pushTelegramActivity('', 'finalizing');
              break;
            case 'done':
              replyMessageId = data.messageId || '';
              totalUsage = data.usage || {};
              break;
            case 'error':
              collected = `❌ Lỗi: ${data.error || 'Agent error'}`;
              break;
          }
        } catch { /* ignore malformed SSE */ }
      }
    }

    // Send final reply
    if (messageIdToEdit) {
      const formattedText = formatForTelegram(collected);
      const modelTag = `\n\n<i>— ${modelLabel}</i>`;
      const finalText = (formattedText || 'Xin lỗi, tôi không thể tạo câu trả lời.') + modelTag;

      const chunks = splitMessage(finalText, 4000);
      for (const chunk of chunks) {
        await callTelegramAPI(token, 'sendMessage', {
          chat_id: chatId,
          text: chunk,
          parse_mode: 'HTML',
          ...telegramReplyOptions(msg),
        }).catch(() => {
          // Fallback to plain text if HTML parsing fails (e.g. malformed tags)
          callTelegramAPI(token, 'sendMessage', {
            chat_id: chatId,
            text: cleanForTelegram(finalText),
            ...telegramReplyOptions(msg),
          });
        });
      }

      // Cleanup progress message
      await callTelegramAPI(token, 'deleteMessage', { chat_id: chatId, message_id: messageIdToEdit }).catch(() => { });
    }

    // Sync to OmniChat
    if (omniConv?.id && collected) {
      const omniReplyId = `tg-reply-${chatId}-${Date.now()}`;
      db.prepare(`
        INSERT INTO omni_messages (id, user_id, conversation_id, sender_type, content, status)
        VALUES (?, ?, ?, 'agent', ?, 'sent')
      `).run(omniReplyId, userId, omniConv.id, collected);
      db.prepare("UPDATE omni_conversations SET last_message = ?, unread_count = 0, updated_at = datetime('now') WHERE id = ?").run(collected, omniConv.id);
    }

    // Wiki extraction is handled by the Python agent — no need to duplicate here

  } catch (err) {
    console.error('[Telegram Chat Error]', err.message);
    await callTelegramAPI(token, 'sendMessage', {
      chat_id: chatId,
      text: `Lỗi: ${err.message}`,
    });
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const cut = remaining.lastIndexOf('\n', maxLen);
    const idx = cut > maxLen / 2 ? cut : remaining.lastIndexOf(' ', maxLen);
    const split = idx > maxLen / 2 ? idx : maxLen;
    chunks.push(remaining.slice(0, split));
    remaining = remaining.slice(split);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function setupBotCommands(token) {
  console.log(`[Telegram] Setting up commands for token: ${token.substring(0, 10)}...`);
  const result = await callTelegramAPI(token, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'Hướng dẫn sử dụng' },
      { command: 'new', description: 'Chat mới (Xóa lịch sử)' },
      { command: 'status', description: 'Trạng thái hệ thống' },
      { command: 'chuyenmohinh', description: 'Đổi AI (DeepSeek/Local)' },
      { command: 'chuyenclaude', description: 'Đổi Claude Proxy Mode' },
      { command: 'terminal', description: 'Mở Claude Terminal' },
      { command: 'lmstudio', description: 'Bật LM Studio (Remote)' },
      { command: 'ollama', description: 'Bật Ollama (Remote)' },
      { command: 'llamacpp', description: 'Bật Llama-cpp (8080)' },
      { command: 'lmstudio_local', description: 'Bật LM Studio (Local Mac)' },
      { command: 'off', description: 'Tắt tất cả AI Remote' },
      { command: 'tinmoi', description: 'Đọc tin tức mới nhất' },
      { command: 'thoitiet', description: 'Xem thời tiết' },
      { command: 'giavang', description: 'Xem giá vàng' },
      { command: 'tygia', description: 'Xem tỷ giá Vietcombank' },
      { command: 'bat', description: 'Bật máy tính (WOL)' },
      { command: 'tat', description: 'Tắt máy tính (SSH)' },
      { command: 'rustdesk', description: 'Nút bật/tắt RustDesk' },
      { command: 'rustdesk_on', description: 'Bật RustDesk' },
      { command: 'rustdesk_off', description: 'Tắt RustDesk' },
      { command: 'help', description: 'Trợ giúp chi tiết' }
    ],
    scope: { type: 'all_private_chats' }
  });
  if (!result.ok) {
    console.error('[Telegram] setMyCommands failed:', result.description);
  } else {
    console.log('[Telegram] setMyCommands succeeded');
  }
  return result;
}

export async function startTelegramBot(token, userId) {
  if (!token || !userId) throw new Error('Missing token or userId');

  const me = await callTelegramAPI(token, 'getMe');
  if (!me.ok) throw new Error(`Invalid token: ${me.description}`);

  await setupBotCommands(token);

  const username = me.result.username;

  const existing = db.prepare('SELECT * FROM telegram_config WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare("UPDATE telegram_config SET bot_token = ?, bot_username = ?, active = 1, updated_at = datetime('now') WHERE user_id = ?").run(token, username, userId);
  } else {
    db.prepare('INSERT INTO telegram_config (user_id, bot_token, bot_username) VALUES (?, ?, ?)').run(userId, token, username);
  }

  if (bots.has(userId)) {
    const old = bots.get(userId);
    clearTimeout(old.timeout);
    old.running = false;
    bots.delete(userId);
  }

  let lastUpdateId = 0;
  const botRef = { token, timeout: null, username, running: true };
  bots.set(userId, botRef);

  const scheduleNext = () => {
    if (!botRef.running) return;
    botRef.timeout = setTimeout(doPoll, 2000);
  };

  const doPoll = async () => {
    if (!botRef.running) return;
    try {
      const updates = await callTelegramAPI(token, 'getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      if (!updates.ok) return;
      for (const update of updates.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        if (update.message?.text) {
          handleMessage(token, update.message, userId).catch(() => { });
        }
        if (update.callback_query?.data) {
          const handledAccess = await handleTelegramAccessCallback(token, update.callback_query, userId).catch(() => false);
          if (handledAccess) continue;
          callTelegramAPI(token, 'answerCallbackQuery', {
            callback_query_id: update.callback_query.id,
          }).catch(() => { });
          handleMessage(token, {
            ...update.callback_query.message,
            text: `/${update.callback_query.data}`,
            from: update.callback_query.from,
          }, userId).catch(() => { });
        }
      }
    } catch { }
    scheduleNext();
  };

  await doPoll();

  events.emit('bot_started', { userId, username });

  return { ok: true, username, message: `Bot @${username} đã kết nối. Gửi tin nhắn tới @${username} trên Telegram để chat.` };
}

export async function stopTelegramBot(userId) {
  const bot = bots.get(userId);
  if (bot) {
    bot.running = false;
    clearTimeout(bot.timeout);
    bots.delete(userId);
  }
  db.prepare('UPDATE telegram_config SET active = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(userId);
  return { ok: true, message: 'Bot đã dừng.' };
}

export function getBotStatus(userId) {
  const config = db.prepare('SELECT * FROM telegram_config WHERE user_id = ? AND active = 1').get(userId);
  const running = bots.has(userId);
  return { connected: running, config: config || null };
}

export function listActiveBots() {
  const configs = db.prepare('SELECT * FROM telegram_config WHERE active = 1').all();
  return configs.map(c => ({ ...c, running: bots.has(c.user_id) }));
}

export function detectToken(text) {
  const match = text.match(/\b(\d{8,12}:[\w-]{30,50})\b/);
  if (match) return match[1];
  return null;
}

export async function autoStartBots() {
  const configs = db.prepare('SELECT * FROM telegram_config WHERE active = 1').all();
  for (const config of configs) {
    startTelegramBot(config.bot_token, config.user_id).catch(() => { });
  }
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken) {
    const alreadyRunning = [...bots.keys()].some(k => {
      const cfg = db.prepare('SELECT bot_token FROM telegram_config WHERE user_id = ?').get(k);
      return cfg?.bot_token === envToken;
    });
    if (!alreadyRunning) {
      let user = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
      if (!user) {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, 'default');
        user = { id };
      }
      startTelegramBot(envToken, user.id).catch(() => { });
    }
  }
}
