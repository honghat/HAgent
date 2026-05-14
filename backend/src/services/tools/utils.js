export function calculate({ expression }) {
  try {
    const sanitized = expression.replace(/\s+/g, '');
    if (!/^[\d+\-*/().,%^]+$/.test(sanitized)) {
      return 'Chỉ hỗ trợ biểu thức toán học cơ bản (+, -, *, /, %, ^, ()).';
    }
    const result = Function(`'use strict'; return (${expression})`)();
    return `Kết quả: ${result}`;
  } catch {
    return 'Biểu thức không hợp lệ.';
  }
}

export function getTime() {
  const now = new Date();
  return [
    `Thời gian hiện tại (Hà Nội): ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    `Thứ: ${now.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' })}`,
    `Ngày: ${now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    `Timestamp: ${now.getTime()}`,
    `Múi giờ: Asia/Ho_Chi_Minh (UTC+7)`,
  ].join('\n');
}

export async function translateText({ text, toLang }) {
  try {
    const langMap = { vi: 'vi', en: 'en', zh: 'zh', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', es: 'es', ru: 'ru', th: 'th' };
    const target = langMap[toLang.toLowerCase()];
    if (!target) return `Ngôn ngữ không hỗ trợ: ${toLang}. Hỗ trợ: ${Object.keys(langMap).join(', ')}`;
    const res = await fetch(
      `https://lingva.ml/api/v1/auto/${target}/${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return 'Không thể dịch.';
    const data = await res.json();
    return `Bản dịch (→ ${toLang.toUpperCase()}): ${data.translation}`;
  } catch {
    return 'Không thể dịch văn bản.';
  }
}

export async function getDefinition({ word }) {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return `Không tìm thấy từ "${word}".`;
    const data = await res.json();
    const phonetics = data[0]?.phonetics?.[0]?.text ? `Phiên âm: ${data[0].phonetics[0].text}` : '';
    const meanings = (data[0]?.meanings || []).map(m =>
      `**${m.partOfSpeech}**: ${m.definitions.slice(0, 2).map(d => d.definition).join('; ')}`
    ).join('\n');
    return [phonetics, meanings].filter(Boolean).join('\n');
  } catch {
    return 'Không thể tra từ điển.';
  }
}

export async function getIpInfo({ ip } = {}) {
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip || '')}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'Không thể tra cứu IP.';
    const data = await res.json();
    if (data.status === 'fail') return `Không tìm thấy thông tin${ip ? ` cho IP: ${ip}` : ''}.`;
    return [
      `📍 Thông tin${ip ? ` IP ${ip}` : ' IP của bạn'}:`,
      `- IP: ${data.query}`,
      `- Vị trí: ${data.city}, ${data.regionName}, ${data.country}`,
      `- ISP: ${data.isp}`,
      `- Tọa độ: ${data.lat}, ${data.lon}`,
      data.org ? `- Tổ chức: ${data.org}` : '',
    ].filter(Boolean).join('\n');
  } catch {
    return 'Không thể tra cứu IP.';
  }
}

export function generateUuid({ count = 1 } = {}) {
  const crypto = {
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }),
  };
  const ids = Array.from({ length: Math.min(count || 1, 10) }, () => crypto.randomUUID());
  return ids.join('\n');
}

export async function hashText({ text, algorithm = 'sha256' }) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const algoMap = { sha256: 'SHA-256', sha1: 'SHA-1', sha512: 'SHA-512' };
  const algo = algoMap[algorithm.toLowerCase()];
  if (!algo) return `Hỗ trợ: ${Object.keys(algoMap).join(', ')}`;
  try {
    const hashBuffer = await crypto.subtle.digest(algo, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return `${algorithm.toUpperCase()}: ${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    let hash = 0;
    for (let i = 0; i < text.length; i++) { const chr = text.charCodeAt(i); hash = ((hash << 5) - hash) + chr; hash |= 0; }
    return `Hash (simple): ${Math.abs(hash).toString(16)}`;
  }
}

export function formatJson({ json, action = 'format' }) {
  try {
    const parsed = JSON.parse(json);
    if (action === 'minify') return JSON.stringify(parsed);
    if (action === 'validate') return '✅ JSON hợp lệ.';
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    return `❌ JSON không hợp lệ: ${e.message}`;
  }
}

export function unitConvert({ value, from, to, type = 'length' }) {
  const conversions = {
    length: { m: 1, km: 0.001, cm: 100, mm: 1000, mile: 0.000621371, yard: 1.09361, foot: 3.28084, inch: 39.3701 },
    weight: { kg: 1, g: 1000, mg: 1e6, lb: 2.20462, oz: 35.274, ton: 0.001 },
    temp: {},
    area: { m2: 1, km2: 1e-6, ha: 1e-4, acre: 0.000247105, ft2: 10.7639 },
    volume: { l: 1, ml: 1000, m3: 0.001, gal: 0.264172, qt: 1.05669, cup: 4.22675 },
  };
  if (type === 'temp') {
    const val = parseFloat(value);
    const f = from.toLowerCase(); const t = to.toLowerCase();
    let celsius;
    if (f === 'c') celsius = val;
    else if (f === 'f') celsius = (val - 32) * 5 / 9;
    else if (f === 'k') celsius = val - 273.15;
    else return 'Hỗ trợ: C (Celsius), F (Fahrenheit), K (Kelvin)';
    let result;
    if (t === 'c') result = celsius;
    else if (t === 'f') result = celsius * 9 / 5 + 32;
    else if (t === 'k') result = celsius + 273.15;
    else return 'Hỗ trợ: C, F, K';
    return `${value}°${from.toUpperCase()} = ${result.toFixed(2)}°${to.toUpperCase()}`;
  }
  const units = conversions[type];
  if (!units) return `Hỗ trợ: ${Object.keys(conversions).join(', ')}`;
  const fromUnit = Object.keys(units).find(u => u === from.toLowerCase());
  const toUnit = Object.keys(units).find(u => u === to.toLowerCase());
  if (!fromUnit) return `Đơn vị không hợp lệ: ${from}`;
  if (!toUnit) return `Đơn vị không hợp lệ: ${to}`;
  const inBase = parseFloat(value) / units[fromUnit];
  const result = inBase * units[toUnit];
  return `${value} ${fromUnit} = ${result.toFixed(6)} ${toUnit}`;
}

export function randomNumber({ min = 0, max = 100, count = 1 } = {}) {
  const n = Math.min(count || 1, 20);
  const nums = Array.from({ length: n }, () => Math.floor(Math.random() * (parseFloat(max) - parseFloat(min) + 1)) + parseFloat(min));
  return nums.length === 1 ? `${nums[0]}` : `Số ngẫu nhiên: ${nums.join(', ')}`;
}

export function encodeDecode({ text, action, encoding = 'base64' }) {
  if (encoding === 'base64') {
    if (action === 'encode') return Buffer.from(text).toString('base64');
    if (action === 'decode') return Buffer.from(text, 'base64').toString('utf8');
  }
  if (encoding === 'url') {
    if (action === 'encode') return encodeURIComponent(text);
    if (action === 'decode') return decodeURIComponent(text);
  }
  return 'Hỗ trợ: base64, url. Action: encode, decode.';
}

export function passwordGenerate({ length = 16, includeSymbols = true } = {}) {
  const len = Math.min(Math.max(parseInt(length) || 16, 8), 64);
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+-=';
  let chars = upper + lower + digits;
  if (includeSymbols) chars += symbols;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
    + lower[Math.floor(Math.random() * lower.length)]
    + digits[Math.floor(Math.random() * digits.length)];
  if (includeSymbols) pwd += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = pwd.length; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return `Mật khẩu: ${pwd.split('').sort(() => Math.random() - 0.5).join('')}`;
}
