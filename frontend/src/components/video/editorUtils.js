// Helper utilities for VideoEditor — pure functions to keep main file small.
export function fmtTime(t) {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const cs = Math.floor((t * 100) % 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

export function nextId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function emptyTimeline() {
  return {
    tracks: [
      { id: 'v1', kind: 'video', name: 'Video 1', items: [] },
      { id: 't1', kind: 'text', name: 'Text 1', items: [] },
      { id: 'a1', kind: 'audio', name: 'Audio 1', items: [] },
      { id: 'm1', kind: 'music', name: 'Nhạc nền', items: [] },
    ],
  }
}

export function ensureMusicTrack(tl) {
  if (tl.tracks.find(t => t.kind === 'music')) return tl
  return { ...tl, tracks: [...tl.tracks, { id: 'm1', kind: 'music', name: 'Nhạc nền', items: [] }] }
}

export function timelineDuration(tl) {
  let d = 0
  for (const tr of tl.tracks || []) {
    for (const it of tr.items || []) {
      d = Math.max(d, it.end || 0)
    }
  }
  return d
}

export function addClipToTrack(tl, trackId, item) {
  return {
    ...tl,
    tracks: tl.tracks.map(t =>
      t.id === trackId ? { ...t, items: [...t.items, item] } : t,
    ),
  }
}

export function updateClipInTrack(tl, trackId, itemId, patch) {
  return {
    ...tl,
    tracks: tl.tracks.map(t =>
      t.id === trackId
        ? {
            ...t,
            items: t.items.map(it =>
              it.id === itemId ? { ...it, ...patch } : it,
            ),
          }
        : t,
    ),
  }
}

export function removeClipFromTrack(tl, trackId, itemId) {
  return {
    ...tl,
    tracks: tl.tracks.map(t =>
      t.id === trackId
        ? { ...t, items: t.items.filter(it => it.id !== itemId) }
        : t,
    ),
  }
}

export function trackKindIcon(kind) {
  switch (kind) {
    case 'text': return 'T'
    case 'audio': return '♪'
    case 'music': return '♫'
    default: return '▶'
  }
}

export function clipColor(kind) {
  switch (kind) {
    case 'text':  return 'bg-violet-600/70 border-violet-500/60'
    case 'audio': return 'bg-emerald-600/70 border-emerald-500/60'
    case 'music': return 'bg-pink-600/70 border-pink-500/60'
    default:      return 'bg-sky-700/60 border-sky-500/50'
  }
}
