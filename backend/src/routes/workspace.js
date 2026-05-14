import { Router } from 'express';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

const SKIP_NAMES = new Set([
  '.DS_Store',
  '.git',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'DerivedData',
  'dist',
  'node_modules',
]);

const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.clj', '.cpp', '.cs', '.css', '.csv', '.env', '.go', '.h', '.html',
  '.java', '.js', '.json', '.jsx', '.kt', '.lock', '.log', '.lua', '.m', '.md',
  '.mjs', '.mm', '.php', '.plist', '.proto', '.py', '.rb', '.rs', '.scss', '.sh',
  '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx', '.txt', '.vue', '.xml',
  '.yaml', '.yml',
]);

function configuredRoots() {
  const envRoots = (process.env.HAGENT_WORKSPACE_ROOTS || '')
    .split(':')
    .map(item => item.trim())
    .filter(Boolean);

  return [
    PROJECT_ROOT,
    os.homedir(),
    '/Volumes/HatAI',
    ...envRoots,
  ];
}

function existingRoots() {
  const seen = new Set();
  return configuredRoots()
    .map(root => path.resolve(root))
    .filter(root => {
      if (seen.has(root)) return false;
      seen.add(root);
      try {
        return fs.existsSync(root) && fs.statSync(root).isDirectory();
      } catch {
        return false;
      }
    });
}

function isInside(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveAllowed(inputPath = '') {
  const roots = existingRoots();
  const candidate = path.resolve(inputPath || roots[0] || PROJECT_ROOT);
  const root = roots.find(item => isInside(candidate, item));
  if (!root) {
    const err = new Error('Path is outside allowed workspace roots');
    err.status = 403;
    throw err;
  }
  return { path: candidate, root };
}

function languageFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'mjs') return 'js';
  if (ext === 'tsx') return 'tsx';
  if (ext === 'jsx') return 'jsx';
  if (ext === 'yml') return 'yaml';
  return ext || 'txt';
}

function isReadableTextFile(filePath, size) {
  if (size > 1024 * 1024 * 2) return false;
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  return TEXT_EXTENSIONS.has(ext) || base.startsWith('.env') || base === 'Dockerfile' || base === 'Makefile';
}

workspaceRouter.get('/roots', (_req, res) => {
  res.json({
    roots: existingRoots().map(root => ({
      path: root,
      name: root === PROJECT_ROOT ? 'HAgent' : path.basename(root) || root,
    })),
  });
});

workspaceRouter.get('/list', async (req, res) => {
  try {
    const { path: dirPath, root } = resolveAllowed(String(req.query.path || ''));
    const stat = await fsp.stat(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    const dirents = await fsp.readdir(dirPath, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
      if (SKIP_NAMES.has(dirent.name)) continue;
      const fullPath = path.join(dirPath, dirent.name);
      let itemStat;
      try {
        itemStat = await fsp.stat(fullPath);
      } catch {
        continue;
      }
      entries.push({
        name: dirent.name,
        path: fullPath,
        type: dirent.isDirectory() ? 'directory' : 'file',
        size: itemStat.size,
        mtime: itemStat.mtimeMs,
        language: dirent.isDirectory() ? '' : languageFromPath(fullPath),
        readable: dirent.isDirectory() ? false : isReadableTextFile(fullPath, itemStat.size),
      });
    }

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      root,
      path: dirPath,
      parent: dirPath === root ? null : path.dirname(dirPath),
      entries: entries.slice(0, 500),
      truncated: entries.length > 500,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

workspaceRouter.get('/file', async (req, res) => {
  try {
    const { path: filePath, root } = resolveAllowed(String(req.query.path || ''));
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return res.status(400).json({ error: 'Path is not a file' });
    if (!isReadableTextFile(filePath, stat.size)) return res.status(400).json({ error: 'File is too large or not a supported text file' });

    const content = await fsp.readFile(filePath, 'utf8');
    res.json({
      root,
      path: filePath,
      name: path.basename(filePath),
      language: languageFromPath(filePath),
      size: stat.size,
      mtime: stat.mtimeMs,
      content,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

workspaceRouter.put('/file', async (req, res) => {
  try {
    const { path: filePath, root } = resolveAllowed(String(req.body.path || ''));
    const content = String(req.body.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024 * 2) {
      return res.status(400).json({ error: 'File content is too large' });
    }
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return res.status(400).json({ error: 'Path is not a file' });
    if (!isReadableTextFile(filePath, stat.size)) return res.status(400).json({ error: 'File is not a supported text file' });

    await fsp.writeFile(filePath, content, 'utf8');
    const nextStat = await fsp.stat(filePath);
    res.json({
      ok: true,
      root,
      path: filePath,
      size: nextStat.size,
      mtime: nextStat.mtimeMs,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
