// Phân quyền truy cập tab/tab con theo vai trò.
// user.permissions: mảng khóa được phép, hoặc ['*'] = toàn quyền (admin).

export function userPerms(user) {
  const p = user?.permissions
  return Array.isArray(p) ? p : []
}

export function isAdmin(user) {
  return user?.role === 'admin' || userPerms(user).includes('*')
}

// Khóa cấp 1: 'chat'. Khóa cấp 2: 'chat:omni'.
export function canAccess(user, key) {
  if (key === 'blog') return true
  if (!user) return false
  if (key === 'personal') return true
  const perms = userPerms(user)
  if (perms.includes('*') || perms.includes(key)) return true
  if (key.includes(':')) return perms.includes(key.split(':')[0]) // cấp 1 ⇒ mọi sub
  return perms.some(p => p === key || p.startsWith(key + ':')) // cấp 1 hiện nếu có sub bất kỳ
}

// Lọc danh sách tab con theo prefix (vd prefix='system', tab.id='files' ⇒ 'system:files').
export function filterTabs(user, prefix, tabs, idKey = 'id') {
  return (tabs || []).filter(t => canAccess(user, `${prefix}:${t[idKey]}`))
}

export function firstAllowed(user, prefix, tabs, idKey = 'id') {
  const f = filterTabs(user, prefix, tabs, idKey)
  return f.length ? f[0][idKey] : null
}
