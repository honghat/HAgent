'use client';
import { usePathname } from 'next/navigation';
import BottomNav from './BottomNav';
import type { AuthUser } from '@/lib/auth';

export default function AppShell({ session, children }: { session: AuthUser | null; children: React.ReactNode }) {
  const path = usePathname();
  const isLogin = path === '/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <BottomNav session={session} />
      <div className="main-content">
        <div className="page-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
