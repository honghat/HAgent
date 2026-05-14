import { v4 as uuidv4 } from 'uuid';
import db from '../../db.js';
import { analyzeJob } from './ai-service.js';
import { getProfile } from './profile-service.js';

/**
 * Fetch job description from URL
 */
async function fetchJobDescription(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();

    // Simple extraction - get text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 10000); // Limit to 10k chars
  } catch (error) {
    throw new Error(`Không thể fetch job từ ${url}: ${error.message}`);
  }
}

/**
 * Extract title and company from job description
 */
function extractTitleCompany(description, url) {
  const lines = description.split('\n').filter(l => l.trim());
  const title = lines[0]?.slice(0, 200) || 'Job Title';

  // Try to extract company from URL
  let company = '';
  try {
    const urlObj = new URL(url);
    company = urlObj.hostname.replace('www.', '').split('.')[0];
  } catch {}

  return { title, company };
}

/**
 * Save job result to database
 */
function saveJobResult(userId, profileId, jobData) {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO job_results (
      id, user_id, profile_id, url, title, company, source, description,
      match_score, analysis, learning_plan, interview_prep, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, url) DO UPDATE SET
      profile_id = excluded.profile_id,
      title = excluded.title,
      company = excluded.company,
      description = excluded.description,
      match_score = excluded.match_score,
      analysis = excluded.analysis,
      learning_plan = excluded.learning_plan,
      interview_prep = excluded.interview_prep,
      updated_at = datetime('now')
  `).run(
    id,
    userId,
    profileId,
    jobData.url,
    jobData.title,
    jobData.company,
    jobData.source,
    jobData.description,
    jobData.matchScore,
    JSON.stringify(jobData.analysis),
    JSON.stringify(jobData.learningPlan),
    JSON.stringify(jobData.interviewPrep),
    'new'
  );

  return getJobResult(userId, jobData.url);
}

/**
 * Get job result by URL
 */
function getJobResult(userId, url) {
  const row = db.prepare(`
    SELECT * FROM job_results
    WHERE user_id = ? AND url = ?
  `).get(userId, url);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    profileId: row.profile_id,
    url: row.url,
    title: row.title,
    company: row.company,
    source: row.source,
    description: row.description,
    matchScore: row.match_score,
    analysis: JSON.parse(row.analysis || '{}'),
    learningPlan: JSON.parse(row.learning_plan || '[]'),
    interviewPrep: JSON.parse(row.interview_prep || '{}'),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Process single job URL
 */
export async function processJobUrl(userId, profileId, url, source = 'manual', provider = 'lmstudio') {
  const profile = getProfile(userId, profileId);
  if (!profile) throw new Error('CV không tồn tại');

  // Fetch job description
  const description = await fetchJobDescription(url);
  const { title, company } = extractTitleCompany(description, url);

  // AI analyze
  const aiResult = await analyzeJob(description, profile.parsed, provider);

  // Save to DB
  return saveJobResult(userId, profileId, {
    url,
    title,
    company,
    source,
    description,
    matchScore: aiResult.match_score || 0,
    analysis: {
      skillsMatch: aiResult.skills_match || [],
      skillsGap: aiResult.skills_gap || [],
      strengths: aiResult.strengths || [],
      risks: aiResult.risks || [],
      pitch: aiResult.pitch || '',
    },
    learningPlan: aiResult.learning_plan || [],
    interviewPrep: aiResult.interview_prep || {},
  });
}

/**
 * Process multiple job URLs
 */
export async function processJobUrls(userId, profileId, urls, source = 'manual', provider = 'lmstudio') {
  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const result = await processJobUrl(userId, profileId, url.trim(), source, provider);
      results.push(result);
    } catch (error) {
      errors.push({ url, error: error.message });
    }
  }

  return { results, errors };
}

/**
 * List job results for profile
 */
export function listJobResults(userId, profileId, status = null) {
  let query = `
    SELECT * FROM job_results
    WHERE user_id = ? AND profile_id = ?
  `;
  const params = [userId, profileId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY match_score DESC, created_at DESC LIMIT 100';

  const rows = db.prepare(query).all(...params);

  return rows.map(row => ({
    id: row.id,
    url: row.url,
    title: row.title,
    company: row.company,
    source: row.source,
    matchScore: row.match_score,
    analysis: JSON.parse(row.analysis || '{}'),
    learningPlan: JSON.parse(row.learning_plan || '[]'),
    interviewPrep: JSON.parse(row.interview_prep || '{}'),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Update job status
 */
export function updateJobStatus(userId, jobId, status, notes = '') {
  const allowed = ['new', 'reviewing', 'interested', 'applied', 'rejected'];
  if (!allowed.includes(status)) {
    throw new Error('Status không hợp lệ');
  }

  const result = db.prepare(`
    UPDATE job_results
    SET status = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(status, notes, jobId, userId);

  if (result.changes === 0) {
    throw new Error('Không tìm thấy job');
  }

  return true;
}
