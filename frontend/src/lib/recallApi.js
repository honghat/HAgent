const API_BASE = import.meta.env.VITE_API_BASE || ''

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readJson(res) {
  const raw = await res.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`Phản hồi không phải JSON (HTTP ${res.status}).`)
  }
}

export async function fetchLessonReviewQueue(token) {
  const res = await fetch(`${API_BASE}/api/lessons/review-queue`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return readJson(res)
}

export async function fetchEnglishReviewQueue(token) {
  const res = await fetch(`${API_BASE}/api/english/review-queue`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return readJson(res)
}

export async function fetchLessonRecallQuestions(token, track) {
  const res = await fetch(`${API_BASE}/api/lessons/recall-questions?track=${encodeURIComponent(track || '')}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return { questions: [] }
  return readJson(res)
}

export async function submitLessonRecall(token, payload) {
  const res = await fetch(`${API_BASE}/api/lessons/recall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
  return data
}

export async function submitEnglishRecall(token, payload) {
  const res = await fetch(`${API_BASE}/api/english/recall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
  return data
}

export async function submitEnglishShadow(token, payload) {
  const res = await fetch(`${API_BASE}/api/english/shadow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
  return data
}

export function parseGapNotes(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export function relativeReviewLabel(nextReviewAt) {
  if (!nextReviewAt) return 'Chưa ôn'
  const now = Date.now()
  const target = new Date(nextReviewAt).getTime()
  if (Number.isNaN(target)) return '—'
  const diffDays = Math.round((target - now) / 86_400_000)
  if (diffDays < -1) return `Quá hạn ${-diffDays} ngày`
  if (diffDays < 0) return 'Quá hạn hôm nay'
  if (diffDays === 0) return 'Ôn hôm nay'
  if (diffDays === 1) return 'Ôn ngày mai'
  if (diffDays < 7) return `Còn ${diffDays} ngày`
  if (diffDays < 30) return `Còn ${Math.round(diffDays / 7)} tuần`
  return `Còn ${Math.round(diffDays / 30)} tháng`
}

export function strengthColor(strength) {
  const s = Number(strength || 0)
  if (s >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (s >= 60) return 'text-sky-600 bg-sky-50 border-sky-200'
  if (s >= 40) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (s > 0) return 'text-rose-600 bg-rose-50 border-rose-200'
  return 'text-gray-400 bg-gray-50 border-gray-200'
}
