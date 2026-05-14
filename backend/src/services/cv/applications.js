import { v4 as uuidv4 } from 'uuid';
import db from '../../db.js';
import { getProfile } from './profiles.js';
import { isRealisticForProfile, searchJobsForProfile } from './job-search.js';
import { parseJson } from './utils.js';

function extractCompany(job) {
  const title = String(job.title || '');
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim().slice(0, 120);
  return '';
}

function buildDraftMessage(job, profile) {
  const matched = (job.matchedSkills || []).slice(0, 5).join(', ');
  const focus = (job.interviewFocus || [])[0] || 'Tôi có nền tảng finance/BI và kinh nghiệm tự động hóa quy trình dữ liệu.';
  return [
    `Chào anh/chị, tôi là ${profile.name}.`,
    `Tôi quan tâm vị trí ${job.title} vì phù hợp với định hướng fintech/BI và các kỹ năng ${matched || 'Python, React, SQL, BI'}.`,
    focus,
    'Tôi muốn trao đổi thêm để hiểu rõ bài toán đội ngũ đang giải quyết và gửi CV để anh/chị xem xét.',
  ].join('\n');
}

function rowToApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profile_id,
    searchId: row.search_id,
    jobUrl: row.job_url,
    jobTitle: row.job_title,
    company: row.company,
    source: row.source,
    status: row.status,
    matchScore: row.match_score,
    incomePotential: row.income_potential,
    verdict: row.verdict,
    job: parseJson(row.job_json, {}),
    draftMessage: row.draft_message,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveApplicationDrafts({ userId, profileId, searchId = '', jobs, minScore = 60 }) {
  const profile = getProfile(userId, profileId, true);
  if (!profile) throw new Error('CV không tồn tại');
  const selected = (jobs || [])
    .filter(job => job?.url && (job.matchScore || 0) >= minScore)
    .filter(job => isRealisticForProfile(job, profile))
    .slice(0, 12);
  const saved = [];

  for (const job of selected) {
    const id = uuidv4();
    const draftMessage = job.pitch || buildDraftMessage(job, profile);
    const company = extractCompany(job);
    db.prepare(`
      INSERT INTO cv_job_applications
        (id, user_id, profile_id, search_id, job_url, job_title, company, source, status, match_score, income_potential, verdict, job_json, draft_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, job_url) DO UPDATE SET
        profile_id = excluded.profile_id,
        search_id = excluded.search_id,
        job_title = excluded.job_title,
        company = excluded.company,
        source = excluded.source,
        match_score = excluded.match_score,
        income_potential = excluded.income_potential,
        verdict = excluded.verdict,
        job_json = excluded.job_json,
        draft_message = excluded.draft_message,
        updated_at = datetime('now')
    `).run(
      id,
      userId,
      profileId,
      searchId,
      job.url,
      job.title || 'Tin tuyển dụng',
      company,
      job.source || '',
      job.matchScore || 0,
      job.incomePotential || 0,
      job.verdict || '',
      JSON.stringify(job),
      draftMessage,
    );
    saved.push(db.prepare('SELECT * FROM cv_job_applications WHERE user_id = ? AND job_url = ?').get(userId, job.url));
  }

  return saved.map(rowToApplication);
}

export async function autoSearchJobsForProfile({ userId, profileId, query, location = 'Vietnam', remote = true, limit = 12, provider = 'local', minScore = 60 }) {
  const search = await searchJobsForProfile({ userId, profileId, query, location, remote, limit, provider });
  const applications = saveApplicationDrafts({ userId, profileId, searchId: search.id, jobs: search.results, minScore });
  return { ...search, applications };
}

export function listApplications(userId, profileId, status = '') {
  const params = [userId, profileId];
  const statusClause = status ? 'AND status = ?' : '';
  if (status) params.push(status);
  return db.prepare(`
    SELECT * FROM cv_job_applications
    WHERE user_id = ? AND profile_id = ? ${statusClause}
    ORDER BY match_score DESC, income_potential DESC, updated_at DESC
    LIMIT 100
  `).all(...params).map(rowToApplication);
}

export function updateApplicationStatus({ userId, id, status, notes = '' }) {
  const allowed = new Set(['pending_review', 'approved', 'rejected', 'applied']);
  if (!allowed.has(status)) throw new Error('Trạng thái apply không hợp lệ');
  const result = db.prepare(`
    UPDATE cv_job_applications
    SET status = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(status, notes, id, userId);
  if (!result.changes) throw new Error('Không tìm thấy draft apply');
  return rowToApplication(db.prepare('SELECT * FROM cv_job_applications WHERE id = ? AND user_id = ?').get(id, userId));
}
