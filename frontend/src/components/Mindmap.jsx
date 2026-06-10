import { useEffect, useMemo, useRef, useState } from 'react'

const SAMPLE = `# HAgent Mindmap
## Mục tiêu
- Gom ý nhanh
- Tách nhánh rõ
  - Việc hôm nay
  - Việc tiếp theo
## Hệ thống
- Backend
- Frontend
- Automations
## Ghi chú
- [x] Ý đã xong
- Ý cần xử lý`

const COLORS = ['#4f8ff7', '#36a66a', '#c58a17', '#d76666', '#8d72d6', '#c56f55', '#2f9db0', '#5f7fca']
const ROW_H = 44
const GAP = 8
const CONN_W = 24
const MIXED_LEAF_SLOT_H = 88
const CANVAS_SIZE = 4200
const MOBILE_DEFAULT_ZOOM = 0.62

function parseTree(markdown) {
  const root = { label: 'Mindmap', children: [], level: 0 }
  const stack = [root]

  markdown.replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
    if (!raw.trim()) return

    const heading = /^(#{1,6})\s+(.+)$/.exec(raw.trim())
    if (heading) {
      const level = heading[1].length
      const node = { label: heading[2].trim(), children: [], level }
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop()
      stack[stack.length - 1].children.push(node)
      stack.push(node)
      return
    }

    const item = /^(\s*)[-*+]\s+(.+)$/.exec(raw.replace(/\t/g, '  '))
    if (item) {
      const depth = Math.floor(item[1].length / 2)
      let parent = stack[stack.length - 1]
      for (let i = 0; i < depth; i += 1) {
        if (!parent.children.length) break
        parent = parent.children[parent.children.length - 1]
      }
      parent.children.push({ label: item[2].trim(), children: [], level: 99 })
    }
  })

  return root.children.length === 1 ? root.children[0] : root
}

function subtreeHeight(node) {
  if (!node.children.length) return ROW_H
  const hasComplexChild = node.children.some((child) => child.children.length > 0)
  return node.children.reduce((sum, child) => {
    const slotH = !child.children.length && hasComplexChild ? MIXED_LEAF_SLOT_H : subtreeHeight(child)
    return sum + slotH
  }, 0) + (node.children.length - 1) * GAP
}

function cleanLabel(label) {
  if (/^~~.*~~$/.test(label)) return { text: label.slice(2, -2), done: true }
  if (/^\[x\]\s+/i.test(label)) return { text: label.replace(/^\[x\]\s+/i, ''), done: true }
  return { text: label, done: false }
}

function roundedStepPath(fromX, fromY, toX, toY, dir = 'right') {
  const dx = toX - fromX;
  const dy = toY - fromY;
  
  if (Math.abs(dy) < 1) {
    return `M ${fromX} ${fromY} H ${toX}`;
  }

  const midX = fromX + dx * 0.5;
  const r = Math.min(5, Math.abs(dy) / 2, Math.abs(dx) / 4 || 2);
  const sign = dy > 0 ? 1 : -1;

  if (dir === 'right') {
    return [
      `M ${fromX} ${fromY}`,
      `H ${midX - r}`,
      `Q ${midX} ${fromY} ${midX} ${fromY + sign * r}`,
      `V ${toY - sign * r}`,
      `Q ${midX} ${toY} ${midX + r} ${toY}`,
      `H ${toX}`,
    ].join(' ');
  }

  return [
    `M ${fromX} ${fromY}`,
    `H ${midX + r}`,
    `Q ${midX} ${fromY} ${midX} ${fromY + sign * r}`,
    `V ${toY - sign * r}`,
    `Q ${midX} ${toY} ${midX - r} ${toY}`,
    `H ${toX}`,
  ].join(' ');
}

function Chip({ label, depth, color, nodeKey, offset, onNodeDrag, zoom }) {
  const { text, done } = cleanLabel(label)
  const x = Number(offset?.x || 0)
  const y = Number(offset?.y || 0)

  const startDrag = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startOffset = { x, y }
    const scale = zoom || 1
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const move = (moveEvent) => {
      moveEvent.preventDefault()
      onNodeDrag(nodeKey, {
        x: Math.round(startOffset.x + (moveEvent.clientX - startX) / scale),
        y: Math.round(startOffset.y + (moveEvent.clientY - startY) / scale),
      })
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div
      className="shrink-0 truncate rounded-full text-center"
      onPointerDown={startDrag}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: 'box-shadow 0.12s, border-color 0.12s',
        minWidth: depth === 0 ? 250 : depth === 1 ? 190 : 150,
        maxWidth: depth === 0 ? 360 : 320,
        padding: depth === 0 ? '10px 28px' : depth === 1 ? '8px 20px' : '6px 14px',
        background: depth === 0
          ? 'linear-gradient(135deg, #6fb2ff 0%, #4f8ff7 100%)'
          : `linear-gradient(135deg, #ffffff 0%, ${color}0f 100%)`,
        border: `2px solid ${depth === 0 ? '#74b6ff' : color}`,
        color: '#111827',
        fontWeight: depth === 0 ? 900 : depth === 1 ? 800 : 700,
        fontSize: depth === 0 ? 22 : depth === 1 ? 18 : 14,
        lineHeight: 1.2,
        boxShadow: depth === 0
          ? '0 8px 20px rgba(79,143,247,0.2)'
          : `0 6px 16px ${color}0d`,
        textDecoration: done ? 'line-through' : 'none',
        opacity: done ? 0.58 : 1,
        cursor: 'grab',
        touchAction: 'none',
        position: 'relative',
        zIndex: x || y ? 2 : 1,
      }}
      title={text}
    >
      {text}
    </div>
  )
}

function Branch({
  node,
  depth = 0,
  colorIndex = 0,
  dir = 'right',
  path = 'root',
  offsets = {},
  onNodeDrag,
  zoom = 1,
}) {
  const color = COLORS[colorIndex % COLORS.length]
  const totalH = subtreeHeight(node)
  const chip = (
    <Chip
      label={node.label}
      depth={depth}
      color={color}
      nodeKey={path}
      offset={offsets[path]}
      onNodeDrag={onNodeDrag}
      zoom={zoom}
    />
  )

  if (!node.children.length) {
    return (
      <div className="flex items-center" style={{ height: ROW_H, flexDirection: dir === 'left' ? 'row-reverse' : 'row' }}>
        {chip}
      </div>
    )
  }

  const hasComplexChild = node.children.some((child) => child.children.length > 0)
  const heights = node.children.map((child) => (
    !child.children.length && hasComplexChild ? MIXED_LEAF_SLOT_H : subtreeHeight(child)
  ))
  let offset = 0
  const centers = heights.map((height) => {
    const y = offset + height / 2
    offset += height + GAP
    return y
  })
  const mid = totalH / 2

  return (
    <div className="flex items-center" style={{ height: totalH, flexDirection: dir === 'left' ? 'row-reverse' : 'row' }}>
      {chip}
      <svg width={CONN_W} height={totalH} className="shrink-0" style={{ overflow: 'visible' }}>
        {centers.map((y, index) => {
          const child = node.children[index]
          const childPath = `${path}/${index}-${child.label}`
          const parentOffsetX = offsets[path]?.x || 0
          const parentOffsetY = offsets[path]?.y || 0
          const childOffsetX = offsets[childPath]?.x || 0
          const childOffsetY = offsets[childPath]?.y || 0
          
          const fromX = dir === 'right' ? parentOffsetX : CONN_W + parentOffsetX
          const fromY = mid + parentOffsetY
          const toX = dir === 'right' ? CONN_W + childOffsetX : childOffsetX
          const toY = y + childOffsetY
          
          const stroke = depth === 0 ? '#93a4b8' : color
          const d = roundedStepPath(fromX, fromY, toX, toY, dir)
          return (
            <path
              key={index}
              d={d}
              stroke={stroke}
              strokeWidth={depth === 0 ? 1.8 : 1.35}
              strokeOpacity={depth === 0 ? 0.38 : 0.34}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
      <div className="flex flex-col" style={{ gap: GAP }}>
        {node.children.map((child, index) => (
          <div
            key={`${child.label}-${index}`}
            className="flex items-center"
            style={{ height: heights[index], flexDirection: dir === 'left' ? 'row-reverse' : 'row' }}
          >
            <Branch
              node={child}
              depth={depth + 1}
              colorIndex={depth === 0 ? index : colorIndex}
              dir={dir}
              path={`${path}/${index}-${child.label}`}
              offsets={offsets}
              onNodeDrag={onNodeDrag}
              zoom={zoom}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function MindmapCanvas({ tree, zoom, offsets, onNodeDrag }) {
  return (
    <div className="inline-flex items-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.12s' }}>
      <Branch node={tree} depth={0} colorIndex={0} dir="right" offsets={offsets} onNodeDrag={onNodeDrag} zoom={zoom} />
    </div>
  )
}

function makeNote(userId) {
  return {
    id: crypto.randomUUID(),
    userId,
    title: 'HAgent Mindmap',
    topic: 'HAgent',
    markdown: SAMPLE,
    updatedAt: new Date().toISOString(),
  }
}

export default function Mindmap({ user }) {
  const userKey = String(user?.id || user?.username || 'local')
  const storageKey = `hagent_mindmaps_${userKey}`
  const [notes, setNotes] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [zoom, setZoom] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? MOBILE_DEFAULT_ZOOM
      : 1
  ))
  const [query, setQuery] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const textareaRef = useRef(null)
  const canvasRef = useRef(null)
  const panRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 })

  useEffect(() => {
    let cancelled = false

    async function loadNotes() {
      try {
        const res = await fetch(`/api/mindmap?user=${encodeURIComponent(userKey)}`)
        if (res.ok) {
          const data = await res.json()
          const apiNotes = Array.isArray(data?.notes) ? data.notes : []
          if (apiNotes.length) {
            if (!cancelled) {
              setNotes(apiNotes)
              setActiveId(apiNotes[0].id)
              setStorageReady(true)
            }
            return
          }
        }
      } catch {
        // Fall back to browser storage if the backend is temporarily unavailable.
      }

      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
        if (Array.isArray(saved) && saved.length) {
          if (!cancelled) {
            setNotes(saved)
            setActiveId(saved[0].id)
            setStorageReady(true)
          }
          return
        }
      } catch {
        // Ignore corrupted localStorage and start with a clean note.
      }

      const first = makeNote(userKey)
      if (!cancelled) {
        setNotes([first])
        setActiveId(first.id)
        setStorageReady(true)
      }
    }

    setStorageReady(false)
    loadNotes()
    return () => {
      cancelled = true
    }
  }, [storageKey, userKey])

  useEffect(() => {
    if (!storageReady || !notes.length) return
    localStorage.setItem(storageKey, JSON.stringify(notes))
    fetch('/api/mindmap', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userKey, notes }),
    }).catch(() => {
      // Browser storage above keeps edits available until the backend recovers.
    })
  }, [notes, storageKey, storageReady, userKey])

  const active = notes.find((note) => note.id === activeId) || notes[0]
  const tree = useMemo(() => parseTree(active?.markdown || ''), [active?.markdown])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes
    return notes.filter((note) => `${note.title} ${note.topic} ${note.markdown}`.toLowerCase().includes(needle))
  }, [notes, query])

  const patchActive = (patch) => {
    setNotes((items) => items.map((note) => (
      note.id === active.id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note
    )))
  }

  const moveNode = (nodeKey, offset) => {
    if (!active) return
    setNotes((items) => items.map((note) => (
      note.id === active.id
        ? {
            ...note,
            nodeOffsets: {
              ...(note.nodeOffsets || {}),
              [nodeKey]: offset,
            },
            updatedAt: new Date().toISOString(),
          }
        : note
    )))
  }

  const newNote = () => {
    const note = { ...makeNote(userKey), title: 'Mindmap mới', topic: '' }
    setNotes((items) => [note, ...items])
    setActiveId(note.id)
  }

  const removeNote = (id) => {
    setNotes((items) => {
      const next = items.filter((note) => note.id !== id)
      if (!next.length) {
        const fallback = makeNote(user?.id || 'local')
        setActiveId(fallback.id)
        return [fallback]
      }
      if (activeId === id) setActiveId(next[0].id)
      return next
    })
  }

  const insertPrefix = (prefix) => {
    const ta = textareaRef.current
    if (!ta || !active) return
    const start = ta.selectionStart
    const value = active.markdown
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = value.indexOf('\n', start)
    const end = lineEnd === -1 ? value.length : lineEnd
    const current = value.slice(lineStart, end)
    const stripped = current.replace(/^(\s*)(#{1,6}\s+|[-*+]\s+)/, '$1')
    const nextLine = prefix === 'indent' ? `  ${current}` : `${prefix}${stripped}`
    patchActive({ markdown: value.slice(0, lineStart) + nextLine + value.slice(end) })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(lineStart + nextLine.length, lineStart + nextLine.length)
    })
  }

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = 0
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    })
  }, [activeId])

  const startPan = (event) => {
    if (!canvasRef.current || event.button !== 0) return
    panRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: canvasRef.current.scrollLeft,
      top: canvasRef.current.scrollTop,
    }
    canvasRef.current.setPointerCapture?.(event.pointerId)
  }

  const movePan = (event) => {
    if (!panRef.current.active || !canvasRef.current) return
    event.preventDefault()
    canvasRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x)
    canvasRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y)
  }

  const endPan = () => {
    panRef.current.active = false
  }

  const handleWheel = (event) => {
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    setZoom((value) => {
      const delta = event.deltaY > 0 ? -0.08 : 0.08
      return Math.min(1.8, Math.max(0.5, +(value + delta).toFixed(2)))
    })
  }

  if (!active) return null

  return (
    <div className="relative flex h-full min-h-0 bg-white text-gray-950">
      {notesOpen && <button type="button" aria-label="Đóng notes" onClick={() => setNotesOpen(false)} className="fixed inset-0 z-20 bg-transparent" />}
      {editorOpen && <button type="button" aria-label="Đóng editor" onClick={() => setEditorOpen(false)} className="fixed inset-0 z-20 bg-transparent" />}

      <aside className={`absolute inset-y-0 left-0 z-30 w-64 border-r border-black/[0.06] bg-white/95 p-2.5 shadow-xl backdrop-blur-xl transition-transform ${notesOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2">
          <button onClick={newNote} className="h-8 rounded-lg bg-gray-950 px-3 text-[12px] font-medium text-white">Mới</button>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] outline-none focus:border-gray-400"
            placeholder="Tìm"
          />
          <button onClick={() => setNotesOpen(false)} className="h-8 w-8 rounded-lg border border-black/[0.08] bg-white text-gray-500">×</button>
        </div>
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((note) => (
            <div key={note.id} className={`flex items-stretch gap-1.5 rounded-lg border p-1 transition ${note.id === active.id ? 'border-gray-950 bg-white shadow-sm' : 'border-black/[0.06] bg-white/60 hover:bg-white'}`}>
              <button
                onClick={() => setActiveId(note.id)}
                className="min-w-0 flex-1 px-1.5 py-1 text-left"
              >
                <div className="truncate text-[12px] font-semibold text-gray-950">{note.title || 'Không tiêu đề'}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span className="truncate">{note.topic || 'Chung'}</span>
                  <span>{new Date(note.updatedAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </button>
              <button
                onClick={() => removeNote(note.id)}
                className="w-9 shrink-0 rounded-md border border-red-100 bg-white text-[11px] font-medium text-red-600 hover:border-red-200 hover:bg-red-50"
                title="Xóa note"
              >
                Xóa
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/75 px-3 backdrop-blur-xl">
          <button onClick={() => setNotesOpen(true)} className="h-8 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] font-medium text-gray-700">Notes</button>
          <button onClick={() => setEditorOpen(true)} className="h-8 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[12px] font-medium text-gray-700">Edit</button>
          <input
            value={active.title}
            onChange={(event) => patchActive({ title: event.target.value })}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-gray-950 outline-none"
            placeholder="Tiêu đề"
          />
          <input
            value={active.topic}
            onChange={(event) => patchActive({ topic: event.target.value })}
            className="hidden h-8 w-32 rounded-lg border border-black/[0.08] bg-white px-2 text-[12px] outline-none focus:border-gray-400 sm:block"
            placeholder="Chủ đề"
          />
          <button onClick={() => setZoom((v) => Math.max(0.35, +(v - 0.1).toFixed(2)))} className="h-8 w-8 rounded-lg border border-black/[0.08] bg-white text-sm">-</button>
          <div className="hidden w-12 text-center text-[11px] font-medium text-gray-500 sm:block">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom((v) => Math.min(1.8, +(v + 0.1).toFixed(2)))} className="h-8 w-8 rounded-lg border border-black/[0.08] bg-white text-sm">+</button>
          <button onClick={() => removeNote(active.id)} className="h-8 rounded-lg border border-red-200 bg-white px-2 text-[12px] text-red-600">Xóa</button>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className={`absolute inset-y-0 left-0 z-30 flex w-[min(420px,calc(100vw-32px))] min-h-0 flex-col border-r border-black/[0.06] bg-white shadow-xl transition-transform ${editorOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <div className="flex h-9 shrink-0 items-center gap-1 border-b border-black/[0.06] bg-gray-50 px-2">
                <button onClick={() => insertPrefix('# ')} className="h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-white">H1</button>
                <button onClick={() => insertPrefix('## ')} className="h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-white">H2</button>
                <button onClick={() => insertPrefix('- ')} className="h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-white">•</button>
                <button onClick={() => insertPrefix('indent')} className="h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-white">→</button>
                <div className="ml-auto text-[11px] text-gray-400">autosaved</div>
                <button onClick={() => setEditorOpen(false)} className="h-7 w-7 rounded-md text-gray-500 hover:bg-white">×</button>
              </div>
              <textarea
                ref={textareaRef}
                value={active.markdown}
                onChange={(event) => patchActive({ markdown: event.target.value })}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-white p-3 font-mono text-[12px] leading-5 text-gray-900 outline-none"
              />
            </div>
          <div
            ref={canvasRef}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={handleWheel}
            className="h-full cursor-grab overflow-auto active:cursor-grabbing"
            style={{
              backgroundColor: '#ffffff',
              backgroundImage: 'linear-gradient(rgba(17,24,39,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,0.12) 1px, transparent 1px)',
              backgroundSize: '100% 30px, 30px 100%',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-black/[0.08] bg-white/85 px-2 py-1 text-[11px] text-gray-500 shadow-sm backdrop-blur">
              Kéo nền để di chuyển · Ctrl/⌘ + scroll để zoom
            </div>
            <div className="relative flex items-center justify-start pl-6" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
              <MindmapCanvas tree={tree} zoom={zoom} offsets={active.nodeOffsets || {}} onNodeDrag={moveNode} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
