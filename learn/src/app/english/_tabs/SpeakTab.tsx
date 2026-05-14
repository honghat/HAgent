'use client';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }

const READ_LEVELS = [{ id: 'A1', label: 'A1' }, { id: 'A2', label: 'A2' }, { id: 'B1', label: 'B1' }, { id: 'B2', label: 'B2' }, { id: 'C1', label: 'C1' }];

interface Props {
  spkTopicLoading: boolean;
  spkTopic: string;
  spkLoading: boolean;
  spkRecordId: number | null;
  spkLevel: string; setSpkLevel: (v: string) => void;
  spkCustomTopic: string; setSpkCustomTopic: (v: string) => void;
  spkSampleDirection: string; setSpkSampleDirection: (v: string) => void;
  spkSample: string; setSpkSample: (v: string) => void;
  spkSampleLoading: boolean;
  spkTopicError: string;
  spkFeedback: string;
  transcript: string;
  recognizing: boolean;
  sttStatus: string;
  genSpkTopic: () => void;
  genSpkSample: () => void;
  getFeedback: () => void;
  startRec: () => void;
  stopRec: () => void;
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

export default function SpeakTab({
  spkTopicLoading, spkTopic, spkLoading, spkRecordId,
  spkLevel, setSpkLevel,
  spkCustomTopic, setSpkCustomTopic,
  spkSampleDirection, setSpkSampleDirection,
  spkSample, setSpkSample, spkSampleLoading,
  spkTopicError, spkFeedback, transcript, recognizing, sttStatus,
  genSpkTopic, genSpkSample, getFeedback, startRec, stopRec,
  markLessonLearned, stopTask,
  getGenMessage, genElapsed,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  parseMarkdown, history,
}: Props) {
  return (
    <div className="desktop-2col">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ borderLeft: '4px solid var(--purple)', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Chủ đề luyện nói</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, color: 'var(--purple)', fontWeight: 800, lineHeight: 1.4 }}>
                  {spkTopicLoading ? getGenMessage(genElapsed) : spkTopic}
                  {spkTopicLoading && <button onClick={() => stopTask('speak')} style={{ color: 'var(--orange)', background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 800, marginLeft: 6 }}>[Dừng]</button>}
                </div>
                {(() => {
                  const item = history.find(h => h.id === spkRecordId);
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
                const activeId = spkRecordId || history.find(h => h.type === 'speak' && h.content === transcript)?.id;
                if (activeId) {
                  return (
                    <button
                      onClick={() => markLessonLearned(activeId)}
                      style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.2)' }}
                    >
                      ✓ Đã luyện nói xong
                    </button>
                  );
                }
                return null;
              })()}
            </div>
            <button onClick={genSpkTopic} disabled={spkTopicLoading || spkLoading} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              {spkTopicLoading ? '⏳...' : '🤖 Đổi chủ đề'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {READ_LEVELS.map(l => (
              <button key={l.id} onClick={() => setSpkLevel(l.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: spkLevel === l.id ? 'var(--accent)' : 'var(--border)', background: spkLevel === l.id ? '#58a6ff22' : 'transparent', color: spkLevel === l.id ? 'var(--accent)' : 'var(--muted)' }}>{l.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>✏️ Hoặc tự nhập chủ đề (tiếng Việt):</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={spkCustomTopic}
                onChange={e => setSpkCustomTopic(e.target.value)}
                placeholder="Ví dụ: Nói về sở thích của bạn..."
                style={{ flex: 1, fontSize: 16 }}
              />
              <button
                onClick={genSpkTopic}
                disabled={!spkCustomTopic.trim() || spkTopicLoading || spkLoading}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: spkCustomTopic.trim() && !spkTopicLoading && !spkLoading ? 'var(--green)' : 'var(--surface2)', color: spkCustomTopic.trim() && !spkTopicLoading && !spkLoading ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: spkCustomTopic.trim() && !spkTopicLoading && !spkLoading ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >
                {spkTopicLoading ? '⏳...' : '🤖 Tạo'}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>💡 Định hướng bài mẫu (tùy chọn):</div>
            <input
              className="input"
              value={spkSampleDirection}
              onChange={e => setSpkSampleDirection(e.target.value)}
              placeholder="Ví dụ: Tập trung vào lợi ích, đưa ra ví dụ cụ thể..."
              style={{ fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => speak(spkTopic, globalSpeed, globalVoice, globalTtsProvider)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🔊</span> Nghe câu hỏi
            </button>
            <button onClick={genSpkSample} disabled={spkSampleLoading || recognizing} style={{ fontSize: 12, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {spkSampleLoading ? '⏳ Đang tạo bài mẫu...' : '💡 Gợi ý trả lời mẫu'}
            </button>
          </div>
          {spkTopicError && <div style={{ fontSize: 11, color: '#f85149', marginTop: 8 }}>{spkTopicError}</div>}
        </div>
        {spkSample && (
          <div className="card" style={{ borderLeft: '4px solid var(--green)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'nowrap' }}>
              <div className="section-title" style={{ color: 'var(--green)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>💡 Bài mẫu AI</div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 1, flexWrap: 'nowrap' }}>
                <button
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    let text = spkSample;
                    const enStartMatch = text.match(/English:?\s*/i);
                    const enStartIdx = enStartMatch ? enStartMatch.index! + enStartMatch[0].length : 0;
                    const viMarkers = [/Tiếng Việt/i, /Bản dịch/i, /Dịch/i, /Từ hay/i];
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
                    let text = spkSample;
                    const enStartMatch = text.match(/English:?\s*/i);
                    const enStartIdx = enStartMatch ? enStartMatch.index! + enStartMatch[0].length : 0;
                    const viMarkers = [/Tiếng Việt/i, /Bản dịch/i, /Dịch/i, /Từ hay/i, /Từ vựng/i];
                    let firstViIdx = text.length;
                    viMarkers.forEach(regex => {
                      const m = text.match(regex);
                      if (m && m.index! > enStartIdx && m.index! < firstViIdx) firstViIdx = m.index!;
                    });
                    text = text.slice(enStartIdx, firstViIdx).replace(/(\*\*|##|#|>\s|[:])/g, '').trim();
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
                <button onClick={() => setSpkSample('')} title="Đóng" style={{ fontSize: 14, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(spkSample) }} />
          </div>
        )}

        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <button onClick={recognizing ? stopRec : startRec} style={{ width: 88, height: 88, borderRadius: 99, border: 'none', fontSize: 36, cursor: 'pointer', background: recognizing ? 'var(--red)' : 'var(--green)', color: '#000', marginBottom: 14, boxShadow: recognizing ? '0 0 0 8px rgba(248,81,73,0.25)' : 'none', transition: 'all 0.2s' }}>
            {recognizing ? '⏹' : '🎤'}
          </button>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {sttStatus || (recognizing ? 'Đang ghi âm — bấm để dừng' : 'Bấm để nói · Whisper AI')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {transcript && (
          <div className="card">
            <div className="section-title">Bạn vừa nói</div>
            <div style={{ fontSize: 14, fontStyle: 'italic', lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>&quot;{transcript}&quot;</div>
            <button className="btn btn-ghost" style={{ width: '100%', position: 'relative' }} onClick={getFeedback} disabled={spkLoading || recognizing}>
              {spkLoading ? '⏳ AI đang chấm điểm...' : '🤖 AI chấm điểm & nhận xét'}
            </button>
          </div>
        )}
        {spkFeedback && (
          <div className="card" style={{ borderLeft: '4px solid var(--green)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="section-title" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 800 }}>
                  <span>📋</span> Kết quả chấm điểm
                </div>
                {spkRecordId && (history.find(h => h.id === spkRecordId)?.learnCount ?? 0) > 0 && (
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, background: '#3fb95022', color: '#3fb950', fontSize: 10, fontWeight: 700, border: '1px solid #3fb95044' }}>
                    ✓ Đã học {history.find(h => h.id === spkRecordId)!.learnCount} lần
                  </div>
                )}
              </div>
              {spkRecordId && (
                <button onClick={() => markLessonLearned(spkRecordId)} style={{ padding: '6px 12px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.2)' }}>
                  ✓ Đánh dấu đã học
                </button>
              )}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-main)', opacity: 0.95 }}
              dangerouslySetInnerHTML={{ __html: parseMarkdown(spkFeedback) }}></div>
          </div>
        )}
      </div>
    </div>
  );
}
