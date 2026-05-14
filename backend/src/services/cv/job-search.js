import { v4 as uuidv4 } from 'uuid';
import db from '../../db.js';
import { JOB_SITES, UNREALISTIC_LOCATION_MARKERS, VIETNAM_MARKERS } from './terms.js';
import { analyzeJob, aiAnalyzeJob } from './job-analysis.js';
import { extractJobLinksFromListing, extractUrls, fetchJobContent, isLikelyJobUrl, matchesDomain, searchDuckDuckGo, getSourceName } from './job-fetching.js';
import { getProfile } from './profiles.js';
import { parseJson } from './utils.js';

async function enrichJobResult(result, profile, provider) {
  const fetched = result.url ? await fetchJobContent(result.url) : { ok: false, title: '', text: '' };
  const title = fetched.title || result.title;
  const snippet = fetched.ok ? fetched.text.slice(0, 380) : result.snippet || 'Không đọc được nội dung JD tự động; mở link để kiểm tra yêu cầu chi tiết.';
  const analysis = analyzeJob({ ...result, title, snippet }, profile, fetched.text);
  const aiAnalysis = await aiAnalyzeJob({ result: { ...result, title, snippet }, profile, jobText: fetched.text, baseAnalysis: analysis, provider });
  return {
    ...result,
    title,
    snippet,
    ...analysis,
    ...(aiAnalysis || {}),
    analysisSource: fetched.ok ? 'job_page' : 'link_only',
    fetchError: fetched.ok ? '' : fetched.error || '',
    postedAt: fetched.postedAt || '',
    freshnessLabel: fetched.freshnessLabel || 'Không rõ ngày đăng',
    freshnessScore: fetched.freshnessScore || 35,
    daysOld: fetched.daysOld,
  };
}

async function directUrlResults(urls, profile, provider) {
  const seen = new Set();
  const cleanedUrls = urls
    .map(url => url.replace(/[)\].,]+$/, ''))
    .filter(url => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const listingResults = [];
  for (const url of cleanedUrls.filter(url => !isLikelyJobUrl(url))) {
    listingResults.push(...await extractJobLinksFromListing(url, 8));
  }

  const jobUrls = [...cleanedUrls.filter(isLikelyJobUrl), ...listingResults.map(job => job.url)];
  const uniqueJobUrls = [...new Set(jobUrls.map(url => url.replace(/[)\].,]+$/, '')))];
  const baseResults = uniqueJobUrls.map(url => ({ title: `Tin tuyển dụng trên ${getSourceName(url)}`, url, snippet: '', source: getSourceName(url), direct: true }));
  return Promise.all(baseResults.map(result => enrichJobResult(result, profile, provider)));
}

function buildBaseQuery(profile, query, location, remote) {
  const textQuery = String(query || '').replace(/https?:\/\/[^\s,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (textQuery) return textQuery;
  const roles = (profile.roles || []).slice(0, 2).join(' OR ');
  const skills = (profile.skills || []).slice(0, 5).join(' ');
  const place = location || profile.locations?.[0] || 'Vietnam';
  return `${roles || 'software engineer'} ${skills} ${place}${remote ? ' remote' : ''} tuyển dụng`;
}

function buildMoneyQueries(profile) {
  const roles = (profile.roles || []).slice(0, 3);
  const skills = (profile.skills || []).slice(0, 5);
  const primaryRole = String(roles[0] || 'data fintech developer').replace(/\s+OR\s+.*/i, '');
  return [
    `${primaryRole} ${skills.slice(0, 3).join(' ')} mới nhất`,
    `${primaryRole} ${skills.slice(0, 3).join(' ')} lương cao mới nhất`,
    `senior ${roles[1] || roles[0] || 'business intelligence engineer'} fintech ngân hàng mới nhất`,
  ].map(q => q.replace(/\s+/g, ' ').trim());
}

function rankJob(result) {
  return (result.matchScore || 0) * 1.1 + (result.incomePotential || 0) * 1.25 + (result.freshnessScore || 35) * 0.85;
}

function includesAny(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.some(term => lower.includes(term));
}

export function isRealisticForProfile(job, profile) {
  const haystack = `${job.title || ''} ${job.snippet || ''} ${job.url || ''}`;
  if (job.fallback || job.analysisSource !== 'job_page') return false;
  if ((job.requiredSkills || []).length === 0) return false;
  if (includesAny(haystack, UNREALISTIC_LOCATION_MARKERS)) return false;
  if (includesAny(haystack, VIETNAM_MARKERS)) return true;
  const wantsRemote = (profile.locations || []).some(location => /remote/i.test(location));
  return wantsRemote && /remote/i.test(haystack) && !/hybrid.*(new york|san francisco|austin|singapore)/i.test(haystack);
}

export async function searchJobsForProfile({ userId, profileId, query, location = '', remote = false, limit = 20, provider = 'lmstudio' }) {
  const profile = getProfile(userId, profileId, true);
  if (!profile) throw new Error('CV không tồn tại');

  const baseQuery = buildBaseQuery(profile, query, location, remote);
  const seen = new Set();
  const combined = await directUrlResults(extractUrls(query), profile, provider);
  for (const result of combined) seen.add(result.url.replace(/^https?:\/\//, '').replace(/\/$/, ''));

  const moneyQueries = buildMoneyQueries(profile);
  for (const site of JOB_SITES) {
    for (const moneyQuery of moneyQueries.slice(0, 2)) {
      const listingJobs = await extractJobLinksFromListing(site.searchUrl(moneyQuery), 4);
      for (const result of listingJobs) {
        const key = result.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push(await enrichJobResult(result, profile, provider));
      }
    }

    const results = await searchDuckDuckGo(`${baseQuery} mới nhất ${site.query}`).catch(() => []);
    for (const result of results.filter(r => matchesDomain(r.url, site.domain) && isLikelyJobUrl(r.url))) {
      const key = result.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(await enrichJobResult({ ...result, source: site.name }, profile, provider));
    }
  }

  const results = combined.filter(job => isRealisticForProfile(job, profile)).sort((a, b) => rankJob(b) - rankJob(a)).slice(0, Number(limit) || 20);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO cv_job_searches (id, user_id, profile_id, query, location, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, profileId, baseQuery, location, JSON.stringify(results));

  return { id, query: baseQuery, location, results, createdAt: new Date().toISOString() };
}

export function listSearches(userId, profileId) {
  return db.prepare(`
    SELECT id, query, location, results_json, created_at
    FROM cv_job_searches
    WHERE user_id = ? AND profile_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId, profileId).map(row => ({ id: row.id, query: row.query, location: row.location, results: parseJson(row.results_json), createdAt: row.created_at }));
}
