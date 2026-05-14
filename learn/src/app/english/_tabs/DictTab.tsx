'use client';
import React, { useState } from 'react';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }

interface Props {
  dictInput: string;
  setDictInput: (v: string) => void;
  dictResult: string;
  setDictResult: (v: string) => void;
  dictLoading: boolean;
  lookupWord: () => void;
  history: EngLesson[];
  mode: string;
  loadHistory: () => void;
  speak: (text: string, speed?: number, voice?: string, server?: string) => void;
  globalSpeed: number;
  globalVoice: string;
  globalTtsProvider: string;
  parseMarkdown: (text: string) => string;
}

export default function DictTab({
  dictInput, setDictInput, dictResult, setDictResult, dictLoading, lookupWord,
  history, mode, loadHistory,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  parseMarkdown,
}: Props) {
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null);
  
  const dictItems = history.filter(h => {
    if (h.type !== 'dict') return false;
    if (mode === 'all') return true;
    try {
      const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
      return itemMode === mode;
    } catch {
      return false;
    }
  });

  return (
    <div className="desktop-2col">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0, flexShrink: 0 }}>🔎 Tra từ</div>
            <input
              className="input"
              value={dictInput}
              onChange={e => setDictInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') lookupWord(); }}
              placeholder="Nhập từ hoặc cụm từ tiếng Anh..."
              style={{ flex: 1, marginBottom: 0, fontSize: 16 }}
            />
            <button className="btn btn-primary" onClick={lookupWord} disabled={dictLoading || !dictInput.trim()} style={{ flexShrink: 0, padding: '8px 16px', fontSize: 13 }}>
              {dictLoading ? '⏳' : '🔎'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['run', 'make', 'break', 'handle', 'deploy', 'callback', 'async', 'refactor', 'leverage', 'on behalf of'].map(w => (
              <button key={w} onClick={() => { setDictInput(w); setDictResult(''); }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', color: 'var(--muted)', background: 'transparent' }}>{w}</button>
            ))}
          </div>
        </div>

        {dictResult && (
          <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--accent)' }}>{dictInput}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => speak(dictInput, globalSpeed, globalVoice, globalTtsProvider)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>🔊 Nghe</button>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: parseMarkdown(dictResult) }} />
          </div>
        )}
      </div>

      <div>
        {dictItems.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="section-title" style={{ margin: 0 }}>🕐 Đã tra gần đây ({dictItems.length})</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
              {dictItems.map((item) => {
                let word = '';
                try { word = JSON.parse(item.metadata || '{}').word || item.content.slice(0, 30); } catch { word = item.content.slice(0, 30); }
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => { setDictInput(word); setDictResult(item.content); }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{word}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(item.createdAt).toLocaleString('vi')}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); speak(word, globalSpeed, globalVoice, globalTtsProvider); }} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>🔊</button>
                    {deleteConfirmId === item.id ? (
                      <button 
                        onClick={async e => { 
                          e.stopPropagation(); 
                          await fetch('/api/english', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }); 
                          setDeleteConfirmId(null);
                          loadHistory(); 
                        }} 
                        style={{ fontSize: 9, color: '#fff', background: '#f85149', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5, fontWeight: 900 }}
                      >
                        XÓA?
                      </button>
                    ) : (
                      <button onClick={e => { 
                        e.stopPropagation(); 
                        setDeleteConfirmId(item.id); 
                        setTimeout(() => setDeleteConfirmId(prev => prev === item.id ? null : prev), 3000);
                      }} style={{ fontSize: 11, color: '#f85149', background: '#f8514915', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}>🗑</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
