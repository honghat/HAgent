import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const WIKI_DIR = join(__dirname, '..', '..', '..', 'data', 'wiki');
export const getUserWikiDir = (userId) => userId ? join(WIKI_DIR, userId) : WIKI_DIR;

const STOP_WORDS = new Set([
  'là','của','và','có','trong','được','không',
  'cho','với','từ','đến','này','các','những',
  'the','is','a','an','of','in','to','for',
]);

export function removeDiacritics(str) {
  return str.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function tokenize(text) {
  return text.toLowerCase()
    .split(/[\s\-_\/]+/)
    .map(t => t.replace(/[^\wàáâãèéêìíòóôõùúăđĩũơưạ-ỹ]/gi, ''))
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

export function getWikiFiles(dir = WIKI_DIR) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...getWikiFiles(full));
      else if (entry.name.endsWith('.md')) files.push(full);
    }
    return files;
  } catch {
    return [];
  }
}

export function searchIdentity(wikiDir) {
  const dir = wikiDir || WIKI_DIR;
  const files = getWikiFiles(dir);
  const results = [];

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const frontmatter = fmMatch[1];
    const relative = file.startsWith(dir) ? file.slice(dir.length + 1) : file;

    const hasUserIdentity =
      /người dùng/i.test(frontmatter) ||
      /summary.*tên/i.test(frontmatter) ||
      /summary.*user/i.test(frontmatter) ||
      /title.*cá nhân/i.test(frontmatter) ||
      /title.*thông tin/i.test(frontmatter) ||
      relative.startsWith('gia-dinh/') ||
      /cá nhân|họ và tên|xưng hô|thông tin.*bản thân/i.test(raw.slice(0, 500));

    if (hasUserIdentity) {
      const title = frontmatter.match(/title:\s*"([^"]+)"/)?.[1] || relative;
      const summary = frontmatter.match(/summary:\s*"([^"]+)"/)?.[1] || '';
      const content = raw.replace(/^---[\s\S]*?---\n/, '').trim();
      results.push({ file: relative, title, summary, content });
    }
  }

  if (!results.length) return '';
  const scored = results.map(r => {
    let score = 0;
    const hasName = /tên|họ và tên|xưng hô/i.test(r.content + r.summary);
    if (hasName) score += 10;
    // Identity entry with "cá nhân" in title is much more likely to be about the user
    if (/cá nhân/i.test(r.title)) score += 50;
    score += 3;
    return { ...r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) return '';
  const snippet = best.content.split('\n').slice(0, 10).join('\n').trim();
  return `📄 **${best.title}**\n${best.summary}\n\n${snippet}`;
}
