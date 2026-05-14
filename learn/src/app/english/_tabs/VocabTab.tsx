'use client';
import React, { Dispatch, SetStateAction } from 'react';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }
interface Card { word: string; def: string; ex: string; vi: string; }

interface Props {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  cardIdx: number;
  setCardIdx: Dispatch<SetStateAction<number>>;
  flipped: boolean;
  setFlipped: Dispatch<SetStateAction<boolean>>;
  known: number[];
  vocabRecordId: number | null;
  vocabLoading: boolean;
  loadVocab: () => void;
  history: EngLesson[];
  mode: string;
  speak: (text: string, speed?: number, voice?: string, server?: string) => void;
  globalSpeed: number;
  globalVoice: string;
  globalTtsProvider: string;
  markLessonLearned: (id: number, quizScore?: number, quizTotal?: number) => void | Promise<void>;
}

export default function VocabTab({
  cards, setCards, cardIdx, setCardIdx, flipped, setFlipped, known,
  vocabRecordId, vocabLoading, loadVocab,
  history, mode,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  markLessonLearned,
}: Props) {
  const card = cards[cardIdx];

  const findNeighbor = (dir: -1 | 1) => {
    if (vocabRecordId === null) return;
    const vocabHistory = history
      .filter(h => h.type === 'vocab')
      .filter(h => {
        try {
          const m = JSON.parse(h.metadata || '{}');
          return (m.mode || 'coder') === mode;
        } catch { return false; }
      })
      .sort((a, b) => b.id - a.id); // Mới nhất lên đầu

    const currentIdxInHistory = vocabHistory.findIndex(h => h.id === vocabRecordId);
    if (currentIdxInHistory === -1) return;

    const targetIdx = currentIdxInHistory - dir; // Vì sort desc nên -dir là tiến tới bài cũ hơn
    if (targetIdx < 0 || targetIdx >= vocabHistory.length) return;

    const item = vocabHistory[targetIdx];
    try {
      const parsed = JSON.parse(item.content);
      if (Array.isArray(parsed)) {
        setCards(parsed);
        setCardIdx(0);
        setFlipped(false);
      }
    } catch { /**/ }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>🗂️ Thẻ ghi nhớ</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Luyện tập từ vựng theo phương pháp Flashcards</p>
        </div>
        <button 
          className="btn btn-premium" 
          style={{ height: 40, padding: '0 16px', fontSize: 13 }} 
          onClick={loadVocab} 
          disabled={vocabLoading}
        >
          {vocabLoading ? '⏳ Đang tạo...' : '🤖 Tạo bộ mới'}
        </button>
      </div>

      {cards.length > 0 && card ? (
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Progress Bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
              <span>BÀI {cardIdx + 1} / {cards.length}</span>
              <span style={{ color: 'var(--green)' }}>TIẾN ĐỘ: {Math.round(((cardIdx + 1) / cards.length) * 100)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${((cardIdx + 1) / cards.length) * 100}%`, 
                background: 'linear-gradient(90deg, var(--accent), var(--green))',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          {/* Flashcard Area */}
          <div className="flashcard-container" style={{ height: 320, perspective: 1000 }}>
            <div 
              className={`flashcard${flipped ? ' flipped' : ''}`} 
              onClick={() => setFlipped(f => !f)}
              style={{
                width: '100%', height: '100%', position: 'relative',
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                transformStyle: 'preserve-3d', cursor: 'pointer'
              }}
            >
              {/* Front Side */}
              <div className="flashcard-front" style={{
                position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                background: 'var(--surface2)', borderRadius: 16, border: '2px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--accent)', textAlign: 'center', letterSpacing: -1 }}>{card.word}</div>
                <button 
                  onClick={e => { e.stopPropagation(); speak(card.word, globalSpeed, globalVoice, globalTtsProvider); }} 
                  style={{ 
                    marginTop: 20, padding: '8px 16px', borderRadius: 20, 
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'var(--surface)'}
                >
                  🔊 <span style={{ fontWeight: 600 }}>Nghe phát âm</span>
                </button>
                <div style={{ position: 'absolute', bottom: 20, fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                  CHẠM ĐỂ XEM NGHĨA
                </div>
              </div>

              {/* Back Side */}
              <div className="flashcard-back" style={{
                position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                background: 'var(--surface2)', borderRadius: 16, border: '2px solid var(--green)44',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transform: 'rotateY(180deg)', padding: 30, textAlign: 'center',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginBottom: 12 }}>ĐỊNH NGHĨA</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 20, lineHeight: 1.5 }}>{card.def}</div>
                
                <div style={{ width: '100%', height: 1, background: 'var(--border)', marginBottom: 20 }} />
                
                <div style={{ fontSize: 13, color: 'var(--orange)', fontStyle: 'italic', marginBottom: 12 }}>
                  &quot;{card.ex}&quot;
                </div>
                <div style={{ fontSize: 24, color: 'var(--green)', fontWeight: 900 }}>
                  {card.vi}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button 
              className="btn btn-ghost" 
              style={{ flex: 1, height: 48, borderRadius: 12 }} 
              onClick={() => { if (cardIdx > 0) { setCardIdx(i => i - 1); setFlipped(false); } else { findNeighbor(-1); } }}
            >
              ← Trước
            </button>

            {cardIdx === cards.length - 1 ? (
              <button 
                onClick={() => vocabRecordId && markLessonLearned(vocabRecordId)}
                style={{ 
                  flex: 2, height: 48, borderRadius: 12, 
                  background: 'linear-gradient(135deg, #3fb950, #30a14e)', 
                  color: '#0d1117', border: 'none', fontWeight: 800, fontSize: 14, 
                  cursor: 'pointer', boxShadow: '0 4px 15px rgba(63,185,80,0.3)',
                  transition: 'transform 0.2s'
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                ✓ HOÀN THÀNH BÀI HỌC
              </button>
            ) : (
              <button 
                className="btn btn-premium" 
                style={{ flex: 2, height: 48, borderRadius: 12, fontSize: 14, fontWeight: 800 }} 
                onClick={() => { setCardIdx(i => i + 1); setFlipped(false); }}
              >
                TIẾP THEO →
              </button>
            )}

            <button 
              className="btn btn-ghost" 
              style={{ flex: 1, height: 48, borderRadius: 12 }} 
              onClick={() => { if (cardIdx < cards.length - 1) { setCardIdx(i => i + 1); setFlipped(false); } else { findNeighbor(1); } }}
            >
              Sau →
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📚</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Chưa có từ vựng</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 300, margin: '0 auto 24px' }}>
            Hãy nhấn nút <strong>Tạo bộ mới</strong> để AI soạn danh sách từ vựng cho bạn.
          </p>
        </div>
      )}
    </div>
  );
}
