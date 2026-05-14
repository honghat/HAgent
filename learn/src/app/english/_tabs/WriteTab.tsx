'use client';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }

const READ_LEVELS = [{ id: 'A1', label: 'A1' }, { id: 'A2', label: 'A2' }, { id: 'B1', label: 'B1' }, { id: 'B2', label: 'B2' }, { id: 'C1', label: 'C1' }];

interface Props {
  writeTopicLoading: boolean;
  writePrompt: string;
  writeRecordId: number | null;
  writeLoading: boolean;
  writeTopicError: string;
  writeLevel: string; setWriteLevel: (v: string) => void;
  writeCustomPrompt: string; setWriteCustomPrompt: (v: string) => void;
  writeSampleDirection: string; setWriteSampleDirection: (v: string) => void;
  writeSample: string; setWriteSample: (v: string) => void;
  writeSampleLoading: boolean;
  writeText: string; setWriteText: (v: string) => void;
  wordCount: number;
  writeFeedback: string; setWriteFeedback: (v: string) => void;
  genWriteTopic: () => void;
  genWriteSample: () => void;
  checkWriting: () => void;
  markLessonLearned: (id: number) => void;
  stopTask: (type: string) => void;
  getGenMessage: (elapsed: number, action?: string) => string;
  genElapsed: number;
  speak: (text: string, speed?: number, voice?: string, server?: string) => Promise<void> | void;
  globalSpeed: number;
  globalVoice: string;
  globalTtsProvider: string;
  parseMarkdown: (text: string) => string;
  history: EngLesson[];
}

export default function WriteTab({
  writeTopicLoading, writePrompt, writeRecordId,
  writeLoading, writeTopicError,
  writeLevel, setWriteLevel,
  writeCustomPrompt, setWriteCustomPrompt,
  writeSampleDirection, setWriteSampleDirection,
  writeSample, setWriteSample, writeSampleLoading,
  writeText, setWriteText, wordCount,
  writeFeedback, setWriteFeedback,
  genWriteTopic, genWriteSample, checkWriting,
  markLessonLearned, stopTask,
  getGenMessage, genElapsed,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  parseMarkdown, history,
}: Props) {
  return (
    <div className="desktop-2col" style={{ width: '100%', maxWidth: '100%' }}>
      <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--orange)', position: 'relative', maxWidth: '100%', overflowWrap: 'break-word' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Đề tài viết</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, color: 'var(--orange)', fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {writeTopicLoading ? getGenMessage(genElapsed, 'soạn bài') : writePrompt}
                  {writeTopicLoading && <button onClick={() => stopTask('writing')} style={{ color: 'var(--red)', background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 800, marginLeft: 6 }}>[Dừng]</button>}
                </div>
                {(() => {
                  const item = history.find(h => h.id === writeRecordId);
                  if (item && item.learnCount > 0) {
                    return (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#3fb95022', color: '#3fb950', fontWeight: 700, border: '1px solid #3fb95044' }}>
                        ✓ {item.learnCount} lần
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              {(() => {
                const activeId = writeRecordId || history.find(h => h.type === 'writing' && h.content === writeText)?.id;
                if (activeId) {
                  return (
                    <button
                      onClick={() => markLessonLearned(activeId)}
                      style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.3)' }}
                    >
                      ✓ Đã viết xong
                    </button>
                  );
                }
                return null;
              })()}
            </div>
            <button onClick={genWriteTopic} disabled={writeTopicLoading || writeLoading} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              {writeTopicLoading ? '⏳...' : '🤖 Tạo đoạn viết mới'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={genWriteSample} disabled={writeSampleLoading} style={{ fontSize: 12, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {writeSampleLoading ? '⏳ Đang soạn bài mẫu...' : '💡 Gợi ý bài viết mẫu'}
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {READ_LEVELS.map(l => (
                <button key={l.id} onClick={() => setWriteLevel(l.id)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderColor: writeLevel === l.id ? 'var(--accent)' : 'var(--border)', background: writeLevel === l.id ? '#58a6ff22' : 'transparent', color: writeLevel === l.id ? 'var(--accent)' : 'var(--muted)' }}>{l.label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>✏️ Hoặc tự nhập đề tài (tiếng Việt):</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={writeCustomPrompt}
                onChange={e => setWriteCustomPrompt(e.target.value)}
                placeholder="Ví dụ: Viết về công việc mơ ước của bạn..."
                style={{ flex: 1, fontSize: 16 }}
              />
              <button
                onClick={genWriteTopic}
                disabled={!writeCustomPrompt.trim() || writeTopicLoading || writeLoading}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: writeCustomPrompt.trim() && !writeTopicLoading && !writeLoading ? 'var(--green)' : 'var(--surface2)', color: writeCustomPrompt.trim() && !writeTopicLoading && !writeLoading ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: writeCustomPrompt.trim() && !writeTopicLoading && !writeLoading ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >
                {writeTopicLoading ? '⏳...' : '🤖 Tạo'}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>💡 Định hướng bài mẫu (tùy chọn):</div>
            <input
              className="input"
              value={writeSampleDirection}
              onChange={e => setWriteSampleDirection(e.target.value)}
              placeholder="Ví dụ: Sử dụng cấu trúc 3 đoạn, đưa ra ví dụ thực tế..."
              style={{ fontSize: 13 }}
            />
          </div>
          {writeTopicError && <div style={{ fontSize: 11, color: '#f85149', marginTop: 8 }}>{writeTopicError}</div>}
        </div>
        {writeSample && (
          <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--green)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'nowrap' }}>
              <div className="section-title" style={{ color: 'var(--green)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>💡 Bài viết mẫu AI</div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 1, flexWrap: 'wrap' }}>
                <button
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    let text = writeSample;
                    const enStartMatch = text.match(/English:?\s*/i);
                    const enStartIdx = enStartMatch ? enStartMatch.index! + enStartMatch[0].length : 0;
                    const viMarkers = [/Tiếng Việt/i, /Bản dịch/i, /Dịch/i, /Từ hay/i, /Từ vựng/i];
                    let firstViIdx = text.length;
                    viMarkers.forEach(regex => {
                      const m = text.match(regex);
                      if (m && m.index! > enStartIdx && m.index! < firstViIdx) firstViIdx = m.index!;
                    });
                    text = text.slice(enStartIdx, firstViIdx).replace(/(\*\*|##|#|>\s|[:])/g, '').trim();
                    text = text.replace(/\[.*?\]/g, '').replace(/\/.*?\//g, '').trim();
                    const old = btn.innerText;
                    btn.innerText = '🔊 Đang phát...';
                    btn.style.pointerEvents = 'none';
                    Promise.resolve(speak(text, globalSpeed, globalVoice, globalTtsProvider)).finally(() => {
                      btn.innerText = old;
                      btn.style.pointerEvents = 'auto';
                    });
                  }}
                  title="Nghe mẫu"
                  style={{ fontSize: 14, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '4px 8px' }}
                >
                  🔊
                </button>
                <button
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    let text = writeSample;
                    const enStartMatch = text.match(/English:?\s*/i);
                    const enStartIdx = enStartMatch ? enStartMatch.index! + enStartMatch[0].length : 0;
                    const viMarkers = [/Tiếng Việt/i, /Bản dịch/i, /Dịch/i, /Từ hay/i, /Từ vựng/i];
                    let firstViIdx = text.length;
                    viMarkers.forEach(regex => {
                      const m = text.match(regex);
                      if (m && m.index! > enStartIdx && m.index! < firstViIdx) firstViIdx = m.index!;
                    });
                    text = text.slice(enStartIdx, firstViIdx);
                    text = text.replace(/(\*\*|##|#|>\s|[:])/g, '').trim();
                    navigator.clipboard.writeText(text);
                    const old = btn.innerText;
                    btn.innerText = '✓ Đã copy';
                    setTimeout(() => btn.innerText = old, 2000);
                  }}
                  title="Copy"
                  style={{ fontSize: 14, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '4px 8px' }}
                >
                  📋
                </button>
                <button onClick={() => setWriteSample('')} title="Đóng" style={{ fontSize: 14, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(writeSample) }} />
          </div>
        )}
        <div className="card">
          <textarea className="input" value={writeText} onChange={e => setWriteText(e.target.value)} rows={9}
            placeholder="Viết tiếng Anh ở đây... (mục tiêu 200 từ)" style={{ marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: wordCount >= 200 ? 'var(--green)' : 'var(--muted)' }}>{wordCount} / 200 từ</span>
            <button onClick={() => { setWriteText(''); setWriteFeedback(''); }} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Xóa</button>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={checkWriting} disabled={writeLoading || !writeText.trim()}>
            {writeLoading ? '⏳ AI đang chấm bài...' : '🤖 AI chấm bài viết'}
          </button>
        </div>
      </div>

      <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
        {writeFeedback && (
          <div className="card" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--surface2)', maxWidth: '100%', overflowWrap: 'break-word' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="section-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800 }}>
                  <span>🔍</span> Chi tiết sửa bài
                </div>
                {(() => {
                  const item = history.find(h => h.id === writeRecordId);
                  if (item && item.learnCount > 0) {
                    return (
                      <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, background: '#3fb95022', color: '#3fb950', fontSize: 10, fontWeight: 700, border: '1px solid #3fb95044' }}>
                        ✓ Đã học {item.learnCount} lần
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              {writeRecordId && (
                <button onClick={() => markLessonLearned(writeRecordId)} style={{ padding: '6px 12px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.2)' }}>
                  ✓ Đánh dấu đã học
                </button>
              )}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-main)', opacity: 0.95 }}
              dangerouslySetInnerHTML={{ __html: parseMarkdown(writeFeedback) }}></div>
          </div>
        )}
      </div>
    </div>
  );
}
