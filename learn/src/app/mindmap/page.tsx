'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface MindmapNote {
  id: number;
  date: string;
  topic: string;
  title: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

type TreeNode = { label: string; children: TreeNode[]; level: number };

// Parse markdown into a tree. Headings (# ##) define top-down hierarchy;
// list items (- or *) under a heading become children, with indentation (2 spaces) increasing depth.
function parseToTree(md: string): TreeNode {
  const root: TreeNode = { label: 'Mindmap', children: [], level: 0 };
  if (!md.trim()) return root;

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const headingStack: TreeNode[] = [root];

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const h = /^(#{1,6})\s+(.+)$/.exec(raw.trim());
    if (h) {
      const level = h[1].length;
      const node: TreeNode = { label: h[2].trim(), children: [], level };
      while (headingStack.length > 1 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack[headingStack.length - 1].children.push(node);
      headingStack.push(node);
      continue;
    }

    const li = /^(\s*)[-*+]\s+(.+)$/.exec(raw.replace(/\t/g, '  '));
    if (li) {
      const indent = li[1].length;
      const depth = Math.floor(indent / 2);
      const parentHeading = headingStack[headingStack.length - 1];
      let cursor = parentHeading;
      for (let d = 0; d < depth; d++) {
        if (cursor.children.length === 0) break;
        cursor = cursor.children[cursor.children.length - 1];
      }
      cursor.children.push({ label: li[2].trim(), children: [], level: 99 });
      continue;
    }
  }

  if (root.children.length === 1) return root.children[0];
  return root;
}

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#d2a8ff', '#ff7b72', '#f78166', '#79c0ff'];
const ROW_H = 44;
const GAP = 10;
const CONN_W = 44;

function subtreeHeight(node: TreeNode): number {
  if (!node.children.length) return ROW_H;
  const sum = node.children.reduce((s, c) => s + subtreeHeight(c), 0);
  return sum + (node.children.length - 1) * GAP;
}

function makeChip(label: string, depth: number, color: string) {
  let text = label;
  let isDone = false;
  if (/^~~.*~~$/.test(text)) {
    text = text.slice(2, -2);
    isDone = true;
  } else if (/^\[x\]\s+/i.test(text)) {
    text = text.replace(/^\[x\]\s+/i, '');
    isDone = true;
  }

  return (
    <div style={{
      background: depth === 0
        ? `linear-gradient(135deg, ${color}, ${color}bb)`
        : `linear-gradient(135deg, ${color}28, ${color}0a)`,
      color: depth === 0 ? '#0d1117' : 'var(--text)',
      border: `1.5px solid ${color}${depth === 0 ? '' : '66'}`,
      borderRadius: 999,
      padding: depth === 0 ? '9px 20px' : depth === 1 ? '6px 13px' : '5px 11px',
      fontWeight: depth === 0 ? 800 : depth === 1 ? 700 : 500,
      fontSize: depth === 0 ? 14 : depth === 1 ? 12 : 11,
      whiteSpace: 'nowrap',
      boxShadow: depth === 0 ? `0 6px 20px ${color}44` : depth === 1 ? `0 3px 10px ${color}28` : 'none',
      flexShrink: 0,
      maxWidth: 500,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: 1.35,
      userSelect: 'none',
      textDecoration: isDone ? 'line-through' : 'none',
      opacity: isDone ? 0.6 : 1,
    }}>{text}</div>
  );
}

function TreeBranch({
  node, depth = 0, colorIndex = 0, dir = 'right',
}: {
  node: TreeNode; depth?: number; colorIndex?: number; dir?: 'left' | 'right';
}) {
  const color = COLORS[colorIndex % COLORS.length];
  const hasChildren = node.children.length > 0;
  const totalH = subtreeHeight(node);
  const chip = makeChip(node.label, depth, color);

  if (!hasChildren) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: ROW_H,
        flexDirection: dir === 'left' ? 'row-reverse' : 'row' }}>
        {chip}
      </div>
    );
  }

  const cHeights = node.children.map(subtreeHeight);
  let off = 0;
  const yCenters = cHeights.map((h) => { const y = off + h / 2; off += h + GAP; return y; });
  const midY = totalH / 2;

  const svgPaths = yCenters.map((y, i) => {
    const c = depth === 0 ? COLORS[i % COLORS.length] : color;
    const d = dir === 'right'
      ? `M 0 ${midY} C ${CONN_W * 0.6} ${midY}, ${CONN_W * 0.4} ${y}, ${CONN_W} ${y}`
      : `M ${CONN_W} ${midY} C ${CONN_W * 0.4} ${midY}, ${CONN_W * 0.6} ${y}, 0 ${y}`;
    return (
      <path key={i} d={d} stroke={c}
        strokeWidth={depth === 0 ? 2.5 : 1.8}
        strokeOpacity={0.85} fill="none" strokeLinecap="round" />
    );
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: totalH,
      flexDirection: dir === 'left' ? 'row-reverse' : 'row' }}>
      {chip}
      <svg width={CONN_W} height={totalH} style={{ flexShrink: 0, overflow: 'visible' }}>
        {svgPaths}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
        {node.children.map((c, i) => (
          <TreeBranch key={i} node={c} depth={depth + 1}
            colorIndex={depth === 0 ? i : colorIndex} dir={dir} />
        ))}
      </div>
    </div>
  );
}

function BalancedMindmap({ tree, zoom }: { tree: TreeNode; zoom: number }) {
  const children = tree.children;
  const half = Math.ceil(children.length / 2);
  const leftKids  = children.slice(0, half);
  const rightKids = children.slice(half);

  const leftH  = leftKids.reduce((s, c) => s + subtreeHeight(c), 0) + Math.max(0, leftKids.length - 1) * GAP;
  const rightH = rightKids.reduce((s, c) => s + subtreeHeight(c), 0) + Math.max(0, rightKids.length - 1) * GAP;
  const totalH = Math.max(leftH, rightH, ROW_H);

  // SVG connector width from root outward
  const CW = 36;

  function sideConnectors(kids: TreeNode[], dir: 'left' | 'right', total: number) {
    const cHeights = kids.map(subtreeHeight);
    let off = (total - (cHeights.reduce((s,h)=>s+h,0) + Math.max(0,kids.length-1)*GAP)) / 2;
    const yCenters = cHeights.map(h => { const y = off + h/2; off += h + GAP; return y; });
    const midY = total / 2;
    return yCenters.map((y, i) => {
      const c = COLORS[(dir === 'left' ? i : half + i) % COLORS.length];
      const d = dir === 'right'
        ? `M 0 ${midY} C ${CW*0.6} ${midY}, ${CW*0.4} ${y}, ${CW} ${y}`
        : `M ${CW} ${midY} C ${CW*0.4} ${midY}, ${CW*0.6} ${y}, 0 ${y}`;
      return <path key={i} d={d} stroke={c} strokeWidth={2.5} strokeOpacity={0.88} fill="none" strokeLinecap="round" />;
    });
  }

  function sideNodes(kids: TreeNode[], dir: 'left' | 'right', total: number) {
    const cHeights = kids.map(subtreeHeight);
    const stackH = cHeights.reduce((s,h)=>s+h,0) + Math.max(0,kids.length-1)*GAP;
    const topPad = (total - stackH) / 2;
    return (
      <div style={{ display:'flex', flexDirection:'column', gap: GAP, paddingTop: topPad }}>
        {kids.map((c, i) => (
          <TreeBranch key={i} node={c} depth={1}
            colorIndex={dir === 'left' ? i : half + i} dir={dir} />
        ))}
      </div>
    );
  }

  const rootColor = COLORS[0];
  const rootChip = (
    <div style={{
      background: `linear-gradient(135deg, #58a6ff, #79c0ff)`,
      color: '#0d1117', borderRadius: 999,
      padding: '11px 22px', fontWeight: 900, fontSize: 15,
      boxShadow: '0 6px 28px rgba(88,166,255,0.45)',
      flexShrink: 0, whiteSpace: 'nowrap', userSelect: 'none',
      letterSpacing: -0.2,
    }}>{tree.label}</div>
  );

  return (
    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center',
      display: 'inline-flex', alignItems: 'center', transition: 'transform 0.12s', minHeight: totalH }}>
      {/* Left side */}
      {leftKids.length > 0 && (
        <>
          {sideNodes(leftKids, 'left', totalH)}
          <svg width={CW} height={totalH} style={{ flexShrink: 0, overflow: 'visible' }}>
            {sideConnectors(leftKids, 'left', totalH)}
          </svg>
        </>
      )}

      {/* Root */}
      {rootChip}

      {/* Right side */}
      {rightKids.length > 0 && (
        <>
          <svg width={CW} height={totalH} style={{ flexShrink: 0, overflow: 'visible' }}>
            {sideConnectors(rightKids, 'right', totalH)}
          </svg>
          {sideNodes(rightKids, 'right', totalH)}
        </>
      )}
    </div>
  );
}

const zoomBtn: React.CSSProperties = {
  minWidth: 28, height: 26, padding: '0 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};

const SAMPLE = `# Chủ đề chính
## Khái niệm cốt lõi
- Điểm 1
- Điểm 2
  - Chi tiết
## Ví dụ
- Ví dụ A
- Ví dụ B
## Ghi nhớ
- Lưu ý quan trọng`;

export default function MindmapPage() {
  const [notes, setNotes] = useState<MindmapNote[]>([]);
  const [selectedId, _setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const setSelectedId = useCallback((id: number | null) => {
    selectedIdRef.current = id;
    _setSelectedId(id);
  }, []);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [markdown, setMarkdown] = useState(SAMPLE);
  const [filterTopic, setFilterTopic] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const initialLoadDone = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isFS, setIsFS] = useState(false);
  const panStart = useRef({ x: 0, y: 0, sl: 0, st: 0 });

  useEffect(() => {
    const fn = () => setIsFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  const toggleFS = () => {
    if (!document.fullscreenElement) {
      wrapRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current || e.button !== 0) return;
    setIsPanning(true);
    panStart.current = {
      x: e.pageX,
      y: e.pageY,
      sl: canvasRef.current.scrollLeft,
      st: canvasRef.current.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !canvasRef.current) return;
    e.preventDefault();
    const dx = e.pageX - panStart.current.x;
    const dy = e.pageY - panStart.current.y;
    canvasRef.current.scrollLeft = panStart.current.sl - dx;
    canvasRef.current.scrollTop = panStart.current.st - dy;
  };

  const handleMouseUp = () => setIsPanning(false);


  function insertAtLine(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const val = ta.value;
    // Find beginning of current line
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const endIdx = lineEnd === -1 ? val.length : lineEnd;
    const currentLine = val.slice(lineStart, endIdx);

    let newLine: string;
    if (prefix === 'indent') {
      newLine = '  ' + currentLine;
    } else {
      // Strip existing heading/list markers then prepend
      const stripped = currentLine.replace(/^(\s*)([#]{1,6}\s+|[-*+]\s+)/, '$1');
      newLine = prefix + stripped;
    }
    const next = val.slice(0, lineStart) + newLine + val.slice(endIdx);
    setMarkdown(next);
    setIsDirty(true);
    // Restore caret position at end of prefix
    requestAnimationFrame(() => {
      ta.focus();
      const caret = lineStart + newLine.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  function toggleStrikethroughLine() {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const endIdx = lineEnd === -1 ? val.length : lineEnd;
    const currentLine = val.slice(lineStart, endIdx);

    const match = /^(\s*(?:[#]{1,6}\s+|[-*+]\s+)?)(.*)$/.exec(currentLine);
    if (!match) return;

    const prefix = match[1];
    let content = match[2];

    if (/^~~.*~~$/.test(content)) {
      content = content.slice(2, -2);
    } else {
      content = `~~${content}~~`;
    }

    const newLine = prefix + content;
    const next = val.slice(0, lineStart) + newLine + val.slice(endIdx);
    setMarkdown(next);
    setIsDirty(true);
    
    requestAnimationFrame(() => {
      ta.focus();
      const caret = lineStart + prefix.length + content.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterDate) params.set('date', filterDate);
    if (filterTopic) params.set('topic', filterTopic);
    const r = await fetch(`/api/mindmap?${params.toString()}`);
    if (r.ok) {
      const data = await r.json();
      setNotes(data);
      if (!initialLoadDone.current) {
        if (data.length > 0) selectNote(data[0]);
        initialLoadDone.current = true;
      }
    }
  }, [filterDate, filterTopic]);

  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => parseToTree(markdown), [markdown]);

  const topics = useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => { if (n.topic) s.add(n.topic); });
    return Array.from(s);
  }, [notes]);

  const grouped = useMemo(() => {
    const m = new Map<string, MindmapNote[]>();
    notes.forEach(n => {
      const k = n.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    });
    return Array.from(m.entries());
  }, [notes]);

  function newNote() {
    setSelectedId(null);
    setTitle('');
    setTopic('');
    setDate(new Date().toISOString().slice(0, 10));
    setMarkdown(SAMPLE);
    setIsDirty(false);
  }

  function selectNote(n: MindmapNote) {
    setSelectedId(n.id);
    setTitle(n.title);
    setTopic(n.topic);
    setDate(n.date);
    setMarkdown(n.markdown);
    setIsDirty(false);
  }

  const isSavingRef = useRef(false);

  async function save() {
    if (isSavingRef.current) return;
    setSaving(true);
    isSavingRef.current = true;
    const currentId = selectedIdRef.current;
    const body = { id: currentId, title: title || 'Không tiêu đề', topic, date, markdown };
    const method = currentId ? 'PUT' : 'POST';
    try {
      const r = await fetch('/api/mindmap', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok && !currentId) {
        const created = await r.json();
        setSelectedId(created.id);
      }
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      setIsDirty(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      save();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, title, topic, date, isDirty]);

  async function remove(id: number) {
    await fetch(`/api/mindmap?id=${id}`, { method: 'DELETE' });
    if (selectedId === id) newNote();
    load();
  }

  const canvasBg = 'radial-gradient(ellipse 80% 60% at 25% 30%, rgba(88,166,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 75% 70%, rgba(210,168,255,0.07) 0%, transparent 60%), #0d1117';

  return (
    <div className="fade-in mm-page">

      {/* ── MINIMAL HEADER ── */}
      <header className="mm-head">
        <button onClick={() => setSidebarOpen(true)} className="mm-head-btn" title="Ghi chú đã lưu">
          <span style={{ fontSize: 16 }}>☰</span>
          {notes.length > 0 && <span className="mm-head-count">{notes.length}</span>}
        </button>

        <input
          className="mm-title-input"
          placeholder="Ghi chú không tiêu đề"
          value={title}
          onChange={e => { setTitle(e.target.value); setIsDirty(true); }}
        />

        <div className="mm-head-actions">
          <button onClick={newNote} className="mm-head-btn" title="Mới">＋</button>
          <button onClick={save} disabled={saving} className="mm-head-save">
            {saving ? '…' : saved ? '✓' : selectedId ? 'Cập nhật' : 'Lưu'}
          </button>
        </div>
      </header>

      {/* ── META CHIPS ── */}
      <div className="mm-meta">
        <label className="mm-chip">
          <span className="mm-chip-label">#</span>
          <input
            value={topic}
            onChange={e => { setTopic(e.target.value); setIsDirty(true); }}
            placeholder="Chủ đề"
            list="topic-list"
            className="mm-chip-input"
          />
          <datalist id="topic-list">{topics.map(t => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="mm-chip">
          <span className="mm-chip-label">📅</span>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setIsDirty(true); }} className="mm-chip-input mm-chip-date" />
        </label>
        <button onClick={() => setEditorOpen(v => !v)} className="mm-chip mm-chip-toggle">
          <span className="mm-chip-label">{editorOpen ? '▼' : '▶'}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Markdown</span>
        </button>
      </div>

      {/* ── NOTES DRAWER ── */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1999, backdropFilter: 'blur(3px)' }} />}
      <div className={`mm-drawer ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📂 Ghi chú của tôi</div>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <button onClick={() => { newNote(); setSidebarOpen(false); }} className="btn btn-green" style={{ width: '100%', marginBottom: 12 }}>➕ Ghi chú mới</button>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="input" style={{ flex: 1, fontSize: 12 }} />
          <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} className="input" style={{ flex: 1, fontSize: 12 }}>
            <option value="">Tất cả chủ đề</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {(filterDate || filterTopic) && (
          <button onClick={() => { setFilterDate(''); setFilterTopic(''); }} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, marginBottom: 8 }}>✕ Xoá lọc</button>
        )}

        {notes.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 13 }}>Chưa có ghi chú nào</div>}
        {grouped.map(([d, items]) => (
          <div key={d} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, letterSpacing: 0.5 }}>
              {new Date(d).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </div>
            {items.map(n => {
              const active = selectedId === n.id;
              return (
                <div key={n.id} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <button onClick={() => { selectNote(n); setSidebarOpen(false); }} style={{
                    flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                    background: active ? 'rgba(88,166,255,0.12)' : 'var(--surface2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                    color: active ? 'var(--accent)' : 'var(--text)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title || 'Không tiêu đề'}</div>
                    {n.topic && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>#{n.topic}</div>}
                  </button>
                  <button onClick={() => remove(n.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 6px', borderRadius: 6 }}>🗑</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── BODY (2-col on desktop) ── */}
      <div className="mm-main-grid">
        {/* ── EDITOR (collapsible) ── */}
        {editorOpen && (
          <div className="mm-editor-box">
            <div className="mm-md-toolbar">
              <button onClick={() => insertAtLine('# ')} title="Tiêu đề lớn">H1</button>
              <button onClick={() => insertAtLine('## ')} title="Tiêu đề vừa">H2</button>
              <button onClick={() => insertAtLine('### ')} title="Tiêu đề nhỏ">H3</button>
              <span className="mm-md-sep" />
              <button onClick={() => insertAtLine('- ')} title="Mục">•&nbsp;Mục</button>
              <button onClick={() => insertAtLine('indent')} title="Lùi vào (sub)">→</button>
              <span className="mm-md-sep" />
              <button onClick={toggleStrikethroughLine} title="Hoàn thành (Gạch ngang)" style={{ textDecoration: 'line-through' }}>S</button>
            </div>
            <textarea
              ref={taRef}
              value={markdown}
              onChange={e => { setMarkdown(e.target.value); setIsDirty(true); }}
              className="mm-textarea"
              placeholder={'# Chủ đề chính\n## Nhánh 1\n- Mục A\n  - Chi tiết\n## Nhánh 2\n- Mục B'}
            />
          </div>
        )}

        {/* ── MINDMAP (main) ── */}
        <div className={`mm-canvas-wrap ${isFS ? 'is-fs' : ''}`} ref={wrapRef} style={{ background: canvasBg }}>
          <div className="mm-zoom-ctrl">
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}>−</button>
            <button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}>+</button>
            <button onClick={toggleFS} className="mm-fs-btn" title={isFS ? 'Thoát' : 'Toàn màn hình'}>{isFS ? '✕' : '⛶'}</button>
          </div>
          <div
            className="mm-canvas"
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'inline-block', transition: 'transform 0.12s', padding: '16px 16px 16px 8px' }}>
              <TreeBranch node={tree} />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .mm-page {
          display: flex; flex-direction: column; gap: 14px;
          min-height: 0; overflow-x: hidden;
          max-width: 1260px; margin: 0 auto; width: 100%;
          padding-bottom: 20px;
        }

        /* ── HEAD ── */
        .mm-head {
          display: flex; align-items: center; gap: 10px;
        }
        .mm-head-btn {
          flex-shrink: 0;
          width: 38px; height: 38px;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--border); background: transparent;
          border-radius: 10px; color: var(--muted);
          cursor: pointer; position: relative;
          transition: all 0.15s;
        }
        .mm-head-btn:hover { color: var(--text); border-color: var(--muted); }
        .mm-head-count {
          position: absolute; top: -4px; right: -4px;
          min-width: 16px; height: 16px; padding: 0 4px;
          background: var(--accent); color: #0d1117;
          border-radius: 99px; font-size: 10px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center;
        }
        :global(.mm-title-input) {
          flex: 1; min-width: 0;
          border: none !important; outline: none !important;
          background: transparent !important;
          font-size: 26px !important; font-weight: 800 !important;
          color: var(--text) !important;
          padding: 6px 0 !important;
          letter-spacing: -0.3px;
          border-bottom: 2px solid transparent !important;
          transition: border-color 0.15s;
        }
        :global(.mm-title-input::placeholder) { color: #484f58; font-weight: 600; }
        :global(.mm-title-input:hover) { border-bottom-color: var(--border) !important; }
        :global(.mm-title-input:focus) { border-bottom-color: var(--accent) !important; }
        .mm-head-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .mm-head-save {
          height: 38px; padding: 0 18px;
          background: linear-gradient(135deg, #3fb950, #2ea043);
          color: #0d1117; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          box-shadow: 0 2px 8px rgba(63,185,80,0.25);
          transition: all 0.15s;
        }
        .mm-head-save:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(63,185,80,0.35); }
        .mm-head-save:disabled { opacity: 0.5; cursor: wait; }

        /* ── META CHIPS ── */
        .mm-meta {
          display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }
        .mm-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 999px;
          background: var(--surface2); border: 1px solid var(--border);
          font-size: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .mm-chip:hover { border-color: var(--muted); }
        .mm-chip-label { color: var(--muted); font-weight: 600; font-size: 11px; letter-spacing: 0.3px; }
        :global(.mm-chip-input) {
          border: none !important; outline: none !important;
          background: transparent !important;
          color: var(--text) !important;
          font-size: 12px !important; font-weight: 600 !important;
          padding: 0 !important;
          width: auto; min-width: 80px;
          color-scheme: dark;
        }
        :global(.mm-chip-input::placeholder) { color: var(--muted); font-weight: 500; }
        :global(.mm-chip-date) { min-width: 110px; }
        .mm-chip:focus-within { border-color: var(--accent); background: rgba(88,166,255,0.08); }
        .mm-chip-toggle { background: transparent; }

        /* ── EDITOR ── */
        .mm-editor-box {
          border: 1px solid var(--border); border-radius: 12px;
          overflow: hidden; background: var(--surface);
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .mm-editor-box:hover { border-color: var(--muted); box-shadow: 0 6px 16px rgba(0,0,0,0.15); }
        .mm-editor-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(88,166,255,0.15); }
        .mm-md-toolbar {
          display: flex; align-items: center; gap: 4px;
          padding: 6px 8px; background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .mm-md-toolbar button {
          height: 28px; padding: 0 10px;
          border: none; background: transparent;
          color: var(--muted); font-size: 12px; font-weight: 700;
          cursor: pointer; border-radius: 6px;
          transition: all 0.12s;
        }
        .mm-md-toolbar button:hover { background: var(--surface); color: var(--text); }
        .mm-md-toolbar button:active { transform: scale(0.95); }
        .mm-md-sep {
          width: 1px; height: 16px; background: var(--border); margin: 0 4px;
        }
        :global(.mm-textarea) {
          width: 100%; display: block;
          min-height: 240px;
          height: 100%;
          resize: none;
          border: none !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--text) !important;
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
          font-size: 15px; line-height: 1.75;
          padding: 14px 16px !important;
          outline: none !important;
        }

        .mm-main-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        @media (min-width: 900px) {
          .mm-main-grid {
            display: grid;
            grid-template-columns: ${editorOpen ? '420px 1fr' : '1fr'};
            gap: 16px;
            align-items: stretch;
            min-height: 650px;
          }
          .mm-editor-box {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .mm-canvas-wrap {
            height: 100%;
            min-height: 0;
          }
        }

        /* ── MINDMAP CANVAS ── */
        .mm-canvas-wrap {
          position: relative;
          border: 1px solid var(--border); border-radius: 16px;
          overflow: hidden;
          min-height: 520px;
          flex: 1;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transition: box-shadow 0.2s ease;
        }
        .mm-canvas-wrap:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.15); }
        .mm-zoom-ctrl {
          position: absolute; bottom: 12px; right: 12px; z-index: 10;
          display: flex; gap: 2px;
          background: rgba(13,17,23,0.8); backdrop-filter: blur(8px);
          border: 1px solid var(--border); border-radius: 10px;
          padding: 3px;
        }
        .mm-zoom-ctrl button {
          min-width: 30px; height: 26px; padding: 0 6px;
          border: none; background: transparent;
          color: var(--text); font-size: 11px; font-weight: 600;
          cursor: pointer; border-radius: 7px;
          font-variant-numeric: tabular-nums;
          transition: background 0.12s;
        }
        .mm-zoom-ctrl button:hover { background: var(--surface2); }
        @media (max-width: 720px) {
          .mm-fs-btn { display: none !important; }
        }
        .mm-canvas-wrap.is-fs {
          position: fixed; inset: 0; z-index: 3000; border-radius: 0;
          width: 100vw; height: 100vh; max-width: none;
        }
        .mm-canvas {
          width: 100%; height: 100%;
          overflow: auto;
          -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y;
          overscroll-behavior: contain;
          cursor: grab;
        }

        /* ── DRAWER ── */
        .mm-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: 320px; max-width: 88vw;
          background: var(--surface); border-right: 1px solid var(--border);
          padding: 18px; overflow-y: auto; z-index: 2000;
          transform: translateX(-110%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 8px 0 40px rgba(0,0,0,0.5);
        }
        .mm-drawer.open { transform: translateX(0); }

        /* ── RESPONSIVE ── */
        @media (max-width: 720px) {
          .mm-page { gap: 12px; }
          .mm-main-grid { gap: 20px; }
          :global(.mm-title-input) { font-size: 22px !important; }
          .mm-canvas-wrap { min-height: 50vh; }
          .mm-canvas { padding: 20px 14px; }
          .mm-head-save { padding: 0 14px; font-size: 12px; }
        }

        /* ── IPAD LANDSCAPE (phone-like view) ── */
        @media (min-width: 900px) and (max-width: 1100px) and (max-height: 800px) {
          .mm-main-grid {
            grid-template-columns: ${editorOpen ? '320px 1fr' : '1fr'};
          }
          .mm-canvas-wrap {
            max-width: 430px;
            margin: 0 auto;
            height: 100%;
          }
        }
      `}</style>
    </div>
  );
}
