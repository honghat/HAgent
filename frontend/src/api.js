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

export async function restructureWiki(token, provider = 'deepseek') {
  const res = await fetch(`${API}/wiki/restructure`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  return res.json();
}

export async function createEntry(data, token) {
  const res = await fetch(`${API}/wiki`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
