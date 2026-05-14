import * as cheerio from 'cheerio';
import { KNOWN_JOB_DOMAINS } from './terms.js';
import { normalizeText } from './utils.js';

export function decodeDuckDuckGoUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
    const uddg = parsed.searchParams.get('uddg');
    const encoded = parsed.searchParams.get('u');
    if (encoded) {
      try { return Buffer.from(encoded, 'base64').toString('utf8'); } catch {}
    }
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch {
    return url.replace(/^\/\//, 'https://');
  }
}

export function matchesDomain(url, domain) {
  try { return new URL(url).hostname.replace(/^www\./, '').endsWith(domain); } catch { return false; }
}

export function getSourceName(url) {
  return KNOWN_JOB_DOMAINS.find(site => matchesDomain(url, site.domain))?.name || 'Job URL';
}

function absoluteUrl(href, baseUrl) {
  try { return new URL(href, baseUrl).href; } catch { return ''; }
}

export function isLikelyJobUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathname = parsed.pathname.toLowerCase();
    if (host.endsWith('itviec.com')) return /\/viec-lam-it\/.+-\d+$/.test(pathname) || /\/it-jobs\/.+-\d+$/.test(pathname);
    if (host.endsWith('topcv.vn')) return /\/viec-lam\/.+-\d+\.html$/.test(pathname);
    if (host.endsWith('careerviet.vn')) {
      if (!/\/viec-lam\/.+\.html$/.test(pathname)) return false;
      if (!/-[a-z]{2,}\d+\.html$/.test(pathname)) return false;
      return !(/-k[a-z0-9]*-vi\.html$|c\d+(l\d+)?-vi\.html$|tat-ca-viec-lam-vi\.html$|\/0-viec-lam|theo-tieu-chi-phu/.test(pathname));
    }
    if (host.endsWith('vietnamworks.com')) return /\/viec-lam\/.+/.test(pathname) && !parsed.searchParams.get('q');
    if (host.endsWith('linkedin.com')) return /\/jobs\/view\//.test(pathname);
    return false;
  } catch { return false; }
}

export function extractUrls(value) {
  return String(value || '').match(/https?:\/\/[^\s,]+/g) || [];
}

function extractFreshness(text) {
  const clean = normalizeText(text);
  const lower = clean.toLowerCase();
  let daysOld = null;
  let postedAt = '';
  let freshnessLabel = 'Không rõ ngày đăng';

  const relative = lower.match(/(\d+)\s*(phút|giờ|ngày|tuần)\s*trước/);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2];
    if (unit === 'phút' || unit === 'giờ') daysOld = 0;
    if (unit === 'ngày') daysOld = n;
    if (unit === 'tuần') daysOld = n * 7;
    freshnessLabel = relative[0];
  } else if (/hôm nay|today|vừa đăng|mới đăng/.test(lower)) {
    daysOld = 0;
    freshnessLabel = 'Hôm nay';
  } else {
    const dateMatch = clean.match(/(?:ngày đăng|đăng tuyển|cập nhật|posted|updated)\D{0,20}(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i)
      || clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (dateMatch) {
      const [, d, m, y] = dateMatch;
      const posted = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(posted.getTime())) {
        daysOld = Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86400000));
        postedAt = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        freshnessLabel = postedAt;
      }
    }
  }

  const freshnessScore = daysOld === null ? 35 : daysOld <= 1 ? 100 : daysOld <= 3 ? 88 : daysOld <= 7 ? 72 : daysOld <= 14 ? 50 : 25;
  return { daysOld, postedAt, freshnessLabel, freshnessScore };
}

async function fetchHtml(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchJobContent(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, iframe, header, footer, nav').remove();
    const title = normalizeText($('h1').first().text() || $('title').first().text());
    const text = normalizeText($('main').text() || $('body').text()).slice(0, 12000);
    return { title, text, ok: text.length > 200, ...extractFreshness(text) };
  } catch (err) {
    return { title: '', text: '', ok: false, error: err.message };
  }
}

export async function extractJobLinksFromListing(url, limit = 8) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const seen = new Set();
    const links = [];

    $('a[href]').each((_, el) => {
      const fullUrl = absoluteUrl($(el).attr('href'), url).replace(/[?#]utm_[^#]+/, '');
      if (!fullUrl || !isLikelyJobUrl(fullUrl)) return;
      const title = normalizeText($(el).text());
      if (/^0 việc làm|theo tiêu chí phụ|mức lương|ngành nghề|tỉnh, thành phố/i.test(title)) return;
      const key = fullUrl.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ title: title || `Tin tuyển dụng trên ${getSourceName(fullUrl)}`, url: fullUrl, source: getSourceName(fullUrl), snippet: '', discovered: true });
    });

    return links.slice(0, limit);
  } catch { return []; }
}

export async function searchDuckDuckGo(query) {
  const res = await fetch('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HAgent/1.0)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12000),
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $('a.result-link').each((_, el) => {
    const link = $(el);
    const row = link.closest('tr');
    const nextRows = row.nextAll('tr').slice(0, 3);
    results.push({
      title: normalizeText(link.text()),
      url: decodeDuckDuckGoUrl(link.attr('href') || nextRows.find('.result-url, .link-text').first().text().trim()),
      snippet: normalizeText(nextRows.find('.result-snippet').first().text().trim()),
    });
  });

  return results.filter(r => r.title && r.url).slice(0, 8);
}
