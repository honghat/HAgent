import { v4 as uuidv4 } from 'uuid';
import db from '../../db.js';
import { parseCV } from './ai-service.js';

/**
 * Create CV profile from raw text
 */
export async function createProfile(userId, name, rawText, provider = 'lmstudio') {
  const id = uuidv4();
  const parsedData = await parseCV(rawText, provider);

  db.prepare(`
    INSERT INTO cv_profiles (id, user_id, name, file_name, file_path, raw_text, parsed_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name, name, '', rawText, JSON.stringify(parsedData));

  return getProfile(userId, id);
}

/**
 * Get profile by id
 */
export function getProfile(userId, profileId) {
  const row = db.prepare(`
    SELECT * FROM cv_profiles
    WHERE id = ? AND user_id = ?
  `).get(profileId, userId);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    rawText: row.raw_text,
    parsed: JSON.parse(row.parsed_data || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List all profiles for user
 */
export function listProfiles(userId) {
  const rows = db.prepare(`
    SELECT id, user_id, name, parsed_data, created_at, updated_at
    FROM cv_profiles
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parsed: JSON.parse(row.parsed_data || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Delete profile
 */
export function deleteProfile(userId, profileId) {
  // Delete associated job results
  db.prepare('DELETE FROM cv_job_applications WHERE user_id = ? AND profile_id = ?')
    .run(userId, profileId);

  // Delete profile
  const result = db.prepare('DELETE FROM cv_profiles WHERE id = ? AND user_id = ?')
    .run(profileId, userId);

  return result.changes > 0;
}
