import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Project root: 3 levels up from backend/src/
let root = resolve(__dirname, '..', '..');

// Verify by checking for CLAUDE.md
try {
  readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
} catch {
  root = process.env.PROJECT_ROOT || process.cwd();
}

export const PROJECT_ROOT = root;
export const DATA_DIR = resolve(root, 'data');
export const BACKEND_DIR = resolve(root, 'backend');
export const FRONTEND_DIR = resolve(root, 'frontend');
