const token = process.env.TELEGRAM_BOT_TOKEN;

async function callTelegramAPI(method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function check() {
  console.log('Checking current commands...');
  const result = await callTelegramAPI('getMyCommands', {});
  console.log('Current commands:', JSON.stringify(result, null, 2));
}

check();
