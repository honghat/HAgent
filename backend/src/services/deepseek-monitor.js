const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';
const TELEGRAM_API = 'https://api.telegram.org/bot';
const CHAT_ID = '7782048635';
const ALERT_THRESHOLD = 1.0;
const CHECK_INTERVAL = 60_000; // 1 minute

let lastAlerted = false;
let intervalId = null;

export function startDeepSeekMonitor() {
  if (intervalId) return;
  checkAndAlert(); // Run immediately
  intervalId = setInterval(checkAndAlert, CHECK_INTERVAL);
  console.log('[DeepSeek Monitor] Started — checking every 1 minute');
}

export function stopDeepSeekMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function checkAndAlert() {
  try {
    const key = process.env.DEEPSEEK_API_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!key || !botToken) return;

    const res = await fetch(DEEPSEEK_BALANCE_URL, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.is_available) return;

    const balance = parseFloat(data.balance_infos[0]?.total_balance || 0);

    if (balance < ALERT_THRESHOLD) {
      if (!lastAlerted) {
        const msg = `⚠️ *CẢNH BÁO:* DeepSeek balance còn *$${balance}* — dưới $${ALERT_THRESHOLD}! Cần nạp thêm.`;
        await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' }),
        });
        lastAlerted = true;
        console.log(`[DeepSeek Monitor] Alert sent: $${balance} below $${ALERT_THRESHOLD}`);
      }
    } else {
      lastAlerted = false;
    }
  } catch {
    // Silently ignore transient errors
  }
}
