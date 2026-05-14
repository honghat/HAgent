import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../config.js';

function git(cmd, opts = {}) {
  try {
    return execSync(`git -C "${PROJECT_ROOT}" ${cmd}`, {
      encoding: 'utf8',
      timeout: 15000,
      ...opts,
    }).trim();
  } catch (e) {
    if (!opts.ignoreError) throw e;
    return '';
  }
}

// Snapshot before changes
export function preChangeSnapshot(label = 'auto') {
  const branch = git('branch --show-current');
  const commit = git('rev-parse HEAD');
  const dirty = git('status --porcelain', { ignoreError: true });
  return { branch, commit, dirty: !!dirty, label, timestamp: new Date().toISOString() };
}

// Auto-commit with safety
export function safeCommit(message) {
  const status = git('status --porcelain', { ignoreError: true });
  if (!status) return { committed: false, reason: 'no changes' };

  git('add -A');
  git(`commit -m "${message.replace(/"/g, '\\"')}"`);
  const newCommit = git('rev-parse HEAD');
  return { committed: true, commit: newCommit };
}

// Rollback to a snapshot
export function rollback(snapshot) {
  if (!snapshot?.commit) throw new Error('No snapshot to rollback to');

  // Stash any current changes
  git('stash --include-untracked', { ignoreError: true });

  // Reset to snapshot commit
  git(`reset --hard ${snapshot.commit}`);

  // If we were on a different branch, switch back
  if (snapshot.branch) {
    git(`checkout ${snapshot.branch}`, { ignoreError: true });
  }

  return { rolledBack: true, to: snapshot.commit };
}

// Safe execution wrapper — auto commit before, rollback on failure
export async function safeEvolve(label, fn) {
  const snap = preChangeSnapshot(label);

  try {
    const result = await fn();
    return { success: true, snap, result };
  } catch (err) {
    console.error(`[self-evolve] ${label} failed:`, err.message);

    // If there were changes, try to rollback
    if (snap.dirty || git('status --porcelain', { ignoreError: true })) {
      try {
        rollback(snap);
        console.log(`[self-evolve] Rolled back to ${snap.commit}`);
      } catch (rbErr) {
        console.error('[self-evolve] Rollback failed:', rbErr.message);
      }
    }

    return { success: false, snap, error: err.message };
  }
}

// Check if core files are intact
const CORE_FILES = [
  'backend/src/index.js',
  'backend/src/db.js',
  'backend/src/services/llm.js',
];

export function verifyCore() {
  const results = [];
  for (const file of CORE_FILES) {
    const fullPath = join(PROJECT_ROOT, file);
    const exists = existsSync(fullPath);
    let valid = exists;
    if (exists) {
      const content = readFileSync(fullPath, 'utf8');
      // Basic sanity: must have import/require and export
      valid = content.length > 100 &&
        (content.includes('import ') || content.includes('require(')) &&
        (content.includes('export ') || content.includes('module.exports'));
    }
    results.push({ file, exists, valid });
  }
  return { allValid: results.every(r => r.valid), results };
}
