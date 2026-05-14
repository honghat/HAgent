import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export const webRouter = Router();
webRouter.use(requireAuth);

// Search DuckDuckGo (no API key needed)
webRouter.get('/web/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Query required' });

    // Use DuckDuckGo lite/HTML endpoint
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HAgent/1.0)' },
    });
    const html = await response.text();

    // Parse results from HTML
    const results = [];
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>(.*?)<\/a>/gi;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/gi;
    const urlRegex = /<span[^>]*class="result-url"[^>]*>(.*?)<\/span>/gi;

    // Alternative parsing - simpler regex
    const rows = html.split('<tr>');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const titleMatch = row.match(/class="result-link"[^>]*>\s*(.*?)\s*<\/a>/i);
      const snippetMatch = row.match(/class="result-snippet"[^>]*>\s*(.*?)\s*<\/td>/i);
      const urlMatch = row.match(/class="result-url"[^>]*>\s*(.*?)\s*<\/span>/i);

      if (titleMatch && urlMatch) {
        results.push({
          title: titleMatch[1].replace(/<[^>]*>/g, '').trim(),
          url: urlMatch[1].replace(/<[^>]*>/g, '').trim(),
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '',
        });
      }
    }

    res.json({ query: q, results: results.slice(0, 10) });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch a URL and extract text content
webRouter.post('/web/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HAgent/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();

    // Extract text content (strip HTML tags)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    res.json({ url, text });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});
