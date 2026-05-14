'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface ChapterInfo { title: string; url: string; num: number; }
interface NovelInfo { title: string; description: string; cover: string; baseUrl: string; firstChapter: string; totalPages: number; chapters: ChapterInfo[]; totalChapters: number; }
interface ChapterContent { title: string; content: string; prevUrl: string; nextUrl: string; }

export default function EntertainmentMain() {
  const [novelUrl, setNovelUrl] = useState('');
  const [novel, setNovel] = useState<NovelInfo | null>(null);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChapterNum, setCurrentChapterNum] = useState(0);
  const [autoNext, setAutoNext] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Load truyện
  const loadNovel = async () => {
    if (!novelUrl.trim()) return;
    if (!novelUrl.startsWith('http')) {
      alert('Vui lòng dán một đường link URL hợp lệ (bắt đầu bằng http hoặc https)');
      return;
    }
    setLoading(true);
    setNovel(null);
    setChapter(null);
    try {
      const res = await fetch(`/api/novel?url=${encodeURIComponent(novelUrl)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.chapters || data.chapters.length === 0) {
        alert('Tìm thấy truyện nhưng không thấy danh sách chương. Vui lòng kiểm tra lại link.');
      }
      setNovel(data);
    } catch (e) {
      alert('Lỗi: ' + String(e));
    }
    setLoading(false);
  };

  // Load 1 chương
  const loadChapter = async (url: string) => {
    stopPlayback();
    setChapterLoading(true);
    try {
      if (!url.startsWith('http')) url = `https://truyencv.io${url}`;
      const res = await fetch(`/api/novel?url=${encodeURIComponent(novelUrl)}&chapter=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.content) {
        alert('Không tìm thấy nội dung chương này. Có thể do scraper bị chặn hoặc cấu trúc trang thay đổi.');
      }
      setChapter(data);
      const numMatch = url.match(/chuong-(\d+)/);
      if (numMatch) setCurrentChapterNum(parseInt(numMatch[1]));
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      alert('Lỗi tải chương: ' + String(e));
    }
    setChapterLoading(false);
  };

  // Stop playback
  const stopPlayback = () => {
    stopRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
  };

  // Fetch audio
  const fetchAudio = async (text: string, signal: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speed: 1.0, voice: 'vi-VN-HoaiMyNeural', server: 'edge' }),
        signal
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch { return null; }
  };

  // Pre-buffer playback
  const playContent = async (text: string) => {
    if (!text) return;
    if (isPlaying) { stopPlayback(); return; }

    setIsPlaying(true);
    stopRef.current = false;
    const sid = ++sessionRef.current;

    // Chia text thành chunks ~800 ký tự và làm sạch rác
    const clean = text
      .replace(/[→|\[\]…{}()«»]/g, ' ') // Xóa ký tự lạ gây lỗi TTS
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
      
    const sentences = clean.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let buf = '';
    for (const s of sentences) {
      if (!s.trim()) continue;
      if (buf.length + s.length > 800 && buf) { chunks.push(buf.trim()); buf = s; }
      else buf += (buf ? ' ' : '') + s;
    }
    if (buf.trim()) chunks.push(buf.trim());
    console.log(`[Entertainment] Playing ${chunks.length} chunks`);
    if (!chunks.length) { 
      alert('Không có nội dung văn bản để đọc.');
      setIsPlaying(false); 
      return; 
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let nextUrl: Promise<string | null> | null = null;

    for (let i = 0; i < chunks.length; i++) {
      if (stopRef.current || sid !== sessionRef.current) break;

      const url = (i === 0) ? await fetchAudio(chunks[0], controller.signal) : await nextUrl;
      if (!url) { 
        console.error(`Chunk ${i} failed`); 
        alert(`Lỗi tạo âm thanh ở đoạn ${i+1}. Vui lòng thử lại.`);
        break; 
      }

      if (i + 1 < chunks.length) nextUrl = fetchAudio(chunks[i + 1], controller.signal);

      if (stopRef.current || sid !== sessionRef.current) { URL.revokeObjectURL(url); break; }

      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
      });
    }

    if (sid === sessionRef.current) {
      setIsPlaying(false);
      // Auto chuyển chương tiếp
      if (autoNext && chapter?.nextUrl && !stopRef.current) {
        loadChapter(chapter.nextUrl).then(() => {
          // Tự động phát chương tiếp sau 1 giây
          setTimeout(() => {
            const el = document.getElementById('auto-play-trigger');
            if (el) el.click();
          }, 1000);
        });
      }
    }
  };

  // Auto play trigger
  const handleAutoPlay = useCallback(() => {
    if (chapter?.content && !isPlaying) playContent(chapter.content);
  }, [chapter, isPlaying]);

  // Quick chapter navigation
  const goToChapter = (num: number) => {
    if (!novel?.baseUrl) return;
    loadChapter(`${novel.baseUrl}/chuong-${num}/`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e0e0e0)', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '16px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ color: 'var(--text, #ccc)', textDecoration: 'none', fontSize: 14, opacity: 0.7 }}>← Trang chủ</a>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, background: 'linear-gradient(90deg, #e94560, #f5a623)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🎧 Nghe Truyện Audio
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {/* URL Input */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block' }}>📎 Dán link truyện từ TruyenCV</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={novelUrl}
              onChange={e => setNovelUrl(e.target.value)}
              placeholder="https://truyencv.io/truyen/ten-truyen/"
              onKeyDown={e => e.key === 'Enter' && loadNovel()}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, outline: 'none' }}
            />
            <button onClick={loadNovel} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: loading ? '#555' : 'linear-gradient(135deg, #e94560, #c23616)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {loading ? '⏳...' : '🔍 Tải'}
            </button>
          </div>
        </div>

        {/* Novel Info */}
        {novel && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {novel.cover && (
                <img src={novel.cover} alt="" style={{ width: 80, height: 110, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
              )}
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#f5a623' }}>{novel.title}</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>{novel.description?.slice(0, 150)}{novel.description?.length > 150 ? '...' : ''}</p>
                <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                  📚 ~{novel.totalChapters || novel.chapters.length} chương
                </div>
              </div>
            </div>

            {/* Quick chapter input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#aaa' }}>Đến chương:</span>
              <input
                type="number"
                min={1}
                placeholder="1"
                onKeyDown={e => { if (e.key === 'Enter') goToChapter(parseInt((e.target as HTMLInputElement).value)); }}
                style={{ width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13 }}
              />
              <button onClick={() => loadChapter(novel.firstChapter)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                📖 Chương 1
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#aaa', cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)} />
                Tự động chương tiếp
              </label>
            </div>

            {/* Chapter list (collapsed) */}
            {novel.chapters.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#e94560', padding: '6px 0' }}>
                  📋 Danh sách chương ({novel.chapters.length} chương)
                </summary>
                <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {novel.chapters.map(ch => (
                    <button
                      key={ch.num}
                      onClick={() => loadChapter(ch.url)}
                      style={{
                        textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: ch.num === currentChapterNum ? 'rgba(233,69,96,0.2)' : 'transparent',
                        color: ch.num === currentChapterNum ? '#e94560' : '#ccc',
                        fontSize: 13, cursor: 'pointer', fontWeight: ch.num === currentChapterNum ? 700 : 400
                      }}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Chapter Content */}
        {chapterLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Đang tải chương...
          </div>
        )}

        {chapter && !chapterLoading && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Chapter header + controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700, color: '#f5a623', minWidth: 200 }}>
                {chapter.title}
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { if (isPlaying) stopPlayback(); else playContent(chapter.content); }}
                  id="auto-play-trigger"
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none',
                    background: isPlaying ? 'linear-gradient(135deg, #e94560, #c23616)' : 'linear-gradient(135deg, #3fb950, #238636)',
                    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    boxShadow: isPlaying ? '0 0 20px rgba(233,69,96,0.3)' : '0 0 20px rgba(63,185,80,0.3)',
                    animation: isPlaying ? 'pulse 2s infinite' : 'none'
                  }}
                >
                  {isPlaying ? '⏸ Dừng' : '🎧 Nghe'}
                </button>
                {chapter.prevUrl && (
                  <button onClick={() => loadChapter(chapter.prevUrl)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                    ← Trước
                  </button>
                )}
                {chapter.nextUrl && (
                  <button onClick={() => loadChapter(chapter.nextUrl)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                    Sau →
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div style={{ fontSize: 15, lineHeight: 1.9, color: '#d4d4d4', whiteSpace: 'pre-line', letterSpacing: '0.02em' }}>
              {chapter.content}
            </div>

            {/* Bottom controls */}
            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'center' }}>
              {chapter.prevUrl && (
                <button onClick={() => loadChapter(chapter.prevUrl)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  ← Chương trước
                </button>
              )}
              <button
                onClick={() => { if (isPlaying) stopPlayback(); else playContent(chapter.content); }}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: isPlaying ? '#e94560' : '#3fb950',
                  color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
                }}
              >
                {isPlaying ? '⏸ Dừng nghe' : '🎧 Nghe chương này'}
              </button>
              {chapter.nextUrl && (
                <button onClick={() => loadChapter(chapter.nextUrl)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#ccc', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  Chương sau →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!novel && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎧</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#888' }}>Nghe truyện với giọng Hoài My</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Dán link truyện từ TruyenCV vào ô trên và bấm Tải</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
