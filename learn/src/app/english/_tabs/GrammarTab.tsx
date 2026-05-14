'use client';
import type { Dispatch, SetStateAction } from 'react';

interface EngLesson { id: number; type: string; learnCount: number; }

const GRAMMAR_TOPICS_DEFAULT = [
  'Thì hiện tại đơn', 'Thì hiện tại tiếp diễn', 'Thì hiện tại hoàn thành',
  'Thì quá khứ đơn', 'Thì tương lai đơn',
  'Câu điều kiện loại 1', 'Câu điều kiện loại 2', 'Câu bị động',
  'Câu gián tiếp', 'Mệnh đề quan hệ', 'So sánh', 'Giới từ',
];

interface Props {
  grammarTopics: string[];
  grammarTopic: string; setGrammarTopic: (v: string) => void;
  grammarCustomTopic: string; setGrammarCustomTopic: (v: string) => void;
  grammarLoading: boolean;
  grammarLesson: string | null;
  grammarRecordId: number | null;
  history: EngLesson[];
  grammarQuizAnswers: string[];
  grammarUserAnswers: string[]; setGrammarUserAnswers: Dispatch<SetStateAction<string[]>>;
  grammarSubmitted: boolean; setGrammarSubmitted: (v: boolean) => void;
  genGrammarLesson: () => void;
  markLessonLearned: (id: number, score?: number, total?: number) => void;
  parseMarkdown: (text: string) => string;
}

export default function GrammarTab({
  grammarTopics = GRAMMAR_TOPICS_DEFAULT,
  grammarTopic, setGrammarTopic,
  grammarCustomTopic, setGrammarCustomTopic,
  grammarLoading, grammarLesson, grammarRecordId, history,
  grammarQuizAnswers, grammarUserAnswers, setGrammarUserAnswers,
  grammarSubmitted, setGrammarSubmitted,
  genGrammarLesson, markLessonLearned, parseMarkdown,
}: Props) {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Selection Area */}
      <div className="card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '80px', opacity: 0.05, transform: 'rotate(15deg)', pointerEvents: 'none' }}>📐</div>
        
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '24px' }}>📐</span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900 }}>Luyện Ngữ Pháp AI</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Nâng cao cấu trúc câu và sự chính xác</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginBottom: '20px' }}>
          {grammarTopics.map(t => (
            <button 
              key={t} 
              onClick={() => { 
                setGrammarTopic(t); 
                setGrammarCustomTopic(''); 
                // Tự động chạy bài học khi click chủ đề có sẵn
                setTimeout(genGrammarLesson, 0);
              }} 
              disabled={grammarLoading}
              style={{ 
                padding: '10px 12px', 
                borderRadius: '10px', 
                border: '1px solid', 
                fontSize: '12px', 
                fontWeight: 700, 
                cursor: 'pointer', 
                transition: 'all 0.2s',
                textAlign: 'left',
                borderColor: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)' : 'var(--border)', 
                background: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)15' : 'var(--surface2)', 
                color: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)' : 'var(--text)',
                boxShadow: grammarTopic === t && !grammarCustomTopic ? '0 4px 12px rgba(88,166,255,0.15)' : 'none',
                opacity: grammarLoading ? 0.6 : 1
              }}
            >
              {grammarLoading && grammarTopic === t ? '⏳' : t}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="input"
              placeholder="Hoặc tự nhập chủ đề (VD: Câu chẻ, Đảo ngữ loại 3...)"
              value={grammarCustomTopic}
              onChange={e => {
                setGrammarCustomTopic(e.target.value);
                if (e.target.value) setGrammarTopic(e.target.value);
              }}
              onKeyDown={e => { if (e.key === 'Enter') genGrammarLesson(); }}
              style={{ width: '100%', padding: '12px 16px', fontSize: '14px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)' }}
            />
            {grammarCustomTopic && (
              <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--accent)', fontWeight: 800 }}>Tùy chỉnh</div>
            )}
          </div>
          
          <button 
            className="btn btn-premium" 
            style={{ width: '120px', height: '46px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}
            onClick={genGrammarLesson}
            disabled={grammarLoading || !grammarTopic}
          >
            {grammarLoading ? '⏳...' : '📖 Học ngay'}
          </button>
        </div>
      </div>

      {/* Lesson Content Area */}
      {grammarLesson && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ 
              padding: '20px 24px', 
              background: 'linear-gradient(90deg, var(--surface2), transparent)', 
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Bài giảng chi tiết</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)' }}>{grammarTopic}</div>
                {(() => {
                  const item = history.find(h => h.id === grammarRecordId);
                  if (item && item.learnCount > 0) return (
                    <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, background: '#3fb95022', color: '#3fb950', fontSize: 10, fontWeight: 700, border: '1px solid #3fb95044' }}>
                      ✓ Đã học {item.learnCount} lần
                    </div>
                  );
                  return null;
                })()}
              </div>
              {grammarRecordId && (
                <button 
                  onClick={() => {
                    const score = grammarSubmitted ? grammarUserAnswers.filter((a, i) => a === grammarQuizAnswers[i]).length : undefined;
                    const total = grammarSubmitted ? grammarQuizAnswers.length : undefined;
                    markLessonLearned(grammarRecordId, score, total);
                  }} 
                  style={{ 
                    padding: '8px 16px', borderRadius: '8px', 
                    background: '#3fb95022', color: '#3fb950', 
                    border: '1px solid #3fb95044', cursor: 'pointer', 
                    fontWeight: 800, fontSize: '12px', transition: 'all 0.2s' 
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#3fb95033'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3fb95022'}
                >
                  ✓ Hoàn thành
                </button>
              )}
            </div>
            
            <div style={{ padding: '24px', fontSize: '15px', lineHeight: '1.8', color: 'var(--text)' }}>
              <div 
                className="markdown-body" 
                dangerouslySetInnerHTML={{ __html: parseMarkdown(grammarLesson.split(/Q1:|1\.\s*\[Question\]/)[0]) }} 
              />
            </div>
          </div>

          {/* Quiz Section */}
          {grammarQuizAnswers.length > 0 && (
            <div className="card" style={{ padding: '24px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--orange)22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🧠</div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>Bài tập củng cố</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Kiểm tra ngay kiến thức vừa học</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {grammarQuizAnswers.map((_, i) => {
                  const qNum = i + 1;
                  const quizPart = grammarLesson.split(/Q\d+:/)[qNum];
                  if (!quizPart) return null;
                  const question = quizPart.split('A)')[0].trim();
                  const optA = quizPart.match(/A\)\s*([^B\n]+)/)?.[1]?.trim() || '';
                  const optB = quizPart.match(/B\)\s*([^C\n]+)/)?.[1]?.trim() || '';
                  const optC = quizPart.match(/C\)\s*([^\n]+)/)?.[1]?.trim() || '';
                  const opts = [optA, optB, optC];

                  return (
                    <div key={i} style={{ padding: '20px', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '16px' }}>{qNum}.</span>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', lineHeight: '1.5' }}>{question}</div>
                      </div>
                      
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {['A', 'B', 'C'].map((opt, oi) => {
                          const isSelected = grammarUserAnswers[i] === opt;
                          const isCorrect = grammarQuizAnswers[i] === opt;
                          
                          let bg = 'var(--surface2)', border = 'var(--border)', color = 'var(--text)', opacity = 1;
                          let icon = '';

                          if (grammarSubmitted) {
                            if (isCorrect) { 
                              bg = '#3fb95015'; border = '#3fb95088'; color = '#3fb950'; 
                              icon = '✅';
                            } else if (isSelected) { 
                              bg = '#f8514915'; border = '#f8514988'; color = '#f85149'; 
                              icon = '❌';
                            } else {
                              opacity = 0.5;
                            }
                          } else if (isSelected) { 
                            bg = 'var(--accent)15'; border = 'var(--accent)'; color = 'var(--accent)';
                          }

                          return (
                            <button 
                              key={opt} 
                              onClick={() => !grammarSubmitted && setGrammarUserAnswers(prev => { const n = [...prev]; n[i] = opt; return n; })}
                              style={{ 
                                textAlign: 'left', padding: '14px 18px', borderRadius: '12px', 
                                border: `2px solid ${border}`, background: bg, color, 
                                fontSize: '14px', fontWeight: isSelected ? 800 : 600,
                                cursor: grammarSubmitted ? 'default' : 'pointer',
                                transition: 'all 0.15s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                opacity
                              }}
                            >
                              <span><span style={{ opacity: 0.6, marginRight: '8px' }}>{opt}.</span> {opts[oi]}</span>
                              <span>{icon}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '32px' }}>
                {!grammarSubmitted ? (
                  <button 
                    className="btn btn-green" 
                    style={{ width: '100%', height: '52px', fontSize: '16px', fontWeight: 900, borderRadius: '14px', boxShadow: '0 8px 20px rgba(63,185,80,0.2)' }} 
                    onClick={() => {
                      setGrammarSubmitted(true);
                      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    }} 
                    disabled={grammarUserAnswers.some(a => !a)}
                  >
                    Nộp bài & Kiểm tra kết quả
                  </button>
                ) : (
                  <div style={{ 
                    textAlign: 'center', padding: '24px', 
                    background: 'linear-gradient(135deg, var(--surface), var(--surface2))', 
                    borderRadius: '16px', border: '2px solid var(--green)44',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600 }}>KẾT QUẢ CỦA BẠN</div>
                    <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--green)', letterSpacing: '-1px' }}>
                      {grammarUserAnswers.filter((a, i) => a === grammarQuizAnswers[i]).length} / {grammarQuizAnswers.length}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--green)', fontWeight: 700, marginTop: '8px' }}>
                      {grammarUserAnswers.filter((a, i) => a === grammarQuizAnswers[i]).length === grammarQuizAnswers.length 
                        ? '🌟 Tuyệt vời! Bạn đã nắm vững kiến thức này.' 
                        : '👍 Tốt lắm! Hãy xem lại các câu chưa chính xác.'}
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      style={{ marginTop: '20px', padding: '10px 24px' }} 
                      onClick={() => { setGrammarSubmitted(false); setGrammarUserAnswers(grammarQuizAnswers.map(() => '')); }}
                    >
                      Làm lại bài tập
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* CSS and Styles */}
      <style jsx>{`
        .markdown-body {
          font-family: inherit;
        }
        .spin {
          display: inline-block;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
