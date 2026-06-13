const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8010',
  appUrl: 'https://hatai.io.vn',
  token: 'hat',
  category: 'other',
  openAfterSave: true,
};
const KNOWN_APP_URLS = ['https://hatai.io.vn', 'http://127.0.0.1:3004', 'http://localhost:3004'];

const sentThisSession = new Map();

function cleanBase(value) {
  return String(value || DEFAULTS.apiBase).trim().replace(/\/+$/, '') || DEFAULTS.apiBase;
}

function cleanUrlBase(value, fallback = DEFAULTS.appUrl) {
  return String(value || fallback).trim().replace(/\/+$/, '') || fallback;
}

function toUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function companionLocalOrigin(origin) {
  const parsed = toUrl(origin);
  if (!parsed) return '';
  if (parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
    return parsed.origin;
  }
  if (parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1';
    return parsed.origin;
  }
  return '';
}

function appOrigins(settings) {
  const origins = new Set();
  [settings.appUrl, ...KNOWN_APP_URLS].forEach(value => {
    const parsed = toUrl(cleanUrlBase(value));
    if (!parsed) return;
    origins.add(parsed.origin);
    const companion = companionLocalOrigin(parsed.origin);
    if (companion) origins.add(companion);
  });
  return origins;
}

function normalizeYoutubeId(value = '') {
  const match = String(value).match(/[A-Za-z0-9_-]{6,}/);
  return match ? match[0] : '';
}

function getYoutubeId(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return '';
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') return normalizeYoutubeId(url.pathname.split('/').filter(Boolean)[0]);
  if (!host.endsWith('youtube.com')) return '';

  const fromQuery = normalizeYoutubeId(url.searchParams.get('v') || '');
  if (fromQuery) return fromQuery;

  const parts = url.pathname.split('/').filter(Boolean);
  if (['embed', 'shorts', 'live'].includes(parts[0])) return normalizeYoutubeId(parts[1]);
  return '';
}

function cleanTitle(value, id) {
  return String(value || '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim()
    || `YouTube ${id}`;
}

function buildPayload({ url, title }) {
  const id = getYoutubeId(url);
  if (!id) throw new Error('Tab hiện tại không phải video YouTube');
  const openUrl = `https://www.youtube.com/watch?v=${id}`;
  return {
    title: cleanTitle(title, id),
    input: url,
    src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
    open_url: openUrl,
    video_type: 'youtube',
    category: 'other',
    source_lang: '',
    reset_progress: true,
  };
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: cleanBase(stored.apiBase),
    appUrl: normalizeAppUrl(stored.appUrl || DEFAULTS.appUrl),
    token: String(stored.token || DEFAULTS.token).trim() || DEFAULTS.token,
    category: String(stored.category || DEFAULTS.category).trim() || DEFAULTS.category,
    openAfterSave: stored.openAfterSave !== false,
  };
}

function normalizeAppUrl(value) {
  const cleaned = cleanUrlBase(value);
  const parsed = toUrl(cleaned);
  if (!parsed) return DEFAULTS.appUrl;
  if (['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.port === '3004') {
    return DEFAULTS.appUrl;
  }
  return cleaned;
}

function videoTabUrl(appUrl, video) {
  const url = new URL(cleanUrlBase(appUrl));
  url.searchParams.set('view', 'entertainment');
  url.searchParams.set('entertainment_tab', 'video');
  url.searchParams.set('from', 'youtube-extension');
  if (video?.id != null) url.searchParams.set('video_id', String(video.id));
  url.searchParams.set('t', String(Date.now()));
  return url.toString();
}

async function readTabState(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        hasToken: Boolean(localStorage.getItem('token')),
        signedOut: localStorage.getItem('hagent_signed_out') === '1',
        view: localStorage.getItem('hagent_view') || '',
        entertainmentTab: localStorage.getItem('hagent_entertainment_tab') || '',
      }),
    });
    return injection?.result || {};
  } catch {
    return {};
  }
}

async function findHAgentTab(settings) {
  const origins = appOrigins(settings);
  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter(tab => {
    const parsed = toUrl(tab.url || '');
    return parsed && origins.has(parsed.origin);
  });
  const scored = [];
  for (const tab of candidates) {
    const parsed = toUrl(tab.url || '');
    const state = await readTabState(tab.id);
    let score = 0;
    if (state.hasToken && !state.signedOut) score += 1000;
    if (state.view === 'entertainment') score += 20;
    if (state.entertainmentTab === 'video') score += 20;
    if (parsed?.origin === 'https://hatai.io.vn') score += 50;
    if (parsed?.origin === toUrl(settings.appUrl)?.origin) score += 10;
    if (/HAgent/i.test(tab.title || '')) score += 5;
    if (tab.active) score += 2;
    scored.push({ tab, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0));
  return scored[0]?.tab || null;
}

async function openHAgentVideoTab(settings, video) {
  const existing = await findHAgentTab(settings);
  if (existing?.id) {
    const parsed = toUrl(existing.url || '');
    const targetUrl = videoTabUrl(parsed?.origin || settings.appUrl, video);
    await chrome.tabs.update(existing.id, { active: true, url: targetUrl });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: videoTabUrl(settings.appUrl, video), active: true });
}

async function saveYoutubeVideo(input, options = {}) {
  const settings = await getSettings();
  const payload = buildPayload(input);
  payload.category = settings.category;

  const key = payload.src;
  if (options.once && sentThisSession.has(key)) {
    const video = sentThisSession.get(key);
    if (settings.openAfterSave) await openHAgentVideoTab(settings, video);
    return { ok: true, skipped: true, title: video?.title || payload.title, video };
  }

  const res = await fetch(`${settings.apiBase}/api/entertainment/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HAgent HTTP ${res.status}`);
  sentThisSession.set(key, data.video || payload);
  if (settings.openAfterSave) await openHAgentVideoTab(settings, data.video || payload);
  return { ok: true, title: data.video?.title || payload.title, video: data.video };
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw new Error('Không đọc được tab hiện tại');
  await pauseTabPlayback(tab.id);
  return saveYoutubeVideo({ url: tab.url, title: tab.title || '' }, { once: false });
}

async function pauseTabPlayback(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll('video').forEach(video => {
          try {
            video.pause();
          } catch {}
        });
      },
    });
  } catch {}
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  await chrome.storage.sync.set({ ...DEFAULTS, ...stored, appUrl: normalizeAppUrl(stored.appUrl) });
});

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: title,
    message: message,
    priority: 2
  });
}

async function syncPlatformCookie(platform) {
  try {
    const settings = await getSettings();
    const targetUrl = platform === 'facebook' ? 'https://www.facebook.com' : 'https://chat.zalo.me';
    
    // 1. Get cookies
    const cookies = await new Promise((resolve) => {
      chrome.cookies.getAll({ url: targetUrl }, (cookiesList) => {
        resolve(cookiesList);
      });
    });

    if (!cookies || cookies.length === 0) {
      throw new Error(`Không tìm thấy cookie nào của ${platform === 'facebook' ? 'Facebook' : 'Zalo'}. Hãy mở tab đăng nhập trước.`);
    }

    // Check required cookies
    const cookieMap = {};
    cookies.forEach(c => {
      cookieMap[c.name] = c.value;
    });

    if (platform === 'facebook' && (!cookieMap.c_user || !cookieMap.xs)) {
      throw new Error('Thiếu cookie c_user hoặc xs. Hãy đăng nhập lại Facebook.');
    }
    if (platform === 'zalo' && !cookieMap.PHPSESSID) {
      throw new Error('Thiếu cookie PHPSESSID. Hãy đăng nhập lại Zalo.');
    }

    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // 2. Resolve HAgent JWT Token
    let jwtToken = settings.token;
    if (!jwtToken || jwtToken === 'hat') { // 'hat' is the default
      // Try to read from open HAgent tab
      const existing = await findHAgentTab(settings);
      if (existing?.id) {
        try {
          const [injection] = await chrome.scripting.executeScript({
            target: { tabId: existing.id },
            func: () => localStorage.getItem('token') || '',
          });
          if (injection?.result) {
            jwtToken = injection.result;
          }
        } catch (err) {
          console.warn('Lỗi đọc token tự động:', err);
        }
      }
    }

    if (!jwtToken) {
      throw new Error('Không tìm thấy token HAgent. Hãy đăng nhập vào HAgent Web trước hoặc cấu hình trong Settings của extension.');
    }

    // 3. Send to API
    const response = await fetch(`${settings.apiBase}/api/omni/connect/${platform}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ cookie: cookieStr })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || `Lỗi API HTTP ${response.status}`);
    }

    showNotification(
      `HAgent - Đồng bộ ${platform === 'facebook' ? 'Facebook' : 'Zalo'}`,
      `Đồng bộ Cookie ${platform === 'facebook' ? 'Facebook' : 'Zalo'} thành công! Listener đã khởi chạy.`
    );
  } catch (err) {
    showNotification(
      'HAgent - Lỗi đồng bộ',
      `Lỗi: ${err.message}`
    );
  }
}

chrome.action.onClicked.addListener(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showNotification('HAgent', 'Không đọc được thông tin tab hiện tại.');
      return;
    }

    const host = new URL(tab.url).hostname.replace(/^www\./, '').toLowerCase();

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      saveActiveTab().then(result => {
        if (result.ok && !result.skipped) {
          showNotification('HAgent YouTube', `Đã gửi video: ${result.title}`);
        }
      }).catch(err => {
        showNotification('HAgent YouTube', `Lỗi: ${err.message}`);
      });
    } else if (host.includes('facebook.com') || host.includes('messenger.com')) {
      await syncPlatformCookie('facebook');
    } else if (host.includes('zalo.me')) {
      await syncPlatformCookie('zalo');
    } else {
      showNotification('HAgent', 'Tiện ích chỉ hỗ trợ gửi video YouTube hoặc đồng bộ Cookie trên trang Facebook/Messenger và Zalo.');
    }
  } catch (err) {
    showNotification('HAgent Error', err.message);
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'save-active-tab') return saveActiveTab();
    if (message?.type === 'save-youtube-url') {
      if (message.auto) return { ok: true, skipped: true };
      return saveYoutubeVideo({
        url: message.url || sender.tab?.url || '',
        title: message.title || sender.tab?.title || '',
      }, { once: Boolean(message.auto) });
    }
    if (message?.type === 'get-settings') return getSettings();
    throw new Error('Lệnh extension không hợp lệ');
  })()
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
