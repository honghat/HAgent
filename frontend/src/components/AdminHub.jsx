// Hub Quản trị (tab cấp 1, chỉ admin) — gom thống kê, người dùng, phân quyền, thiết bị, nhật ký.
import { Suspense, lazy, useState } from 'react'

const AdminOverview = lazy(() => import('./admin/AdminOverview.jsx'))
const AdminUsers = lazy(() => import('./admin/AdminUsers.jsx'))
const AdminRoles = lazy(() => import('./admin/AdminRoles.jsx'))
const AdminDevices = lazy(() => import('./admin/AdminDevices.jsx'))
const AdminAudit = lazy(() => import('./admin/AdminAudit.jsx'))
const AdminControls = lazy(() => import('./admin/AdminControls.jsx'))
const AdminDatabase = lazy(() => import('./admin/AdminDatabase.jsx'))
const ServicesPanel = lazy(() => import('./ServicesPanel.jsx'))
const BlogHub = lazy(() => import('./BlogHub.jsx'))

const tabs = [
  {
    id: 'overview', label: 'Tổng quan',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>,
  },
  {
    id: 'users', label: 'Người dùng',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.4-1.8M9 11a4 4 0 100-8 4 4 0 000 8z" /><path d="M2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2" /></svg>,
  },
  {
    id: 'roles', label: 'Phân quyền',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>,
  },
  {
    id: 'devices', label: 'Thiết bị',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 22h8M12 18v4" /></svg>,
  },
  {
    id: 'audit', label: 'Nhật ký',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" opacity="0" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  },
  {
    id: 'controls', label: 'Điều khiển',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v10M6.34 6.34a8 8 0 1011.32 0" /></svg>,
  },
  {
    id: 'database', label: 'Cơ sở dữ liệu',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></svg>,
  },
  {
    id: 'blog', label: 'Bài viết',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2m2 2a2 2 0 012 2v8a2 2 0 01-2 2h-2m-6-13H7m6 4H7m8 4H7" /></svg>,
  },
  {
    id: 'services', label: 'Dịch vụ',
    icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12H3l2 9h14l2-9h-2M5 12V7a2 2 0 012-2h10a2 2 0 012 2v5M9 12h6" /><circle cx="9" cy="16" r="0.5" fill="currentColor" /></svg>,
  },
]

function TabLoading() {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-[12px] font-medium text-gray-400">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
      Đang tải...
    </div>
  )
}

export default function AdminHub({ token, currentUser }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hagent_admin_tab') || 'overview')

  function selectTab(tab) {
    setActiveTab(tab)
    localStorage.setItem('hagent_admin_tab', tab)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <div className="sticky top-0 z-30 shrink-0 border-b border-black/[0.12] bg-white/90 px-2 py-1.5 backdrop-blur-xl sm:px-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-gray-100 p-0.5 sm:inline-flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-all sm:h-7 sm:w-auto sm:gap-1 sm:px-2.5 ${
                activeTab === tab.id
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5 pb-safe">
        <div className="mx-auto w-full max-w-6xl">
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'overview' && <AdminOverview token={token} />}
            {activeTab === 'users' && <AdminUsers token={token} currentUser={currentUser} />}
            {activeTab === 'roles' && <AdminRoles token={token} />}
            {activeTab === 'devices' && <AdminDevices token={token} />}
            {activeTab === 'audit' && <AdminAudit token={token} />}
            {activeTab === 'controls' && <AdminControls token={token} />}
            {activeTab === 'database' && <AdminDatabase token={token} />}
            {activeTab === 'blog' && <BlogHub user={currentUser} token={token} onViewChange={() => {}} />}
            {activeTab === 'services' && <ServicesPanel token={token} />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
