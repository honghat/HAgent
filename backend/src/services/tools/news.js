// VnExpress news
export async function fetchVnExpress() {
  try {
    const res = await fetch('https://vnexpress.net/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const articles = [];
    const seenUrls = new Set();
    const blocks = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
    for (const block of blocks) {
      const titleLink = block.match(/<a[^>]*href="(https:\/\/vnexpress\.net\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleLink) continue;
      const url = titleLink[1];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      const titleRaw = titleLink[2].replace(/<[^>]*>/g, '').trim();
      if (!titleRaw || titleRaw.length < 10) continue;
      const desc = block.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = desc ? desc[1].replace(/<[^>]*>/g, '').trim() : '';
      let category = '';
      const catMatch = block.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (catMatch) category = catMatch[1].replace(/<[^>]*>/g, '').trim();
      articles.push({ title: titleRaw, url, snippet, category });
      if (articles.length >= 20) break;
    }
    if (!articles.length) {
      const links = html.match(/<a[^>]*href="https:\/\/vnexpress\.net\/[^"]+"[^>]*>[\s\S]*?<\/a>/gi) || [];
      for (const link of links) {
        const urlMatch = link.match(/href="(https:\/\/vnexpress\.net\/[^"]+)"/i);
        const text = link.replace(/<[^>]*>/g, '').trim();
        if (!urlMatch || !text || text.length < 15 || seenUrls.has(urlMatch[1])) continue;
        seenUrls.add(urlMatch[1]);
        articles.push({ title: text, url: urlMatch[1], snippet: '' });
        if (articles.length >= 15) break;
      }
    }
    if (!articles.length) return 'Không thể lấy tin tức từ VnExpress.';
    return articles.map((a, i) =>
      `${i + 1}. **${a.title}**${a.category ? ` [${a.category}]` : ''}\n   ${a.url}${a.snippet ? `\n   ${a.snippet}` : ''}`
    ).join('\n\n');
  } catch { return 'Không thể lấy tin tức từ VnExpress.'; }
}

// Dân trí news
export async function fetchDanTri() {
  try {
    const res = await fetch('https://dantri.com.vn/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const articles = [];
    const seenUrls = new Set();
    const links = html.match(/<a[^>]*href="(https:\/\/dantri\.com\.vn\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
    for (const link of links) {
      const urlMatch = link.match(/href="(https:\/\/dantri\.com\.vn\/[^"]+)"/i);
      const text = link.replace(/<[^>]*>/g, '').trim();
      if (!urlMatch || !text || text.length < 15 || seenUrls.has(urlMatch[1])) continue;
      seenUrls.add(urlMatch[1]);
      articles.push({ title: text, url: urlMatch[1] });
      if (articles.length >= 20) break;
    }
    if (!articles.length) return 'Không thể lấy tin tức từ Dân trí.';
    return articles.map((a, i) => `${i + 1}. **${a.title}**\n   ${a.url}`).join('\n\n');
  } catch { return 'Không thể lấy tin tức từ Dân trí.'; }
}
