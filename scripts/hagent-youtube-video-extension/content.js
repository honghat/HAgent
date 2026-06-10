const ROOT_ID = 'hagent-youtube-video-root';
const LOGO_URL = chrome.runtime.getURL('icon-128.png');

let root = null;
let button = null;
let label = null;
let lastWatchUrl = '';
let busy = false;

function isWatchUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return parsed.pathname.length > 1;
    if (!host.endsWith('youtube.com')) return false;
    return parsed.pathname === '/watch' && parsed.searchParams.has('v');
  } catch {
    return false;
  }
}

function ensureWidget() {
  if (root && button && label) return;
  if (!document.documentElement) {
    window.setTimeout(ensureWidget, 150);
    return;
  }

  document.getElementById(ROOT_ID)?.remove();
  root = document.createElement('div');
  root.id = ROOT_ID;
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .send {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 48px;
        min-width: 136px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        padding: 0 18px 0 10px;
        color: #fff;
        background: linear-gradient(135deg, #0b1020, #1b2437 58%, #0f766e);
        box-shadow: 0 18px 48px rgba(2, 6, 23, 0.3), 0 4px 14px rgba(15, 118, 110, 0.24);
        cursor: pointer;
        outline: none;
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        user-select: none;
      }
      .send:hover {
        transform: translateY(-1px);
        box-shadow: 0 24px 60px rgba(2, 6, 23, 0.34), 0 6px 18px rgba(15, 118, 110, 0.28);
        filter: saturate(1.06);
      }
      .send:active { transform: translateY(0) scale(0.98); }
      .send:focus-visible { box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.26), 0 24px 60px rgba(2, 6, 23, 0.34); }
      .mark {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        overflow: hidden;
        background: #fff;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 2px 8px rgba(2, 6, 23, 0.24);
      }
      .mark img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .label {
        color: #fff;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0;
        white-space: nowrap;
      }
      .send[data-state="loading"] {
        cursor: wait;
        background: linear-gradient(135deg, #111827, #334155);
      }
      .send[data-state="success"] {
        background: linear-gradient(135deg, #064e3b, #059669);
      }
      .send[data-state="error"] {
        background: linear-gradient(135deg, #7f1d1d, #dc2626);
      }
      .send[data-state="loading"] .mark {
        animation: pulse 900ms ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.62; transform: scale(0.92); }
      }
      @media (max-width: 640px) {
        :host {
          right: 14px;
          bottom: 84px;
        }
        .send {
          height: 44px;
          min-width: 116px;
          padding-right: 14px;
        }
        .mark {
          width: 30px;
          height: 30px;
          font-size: 14px;
        }
        .label {
          font-size: 12px;
        }
      }
    </style>
    <button class="send" type="button" title="Gửi video này sang HAgent" aria-label="Gửi video này sang HAgent">
      <span class="mark"><img src="${LOGO_URL}" alt=""></span>
      <span class="label">Gửi HAgent</span>
    </button>
  `;
  document.documentElement.appendChild(root);
  button = shadow.querySelector('.send');
  label = shadow.querySelector('.label');
  button.addEventListener('click', sendCurrentVideo);
  updateWidget();
}

function setState(state, text, title = '') {
  if (!button || !label) return;
  button.dataset.state = state;
  label.textContent = text;
  button.title = title || 'Gửi video này sang HAgent';
  button.setAttribute('aria-label', button.title);
}

function updateWidget() {
  ensureWidget();
  const currentUrl = location.href;
  const visible = isWatchUrl(currentUrl);
  root.style.display = visible ? 'block' : 'none';
  if (visible && currentUrl !== lastWatchUrl) {
    lastWatchUrl = currentUrl;
    busy = false;
    setState('ready', 'Gửi HAgent');
  }
}

function sendCurrentVideo(event) {
  event?.preventDefault();
  event?.stopPropagation();
  if (busy) return;
  const url = location.href;
  if (!isWatchUrl(url)) {
    setState('error', 'Không phải video', 'Mở một video YouTube rồi bấm lại');
    return;
  }

  busy = true;
  pauseYoutubePlayback();
  setState('loading', 'Đang gửi', 'Đang gửi video sang HAgent');
  chrome.runtime.sendMessage({
    type: 'save-youtube-url',
    auto: false,
    url,
    title: document.title || '',
  }, result => {
    busy = false;
    if (chrome.runtime.lastError) {
      setState('error', 'Lỗi', chrome.runtime.lastError.message);
      return;
    }
    if (!result?.ok) {
      setState('error', 'Lỗi', result?.error || 'Không gửi được video');
      return;
    }
    setState('success', 'Đã gửi', result.video?.title || result.title || 'Đã gửi sang HAgent');
    window.setTimeout(() => {
      if (!busy && location.href === url) setState('ready', 'Gửi HAgent');
    }, 2200);
  });
}

function pauseYoutubePlayback() {
  document.querySelectorAll('video').forEach(video => {
    try {
      video.pause();
    } catch {}
  });
}

function scheduleUpdate() {
  window.setTimeout(updateWidget, 120);
}

const pushState = history.pushState;
history.pushState = function patchedPushState(...args) {
  const result = pushState.apply(this, args);
  scheduleUpdate();
  return result;
};

const replaceState = history.replaceState;
history.replaceState = function patchedReplaceState(...args) {
  const result = replaceState.apply(this, args);
  scheduleUpdate();
  return result;
};

window.addEventListener('popstate', scheduleUpdate);
window.addEventListener('yt-navigate-finish', scheduleUpdate);
ensureWidget();
