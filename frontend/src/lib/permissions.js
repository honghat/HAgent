// Phân quyền truy cập tab/tab con theo vai trò.
// user.permissions: mảng khóa được phép, hoặc ['*'] = toàn quyền (admin).

export function userPerms(user) {
  const p = user?.permissions
  return Array.isArray(p) ? p : []
}

export function isAdmin(user) {
  return user?.role === 'admin' || userPerms(user).includes('*')
}

// Khóa cấp 1: 'chat'. Khóa cấp 2: 'chat:omni'. Khóa cấp 3: 'system:workflows:flow'
export function canAccess(user, key) {
  if (!user) return false
  const perms = userPerms(user)
  if (perms.includes('*')) return true
  
  return perms.some(p => {
    // Khớp chính xác
    if (p === key) return true
    // Quyền cha cho phép truy cập con (ví dụ: 'system' cho phép 'system:workflows:flow')
    if (key.startsWith(p + ':')) return true
    // Quyền con cho phép hiển thị cha để điều hướng (ví dụ: 'system:workflows:flow' cho phép hiển thị menu 'system')
    if (p.startsWith(key + ':')) return true
    return false
  })
}

// Lọc danh sách tab con theo prefix (vd prefix='system', tab.id='files' ⇒ 'system:files').
export function filterTabs(user, prefix, tabs, idKey = 'id') {
  return (tabs || []).filter(t => canAccess(user, `${prefix}:${t[idKey]}`))
}

export function firstAllowed(user, prefix, tabs, idKey = 'id') {
  const f = filterTabs(user, prefix, tabs, idKey)
  return f.length ? f[0][idKey] : null
}
