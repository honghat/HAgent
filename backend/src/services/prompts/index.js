import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(name) {
  return readFileSync(join(__dirname, name), 'utf8').trim();
}

const harness = load('harness.md');
const hagentBrain = load('hagent-brain.md');
const communication = load('communication.md');
const executingActions = load('executing-actions.md');
const toolUsage = load('tool-usage.md');
const dataFreshness = load('data-freshness.md');
const wikiMemory = load('wiki-memory.md');
const subagent = load('subagent.md');
const executionDiscipline = load('execution-discipline.md');

export const CHAT_SYSTEM = [
  harness,
  hagentBrain,
  executionDiscipline,
  communication,
  executingActions,
  toolUsage,
  dataFreshness,
  wikiMemory,
  subagent,
  `Current date: ${new Date().toISOString().split('T')[0]}`,
].join('\n\n');
