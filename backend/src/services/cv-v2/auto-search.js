import { generateSearchQueries } from './ai-service.js';
import axios from 'axios';

const PYTHON_SERVICE_URL = 'http://localhost:8005';

/**
 * Auto search jobs using Python microservice
 */
export async function autoSearchJobs(cvData, options = {}, provider = 'lmstudio') {
  const source = options.source || 'itviec';
  // 1. Lấy keywords từ CV dùng LLM hiện tại
  const queries = await generateSearchQueries(cvData, provider);
  if (queries.length === 0) {
    throw new Error('Không thể tạo query tìm kiếm từ CV');
  }

  console.log(`[AutoSearch] Keywords: ${queries.join(', ')}, Source: ${source}`);

  try {
    // 2. Gọi sang Python microservice để scrape thực tế (LinkedIn, ITViec...)
    const response = await axios.post(`${PYTHON_SERVICE_URL}/scrape`, {
      keywords: queries.slice(0, 2), // Lấy 2 keywords đầu để tránh quá tải
      source: source,
      max_pages: options.maxPages || 1
    });

    const jobs = response.data.jobs || [];

    return {
      queries,
      results: jobs,
      urls: jobs.map(j => j.url),
      summary: {
        totalSites: 1,
        successfulSites: 1,
        totalUrls: jobs.length,
      },
    };
  } catch (error) {
    console.error('[Python Service Error]', error.message);
    throw new Error(`Lỗi scraping service: ${error.message}`);
  }
}

