import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db.js';
import { processFile } from '../files/processor.js';
import { LOCATION_TERMS, ROLE_TERMS, SKILL_TERMS } from './terms.js';
import { DATA_ROOT, extractMatches, normalizeText, parseJson } from './utils.js';

function rowToProfile(row, includeContent = false) {
  if (!row) return null;
  const profile = {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    summary: row.summary,
    skills: parseJson(row.skills_json),
    roles: parseJson(row.roles_json),
    locations: parseJson(row.locations_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeContent) profile.content = row.content;
  return profile;
}

function extractName(text, fallback) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const candidates = lines
    .map(line => line.replace(/^#+\s*/, '').replace(/[|•].*$/, '').trim())
    .filter(line => line.length >= 3 && line.length <= 60)
    .filter(line => !/@|http|www\.|phone|email|cv|resume|word document|kế hoạch|ngày tạo/i.test(line));
  return candidates[0] || fallback.replace(/\.[^.]+$/, '');
}

function inferRolesFromSkills(skills) {
  const lower = skills.join(' ').toLowerCase();
  if (/react|frontend|vue|next/.test(lower)) return ['Frontend Developer'];
  if (/node|python|java|backend|api|sql/.test(lower)) return ['Backend Developer'];
  if (/machine learning|llm|rag|ai/.test(lower)) return ['AI Engineer'];
  if (/power bi|data analysis|excel|sql/.test(lower)) return ['Data Analyst'];
  if (/product management|scrum/.test(lower)) return ['Product Manager'];
  return ['Software Engineer'];
}

export function analyzeCv(content, fileName) {
  const body = content.replace(/^### Word Document:.*$/im, '').trim();
  const clean = normalizeText(body);
  const skills = extractMatches(clean, SKILL_TERMS, 18);
  const roles = extractMatches(clean, ROLE_TERMS, 6);
  const locations = extractMatches(clean, LOCATION_TERMS, 5);

  return {
    name: extractName(body, fileName),
    summary: clean.slice(0, 420),
    skills,
    roles: roles.length ? roles : inferRolesFromSkills(skills),
    locations,
  };
}

export async function createProfileFromFile({ userId, filePath, fileName }) {
  const content = await processFile(filePath);
  if (!content || content.startsWith('[Error processing file')) {
    throw new Error('Không đọc được nội dung CV');
  }

  const analysis = analyzeCv(content, fileName);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO cv_profiles
      (id, user_id, name, file_name, file_path, content, summary, skills_json, roles_json, locations_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    analysis.name,
    fileName,
    filePath,
    content,
    analysis.summary,
    JSON.stringify(analysis.skills),
    JSON.stringify(analysis.roles),
    JSON.stringify(analysis.locations),
  );

  return getProfile(userId, id, true);
}

export function listProfiles(userId) {
  const rows = db.prepare('SELECT * FROM cv_profiles WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  return rows.map(row => rowToProfile(row));
}

export function getProfile(userId, id, includeContent = false) {
  const row = db.prepare('SELECT * FROM cv_profiles WHERE id = ? AND user_id = ?').get(id, userId);
  return rowToProfile(row, includeContent);
}

export function deleteProfile(userId, id) {
  const row = db.prepare('SELECT file_path FROM cv_profiles WHERE id = ? AND user_id = ?').get(id, userId);
  const result = db.prepare('DELETE FROM cv_profiles WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes && row?.file_path?.startsWith(DATA_ROOT)) {
    fs.unlink(row.file_path, () => {});
  }
  return result.changes > 0;
}
