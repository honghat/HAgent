const fs = require('fs');

let code = fs.readFileSync('src/app/english/EnglishContent.tsx', 'utf8');

// 1. Change useEffect loadHistory
code = code.replace(
  "useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);",
  "useEffect(() => { loadHistory(); }, [loadHistory, tab]);"
);

// 2. Wrap main content with desktop-main-side
code = code.replace(
  "{/* ── LISTEN ── */}",
  `<div className="desktop-main-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── LISTEN ── */}`
);

// 3. Remove old history block and replace with new right column
const historyReplacement = `
        </div>
        
        {/* ── HISTORY RIGHT COLUMN ── */}
        <div>
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <div className="section-title" style={{ margin:0 }}>📚 Lịch sử học</div>
              <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} onClick={loadHistory}>↻ Tải lại</button>
            </div>
            {historyLoading && <div style={{ color:'var(--muted)', padding:20 }}>Đang tải...</div>}
            
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {(() => {
                const mapType = tab === 'write' ? 'writing' : tab;
                const items = history.filter(h => h.type === mapType);
                if (!items.length && !historyLoading) return <div style={{color:'var(--muted)', fontSize:12}}>Chưa có bài học nào.</div>;
                
                return items.map(item => (
                  <div key={item.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 4px', borderBottom:'1px solid var(--surface2)', cursor:'pointer' }}
                    onClick={() => {
                      if (mapType === 'listen') {
                        setListenText(item.content);
                        setTab('listen');
                      } else if (mapType === 'speak') {
                        setTranscript(item.content);
                        try { setSpkFeedback(JSON.parse(item.metadata||'{}').feedback || ''); } catch { /**/ }
                        setTab('speak');
                      } else if (mapType === 'writing') {
                        setWriteText(item.content);
                        try { const m = JSON.parse(item.metadata||'{}'); setWritePrompt(m.prompt || WRITING_PROMPTS[0]); setWriteFeedback(m.feedback || ''); } catch { /**/ }
                        setTab('write');
                      } else if (mapType === 'vocab') {
                        try { const parsed = JSON.parse(item.content); setCards(parsed); setCardIdx(0); setFlipped(false); setKnown([]); } catch { /**/ }
                        setTab('vocab');
                      } else if (mapType === 'read') {
                        try { const m = JSON.parse(item.metadata||'{}'); setReadTopic(m.topic||''); setReadLevel(m.level||'B1'); setReadQuestions(m.questions||[]); setReadAnswers([]); setReadSubmitted(false); } catch { /**/ }
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {mapType === 'vocab'
                          ? (() => { try { return \`\${JSON.parse(item.content).length} từ: \${JSON.parse(item.metadata||'{}').topic||''}\`; } catch { return item.content.slice(0,50); } })()
                          : (mapType === 'speak' || mapType === 'writing')
                            ? (() => { try { return JSON.parse(item.metadata||'{}').topic || JSON.parse(item.metadata||'{}').prompt; } catch { return item.content.slice(0,50); } })()
                            : (mapType === 'read') 
                              ? (() => { try { return JSON.parse(item.metadata||'{}').title; } catch { return item.content.slice(0,50); } })()
                              : item.content.slice(0,60)}
                      </div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                        {new Date(item.createdAt).toLocaleString('vi')} · <span style={{ color:'var(--accent)' }}>Sửa/Học lại →</span>
                      </div>
                    </div>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm('Bạn chắc chắn xóa bài này?')) return;
                      await fetch('/api/english', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: item.id }) });
                      loadHistory();
                    }} style={{ flexShrink:0, fontSize:13, color:'#f85149', background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>🗑</button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

const historyStartStr = "{/* ── HISTORY ── */}";
const historyStartIndex = code.indexOf(historyStartStr);
if (historyStartIndex !== -1) {
  // Find the exact end of the file or matching closing divs manually.
  // We'll replace from History marker all the way to the end of the file.
  code = code.substring(0, historyStartIndex) + historyReplacement;
}

fs.writeFileSync('src/app/english/EnglishContent.tsx', code);
console.log('Refactoring done.');
