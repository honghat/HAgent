export default function Loading() {
  return (
    <div style={{ padding: '20px', minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
      <div style={{ 
        width: '40px', height: '40px', 
        border: '3px solid rgba(88, 166, 255, 0.1)', 
        borderTop: '3px solid #58a6ff', 
        borderRadius: '50%', 
        animation: 'spin 1s linear infinite' 
      }} />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
      <div style={{ marginTop: '16px', fontSize: '13px', color: '#7d8590', fontWeight: 500 }}>Đang tải dữ liệu...</div>
    </div>
  );
}
