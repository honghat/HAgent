/**
 * Web search with multi-engine fallback:
 * 1. DuckDuckGo HTML (no API key required)
 * 2. Brave Search API (if BRAVE_API_KEY configured)
 * 3. SearXNG (if SEARXNG_URL configured)
 */
export async function webSearch(query) {
  // Try DuckDuckGo first
  try {
    const ddgResult = await searchDuckDuckGo(query);
    if (ddgResult && !ddgResult.startsWith('Lỗi') && ddgResult.length > 50) {
      return ddgResult;
    }
  } catch { /* fall through */ }

  // Fallback: Brave Search API
  const braveKey = process.env.BRAVE_API_KEY;
  if (braveKey) {
    try {
      const braveResult = await searchBrave(query, braveKey);
      if (braveResult && braveResult.length > 50) return braveResult;
    } catch { /* fall through */ }
  }

  // Fallback: SearXNG
  const searxUrl = process.env.SEARXNG_URL;
  if (searxUrl) {
    try {
      const searxResult = await searchSearXNG(query, searxUrl);
      if (searxResult && searxResult.length > 50) return searxResult;
    } catch { /* fall through */ }
  }

  return 'Không tìm thấy kết quả. Thử fetch_url với URL cụ thể.';
}

async function searchDuckDuckGo(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    const html = await res.text();
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const results = [];
    let current = {};
    for (const row of rows) {
      const link = row.match(/class='result-link'[^>]*>\s*(.*?)\s*<\/a>/i);
      const snippet = row.match(/class='result-snippet'[^>]*>\s*(.*?)\s*<\/td>/i);
      const url = row.match(/class='link-text'[^>]*>\s*(.*?)\s*<\/span>/i);
      if (link) {
        if (current.title) results.push(current);
        current = { title: link[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim(), url: '', snippet: '' };
      }
      if (snippet && current.title) current.snippet = snippet[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      if (url && current.title) current.url = url[1].replace(/<[^>]*>/g, '').trim();
    }
    if (current.title) results.push(current);
    if (results.length === 0) return 'Lỗi: Không có kết quả DDG.';
    return results.slice(0, 8).map((r, i) => `${i + 1}. **${r.title}**\n   🔗 ${r.url}\n   ${r.snippet}`).join('\n\n');
  } finally {
    clearTimeout(timer);
  }
}

async function searchBrave(query, apiKey) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&search_lang=vi`, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  const items = data.web?.results || [];
  return items.slice(0, 8).map((r, i) =>
    `${i + 1}. **${r.title}**\n   🔗 ${r.url}\n   ${r.description || ''}`
  ).join('\n\n');
}

async function searchSearXNG(query, baseUrl) {
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&language=vi`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  return (data.results || []).slice(0, 8).map((r, i) =>
    `${i + 1}. **${r.title}**\n   🔗 ${r.url}\n   ${r.content || ''}`
  ).join('\n\n');
}

export async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!res.ok) return `Lỗi HTTP ${res.status} khi đọc ${url}`;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return `Không thể đọc file loại ${contentType} từ ${url}`;
    }

    const html = await res.text();

    // Try to extract main content first (article, main, #content, .content)
    const mainMatch = html.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i)
      || html.match(/<div[^>]+(?:id|class)="[^"]*(?:content|article|post|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const source = mainMatch ? mainMatch[1] : html;

    return source
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } catch (e) {
    return e.name === 'AbortError' ? 'Timeout: Trang web phản hồi quá chậm.' : `Không thể đọc trang web: ${e.message}`;
  } finally {
    clearTimeout(timer);
  }
}

