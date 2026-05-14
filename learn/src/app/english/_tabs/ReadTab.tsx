'use client';
import type { Dispatch, SetStateAction } from 'react';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }
type Article = { title: string; body: string; wordCount: number };
type Q = { q: string; options: string[]; answer: number };
type ChatMsg = { role: 'user' | 'ai'; text: string };

const READ_LEVELS = [{ id: 'A1', label: 'A1' }, { id: 'A2', label: 'A2' }, { id: 'B1', label: 'B1' }, { id: 'B2', label: 'B2' }, { id: 'C1', label: 'C1' }];

interface Props {
  readLevel: string; setReadLevel: (v: string) => void;
  readCustomTopic: string; setReadCustomTopic: (v: string) => void;
  readLoading: boolean;
  readError: string;
  readArticle: Article | null;
  readRecordId: number | null;
  readSelected: string; setReadSelected: Dispatch<SetStateAction<string>>;
  readLookup: string;
  readLookupLoading: boolean;
  readQuestions: Q[];
  readAnswers: number[]; setReadAnswers: Dispatch<SetStateAction<number[]>>;
  readSubmitted: boolean; setReadSubmitted: (v: boolean) => void;
  readScore: number;
  readChat: ChatMsg[];
  readChatInput: string; setReadChatInput: (v: string) => void;
  readChatLoading: boolean;
  readSpeaking: boolean; setReadSpeaking: (v: boolean) => void;
  generateReading: () => void;
  readLookupFn: () => void;
  sendReadChat: () => void;
  markLessonLearned: (id: number) => void;
  speak: (text: string, speed?: number, voice?: string, server?: string) => Promise<void> | void;
  globalSpeed: number;
  globalVoice: string;
  globalTtsProvider: string;
  parseMarkdown: (text: string) => string;
  history: EngLesson[];
}

export default function ReadTab({
  readLevel, setReadLevel,
  readCustomTopic, setReadCustomTopic,
  readLoading, readError, readArticle, readRecordId,
  readSelected, setReadSelected,
  readLookup, readLookupLoading,
  readQuestions, readAnswers, setReadAnswers,
  readSubmitted, setReadSubmitted, readScore,
  readChat, readChatInput, setReadChatInput, readChatLoading,
  readSpeaking, setReadSpeaking,
  generateReading, readLookupFn, sendReadChat,
  markLessonLearned,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  parseMarkdown, history,
}: Props) {
  return (
    <div className="desktop-2col">
      <div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {READ_LEVELS.map(l => (
              <button key={l.id} onClick={() => setReadLevel(l.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: readLevel === l.id ? 'var(--accent)' : 'var(--border)', background: readLevel === l.id ? '#58a6ff22' : 'transparent', color: readLevel === l.id ? 'var(--accent)' : 'var(--muted)' }}>{l.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>✏️ Hoặc tự nhập chủ đề (tiếng Việt hoặc tiếng Anh):</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={readCustomTopic} onChange={e => setReadCustomTopic(e.target.value)} placeholder="Ví dụ: Trí tuệ nhân tạo..." style={{ flex: 1, fontSize: 13 }} />
              <button onClick={generateReading} disabled={!readCustomTopic.trim() || readLoading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: readCustomTopic.trim() && !readLoading ? 'var(--green)' : 'var(--surface2)', color: readCustomTopic.trim() && !readLoading ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: readCustomTopic.trim() && !readLoading ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                {readLoading ? '⏳...' : '🤖 Tạo'}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', height: 44 }} onClick={generateReading} disabled={readLoading}>
            {readLoading ? '⏳ AI đang tạo bài...' : '🤖 Tạo bài đọc mới'}
          </button>
          {readError && <div style={{ fontSize: 11, color: '#f85149', marginTop: 8, textAlign: 'center' }}>{readError}</div>}
        </div>

        {readArticle && (
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3, color: 'var(--accent)', marginBottom: 12 }}>{readArticle.title}</div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, background: 'var(--surface2)', padding: '3px 8px', borderRadius: 4, color: 'var(--muted)', fontWeight: 600 }}>{readArticle.wordCount} words</span>
                  <span style={{ fontSize: 11, background: 'var(--surface2)', padding: '3px 8px', borderRadius: 4, color: 'var(--muted)', fontWeight: 600 }}>Level {readLevel}</span>
                  {(() => {
                    const itemId = readRecordId || history.find(h => h.type === 'reading' && h.content === readArticle.body)?.id;
                    const item = history.find(h => h.id === itemId);
                    if (item && item.learnCount > 0) {
                      return (
                        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#3fb95022', color: '#3fb950', fontWeight: 700, border: '1px solid #3fb95044' }}>
                          ✓ Đã học {item.learnCount} lần
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={async () => {
                      setReadSpeaking(true);
                      try {
                        await speak(`${readArticle.title}. ${readArticle.body}`, globalSpeed, globalVoice, globalTtsProvider);
                      } finally {
                        setReadSpeaking(false);
                      }
                    }}
                    disabled={readSpeaking}
                    style={{ padding: '6px 12px', borderRadius: 8, background: readSpeaking ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)', color: readSpeaking ? '#000' : 'var(--accent)', cursor: readSpeaking ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, animation: readSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
                  >
                    {readSpeaking ? '🔊 Đang phát...' : '🔊 Nghe bài'}
                  </button>
                  {(() => {
                    const itemId = readRecordId || history.find(h => h.type === 'reading' && h.content === readArticle.body)?.id;
                    if (itemId) {
                      return (
                        <button onClick={() => markLessonLearned(itemId)} style={{ padding: '6px 12px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          📚 Đã học xong
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 15, lineHeight: 1.9, color: 'var(--text-main)', userSelect: 'text', letterSpacing: '0.01em' }}
              onMouseUp={() => {
                try {
                  const s = window.getSelection()?.toString().trim();
                  if (s && s.length > 0 && s.length < 300) setReadSelected(s);
                } catch { /**/ }
              }}>
              {readArticle.body.split('\n\n').map((p, i) => <p key={i} style={{ marginBottom: 16, marginTop: 0 }}>{p}</p>)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>💡 Bôi đen từ hoặc câu để tra nghĩa</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {readArticle && (
          <div className="card" style={{ borderLeft: '3px solid var(--purple)' }}>
            <div className="section-title" style={{ color: 'var(--purple)' }}>🔍 Tra từ / câu</div>
            <textarea className="input" rows={4} value={readSelected} onChange={e => setReadSelected(e.target.value)} placeholder="Bôi đen trong bài hoặc gõ từ cần tra..." style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.6 }} />
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={readLookupFn} disabled={readLookupLoading || !readSelected.trim()}>
              {readLookupLoading ? '⏳ Đang tra...' : '🤖 AI giải thích'}
            </button>
            {readLookup && <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}
              dangerouslySetInnerHTML={{ __html: parseMarkdown(readLookup) }}></div>}
          </div>
        )}

        {readQuestions.length > 0 && (
          <div className="card">
            <div className="section-title">🧠 Comprehension</div>
            {readQuestions.map((q, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>{i + 1}. {q.q}</div>
                {q.options.map((opt, oi) => {
                  const isSel = readAnswers[i] === oi, isCorrect = q.answer === oi;
                  let bg = 'var(--surface2)', border = 'var(--border)', color = 'var(--text)';
                  if (readSubmitted) { if (isCorrect) { bg = '#0d1a0e'; border = '#3fb950'; color = '#3fb950'; } else if (isSel) { bg = '#1a0a0a'; border = '#f85149'; color = '#f85149'; } } else if (isSel) { bg = '#58a6ff22'; border = '#58a6ff'; }
                  return <button key={oi} onClick={() => { if (!readSubmitted) setReadAnswers(a => { const n = [...a]; n[i] = oi; return n; }); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '9px 12px', color, fontSize: 13, cursor: readSubmitted ? 'default' : 'pointer', marginBottom: 5, lineHeight: 1.4 }}>{String.fromCharCode(65 + oi)}) {opt}</button>;
                })}
              </div>
            ))}
            {!readSubmitted
              ? <button className="btn btn-green" style={{ width: '100%', height: 42 }} onClick={() => setReadSubmitted(true)} disabled={readAnswers.some(a => a === -1)}>Submit</button>
              : <div style={{ textAlign: 'center', padding: 14, background: readScore === readQuestions.length ? '#0d1a0e' : '#1a0a0a', borderRadius: 10, border: `1px solid ${readScore === readQuestions.length ? '#3fb950' : '#f85149'}` }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: readScore === readQuestions.length ? '#3fb950' : '#f85149' }}>{readScore}/{readQuestions.length} {readScore === readQuestions.length ? '🎉' : '💪'}</div>
              </div>
            }
          </div>
        )}

        {readArticle && (
          <div className="card" style={{ borderLeft: '3px solid var(--green)' }}>
            <div className="section-title" style={{ color: 'var(--green)' }}>💬 Hỏi AI về bài đọc</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {readChat.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Hỏi AI về từ khó, ngữ pháp, nội dung bài...</div>}
              {readChat.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.6, background: m.role === 'user' ? '#58a6ff22' : 'var(--surface2)', border: `1px solid ${m.role === 'user' ? '#58a6ff44' : 'var(--border)'}` }}
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(m.text) }}></div>
                </div>
              ))}
              {readChatLoading && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, background: 'var(--surface2)', color: 'var(--muted)' }}>⏳ AI đang trả lời...</div></div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={readChatInput} onChange={e => setReadChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReadChat(); } }} placeholder="Hỏi về bài đọc..." style={{ flex: 1, marginBottom: 0 }} />
              <button className="btn btn-green" onClick={sendReadChat} disabled={readChatLoading || !readChatInput.trim()} style={{ flexShrink: 0 }}>Gửi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
