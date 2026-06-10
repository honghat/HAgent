const API = '/api';

function auth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchWiki(token) {
  const res = await fetch(`${API}/wiki`, { headers: { ...auth(token) } });
  return res.json();
}

export async function fetchEntry(id, token) {
  const res = await fetch(`${API}/wiki/${id}`, { headers: { ...auth(token) } });
  return res.json();
}

export async function updateEntry(id, data, token) {
  const res = await fetch(`${API}/wiki/${id}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEntry(id, token) {
  const res = await fetch(`${API}/wiki/${id}`, { method: 'DELETE', headers: { ...auth(token) } });
  return res.json();
}

export async function exportWiki(token) {
  const res = await fetch(`${API}/wiki/export`, { headers: { ...auth(token) } });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'hagent-wiki.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export function restructureWikiStream(token, provider = 'deepseek', { onEvent } = {}) {
  const ctrl = new AbortController()
  fetch(`${API}/wiki/restructure`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok) { onEvent?.({ type: 'error', error: `HTTP ${res.status}` }); return }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { onEvent?.(JSON.parse(line.slice(6))) } catch {}
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') onEvent?.({ type: 'error', error: err.message })
  })
  return ctrl
}

export async function createEntry(data, token) {
  const res = await fetch(`${API}/wiki`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchContextCompaction(token) {
  const res = await fetch(`${API}/context/compaction`, { headers: { ...auth(token) } });
  return res.json();
}

export async function updateContextCompaction(token, data) {
  const res = await fetch(`${API}/context/compaction`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
