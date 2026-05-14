'use client';
import dynamic from 'next/dynamic';

const LearnMain = dynamic(() => import('./_components/LearnMain'), { 
  ssr: false,
  loading: () => (
    <div style={{ padding: 20, color: '#888', textAlign: 'center', background: '#0d1117', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div style={{ fontSize: 40, marginBottom: 20 }}>🚀</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Đang khởi tạo Learn AI...</div>
      <div style={{ fontSize: 12, marginTop: 8, opacity: 0.6 }}>Vui lòng đợi trong giây lát</div>
    </div>
  )
});

export default function Page() {
  return <LearnMain />;
}
