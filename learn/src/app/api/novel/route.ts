import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/** Scrape thông tin truyện từ truyencv.io */
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  const chapter = searchParams.get('chapter');

  if (!url) return Response.json({ error: 'Missing url' }, { status: 400 });

  try {
    if (chapter) {
      console.log(`[Novel API] Fetching chapter: ${chapter}`);
      return await fetchChapter(chapter);
    } else {
      console.log(`[Novel API] Fetching novel: ${url}`);
      return await fetchNovelInfo(url);
    }
  } catch (e) {
    console.error(`[Novel API] Error:`, e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

async function fetchNovelInfo(url: string) {
  if (!url.startsWith('http')) throw new Error('URL không hợp lệ. Phải bắt đầu bằng http hoặc https');
  
  console.log(`[Novel API] Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Không tải được truyện. Mã lỗi: ${res.status}`);
  const html = await res.text();
  console.log(`[Novel API] HTML loaded (${html.length} chars)`);

  // Trích xuất tên truyện
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s*\|.*$/, '').trim() || 'Truyện';

  // Trích xuất mô tả
  const descMatch = html.match(/og:description['"]\s*content=['"]([^'"]+)/i);
  const description = descMatch?.[1] || '';

  // Trích xuất ảnh bìa
  const imgMatch = html.match(/og:image['"]\s*content=['"]([^'"]+)/i);
  const cover = imgMatch?.[1] || '';

  // Tìm base URL cho slug truyện
  const slugMatch = url.match(/(https?:\/\/[^/]+\/truyen\/[^/]+)/);
  const baseUrl = slugMatch?.[1] || url.replace(/\/$/, '');

  // Tìm tổng số trang chương
  const pageMatch = html.match(/page\/(\d+)\/#chapter-list/g);
  let totalPages = 1;
  if (pageMatch) {
    const nums = pageMatch.map(p => parseInt(p.match(/page\/(\d+)/)?.[1] || '1'));
    totalPages = Math.max(...nums);
  }

  // Trích xuất danh sách chương
  const chapters: { title: string; url: string; num: number }[] = [];
  const seen = new Set<number>();

  // Cách 1: Thử lấy từ JSON-LD (rất chính xác)
  const jsonLdMatch = html.match(/<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const script of jsonLdMatch) {
      try {
        const content = script.replace(/<script[^>]*>|<\/script>/gi, '');
        const data = JSON.parse(content);
        const parts = data.hasPart || (data['@graph']?.find((n: any) => n.hasPart)?.hasPart);
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.url && p.url.includes('/chuong-')) {
              const num = parseInt(p.url.match(/chuong-(\d+)/)?.[1] || '0');
              if (num && !seen.has(num)) {
                seen.add(num);
                chapters.push({ title: p.name || `Chương ${num}`, url: p.url, num });
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  // Cách 2: Regex HTML (dự phòng và lấy thêm)
  const links = html.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"][^>]*>([\s\S]*?)<\/a>/gi);
  if (links) {
    for (const link of links) {
      const m = link.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"][^>]*>([\s\S]*?)<\/a>/i);
      if (m) {
        const num = parseInt(m[2]);
        if (!seen.has(num)) {
          let chTitle = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (chTitle.includes('Chương') || chTitle.includes('Ch-') || /^\d+$/.test(chTitle)) {
            seen.add(num);
            chTitle = chTitle.replace(/^.*?Chương/, 'Chương');
            chapters.push({ title: chTitle, url: m[1], num });
          }
        }
      }
    }
  }

  // Nếu vẫn rỗng, thử bắt mọi link /chuong-X/
  if (chapters.length === 0) {
    const rawLinks = html.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"]/gi);
    if (rawLinks) {
      for (const link of rawLinks) {
        const m = link.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"]/i);
        if (m) {
          const num = parseInt(m[2]);
          if (!seen.has(num)) {
            seen.add(num);
            chapters.push({ title: `Chương ${num}`, url: m[1], num });
          }
        }
      }
    }
  }

  // Nếu không thấy chương 1, thử lấy thêm từ trang cuối cùng (thường chứa chương 1 vì Truyencv sắp xếp mới nhất lên đầu)
  if (!seen.has(1)) {
    try {
      const lastPageUrl = `${baseUrl.replace(/\/$/, '')}/chuong/page/${totalPages}/`;
      console.log(`[Novel API] Fetching last page for Chapter 1: ${lastPageUrl}`);
      const lastRes = await fetch(lastPageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5000),
      });
      if (lastRes.ok) {
        const lastHtml = await lastRes.text();
        const lastLinks = lastHtml.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"]/gi);
        if (lastLinks) {
          for (const link of lastLinks) {
            const m = link.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"]/i);
            if (m) {
              const num = parseInt(m[2]);
              if (!seen.has(num)) {
                seen.add(num);
                chapters.push({ title: `Chương ${num}`, url: m[1], num });
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`[Novel API] Error fetching last page:`, e);
    }
  }

  // Sắp xếp lại theo số chương
  chapters.sort((a, b) => a.num - b.num);

  // Tìm chương đầu tiên
  const firstChapterMatch = html.match(/href=['"]([^'"]*\/chuong-1\/?)['"]/i);
  const firstChapter = firstChapterMatch?.[1] || `${baseUrl}/chuong-1/`;

  console.log(`[Novel API] Success. Found ${chapters.length} chapters.`);
  return Response.json({
    title,
    description,
    cover,
    baseUrl,
    firstChapter,
    totalPages,
    chapters,
    totalChapters: chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) : 0
  });
}

async function fetchChapter(url: string) {
  // Đảm bảo URL đầy đủ
  if (!url.startsWith('http')) {
    url = `https://truyencv.io${url}`;
  }
  
  if (!url.startsWith('http')) throw new Error('URL chương không hợp lệ');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();

  // Trích xuất tiêu đề chương
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch?.[1]?.replace(/\s*–\s*TruyenCV.*$/, '').trim() || '';

  // Trích xuất nội dung chương - tìm trong div.content hoặc div.chapter-content
  let content = '';

  // Phương pháp 1: Tìm nội dung giữa các nav buttons hoặc trong div content
  const contentMatch = html.match(/class=['"]chapter-content['"][^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/class=['"]content['"][^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/class=['"]entry-content['"][^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/id=['"]chapter-c['"][^>]*>([\s\S]*?)<\/div>/i);

  if (contentMatch) {
    content = contentMatch[1];
  } else {
    // Phương pháp 2: Tìm nội dung văn bản giữa navigation Sau và Footer
    const bodyMatch = html.match(/Sau<\/a>[\s\S]*?<\/div>([\s\S]*?)(?:<div[^>]*class=['"](?:nav|comment|footer|rating))/i);
    if (bodyMatch) content = bodyMatch[1];
  }

  // Nếu vẫn không thấy, thử tìm đoạn text dài nhất (thường là nội dung truyện)
  if (!content || content.length < 200) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches && pMatches.length > 5) {
      content = pMatches.join('\n');
    }
  }

  // Làm sạch HTML thành text thuần
  content = content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') 
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '') // Xóa tag HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");

  // Bộ lọc "Cắt đuôi" - tìm từ khóa rác đầu tiên và cắt bỏ toàn bộ phần sau
  const junkKeywords = [
    '©', '&copy;', 'Bản quyền', 'Bản quyền', 'TruyenCV', 
    'Tên người dùng', 'Tên người dùng', 'Mật khẩu', 'Mật khẩu', 
    'Ghi nhớ đăng nhập', 'Ghi nhớ đăng nhập', 'Đăng ký', 'Đăng ký',
    'Captcha', 'Hủy', 'Hủy', 'Bạn phải đăng nhập để gửi bình luận',
    'Trước | Sau', 'Trước | Sau', 'Từ đầu', 'Từ đầu'
  ];

  let lowestIndex = content.length;
  for (const kw of junkKeywords) {
    const idx = content.indexOf(kw);
    if (idx !== -1 && idx > content.length * 0.3 && idx < lowestIndex) {
      lowestIndex = idx;
    }
  }
  
  if (lowestIndex < content.length) {
    content = content.substring(0, lowestIndex);
  }

  // Làm sạch nốt các rác lẻ tẻ và chuẩn hóa khoảng trống
  content = content
    .replace(/cấu hình\s+\d+/gi, '')
    .replace(/Cấu hình\s+\d+/gi, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n')
    .trim();

  // Tìm link chương trước/sau
  const prevMatch = html.match(/href=['"]([^'"]*\/chuong-\d+\/?)['"]\s*[^>]*>\s*(?:Trước|Prev)/i);
  const nextMatch = html.match(/href=['"]([^'"]*\/chuong-\d+\/?)['"]\s*[^>]*>\s*(?:Sau|Next)/i)
    || html.match(/Sau<\/a>[\s\S]*?href=['"]([^'"]*\/chuong-\d+\/?)['"]/i);

  // Tìm link Sau chính xác hơn
  let nextUrl = '';
  const nextLinks = html.match(/href=['"]([^'"]*\/chuong-(\d+)\/?)['"]/gi);
  if (nextLinks) {
    const currentNum = parseInt(url.match(/chuong-(\d+)/)?.[1] || '0');
    for (const link of nextLinks) {
      const numMatch = link.match(/chuong-(\d+)/);
      if (numMatch && parseInt(numMatch[1]) === currentNum + 1) {
        nextUrl = link.match(/href=['"]([^'"]+)['"]/)?.[1] || '';
        break;
      }
    }
  }

  const prevUrl = prevMatch?.[1] || '';

  return Response.json({
    title,
    content,
    prevUrl,
    nextUrl,
    currentUrl: url,
  });
}
