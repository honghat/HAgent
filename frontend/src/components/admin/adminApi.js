// API client cho khu Quản trị (/api/admin). Dùng Bearer token.
const BASE = '/api/admin'

function authHeaders(token, withJson) {
  const h = { Authorization: `Bearer ${token}` }
  if (withJson) h['Content-Type'] = 'application/json'
  return h
}

async function req(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(token, !!body),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Lỗi ${res.status}`)
  return data
}

export const adminApi = {
  overview: (t) => req('GET', '/overview', t),
  catalog: (t) => req('GET', '/permissions/catalog', t),
  users: (t) => req('GET', '/users', t),
  createUser: (t, b) => req('POST', '/users', t, b),
  updateUser: (t, id, b) => req('PATCH', `/users/${encodeURIComponent(id)}`, t, b),
  deleteUser: (t, id) => req('DELETE', `/users/${encodeURIComponent(id)}`, t),
  roles: (t) => req('GET', '/roles', t),
  createRole: (t, b) => req('POST', '/roles', t, b),
  updateRole: (t, role, b) => req('PATCH', `/roles/${encodeURIComponent(role)}`, t, b),
  deleteRole: (t, role) => req('DELETE', `/roles/${encodeURIComponent(role)}`, t),
  devices: (t, status) => req('GET', `/devices${status ? `?status=${encodeURIComponent(status)}` : ''}`, t),
  approveDevice: (t, id) => req('POST', `/devices/${encodeURIComponent(id)}/approve`, t),
  revokeDevice: (t, id) => req('DELETE', `/devices/${encodeURIComponent(id)}`, t),
  audit: (t, params) => {
    const q = new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)
    ).toString()
    return req('GET', `/audit${q ? `?${q}` : ''}`, t)
  },
}
