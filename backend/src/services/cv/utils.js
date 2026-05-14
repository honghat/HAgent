export const DATA_ROOT = new URL('../../../../data/', import.meta.url).pathname;

export function parseJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

export function parseLooseJson(raw) {
  try { return JSON.parse(raw); } catch {}
  const match = String(raw || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch {}
  }
  const objectMatch = String(raw || '').match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  return null;
}

export function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function titleCase(value) {
  return value.replace(/\w\S*/g, part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

export function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsWord = /^[a-z0-9]/i.test(term);
  const endsWord = /[a-z0-9]$/i.test(term);
  const prefix = startsWord ? '(?<![a-z0-9])' : '';
  const suffix = endsWord ? '(?![a-z0-9])' : '';
  return new RegExp(`${prefix}${escaped}${suffix}`, 'i').test(text);
}

export function extractMatches(text, terms, limit) {
  const matches = terms.filter(term => hasTerm(text, term));
  return [...new Set(matches.map(titleCase))].slice(0, limit);
}

export function normalizeSkill(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '').trim();
}

export function overlap(listA = [], listB = []) {
  const b = new Map(listB.map(item => [normalizeSkill(item), item]));
  return listA.filter(item => b.has(normalizeSkill(item)));
}

export function difference(listA = [], listB = []) {
  const b = new Set(listB.map(normalizeSkill));
  return listA.filter(item => !b.has(normalizeSkill(item)));
}
