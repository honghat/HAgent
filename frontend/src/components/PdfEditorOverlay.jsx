import { useState, useRef, useEffect } from 'react'
import { X, GripHorizontal, RotateCcw, RotateCw, Trash2 } from 'lucide-react'

function ImageResizeHandles({ onPointerDown }) {
  const handles = [
    ['nw', 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],
    ['n', 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize'],
    ['ne', 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
    ['e', 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize'],
    ['se', 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize'],
    ['s', 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize'],
    ['sw', 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],
    ['w', 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
  ]
  return (
    <div className="absolute inset-0 pointer-events-none">
      {handles.map(([handle, pos]) => (
        <button
          key={handle}
          type="button"
          data-handle={handle}
          onPointerDown={e => onPointerDown(e)}
          className={`absolute h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow-lg ring-1 ring-blue-800/50 pointer-events-auto hover:bg-blue-500 hover:scale-110 transition-transform ${pos}`}
        />
      ))}
    </div>
  )
}

export default function PdfEditorOverlay({
  activeIdx,
  elements,
  setElements,
  pdfTextContent,
  setPdfTextContent,
  editTextMode,
  setEditTextMode,
  insertMode,
  setInsertMode,
  insertText,
  setInsertText,
  insertFontSize,
  insertColor,
  insertImageData,
  setInsertImageData,
  insertImgWidth,
  imageEditMode,
  canvasRef,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [dragState, setDragState] = useState(null) // { id, startX, startY, startElX, startElY }
  const [textDrag, setTextDrag] = useState(null) // { id, startX, startY, startItemX, startItemY, rect }
  const [imageResize, setImageResize] = useState(null) // { id, handle, startX, startY, startW }
  const overlayRef = useRef(null)

  // Filter elements for the active page
  const pageElements = elements.filter(el => el.pageIdx === activeIdx)
  const pageTextItems = pdfTextContent.filter(item => item.pageIdx === activeIdx && !item.deleted)

  // Get canvas actual dimensions to position elements accurately
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = new ResizeObserver(() => {
      setDimensions({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      })
    })

    resizeObserver.observe(canvas)
    setDimensions({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    })

    return () => resizeObserver.disconnect()
  }, [canvasRef, activeIdx])

  const handleOverlayClick = (e) => {
    if (!insertMode) {
      // Clear selection if clicking empty area
      if (e.target === overlayRef.current) {
        setSelectedId(null)
        setSelectedTextId(null)
      }
      return
    }

    const rect = overlayRef.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height

    if (insertMode === 'text' && insertText.trim()) {
      const newEl = {
        id: 'text-' + Date.now(),
        pageIdx: activeIdx,
        type: 'text',
        x: nx,
        y: ny,
        text: insertText,
        fontSize: insertFontSize,
        color: insertColor,
        width: 200, // default width
      }
      setElements(prev => [...prev, newEl])
      setInsertMode(null)
      setInsertText('')
    } else if (insertMode === 'image' && insertImageData) {
      // Create local object URL for rendering in overlay
      const blob = new Blob([insertImageData.bytes], { type: insertImageData.isJpeg ? 'image/jpeg' : 'image/png' })
      const src = URL.createObjectURL(blob)

      const newEl = {
        id: 'image-' + Date.now(),
        pageIdx: activeIdx,
        type: 'image',
        x: nx,
        y: ny,
        bytes: insertImageData.bytes,
        isJpeg: insertImageData.isJpeg,
        src,
        width: insertImgWidth,
        rotation: 0,
        name: insertImageData.name,
      }
      setElements(prev => [...prev, newEl])
      setInsertMode(null)
      setInsertImageData(null)
    }
  }

  const handlePointerDown = (e, el) => {
    e.stopPropagation()
    setSelectedId(el.id)
    setSelectedTextId(null)

    if (el.type === 'image' && e.target.dataset.handle) {
      const handle = e.target.dataset.handle
      setImageResize({
        id: el.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startW: el.width,
      })
      try { overlayRef.current?.setPointerCapture(e.pointerId) } catch {}
      return
    }

    const rect = overlayRef.current.getBoundingClientRect()
    setDragState({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startElX: el.x,
      startElY: el.y,
      rect,
    })

    try { overlayRef.current?.setPointerCapture(e.pointerId) } catch {}
  }

  const handlePointerMove = (e) => {
    if (dragState) {
      e.stopPropagation()
      const dx = (e.clientX - dragState.startX) / dragState.rect.width
      const dy = (e.clientY - dragState.startY) / dragState.rect.height

      setElements(prev =>
        prev.map(el => {
          if (el.id === dragState.id) {
            return {
              ...el,
              x: Math.max(0, Math.min(1, dragState.startElX + dx)),
              y: Math.max(0, Math.min(1, dragState.startElY + dy)),
            }
          }
          return el
        })
      )
    } else if (imageResize) {
      e.stopPropagation()
      const dx = e.clientX - imageResize.startX
      const rect = overlayRef.current.getBoundingClientRect()
      const pointPerPixel = 595 / Math.max(1, rect.width)

      let nextW = imageResize.startW
      if (imageResize.handle === 'e' || imageResize.handle === 'se') {
        nextW += dx * pointPerPixel
      } else if (imageResize.handle === 'w' || imageResize.handle === 'sw') {
        nextW -= dx * pointPerPixel
        // Khi kéo cạnh trái, cần cập nhật cả tọa độ x để ảnh không bị dịch chuyển
        setElements(prev => prev.map(el => {
          if (el.id === imageResize.id) {
            return { ...el, x: el.x + (dx * pointPerPixel / 595), width: Math.max(20, nextW) }
          }
          return el
        }))
        return
      }
      setElements(prev =>
        prev.map(el => (el.id === imageResize.id ? { ...el, width: Math.max(20, nextW) } : el))
      )
    } else if (textDrag) {
      e.stopPropagation()
      const dx = (e.clientX - textDrag.startX) / textDrag.rect.width
      const dy = (e.clientY - textDrag.startY) / textDrag.rect.height
      setPdfTextContent(prev =>
        prev.map(item => item.id === textDrag.id
          ? {
              ...item,
              x: Math.max(0, Math.min(1, textDrag.startItemX + dx)),
              y: Math.max(0, Math.min(1, textDrag.startItemY + dy)),
              dirty: true,
            }
          : item
        )
      )
    }
  }

  const handlePointerUp = (e) => {
    if (dragState) {
      e.stopPropagation()
      try { overlayRef.current?.releasePointerCapture(e.pointerId) } catch {}
      setDragState(null)
    } else if (imageResize) {
      e.stopPropagation()
      try { overlayRef.current?.releasePointerCapture(e.pointerId) } catch {}
      setImageResize(null)
    } else if (textDrag) {
      e.stopPropagation()
      try { overlayRef.current?.releasePointerCapture(e.pointerId) } catch {}
      setTextDrag(null)
    }
  }

  const deleteElement = (id) => {
    const el = elements.find(e => e.id === id)
    if (el?.src) {
      URL.revokeObjectURL(el.src)
    }
    setElements(prev => prev.filter(el => el.id !== id))
    setSelectedId(null)
  }

  const updateText = (id, newText) => {
    setElements(prev =>
      prev.map(el => (el.id === id ? { ...el, text: newText } : el))
    )
  }

  const deleteTextItem = (id) => {
    setPdfTextContent(prev =>
      prev.map(item => item.id === id ? { ...item, str: '', deleted: true, dirty: true } : item)
    )
    setSelectedTextId(null)
  }

  const startTextDrag = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = overlayRef.current.getBoundingClientRect()
    setSelectedTextId(item.id)
    setSelectedId(null)
    setTextDrag({
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      rect,
    })
    try { overlayRef.current?.setPointerCapture(e.pointerId) } catch {}
  }

  const rotateImage = (id, delta) => {
    setElements(prev =>
      prev.map(el => (el.id === id ? { ...el, rotation: ((el.rotation || 0) + delta + 360) % 360 } : el))
    )
  }

  if (dimensions.width === 0) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`absolute z-20 overflow-hidden ${
        insertMode ? 'cursor-crosshair' : 'cursor-default'
      }`}
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        left: '50%',
        top: '0',
        transform: 'translateX(-50%)',
      }}
    >
      {editTextMode && pageTextItems.map((item) => {
        const isTextSelected = selectedTextId === item.id
        return (
        <div
          key={item.id}
          className="absolute"
          style={{
            left: `${Math.max(0, item.x * dimensions.width - 2)}px`,
            top: `${Math.max(0, item.y * dimensions.height - 2)}px`,
          }}
        >
          {isTextSelected && (
            <div className="absolute -top-7 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded bg-zinc-900 px-1 py-0.5 shadow-md">
              <button
                onPointerDown={(e) => startTextDrag(e, item)}
                className="rounded p-0.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                title="Kéo chữ"
              >
                <GripHorizontal className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTextItem(item.id)
                }}
                className="rounded p-0.5 text-red-400 hover:bg-zinc-800 hover:text-red-300"
                title="Xóa chữ"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
          <textarea
            value={item.str}
            onFocus={() => {
              setSelectedTextId(item.id)
              setSelectedId(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedTextId(item.id)
              setSelectedId(null)
            }}
            onChange={(e) => setPdfTextContent(prev => prev.map(it => it.id === item.id ? { ...it, str: e.target.value, dirty: true } : it))}
            className="overflow-hidden border border-dotted border-gray-400 bg-white p-0 text-gray-950 resize-none focus:outline-none focus:border-blue-500"
            style={{
            width: `${Math.max(item.width * dimensions.width + 24, item.str.length * item.fontSize * dimensions.height * 0.72 + 24, 96)}px`,
            height: `${item.height * dimensions.height + 6}px`,
            fontSize: `${item.fontSize * dimensions.height}px`,
            lineHeight: '1',
            fontFamily: 'Noto Sans, Helvetica, sans-serif',
            scrollbarWidth: 'none',
          }}
          />
        </div>
        )
      })}
      {pageElements.map(el => {
        const isSelected = selectedId === el.id
        const elLeft = el.x * dimensions.width
        const elTop = el.y * dimensions.height

        return (
          <div
            key={el.id}
            onPointerDown={(e) => handlePointerDown(e, el)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`absolute touch-none select-none p-1 transition-shadow duration-150 ${
              isSelected
                ? 'ring-2 ring-blue-500 bg-blue-50/10 shadow-lg'
                : imageEditMode && el.type === 'image'
                  ? 'ring-1 ring-blue-300/70 hover:ring-blue-500'
                : 'hover:ring-1 hover:ring-blue-300'
            }`}
            style={{
              left: `${elLeft}px`,
              top: `${elTop}px`,
              transform: 'translate(-5px, -5px)', // small offset for padding
              cursor: dragState?.id === el.id ? 'grabbing' : 'grab',
            }}
          >
            {/* Header controls for selected item */}
            {isSelected && (
              <div
                className="absolute -top-7 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded bg-zinc-900 px-1 py-0.5 shadow-md"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <GripHorizontal className="h-3 w-3 text-zinc-400 cursor-grab" />
                {el.type === 'image' && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        rotateImage(el.id, -90)
                      }}
                      className="rounded p-0.5 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                      title="Xoay trái"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        rotateImage(el.id, 90)
                      }}
                      className="rounded p-0.5 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                      title="Xoay phải"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteElement(el.id)
                  }}
                  className="rounded p-0.5 text-red-400 hover:bg-zinc-800 hover:text-red-300"
                  title="Xóa phần tử"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}

            {el.type === 'text' ? (
              <div className="relative">
                {isSelected ? (
                  <textarea
                    value={el.text}
                    onChange={(e) => updateText(el.id, e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag while editing
                    className="border-none bg-transparent resize-none p-0 focus:outline-none"
                    style={{
                      fontSize: `${el.fontSize}px`,
                      color: el.color,
                      fontWeight: '500',
                      fontFamily: 'Noto Sans, Helvetica, sans-serif',
                      minWidth: '60px',
                    }}
                    rows={Math.max(1, el.text.split('\n').length)}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: `${el.fontSize}px`,
                      color: el.color,
                      fontWeight: '500',
                      fontFamily: 'Noto Sans, Helvetica, sans-serif',
                      whiteSpace: 'pre-wrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {el.text}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <img
                  src={el.src}
                  alt="Chèn"
                  className="block pointer-events-none"
                  style={{
                    width: `${(el.width / 595) * dimensions.width}px`, // maintain proportional width
                    height: 'auto',
                    transform: `rotate(${el.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                  }}
                />
                {isSelected && (
                  <ImageResizeHandles onPointerDown={(e) => handlePointerDown(e, { ...el, type: 'image' })} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
