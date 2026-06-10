import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Save, FlipHorizontal2, Download, Upload, X, FilePlus2, Image as ImageIcon, FileType2, Combine, Languages, FileText, MoreVertical, CheckSquare2, Square, Type, ImagePlus, Clock, ZoomIn, ZoomOut, Pencil, Minimize2, CheckCircle2, Crop, Settings2, Eye, EyeOff, ScanLine, RotateCcw, RotateCw } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, degrees, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import PdfEditorOverlay from './PdfEditorOverlay.jsx'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function renderThumb(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 0.3 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  return URL.createObjectURL(blob)
}

async function loadPdfUnicodeFont(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const res = await fetch('/api/pdf/font/noto-sans', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Không tải được font Unicode cho PDF editor (HTTP ${res.status})`)
  }
  const fontBytes = await res.arrayBuffer()
  return pdfDoc.embedFont(fontBytes, { subset: true })
}

async function normalizeImageFileToPng(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((out) => out ? resolve(out) : reject(new Error('Không chuyển được ảnh sang PNG')), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export default function PdfEditor({ token }) {
  const [fileName, setFileName] = useState('')
  const [bytes, setBytes] = useState(null) // Uint8Array of working PDF
  const [pdf, setPdf] = useState(null) // pdfjs doc
  const [pages, setPages] = useState([]) // [{ orig, thumb, selected }]
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(null) // {x,y,target}
  const [result, setResult] = useState(null)
  const mainCanvasRef = useRef(null)
  const inputRef = useRef(null)
  const dragIdxRef = useRef(null)
  const hiddenInputRef = useRef(null)
  const hiddenAction = useRef(null) // 'add-image', 'add-docx', 'merge', 'translate'
  const insertImageInputRef = useRef(null)

  const [insertMode, setInsertMode] = useState(null) // null | 'text' | 'image'
  const [insertText, setInsertText] = useState('')
  const [insertFontSize, setInsertFontSize] = useState(16)
  const [insertColor, setInsertColor] = useState('#000000')
  const [insertImageData, setInsertImageData] = useState(null) // { name, bytes, isJpeg }
  const [insertImgWidth, setInsertImgWidth] = useState(150)
  const [elements, setElements] = useState([]) // Overlay elements
  const [imageEditMode, setImageEditMode] = useState(false)
  const [pdfTextContent, setPdfTextContent] = useState([]) // Existing PDF text
  const [editTextMode, setEditTextMode] = useState(false) // Edit existing text mode
  const [recentFiles, setRecentFiles] = useState([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [zoom, setZoom] = useState(1.0) // zoom multiplier over fit-width
  const [currentFilePath, setCurrentFilePath] = useState(null) // server path for auto-save
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [compressing, setCompressing] = useState(false)
  const [compressResult, setCompressResult] = useState(null) // { savedBytes, originalSize, compressedSize, savedPath }
  const [previewRotation, setPreviewRotation] = useState(0)
  const [rotatePanelOpen, setRotatePanelOpen] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [scanDrag, setScanDrag] = useState(null) // { start, current }
  const [scanSelection, setScanSelection] = useState(null) // { x, y, width, height }
  const [scanResize, setScanResize] = useState(null) // { handle, start, rect }
  const [cropMode, setCropMode] = useState(false)
  const [cropDrag, setCropDrag] = useState(null) // { start, current } normalized canvas points
  const [cropSelection, setCropSelection] = useState(null) // { x, y, width, height } normalized from top-left
  const [cropResize, setCropResize] = useState(null) // { handle, start, rect }
  const [translateProgress, setTranslateProgress] = useState(null) // { status, step, stepLabel, message, currentPage, totalPages } | null
  const [llmSettings, setLlmSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('hagent_pdf_llm_settings')
      return saved ? JSON.parse(saved) : { provider: 'none', model: '', api_key: '', base_url: '' }
    } catch { return { provider: 'none', model: '', api_key: '', base_url: '' } }
  })
  const [llmModalOpen, setLlmModalOpen] = useState(false)
  const previewContainerRef = useRef(null)
  const wheelTimerRef = useRef(null)
  const activeIdxRef = useRef(0)
  const pendingPageScrollRef = useRef(null)
  const swipeRef = useRef(null)
  const saveTimerRef = useRef(null)
  const rotateDragRef = useRef(null)
  const currentFilePathRef = useRef(null)
  const extractedTextPagesRef = useRef(new Set())

  useEffect(() => {
    activeIdxRef.current = activeIdx
  }, [activeIdx])

  // Load recent files on mount
  useEffect(() => { loadRecentFiles() }, [])

  // Listen for open-by-path event from PdfTools (text/image/docx to PDF)
  useEffect(() => {
    function onOpen(e) {
      const { path, name } = e.detail || {}
      if (path) openByPath(path, name || path.split('/').pop())
    }
    window.addEventListener('hagent_open_pdf_path', onOpen)
    return () => window.removeEventListener('hagent_open_pdf_path', onOpen)
  }, [])

  // Reset saveStatus back to idle after showing "Đã lưu"
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  async function loadBytes(rawBytes, name, savedPages = null, savedActiveIdx = 0) {
    setLoading(true); setError(''); setResult(null)
    try {
      if (pdf?.destroy) {
        pdf.destroy().catch(() => {})
      }
      setPdf(null)
      setPages([])
      // pdfjs needs a fresh copy because it transfers the buffer
      const doc = await pdfjsLib.getDocument({ data: rawBytes.slice() }).promise
      const total = doc.numPages
      let list
      if (savedPages && savedPages.length > 0) {
        // Restore thumbnails for saved order
        list = []
        for (const p of savedPages) {
          if (p.orig < 1 || p.orig > total) continue
          list.push({ orig: p.orig, selected: !!p.selected, thumb: await renderThumb(doc, p.orig) })
        }
      } else {
        list = []
        for (let i = 1; i <= total; i++) {
          list.push({ orig: i, selected: false, thumb: await renderThumb(doc, i) })
        }
      }
      // Cleanup old thumbs
      pages.forEach(p => p.thumb && URL.revokeObjectURL(p.thumb))
      setBytes(rawBytes)
      setFileName(name)
      setPdf(doc)
      setPages(list)
      setPreviewRotation(0)
      setRotatePanelOpen(false)
      setScanMode(false)
      setScanDrag(null)
      setScanSelection(null)
      setZoom(1.0)
      setActiveIdx(Math.min(savedActiveIdx, list.length - 1))
      setElements([])
      setPdfTextContent([])
      extractedTextPagesRef.current = new Set()
    } catch (e) {
      setError(`Không mở được PDF: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function openLocalFile(f) {
    if (!f) return
    setCurrentFilePathAndRef(null)
    const buf = new Uint8Array(await f.arrayBuffer())
    loadBytes(buf, f.name)
  }

  async function loadRecentFiles() {
    setRecentLoading(true)
    try {
      const res = await fetch('/api/pdf/recent', { headers: authHeaders(token) })
      if (res.ok) {
        const data = await res.json()
        setRecentFiles(data.files || [])
      }
    } catch {}
    setRecentLoading(false)
  }

  async function openByPath(path, name) {
    setLoading(true); setError('')
    setCurrentFilePathAndRef(path)
    try {
      const res = await fetch(`/api/pdf/open?path=${encodeURIComponent(path)}`, { headers: authHeaders(token) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ab = await res.arrayBuffer()
      await loadBytes(new Uint8Array(ab), name)
    } catch (e) {
      setCurrentFilePathAndRef(null)
      setError(`Không mở được: ${e.message}`)
      setLoading(false)
    }
  }

  async function deleteRecent(path) {
    try {
      const fd = new FormData()
      fd.append('path', path)
      const r = await fetch('/api/pdf/delete', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t || `HTTP ${r.status}`)
      }
      setRecentFiles(prev => prev.filter(f => f.path !== path))
    } catch (e) {
      alert(`Không xoá được: ${e.message}`)
    }
  }

  async function renameRecent(path, currentName) {
    const stem = currentName.replace(/\.pdf$/i, '')
    const newName = window.prompt(`Đổi tên "${currentName}" thành:`, stem)
    if (!newName || newName === stem) return
    try {
      const fd = new FormData()
      fd.append('path', path)
      fd.append('new_name', newName.trim())
      const r = await fetch('/api/pdf/rename', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!r.ok) {
        const t = await r.text()
        let msg = t
        try { msg = JSON.parse(t).detail || t } catch {}
        throw new Error(msg || `HTTP ${r.status}`)
      }
      const data = await r.json()
      // Refresh recent list
      loadRecentFiles()
      // If currently open, update path/name
      if (currentFilePathRef.current === path) {
        setCurrentFilePathAndRef(data.path)
        setFileName(data.path.split('/').pop())
      }
    } catch (e) {
      alert(`Không đổi tên được: ${e.message}`)
    }
  }

  async function compressCurrent() {
    if (!bytes) return
    if (bytes.byteLength < 1024) {
      alert('File quá nhỏ, không cần nén.')
      return
    }
    if (!window.confirm('Nén PDF bằng FlateDecode + tối ưu object stream? File mới sẽ được lưu vào "Gần đây".')) return
    setCompressing(true)
    setCompressResult(null)
    try {
      const fd = new FormData()
      const fname = (fileName || 'document.pdf').replace(/\.pdf$/i, '') + '.pdf'
      fd.append('file', new Blob([bytes], { type: 'application/pdf' }), fname)
      const r = await fetch('/api/pdf/compress', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!r.ok) {
        const t = await r.text()
        let msg = t
        try { msg = JSON.parse(t).detail || t } catch {}
        throw new Error(msg || `HTTP ${r.status}`)
      }
      const ab = await r.arrayBuffer()
      const originalSize = parseInt(r.headers.get('x-original-size') || '0', 10)
      const compressedSize = parseInt(r.headers.get('x-compressed-size') || '0', 10)
      const savedPath = r.headers.get('x-saved-path') || ''
      setCompressResult({
        originalSize, compressedSize,
        savedBytes: Math.max(0, originalSize - compressedSize),
        savedPath,
      })
      // Refresh recent list
      loadRecentFiles()
    } catch (e) {
      alert(`Nén thất bại: ${e.message}`)
    } finally {
      setCompressing(false)
    }
  }

  async function persistRotation(angle, targets, bytesSnapshot = bytes, pagesSnapshot = pages, activeSnapshot = activeIdx) {
    if (!bytesSnapshot || pagesSnapshot.length === 0) return
    setWorking('rotate'); setError('')
    try {
      const currentBytes = await buildCurrentPdfBytes(bytesSnapshot, pagesSnapshot)
      const fd = new FormData()
      fd.append('file', new Blob([currentBytes], { type: 'application/pdf' }), fileName || 'input.pdf')
      fd.append('angle', String(angle))
      fd.append('pages', targets.join(','))
      const res = await fetch('/api/pdf/rotate-small', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `HTTP ${res.status}`)
      }
      const nextBytes = new Uint8Array(await res.arrayBuffer())
      await loadBytes(nextBytes, fileName || 'rotated.pdf', null, Math.min(activeSnapshot, pagesSnapshot.length - 1))
      scheduleAutoSave(nextBytes)
    } catch (e) {
      setPreviewRotation(v => +(v - angle).toFixed(2))
      setError(`Xoay thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  async function rotateCurrentPage90(angle) {
    if (!bytes || pages.length === 0 || working) return
    setWorking('rotate'); setError('')
    try {
      const currentBytes = await buildCurrentPdfBytes(bytes, pages)
      const pdfDoc = await PDFDocument.load(currentBytes)
      const page = pdfDoc.getPage(activeIdx)
      const currentAngle = page.getRotation().angle || 0
      page.setRotation(degrees((currentAngle + angle + 360) % 360))
      const nextBytes = new Uint8Array(await pdfDoc.save())
      await loadBytes(nextBytes, fileName || 'rotated.pdf', null, activeIdx)
      scheduleAutoSave(nextBytes)
    } catch (e) {
      setError(`Xoay trang thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  function angleFromRotateDialEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
    const value = (x / rect.width) * 6 - 3
    return Math.round(value * 10) / 10
  }

  function beginRotateDrag(e) {
    if (!bytes || pages.length === 0 || working) return
    e.preventDefault()
    const nextAngle = angleFromRotateDialEvent(e)
    rotateDragRef.current = {
      startAngle: previewRotation,
      activeSnapshot: activeIdx,
      bytesSnapshot: bytes,
      pagesSnapshot: pages,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setPreviewRotation(nextAngle)
  }

  function moveRotateDrag(e) {
    if (!rotateDragRef.current) return
    e.preventDefault()
    setPreviewRotation(angleFromRotateDialEvent(e))
  }

  function endRotateDrag(e) {
    const drag = rotateDragRef.current
    if (!drag) return
    e.preventDefault()
    rotateDragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const finalAngle = angleFromRotateDialEvent(e)
    setPreviewRotation(finalAngle)
    const delta = +(finalAngle - drag.startAngle).toFixed(2)
    if (Math.abs(delta) < 0.01) return
    persistRotation(
      delta,
      [drag.activeSnapshot + 1],
      drag.bytesSnapshot,
      drag.pagesSnapshot,
      drag.activeSnapshot,
    )
  }

  async function applyCropSelection() {
    if (!bytes || !cropSelection) return
    const { x, y, width, height } = cropSelection
    if (width < 0.02 || height < 0.02) {
      setCropSelection(null)
      return
    }
    setWorking('crop'); setError('')
    try {
      const currentBytes = await buildCurrentPdfBytes(bytes, pages)
      const pdfDoc = await PDFDocument.load(currentBytes)
      const page = pdfDoc.getPage(activeIdx)
      const size = page.getSize()
      const cropX = x * size.width
      const cropW = width * size.width
      const cropH = height * size.height
      const cropY = (1 - y - height) * size.height
      page.setCropBox(cropX, cropY, cropW, cropH)
      const nextBytes = new Uint8Array(await pdfDoc.save())
      setCropMode(false)
      setCropSelection(null)
      await loadBytes(nextBytes, fileName || 'cropped.pdf', null, activeIdx)
      scheduleAutoSave(nextBytes)
    } catch (e) {
      setError(`Crop thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  function toggleScanMode() {
    setScanMode(v => !v)
    setScanDrag(null)
    setScanSelection(null)
    setScanResize(null)
    setCropMode(false)
    setCropSelection(null)
    setCropDrag(null)
    setCropResize(null)
    setRotatePanelOpen(false)
    setInsertMode(null)
  }

  function beginScanResize(e, handle) {
    if (!scanSelection) return
    e.preventDefault()
    e.stopPropagation()
    const point = pointFromCanvasEvent(e)
    if (!point) return
    setScanResize({ handle, start: point, rect: scanSelection })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function moveScanResize(e) {
    if (!scanResize) return
    e.preventDefault()
    e.stopPropagation()
    const point = pointFromCanvasEvent(e)
    if (!point) return
    setScanSelection(resizeCropRect(scanResize.rect, scanResize.handle, point))
  }

  function endScanResize(e) {
    if (!scanResize) return
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
    setScanResize(null)
  }

  async function applyScanPage() {
    if (!bytes || !scanSelection) return
    setWorking('scan'); setError('')
    try {
      const { x, y, width, height } = scanSelection
      const scanPoints = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
      ]
      const currentBytes = await buildCurrentPdfBytes(bytes, pages)
      const fd = new FormData()
      fd.append('file', new Blob([currentBytes], { type: 'application/pdf' }), fileName || 'input.pdf')
      fd.append('page', String(activeIdx + 1))
      fd.append('points', JSON.stringify(scanPoints))
      fd.append('enhance', 'true')
      const res = await fetch('/api/pdf/scan-page', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `HTTP ${res.status}`)
      }
      const nextBytes = new Uint8Array(await res.arrayBuffer())
      await loadBytes(nextBytes, fileName || 'scanned.pdf', null, activeIdx)
      scheduleAutoSave(nextBytes)
      setScanMode(false)
      setScanSelection(null)
    } catch (e) {
      setError(`Scan thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  async function saveToServer(path, data) {
    if (!path || !data) return
    setSaveStatus('saving')
    try {
      const fd = new FormData()
      fd.append('path', path)
      fd.append('file', new Blob([data], { type: 'application/pdf' }), fileName || 'document.pdf')
      const res = await fetch('/api/pdf/save', {
        method: 'POST',
        headers: authHeaders(token),
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const result = await res.json()
      setCurrentFilePathAndRef(result.path)
      setSaveStatus('saved')
    } catch (e) {
      setSaveStatus('error')
      console.warn('PDF save failed:', e.message)
    }
  }

  function scheduleAutoSave(data) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const path = currentFilePathRef.current || (fileName || 'untitled').replace(/\.pdf$/i, '') + '.pdf'
      saveToServer(path, data || bytes)
    }, 800)
  }

  function setCurrentFilePathAndRef(path) {
    currentFilePathRef.current = path
    setCurrentFilePath(path)
  }

  async function buildCurrentPdfBytes(srcBytes, pageList) {
    const src = await PDFDocument.load(srcBytes)
    const dst = await PDFDocument.create()
    const indexes = pageList.map(p => p.orig - 1)
    const pageIndexMap = new Map()
    pageList.forEach((p, dstIdx) => {
      const visualIdx = pages.indexOf(p)
      pageIndexMap.set(visualIdx >= 0 ? visualIdx : dstIdx, dstIdx)
    })
    const copied = await dst.copyPages(src, indexes)
    copied.forEach(p => dst.addPage(p))

    const editedTextItems = pdfTextContent.filter(item => item.dirty || item.str !== item.originalStr)

    const textElements = elements.filter(el => el.type === 'text')
    const imageElements = elements.filter(el => el.type === 'image')
    const needsFont = editedTextItems.length > 0 || textElements.length > 0

    if (needsFont || imageElements.length > 0) {
      const font = needsFont ? await loadPdfUnicodeFont(dst) : null

      // 1. Bake only edited text layer items. Unchanged PDF text stays intact.
      for (const item of editedTextItems) {
        const sourcePageIdx = item.pageIdx !== undefined ? item.pageIdx : activeIdx
        const pageIdx = pageIndexMap.get(sourcePageIdx)
        if (pageIdx === undefined || pageIdx < 0 || pageIdx >= dst.getPageCount()) continue
        const page = dst.getPage(pageIdx)
        const { width, height } = page.getSize()
        const fontSize = item.fontSize * height
        const padX = Math.max(1.5, fontSize * 0.12)
        const padY = Math.max(1.5, fontSize * 0.22)
        const rectX = Math.max(0, item.x * width - padX)
        const rectY = Math.max(0, height - (item.y + item.height) * height - padY)
        const rectW = Math.min(width - rectX, item.width * width + padX * 2)
        const rectH = Math.min(height - rectY, item.height * height + padY * 2)

        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: rectW,
          height: rectH,
          color: rgb(1, 1, 1),
        })

        if (item.str.trim()) {
          page.drawText(item.str, {
            x: item.x * width,
            y: height - (item.y + item.height) * height,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
          })
        }
      }

      // 2. Bake new elements
      for (const el of textElements) {
        const pageIdx = pageIndexMap.get(el.pageIdx)
        if (pageIdx === undefined || pageIdx < 0 || pageIdx >= dst.getPageCount()) continue
        const page = dst.getPage(pageIdx)
        const { width, height } = page.getSize()

        page.drawText(el.text, {
          x: el.x * width,
          y: height - el.y * height - el.fontSize,
          size: el.fontSize,
          font: font,
          color: rgb(
            parseInt(el.color.slice(1, 3), 16) / 255,
            parseInt(el.color.slice(3, 5), 16) / 255,
            parseInt(el.color.slice(5, 7), 16) / 255,
          ),
        })
      }

      for (const el of imageElements) {
        const pageIdx = pageIndexMap.get(el.pageIdx)
        if (pageIdx === undefined || pageIdx < 0 || pageIdx >= dst.getPageCount()) continue
        const page = dst.getPage(pageIdx)
        const { width, height } = page.getSize()
        const img = await dst.embedPng(el.bytes)
        const scale = el.width / img.width
        const imgH = img.height * scale
        page.drawImage(img, {
          x: el.x * width,
          y: height - el.y * height - imgH,
          width: el.width,
          height: imgH,
          rotate: degrees(el.rotation || 0),
        })
      }
    }

    return new Uint8Array(await dst.save())
  }

  function scheduleFullSave(pageList) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!bytes) return
      try {
        const newBytes = await buildCurrentPdfBytes(bytes, pageList || pages)
        const path = currentFilePathRef.current || (fileName || 'untitled').replace(/\.pdf$/i, '') + '.pdf'
        await saveToServer(path, newBytes)
      } catch (e) {
        console.warn('Full save failed:', e.message)
      }
    }, 800)
  }

  async function refreshAfterEdit(newBytes) {
    const doc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
    const newThumb = await renderThumb(doc, pages[activeIdx].orig)
    URL.revokeObjectURL(pages[activeIdx].thumb)
    setBytes(newBytes)
    setPdf(doc)
    setPages(prev => prev.map((p, i) => i === activeIdx ? { ...p, thumb: newThumb } : p))
    scheduleAutoSave(newBytes)
  }

  function handleCanvasClick(e) {
    // Insertion is now handled by PdfEditorOverlay
  }

  function pointFromCanvasEvent(e) {
    const canvas = mainCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  function normalizedRectFromPoints(a, b) {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    return {
      x,
      y,
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    }
  }

  function resizeCropRect(base, handle, point) {
    let left = base.x
    let top = base.y
    let right = base.x + base.width
    let bottom = base.y + base.height
    if (handle.includes('w')) left = point.x
    if (handle.includes('e')) right = point.x
    if (handle.includes('n')) top = point.y
    if (handle.includes('s')) bottom = point.y
    left = Math.max(0, Math.min(1, left))
    right = Math.max(0, Math.min(1, right))
    top = Math.max(0, Math.min(1, top))
    bottom = Math.max(0, Math.min(1, bottom))
    const x = Math.min(left, right)
    const y = Math.min(top, bottom)
    return {
      x,
      y,
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    }
  }

  function beginCropResize(e, handle) {
    if (!cropSelection) return
    e.preventDefault()
    e.stopPropagation()
    const point = pointFromCanvasEvent(e)
    if (!point) return
    setCropResize({ handle, start: point, rect: cropSelection })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function moveCropResize(e) {
    if (!cropResize) return
    e.preventDefault()
    e.stopPropagation()
    const point = pointFromCanvasEvent(e)
    if (!point) return
    setCropSelection(resizeCropRect(cropResize.rect, cropResize.handle, point))
  }

  function endCropResize(e) {
    if (!cropResize) return
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
    setCropResize(null)
  }

  function handleCanvasMouseDown(e) {
    if (insertMode || !bytes) return
    if (cropMode) {
      const point = pointFromCanvasEvent(e)
      if (!point) return
      e.preventDefault()
      setCropSelection(null)
      setCropDrag({ start: point, current: point })
    } else if (scanMode) {
      const point = pointFromCanvasEvent(e)
      if (!point) return
      e.preventDefault()
      setScanSelection(null)
      setScanDrag({ start: point, current: point })
    }
  }

  function handleCanvasMouseMove(e) {
    if (cropDrag) {
      const point = pointFromCanvasEvent(e)
      if (!point) return
      e.preventDefault()
      setCropDrag(prev => prev ? { ...prev, current: point } : null)
    } else if (scanDrag) {
      const point = pointFromCanvasEvent(e)
      if (!point) return
      e.preventDefault()
      setScanDrag(prev => prev ? { ...prev, current: point } : null)
    }
  }

  function handleCanvasMouseUp(e) {
    if (cropDrag) {
      const point = pointFromCanvasEvent(e) || cropDrag.current
      e.preventDefault()
      const rect = normalizedRectFromPoints(cropDrag.start, point)
      setCropDrag(null)
      setCropSelection(rect.width >= 0.02 && rect.height >= 0.02 ? rect : null)
    } else if (scanDrag) {
      const point = pointFromCanvasEvent(e) || scanDrag.current
      e.preventDefault()
      const rect = normalizedRectFromPoints(scanDrag.start, point)
      setScanDrag(null)
      setScanSelection(rect.width >= 0.02 && rect.height >= 0.02 ? rect : null)
    }
  }

  // Wheel: Ctrl+Wheel = zoom, Shift+Wheel = đổi trang nhanh.
  // Plain wheel scrolls inside the page first; at page edges it moves to
  // the previous/next page so reading a PDF feels continuous.
  useEffect(() => {
    const container = previewContainerRef.current
    if (!container) return
    function switchPage(direction, e) {
      if (!pages.length || wheelTimerRef.current) return false
      const current = activeIdxRef.current
      const next = Math.max(0, Math.min(pages.length - 1, current + direction))
      if (next === current) return false
      e.preventDefault()
      activeIdxRef.current = next
      pendingPageScrollRef.current = direction > 0 ? 'top' : 'bottom'
      setActiveIdx(next)
      wheelTimerRef.current = window.setTimeout(() => {
        wheelTimerRef.current = null
      }, 180)
      return true
    }
    function onWheel(e) {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault()
        setZoom(z => Math.min(4, Math.max(0.3, z - e.deltaY * 0.001)))
      } else if (e.shiftKey) {
        // Đổi trang
        switchPage(Math.sign(e.deltaY) || 1, e)
      } else if (Math.abs(e.deltaY) >= 4) {
        const direction = Math.sign(e.deltaY)
        const atTop = container.scrollTop <= 2
        const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2
        if ((direction > 0 && atBottom) || (direction < 0 && atTop)) {
          switchPage(direction, e)
        }
      }
      // else: browser handles natural scrolling inside the current page.
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current)
        wheelTimerRef.current = null
      }
    }
  }, [pages.length])

  async function onInsertImageFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const bytes = await normalizeImageFileToPng(f)
      setInsertImageData({ name: f.name, bytes, isJpeg: false })
      setInsertMode('image')
    } catch (err) {
      setError(`Không đọc được ảnh: ${err.message}`)
    }
  }

  async function extractPageText(pageNum) {
    if (!pdf) return
    const pageIdx = activeIdxRef.current
    if (extractedTextPagesRef.current.has(pageIdx)) return

    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    
    // Convert PDF coordinates (pdf.js) to normalized overlay coordinates (0-1)
    const viewport = page.getViewport({ scale: 1 })
    const items = textContent.items
      .filter(item => item.str.trim() !== '')
      .map(item => {
        const [scaleX, skewY, skewX, scaleY, tx, ty] = item.transform
        const fontHeight = item.height || Math.hypot(scaleX, scaleY) || Math.abs(scaleY) || 12
        const boxHeight = Math.max(fontHeight, Math.abs(scaleY) || fontHeight)
        return {
          id: `${pageIdx}-${tx}-${ty}-${item.str}`,
          pageIdx,
          str: item.str,
          originalStr: item.str,
          dirty: false,
          x: tx / viewport.width,
          y: (viewport.height - ty - boxHeight) / viewport.height, // PDF Y-up to overlay Y-down
          width: item.width / viewport.width,
          height: boxHeight / viewport.height,
          fontSize: fontHeight / viewport.height,
        }
      })
    extractedTextPagesRef.current.add(pageIdx)
    setPdfTextContent(prev => {
      if (prev.some(item => item.pageIdx === pageIdx)) return prev
      return [...prev, ...items]
    })
  }

  // Render large preview
  useEffect(() => {
    if (!pdf || pages.length === 0 || !mainCanvasRef.current) return
    const orig = pages[activeIdx]?.orig
    if (!orig) return
    
    // Extract text content for the active page
    extractPageText(orig)

    let cancelled = false
    pdf.getPage(orig).then(async page => {
      if (cancelled) return
      const canvas = mainCanvasRef.current
      if (!canvas) return
      const parentW = previewContainerRef.current?.clientWidth || window.innerWidth || 900
      const sidePad = (window.innerWidth < 640 ? 20 : 160)
      const availW = Math.max(280, parentW - sidePad)
      const baseVp = page.getViewport({ scale: 1 })
      const baseScale = Math.min(2.5, availW / baseVp.width)
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const viewport = page.getViewport({ scale: baseScale * zoom * dpr })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.maxWidth = 'none'
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      if (cancelled) return
      const pendingScroll = pendingPageScrollRef.current
      if (pendingScroll && previewContainerRef.current) {
        pendingPageScrollRef.current = null
        const target = pendingScroll === 'bottom'
          ? previewContainerRef.current.scrollHeight
          : 0
        previewContainerRef.current.scrollTo({ top: target, behavior: 'auto' })
      }
    })
    return () => { cancelled = true }
  }, [activeIdx, pdf, pages, zoom])

  // === Local edits (no backend) ===
  const toggleSelect = useCallback((idx, e) => {
    e?.stopPropagation()
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p))
  }, [])

  function toggleActiveSelect() {
    if (pages.length === 0) return
    setPages(prev => prev.map((p, i) => i === activeIdx ? { ...p, selected: !p.selected } : p))
  }

  function selectAllPages() {
    setPages(prev => prev.map(p => ({ ...p, selected: true })))
  }

  function clearSelectedPages() {
    setPages(prev => prev.map(p => ({ ...p, selected: false })))
  }

  function deleteSelected() {
    const kept = pages.filter(p => !p.selected)
    if (kept.length === 0) { setError('Phải giữ lại ít nhất 1 trang'); return }
    pages.forEach(p => { if (p.selected) URL.revokeObjectURL(p.thumb) })
    setPages(kept)
    setActiveIdx(Math.min(activeIdx, kept.length - 1))
    scheduleFullSave(kept)
  }

  function deleteOne(idx) {
    if (pages.length <= 1) { setError('Phải giữ lại ít nhất 1 trang'); return }
    URL.revokeObjectURL(pages[idx].thumb)
    const next = pages.filter((_, i) => i !== idx)
    setPages(next)
    setActiveIdx(Math.min(activeIdx, next.length - 1))
    scheduleFullSave(next)
  }

  function reverseOrder() {
    const reversed = [...pages].reverse()
    setPages(reversed)
    setActiveIdx(0)
    scheduleFullSave(reversed)
  }

  function onDragStart(idx) { dragIdxRef.current = idx }
  function onDragOver(e) { e.preventDefault() }
  function onDrop(idx) {
    const from = dragIdxRef.current
    dragIdxRef.current = null
    if (from === null || from === idx) return
    const next = [...pages]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    setPages(next)
    setActiveIdx(idx)
    scheduleFullSave(next)
  }

  // === Export ===
  async function exportPdf(selectedOnly = false) {
    if (!bytes || pages.length === 0) return
    setWorking('export'); setError(''); setResult(null)
    try {
      const target = selectedOnly ? pages.filter(p => p.selected) : pages
      if (target.length === 0) throw new Error('Chưa chọn trang nào')
      const out = await buildCurrentPdfBytes(bytes, target)
      const blob = new Blob([out], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const name = (fileName.replace(/\.pdf$/i, '') || 'edited') + (selectedOnly ? '.selected.pdf' : '.pdf')
      setResult({ url, name, size: blob.size })
      // Auto-download
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
    } catch (e) {
      setError(`Xuất PDF thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  async function handleSave() {
    if (!bytes || pages.length === 0) return
    try {
      setWorking('save')
      const path = currentFilePathRef.current || (fileName || 'untitled').replace(/\.pdf$/i, '') + '.pdf'
      // Build PDF from current page order
      const newBytes = await buildCurrentPdfBytes(bytes, pages)
      await saveToServer(path, newBytes)
    } catch (e) {
      setError(`Lưu thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  const saveIcon = saveStatus === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                   saveStatus === 'saved' ? <FileText className="h-3.5 w-3.5" /> :
                   <Save className="h-3.5 w-3.5" />

  // === Add pages helpers ===
  async function appendPdfBytes(otherBytes) {
    if (!bytes) {
      await loadBytes(new Uint8Array(otherBytes), 'document.pdf')
      return
    }
    setWorking('append'); setError('')
    try {
      const dst = await PDFDocument.load(bytes)
      const src = await PDFDocument.load(otherBytes)
      const startCount = dst.getPageCount()
      const copied = await dst.copyPages(src, src.getPageIndices())
      copied.forEach(p => dst.addPage(p))
      const newBytes = new Uint8Array(await dst.save())
      const doc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      // Render thumbs for newly added pages
      const newThumbs = []
      for (let i = startCount + 1; i <= doc.numPages; i++) {
        newThumbs.push({ orig: i, selected: false, thumb: await renderThumb(doc, i) })
      }
      // Existing pages keep their orig indices (they didn't shift in source)
      setBytes(newBytes)
      setPdf(doc)
      setPages(prev => [...prev, ...newThumbs])
      setActiveIdx(pages.length)
      scheduleAutoSave(newBytes)
    } catch (e) {
      setError(`Thêm trang thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  async function addBlankPage() {
    setWorking('blank'); setError('')
    try {
      if (!bytes) {
        const dst = await PDFDocument.create()
        dst.addPage([595, 842])
        const out = new Uint8Array(await dst.save())
        await loadBytes(out, 'blank.pdf')
        return
      }
      const dst = await PDFDocument.load(bytes)
      const startCount = dst.getPageCount()
      dst.addPage([595, 842])
      const newBytes = new Uint8Array(await dst.save())
      const doc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      const thumb = await renderThumb(doc, startCount + 1)
      setBytes(newBytes)
      setPdf(doc)
      setPages(prev => [...prev, { orig: startCount + 1, selected: false, thumb }])
      setActiveIdx(pages.length)
      scheduleAutoSave(newBytes)
    } catch (e) {
      setError(`Thêm trang trắng thất bại: ${e.message}`)
    } finally {
      setWorking('')
    }
  }

  async function addImages(files) {
    if (!files || files.length === 0) return
    setWorking('images'); setError('')
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/pdf/from-images', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ab = await res.arrayBuffer()
      await appendPdfBytes(ab)
    } catch (e) {
      setError(`Thêm ảnh thất bại: ${e.message}`)
      setWorking('')
    }
  }

  async function addDocx(f) {
    if (!f) return
    setWorking('docx'); setError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/pdf/from-docx', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ab = await res.arrayBuffer()
      await appendPdfBytes(ab)
    } catch (e) {
      setError(`Thêm Word thất bại: ${e.message}`)
      setWorking('')
    }
  }

  async function mergeOther(f) {
    if (!f) return
    const ab = await f.arrayBuffer()
    await appendPdfBytes(ab)
  }

  async function translateCurrent(targetLang = 'vi') {
    if (!bytes) return
    setWorking('translate'); setError('')
    setTranslateProgress({ status: 'queued', step: 0, stepLabel: 'Đang khởi động', message: 'Chuẩn bị...', currentPage: 0, totalPages: 0 })
    let sse = null
    try {
      const fd = new FormData()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      fd.append('file', new File([blob], fileName || 'doc.pdf', { type: 'application/pdf' }))
      fd.append('target_lang', targetLang)
      if ((llmSettings.provider || 'none') !== 'none') {
        fd.append('llm_settings_json', JSON.stringify(llmSettings))
      }
      const res = await fetch('/api/pdf/translate-job', { method: 'POST', headers: authHeaders(token), body: fd })
      if (!res.ok) {
        let detail = await res.text()
        try { detail = JSON.parse(detail).detail || detail } catch { /* noop */ }
        throw new Error(detail || `HTTP ${res.status}`)
      }
      const { job_id } = await res.json()
      // Mở SSE stream để nhận progress
      const baseUrl = ''
      sse = new EventSource(`${baseUrl}/api/pdf/translate-job/${job_id}/stream`)
      const finalPayload = await new Promise((resolve, reject) => {
        let timeoutId = setTimeout(() => reject(new Error('Timeout: server không phản hồi')), 600000)
        sse.addEventListener('progress', (ev) => {
          try {
            const data = JSON.parse(ev.data)
            setTranslateProgress({
              status: data.status,
              step: data.step,
              stepLabel: data.step_label,
              message: data.message,
              currentPage: data.current_page,
              totalPages: data.total_pages,
            })
          } catch { /* ignore */ }
        })
        sse.addEventListener('done', (ev) => {
          clearTimeout(timeoutId)
          try { resolve(JSON.parse(ev.data)) } catch (e) { reject(e) }
        })
        sse.addEventListener('error', (ev) => {
          clearTimeout(timeoutId)
          // EventSource's 'error' fires on disconnect too; check if job truly errored
          if (ev?.data) {
            try { reject(new Error(JSON.parse(ev.data).error || 'Lỗi stream')) } catch { reject(new Error('Lỗi stream')) }
          }
        })
        sse.addEventListener('ping', () => { /* keep-alive */ })
      })
      sse.close()
      // Decode base64 PDF và download
      const binStr = atob(finalPayload.pdf_base64)
      const len = binStr.length
      const bytes8 = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes8[i] = binStr.charCodeAt(i)
      const ab = bytes8.buffer
      const url = URL.createObjectURL(new Blob([ab], { type: 'application/pdf' }))
      const name = finalPayload.filename || ((fileName.replace(/\.pdf$/i, '') || 'doc') + `.${targetLang}.pdf`)
      setResult({ url, name, size: ab.byteLength, savedPath: finalPayload.saved_path, ocrPages: finalPayload.ocr_pages })
      const a = document.createElement('a'); a.href = url; a.download = name; a.click()
      setTranslateProgress({ status: 'done', step: 5, stepLabel: 'Hoàn tất', message: 'Hoàn tất!', currentPage: finalPayload.ocr_pages?.length || 0, totalPages: finalPayload.ocr_pages?.length || 0 })
      setTimeout(() => setTranslateProgress(null), 2500)
    } catch (e) {
      setError(`Dịch thất bại: ${e.message}`)
      setTranslateProgress(null)
    } finally {
      if (sse) try { sse.close() } catch { /* noop */ }
      setWorking('')
    }
  }

  async function reset() {
    pages.forEach(p => p.thumb && URL.revokeObjectURL(p.thumb))
    if (result?.url) URL.revokeObjectURL(result.url)
    setFileName(''); setBytes(null); setPdf(null); setPages([]); setActiveIdx(0); setResult(null); setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  // Hidden input dispatcher
  function pickHidden(action, accept, multiple = false) {
    hiddenAction.current = action
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = ''
      hiddenInputRef.current.accept = accept
      hiddenInputRef.current.multiple = multiple
      hiddenInputRef.current.click()
    }
  }
  function onHiddenChange(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const act = hiddenAction.current
    hiddenAction.current = null
    if (act === 'add-image') addImages(files)
    else if (act === 'add-docx') addDocx(files[0])
    else if (act === 'merge') mergeOther(files[0])
  }

  // Context menu
  function openMenu(e, targetIdx = null) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, target: targetIdx })
  }
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const selectedCount = pages.filter(p => p.selected).length

  // ===== Empty state =====
  if (!bytes) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f6f6f6] text-[#1f1f1f]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#d7d7d7] bg-white px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#d71920] text-white">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[13px] font-semibold leading-4">PDF Studio</div>
              <div className="text-[10px] text-gray-500">Sắp xếp, gộp, dịch và xuất tài liệu</div>
            </div>
          </div>
          <button onClick={(e) => openMenu(e)} className="flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
            <MoreVertical className="h-3.5 w-3.5" />
            Công cụ
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d71920]/10 text-[#d71920]">
              <Upload className="h-7 w-7" />
            </div>
            <div className="mt-4 text-center">
              <p className="text-[17px] font-semibold text-gray-950">Mở tài liệu PDF</p>
              <p className="mt-1 text-[12px] leading-5 text-gray-500">Kéo thả, sắp xếp thumbnail, gộp thêm trang và xuất file sau khi chỉnh.</p>
            </div>
            <div className="mt-5 flex flex-col items-center gap-3">
              <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded bg-[#d71920] px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-[#b9151b]">
                <Upload className="h-4 w-4" />
                Chọn PDF
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={e => openLocalFile(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={addBlankPage} className="flex h-9 items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                  <FilePlus2 className="h-3.5 w-3.5" />Tạo PDF trắng
                </button>
                <button onClick={() => pickHidden('merge', 'application/pdf', false)} className="flex h-9 items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                  <Combine className="h-3.5 w-3.5" />Gộp PDF
                </button>
              </div>
            </div>

            {/* Recent files */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <Clock className="h-3 w-3" />Gần đây
                </span>
                <button onClick={loadRecentFiles} className="text-[11px] text-gray-400 hover:text-gray-700">Làm mới</button>
              </div>
              {recentLoading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-gray-300" /></div>}
              {!recentLoading && recentFiles.length === 0 && (
                <div className="py-3 text-center text-[11px] text-gray-400">Không có file gần đây</div>
              )}
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {recentFiles.map(f => (
                  <div
                    key={f.path}
                    className="group flex items-center gap-1 rounded border border-gray-100 bg-gray-50 px-2 py-1.5 hover:border-gray-300 hover:bg-white"
                  >
                    <button
                      onClick={() => openByPath(f.path, f.name)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-[#d71920]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-gray-900">{f.name}</div>
                        <div className="truncate text-[10px] text-gray-400">{f.folder} · {fmtSize(f.size)}</div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); renameRecent(f.path, f.name) }}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                        title="Đổi tên"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRecent(f.path) }}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Xoá"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {loading && <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>}
            {error && <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
          </div>
        </div>
        <input ref={hiddenInputRef} type="file" onChange={onHiddenChange} className="hidden" />
        {menu && renderMenu(menu, { hasBytes: !!bytes, addBlankPage, pickHidden, onClose: () => setMenu(null), translateCurrent, deleteOne, exportPdf, selectedCount })}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f4f4] text-[#1f1f1f]" onContextMenu={e => openMenu(e)}>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[#d8d8d8] bg-white px-2 py-2 sm:h-12 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#d71920] text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-4 text-gray-950">{fileName}</div>
            <div className="text-[10px] text-gray-500">{pages.length} trang · Trang {activeIdx + 1}</div>
          </div>
          {selectedCount > 0 && <span className="ml-1 shrink-0 rounded-full bg-[#fff1f1] px-2 py-0.5 text-[10px] font-semibold text-[#b9151b]">{selectedCount}</span>}
          {/* Mobile primary action */}
          <button onClick={handleSave} disabled={saveStatus === 'saving'} className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded bg-[#d71920] px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-[#b9151b] disabled:opacity-50 sm:hidden">
            {saveIcon}
            {saveStatus === 'saving' ? 'Đang lưu' : 'Lưu'}
          </button>
          <button onClick={reset} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 sm:hidden" title="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="-mx-2 flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 no-scrollbar sm:ml-auto sm:mx-0 sm:overflow-visible sm:px-0">
          <button onClick={toggleActiveSelect} className="flex h-8 shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
            {pages[activeIdx]?.selected ? <CheckSquare2 className="h-3.5 w-3.5 text-[#d71920]" /> : <Square className="h-3.5 w-3.5" />}
            Chọn trang
          </button>
          <button onClick={selectAllPages} className="hidden h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100 md:flex">
            <CheckSquare2 className="h-3.5 w-3.5" />Tất cả
          </button>
          <button onClick={clearSelectedPages} disabled={selectedCount === 0} className="hidden h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 md:flex">
            <Square className="h-3.5 w-3.5" />Bỏ chọn
          </button>
          <button onClick={reverseOrder} className="flex h-8 shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
            <FlipHorizontal2 className="h-3.5 w-3.5" />Đảo
          </button>
          <div className="hidden h-5 w-px bg-gray-200 sm:block" />
          <button
            onClick={() => { setRotatePanelOpen(v => !v); setScanMode(false); setCropMode(false); setCropSelection(null); setCropDrag(null); setCropResize(null); setInsertMode(null) }}
            disabled={!bytes || !!working}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium disabled:opacity-40 ${rotatePanelOpen ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
            title="Bật công cụ căn nghiêng trang"
          >
            <Settings2 className="h-3.5 w-3.5" />Căn ảnh
          </button>
          <button
            onClick={() => rotateCurrentPage90(-90)}
            disabled={!bytes || !!working}
            className="flex h-8 shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            title="Xoay trang hiện tại sang trái 90 độ"
          >
            <RotateCcw className="h-3.5 w-3.5" />Xoay trái
          </button>
          <button
            onClick={() => rotateCurrentPage90(90)}
            disabled={!bytes || !!working}
            className="flex h-8 shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            title="Xoay trang hiện tại sang phải 90 độ"
          >
            <RotateCw className="h-3.5 w-3.5" />Xoay phải
          </button>
          <button
            onClick={toggleScanMode}
            disabled={!bytes || !!working}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium disabled:opacity-40 ${scanMode ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
            title="Nắn phối cảnh bằng 4 góc như app scan"
          >
            <ScanLine className="h-3.5 w-3.5" />Scan
          </button>
          <button
            onClick={() => setEditTextMode(v => !v)}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium ${editTextMode ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            <Pencil className="h-3.5 w-3.5" />Sửa chữ
          </button>
          <button
            onClick={() => { setCropMode(v => !v); setCropSelection(null); setCropDrag(null); setCropResize(null); setRotatePanelOpen(false); setScanMode(false); setInsertMode(null) }}
            disabled={!bytes || !!working}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium disabled:opacity-40 ${cropMode ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
            title="Kéo khung trên trang để crop"
          >
            <Crop className="h-3.5 w-3.5" />Crop
          </button>
          <div className="hidden h-5 w-px bg-gray-200 sm:block" />
          <button
            onClick={() => { setCropMode(false); setCropSelection(null); setRotatePanelOpen(false); setScanMode(false); setInsertMode(m => m === 'text' ? null : 'text') }}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium ${insertMode === 'text' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            <Type className="h-3.5 w-3.5" />Chèn chữ
          </button>
          <button
            onClick={() => { setCropMode(false); setCropSelection(null); setRotatePanelOpen(false); setScanMode(false); insertImageInputRef.current?.click() }}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium ${insertMode === 'image' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            <ImagePlus className="h-3.5 w-3.5" />Chèn ảnh
          </button>
          <button
            onClick={() => { setImageEditMode(v => !v); setInsertMode(null); setCropMode(false); setCropSelection(null); setRotatePanelOpen(false); setScanMode(false) }}
            disabled={!bytes || !!working}
            className={`flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium disabled:opacity-40 ${imageEditMode ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
            title="Bật/tắt chỉnh ảnh đã chèn: kéo, resize, xoay, xóa"
          >
            <ImageIcon className="h-3.5 w-3.5" />Sửa ảnh
          </button>
          <div className="hidden h-5 w-px bg-gray-200 sm:block" />
          <button onClick={() => deleteSelected()} disabled={selectedCount === 0 || working} className="flex h-8 shrink-0 items-center gap-1 rounded border border-[#ffd6d8] bg-[#fff7f7] px-2 text-[11px] font-semibold text-[#b9151b] hover:bg-[#fff1f1] disabled:opacity-40">
            <Trash2 className="h-3.5 w-3.5" />Xóa
          </button>
          <button onClick={() => exportPdf(true)} disabled={selectedCount === 0 || working === 'export'} className="hidden h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 sm:flex">
            <Download className="h-3.5 w-3.5" />Xuất chọn
          </button>
          <button onClick={handleSave} disabled={saveStatus === 'saving'} className="hidden h-8 items-center gap-1 rounded bg-[#d71920] px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-[#b9151b] disabled:opacity-50 sm:flex">
            {saveIcon}
            {saveStatus === 'saving' ? 'Đang lưu' : saveStatus === 'saved' ? 'Đã lưu' : 'Lưu PDF'}
          </button>
          <button onClick={compressCurrent} disabled={!bytes || compressing} className="flex h-8 shrink-0 items-center gap-1 rounded border border-emerald-500 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40" title="Nén PDF (lưu file mới vào Gần đây)">
            <Minimize2 className="h-3.5 w-3.5" />
            {compressing ? 'Đang nén...' : 'Nén'}
          </button>
          <button onClick={e => openMenu(e)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100" title="Menu công cụ">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          <button onClick={reset} className="hidden h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 sm:flex" title="Đóng & xóa phiên">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      {working && <div className="flex shrink-0 items-center gap-2 border-b border-blue-100 bg-blue-50 px-3 py-2 text-[12px] text-blue-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />Đang xử lý: {working}</div>}
      {compressResult && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
          <span>Đã nén: {fmtSize(compressResult.originalSize)} → {fmtSize(compressResult.compressedSize)} (tiết kiệm {fmtSize(compressResult.savedBytes)})</span>
          <button onClick={() => setCompressResult(null)} className="text-emerald-700 hover:text-emerald-900"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {cropMode && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          <span>Kéo một khung trên trang để crop. Crop áp dụng cho trang hiện tại.</span>
          <button onClick={() => { setCropMode(false); setCropSelection(null); setCropDrag(null); setCropResize(null) }} className="text-blue-700 hover:text-blue-900"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {translateProgress && (
        <div className="shrink-0 border-b border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2.5 text-[12px] text-blue-900">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              {translateProgress.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
              <span>
                {translateProgress.status === 'done' ? 'Dịch xong' :
                 translateProgress.status === 'reading' ? 'Bước 1/5: Đang đọc PDF' :
                 translateProgress.status === 'ocr' ? 'Bước 2/5: OCR (trích xuất text từ ảnh scan)' :
                 translateProgress.status === 'cleaning' ? 'Bước 3/5: LLM sửa lỗi OCR (chính tả, dính chữ)' :
                 translateProgress.status === 'translating' ? 'Bước 4/5: Đang dịch' :
                 translateProgress.status === 'building' ? 'Bước 5/5: Tạo file PDF' :
                 translateProgress.status === 'error' ? 'Lỗi' :
                 translateProgress.stepLabel}
              </span>
            </div>
            <span className="text-[11px] font-mono text-blue-700">
              {translateProgress.totalPages > 0 ? `${translateProgress.currentPage}/${translateProgress.totalPages} trang` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className={`h-full transition-all duration-300 ${translateProgress.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{
                width: translateProgress.status === 'done' ? '100%' :
                       translateProgress.totalPages > 0 ? `${Math.min(100, Math.round((translateProgress.currentPage / translateProgress.totalPages) * 100))}%` :
                       '5%'
              }}
            />
          </div>
          <div className="mt-1 truncate text-[10.5px] text-blue-700/80">{translateProgress.message}</div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Thumbnail strip — ẩn trên mobile, vuốt để sang trang */}
        <div className="hidden w-24 shrink-0 flex-col overflow-y-auto border-r border-[#d8d8d8] bg-[#fbfbfb] p-1.5 sm:flex sm:w-36 sm:p-2 md:w-44">
          <div className="mb-2 flex h-7 items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <span>Pages</span>
            <button
              type="button"
              onClick={selectedCount === pages.length ? clearSelectedPages : selectAllPages}
              className="rounded px-1.5 py-1 text-[10px] normal-case text-gray-600 hover:bg-gray-100 hover:text-gray-950"
            >
              {selectedCount === pages.length ? 'Bỏ chọn' : 'Chọn hết'}
            </button>
          </div>
          {pages.map((p, i) => (
            <div
              key={`${p.orig}-${i}`}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(i)}
              onClick={() => setActiveIdx(i)}
              onContextMenu={e => openMenu(e, i)}
              className={`group relative mb-2 cursor-pointer rounded border bg-white p-1.5 transition-all ${
                activeIdx === i ? 'border-[#d71920] shadow-md shadow-red-950/10' : 'border-gray-200 hover:border-gray-400'
              } ${p.selected ? 'bg-[#fff7f7] ring-2 ring-[#d71920]/55' : ''}`}
            >
              <img src={p.thumb} alt={`Trang ${i + 1}`} className="block h-auto w-full rounded-sm border border-gray-100" />
              <div className="absolute left-2 top-2 flex items-center gap-1.5">
                <span className="rounded bg-gray-950/85 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
              </div>
              <button
                type="button"
                onClick={e => toggleSelect(i, e)}
                className={`absolute right-2 top-2 flex h-7 items-center gap-1 rounded px-2 text-[10px] font-semibold shadow-sm ${
                  p.selected
                    ? 'bg-[#d71920] text-white'
                    : 'bg-white/95 text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100'
                }`}
                title={p.selected ? `Bỏ chọn trang ${i + 1}` : `Chọn trang ${i + 1}`}
              >
                {p.selected ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                {p.selected ? 'Đã chọn' : 'Chọn'}
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setActiveIdx(i)
                  toggleSelect(i, e)
                }}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded bg-gray-100 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
              >
                {p.selected ? <CheckSquare2 className="h-3.5 w-3.5 text-[#d71920]" /> : <Square className="h-3.5 w-3.5" />}
                {p.selected ? 'Bỏ chọn trang' : 'Chọn trang'}
              </button>
            </div>
          ))}
          <button
            onClick={addBlankPage}
            disabled={!!working}
            className="flex h-11 items-center justify-center gap-1 rounded border border-dashed border-gray-300 bg-white text-[11px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            <FilePlus2 className="h-3.5 w-3.5" />Trang trắng
          </button>
        </div>

        {/* Main preview */}
        <div
          ref={previewContainerRef}
          className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[#2d2d2d] p-2 sm:p-6"
          onTouchStart={e => { if (e.touches.length === 1) { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } } }}
          onTouchEnd={e => {
            const s = swipeRef.current
            if (!s || insertMode) return
            const t = e.changedTouches[0]
            const dx = t.clientX - s.x
            const dy = t.clientY - s.y
            const dt = Date.now() - s.t
            swipeRef.current = null
            if (dt < 500 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx < 0 && activeIdx < pages.length - 1) setActiveIdx(activeIdx + 1)
              else if (dx > 0 && activeIdx > 0) setActiveIdx(activeIdx - 1)
            }
          }}
        >
          <div
            className="relative shrink-0 transition-transform duration-150 ease-out"
            style={{
              transform: `rotate(${previewRotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <canvas
              ref={mainCanvasRef}
              onClick={handleCanvasClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              className={`block bg-white shadow-2xl shadow-black/40${insertMode || cropMode || scanMode ? ' cursor-crosshair' : ''}`}
            />
            <PdfEditorOverlay
              activeIdx={activeIdx}
              elements={elements}
              setElements={setElements}
              insertMode={insertMode}
              setInsertMode={setInsertMode}
              insertText={insertText}
              setInsertText={setInsertText}
              insertFontSize={insertFontSize}
              insertColor={insertColor}
              insertImageData={insertImageData}
              setInsertImageData={setInsertImageData}
              insertImgWidth={insertImgWidth}
              imageEditMode={imageEditMode}
              pdfTextContent={pdfTextContent}
              setPdfTextContent={setPdfTextContent}
              editTextMode={editTextMode}
              setEditTextMode={setEditTextMode}
              canvasRef={mainCanvasRef}
            />
            {(cropDrag || cropSelection) && (
              <div
                className="pointer-events-none absolute border-2 border-blue-500 bg-blue-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
                style={cropRectStyle(cropDrag ? normalizedRectFromPoints(cropDrag.start, cropDrag.current) : cropSelection)}
              />
            )}
            {cropSelection && (
              <CropResizeHandles
                rect={cropSelection}
                onPointerDown={beginCropResize}
                onPointerMove={moveCropResize}
                onPointerUp={endCropResize}
                onPointerCancel={endCropResize}
              />
            )}
            {(scanDrag || scanSelection) && (
              <div
                className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
                style={cropRectStyle(scanDrag ? normalizedRectFromPoints(scanDrag.start, scanDrag.current) : scanSelection)}
              />
            )}
            {cropSelection && (
              <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-950/80 p-1 shadow-xl ring-1 ring-white/15 backdrop-blur">
                <button
                  onClick={applyCropSelection}
                  disabled={!!working}
                  className="h-8 rounded-full bg-white px-3 text-[11px] font-semibold text-zinc-950 shadow-sm hover:bg-blue-50 disabled:opacity-40"
                >
                  Áp dụng
                </button>
                <button
                  onClick={() => setCropSelection(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 hover:bg-white/15 hover:text-white"
                  title="Hủy crop"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {scanSelection && (
              <CropResizeHandles
                rect={scanSelection}
                onPointerDown={beginScanResize}
                onPointerMove={moveScanResize}
                onPointerUp={endScanResize}
                onPointerCancel={endScanResize}
              />
            )}
            {scanMode && scanSelection && (
              <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-950/80 p-1 shadow-xl ring-1 ring-white/15 backdrop-blur">
                <button
                  onClick={applyScanPage}
                  disabled={!!working}
                  className="h-8 rounded-full bg-white px-3 text-[11px] font-semibold text-zinc-950 shadow-sm hover:bg-emerald-50 disabled:opacity-40"
                >
                  Áp dụng Scan
                </button>
                <button
                  onClick={() => { setScanMode(false); setScanSelection(null) }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 hover:bg-white/15 hover:text-white"
                  title="Hủy Scan"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {rotatePanelOpen && (
          <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-zinc-950/75 p-2 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
            <RotateDial
              angle={previewRotation}
              disabled={!bytes || !!working}
              onPointerDown={beginRotateDrag}
              onPointerMove={moveRotateDrag}
              onPointerUp={endRotateDrag}
              onPointerCancel={endRotateDrag}
            />
            <button
              onClick={() => setRotatePanelOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/75 hover:bg-white/15 hover:text-white"
              title="Ẩn công cụ căn ảnh"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          )}

          {/* Floating zoom controls - đặt ở giữa-dưới canvas */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 px-2 py-1 shadow-lg backdrop-blur-sm">
            <button
              onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/20"
              title="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="pointer-events-auto min-w-[52px] rounded-full px-2 py-1 text-center text-[11px] font-semibold text-white hover:bg-white/20"
              title="Reset 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(1)))}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/20"
              title="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile page indicator + nav */}
          {pages.length > 1 && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 sm:hidden">
              <button
                onClick={() => activeIdx > 0 && setActiveIdx(activeIdx - 1)}
                disabled={activeIdx === 0}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm disabled:opacity-30"
                aria-label="Trang trước"
              >‹</button>
              <span className="pointer-events-auto rounded-full bg-black/65 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg backdrop-blur-sm">
                {activeIdx + 1} / {pages.length}
              </span>
              <button
                onClick={() => activeIdx < pages.length - 1 && setActiveIdx(activeIdx + 1)}
                disabled={activeIdx === pages.length - 1}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm disabled:opacity-30"
                aria-label="Trang sau"
              >›</button>
            </div>
          )}

          {/* Insert panel */}
          {insertMode && (
            <div className="absolute right-4 top-4 z-30 w-60 rounded-lg border border-gray-200 bg-white p-4 shadow-xl shadow-black/20">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-900">
                  {insertMode === 'text' ? 'Chèn văn bản' : 'Chèn ảnh vào trang'}
                </span>
                <button
                  onClick={() => { setInsertMode(null); setInsertText(''); setInsertImageData(null) }}
                  className="text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {insertMode === 'text' && (
                <>
                  <textarea
                    value={insertText}
                    onChange={e => setInsertText(e.target.value)}
                    placeholder="Nhập nội dung..."
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[12px] outline-none focus:border-blue-400 focus:bg-white"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[11px] text-gray-500">Cỡ</label>
                    <input
                      type="number" min={6} max={72} value={insertFontSize}
                      onChange={e => setInsertFontSize(Number(e.target.value))}
                      className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-center text-[12px]"
                    />
                    <label className="text-[11px] text-gray-500">Màu</label>
                    <input
                      type="color" value={insertColor}
                      onChange={e => setInsertColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-gray-200"
                    />
                  </div>
                  <div className="mt-3 rounded bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">
                    Nhấp vào trang PDF để đặt văn bản
                  </div>
                </>
              )}

              {insertMode === 'image' && !insertImageData && (
                <div className="text-[11px] text-gray-400">Đang chờ chọn ảnh...</div>
              )}

              {insertMode === 'image' && insertImageData && (
                <>
                  <div className="mb-2 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
                    <ImagePlus className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate text-[11px] text-gray-700">{insertImageData.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-[11px] text-gray-500">Rộng (pt)</label>
                    <input
                      type="number" min={20} max={500} value={insertImgWidth}
                      onChange={e => setInsertImgWidth(Number(e.target.value))}
                      className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-center text-[12px]"
                    />
                  </div>
                  <div className="mt-3 rounded bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">
                    Nhấp vào trang PDF để đặt ảnh
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <input ref={hiddenInputRef} type="file" onChange={onHiddenChange} className="hidden" />
      <input ref={insertImageInputRef} type="file" accept="image/png,image/jpeg" onChange={onInsertImageFile} className="hidden" />
      {menu && renderMenu(menu, { hasBytes: !!bytes, addBlankPage, pickHidden, onClose: () => setMenu(null), translateCurrent, deleteOne, exportPdf, selectedCount })}
      {llmModalOpen && <LlmSettingsModal settings={llmSettings} onClose={() => setLlmModalOpen(false)} onSave={(s) => { setLlmSettings(s); localStorage.setItem('hagent_pdf_llm_settings', JSON.stringify(s)); setLlmModalOpen(false) }} token={token} />}
    </div>
  )
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function cropRectStyle(rect) {
  if (!rect) return { display: 'none' }
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  }
}

function CropResizeHandles({ rect, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
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
    <div
      className="absolute z-30"
      style={cropRectStyle(rect)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {handles.map(([handle, pos]) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize crop ${handle}`}
          onPointerDown={e => onPointerDown(e, handle)}
          className={`absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-md ring-1 ring-blue-700/30 hover:bg-blue-600 ${pos}`}
        />
      ))}
    </div>
  )
}

function ScanQuadOverlay({ points, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const polygon = points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')
  const labels = ['TL', 'TR', 'BR', 'BL']
  return (
    <div className="absolute inset-0 z-30">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={polygon} fill="rgba(16,185,129,0.14)" stroke="#10b981" strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
        <polyline points={`${polygon} ${points[0].x * 100},${points[0].y * 100}`} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.22" strokeDasharray="1.2 1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((point, idx) => (
        <button
          key={idx}
          type="button"
          aria-label={`Scan corner ${labels[idx]}`}
          onPointerDown={e => onPointerDown(e, idx)}
          onPointerMove={e => onPointerMove(e, idx)}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 text-[8px] font-bold leading-none text-white shadow-lg ring-1 ring-emerald-700/40 hover:bg-emerald-400"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        >
          {labels[idx]}
        </button>
      ))}
    </div>
  )
}

function RotateDial({ angle, disabled, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const clamped = Math.max(-3, Math.min(3, Number(angle) || 0))
  const t = (clamped + 3) / 6
  const theta = Math.PI - t * Math.PI
  const x = 56 + 46 * Math.cos(theta)
  const y = 54 - 46 * Math.sin(theta)
  return (
    <div
      role="slider"
      aria-label="Xoay trang hiện tại"
      aria-valuemin={-3}
      aria-valuemax={3}
      aria-valuenow={clamped}
      title="Kéo núm trên bán nguyệt để xoay trang hiện tại"
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerMove={disabled ? undefined : onPointerMove}
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerCancel={disabled ? undefined : onPointerCancel}
      className={`relative h-14 w-28 touch-none select-none ${disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <svg viewBox="0 0 112 64" className="h-full w-full overflow-visible">
        <path d="M10 54 A46 46 0 0 1 102 54" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" strokeLinecap="round" />
        <path d="M10 54 A46 46 0 0 1 102 54" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.max(0.01, t * 145)} 145`} />
        <line x1="56" y1="54" x2={x} y2={y} stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx={x} cy={y} r="7.5" fill="#ffffff" stroke="#60a5fa" strokeWidth="3" />
        <circle cx="56" cy="54" r="2.5" fill="rgba(255,255,255,0.65)" />
        <text x="12" y="62" fontSize="8" fill="rgba(255,255,255,0.55)">-3</text>
        <text x="52" y="62" fontSize="8" fill="rgba(255,255,255,0.55)">0</text>
        <text x="94" y="62" fontSize="8" fill="rgba(255,255,255,0.55)">+3</text>
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-[28px] -translate-x-1/2 rounded px-1 text-[10px] font-semibold text-white">
        {clamped > 0 ? '+' : ''}{clamped.toFixed(1)}°
      </div>
    </div>
  )
}

function renderMenu(menu, ctx) {
  const { hasBytes, addBlankPage, pickHidden, onClose, translateCurrent, deleteOne, exportPdf, selectedCount } = ctx
  const onTarget = menu.target !== null
  return (
    <div
      className="fixed z-50 min-w-[220px] overflow-hidden rounded border border-gray-300 bg-white py-1 shadow-2xl shadow-black/20"
      style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 360) }}
      onClick={e => e.stopPropagation()}
    >
      <MenuItem onClick={() => { addBlankPage(); onClose() }} icon={FilePlus2} label="Tạo / thêm trang trắng" />
      <MenuItem onClick={() => { pickHidden('add-image', 'image/*', true); onClose() }} icon={ImageIcon} label="Thêm trang từ ảnh" />
      <MenuItem onClick={() => { pickHidden('add-docx', '.doc,.docx', false); onClose() }} icon={FileType2} label="Thêm trang từ Word" />
      <MenuItem onClick={() => { pickHidden('merge', 'application/pdf', false); onClose() }} icon={Combine} label="Gộp với PDF khác" />
      {hasBytes && <>
        <div className="mx-2 my-1 border-t border-gray-200" />
        <MenuItem onClick={() => { translateCurrent('vi'); onClose() }} icon={Languages} label="Dịch toàn bộ → Tiếng Việt" />
        <MenuItem onClick={() => { translateCurrent('en'); onClose() }} icon={Languages} label="Dịch toàn bộ → English" />
        <MenuItem onClick={() => { setLlmModalOpen(true); onClose() }} icon={Settings2} label="Cấu hình LLM correction..." />
        <div className="mx-2 my-1 border-t border-gray-200" />
        {onTarget && <MenuItem onClick={() => { deleteOne(menu.target); onClose() }} icon={Trash2} label={`Xóa trang #${menu.target + 1}`} danger />}
        <MenuItem onClick={() => { exportPdf(true); onClose() }} icon={Download} label={`Xuất trang đã chọn (${selectedCount})`} disabled={selectedCount === 0} />
        <MenuItem onClick={() => { exportPdf(false); onClose() }} icon={FileText} label="Xuất toàn bộ PDF" />
      </>}
    </div>
  )
}

function MenuItem({ onClick, icon: Icon, label, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[11px] disabled:opacity-40 ${
        danger ? 'text-[#b9151b] hover:bg-[#fff1f1]' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${danger ? 'text-[#d71920]' : 'text-gray-500'}`} />
      {label}
    </button>
  )
}

const LLM_PROVIDERS = [
  { value: 'none', label: 'Tắt (chỉ dùng lingva.ml cũ)', defaultModel: '', defaultBase: '' },
  { value: 'deepseek', label: 'DeepSeek (rẻ, nhanh, tiếng Việt tốt)', defaultModel: 'deepseek-chat', defaultBase: 'https://api.deepseek.com/v1' },
  { value: 'gemini', label: 'Google Gemini (free tier có)', defaultModel: 'gemini-2.0-flash', defaultBase: '' },
  { value: 'openai', label: 'OpenAI GPT-4o-mini', defaultModel: 'gpt-4o-mini', defaultBase: 'https://api.openai.com/v1' },
  { value: 'ollama', label: 'Ollama local (http://localhost:11434)', defaultModel: 'qwen2.5:3b', defaultBase: 'http://localhost:11434/v1' },
  { value: 'lmstudio', label: 'LM Studio local (http://localhost:1234)', defaultModel: 'qwen2.5-3b-instruct', defaultBase: 'http://localhost:1234/v1' },
  { value: 'custom', label: 'Custom (9router, proxy, …)', defaultModel: '', defaultBase: '' },
]

function LlmSettingsModal({ settings, onClose, onSave, token }) {
  const [draft, setDraft] = useState(settings || { provider: 'none', model: '', api_key: '', base_url: '' })
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState(null) // null | {ok, error, reply, model}
  const [testing, setTesting] = useState(false)

  const prov = LLM_PROVIDERS.find(p => p.value === (draft.provider || 'none')) || LLM_PROVIDERS[0]
  const needKey = (draft.provider || 'none') !== 'none' && draft.provider !== 'ollama' && draft.provider !== 'lmstudio'
  const needBase = ['ollama', 'lmstudio', 'custom'].includes(draft.provider)

  function update(patch) {
    setDraft(d => {
      const next = { ...d, ...patch }
      if (patch.provider !== undefined) {
        const np = LLM_PROVIDERS.find(p => p.value === patch.provider)
        if (np) {
          if (!d.model) next.model = np.defaultModel
          if (!d.base_url) next.base_url = np.defaultBase
        }
      }
      return next
    })
  }

  async function test() {
    setTesting(true); setTestStatus(null)
    try {
      const res = await fetch('/api/pdf/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ settings: draft }),
      })
      const data = await res.json()
      setTestStatus(data)
    } catch (e) {
      setTestStatus({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-gray-900">Cấu hình LLM Correction</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 px-4 py-4 text-[12px]">
          <div>
            <label className="mb-1 block font-medium text-gray-700">Provider</label>
            <select
              value={draft.provider || 'none'}
              onChange={e => update({ provider: e.target.value })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none"
            >
              {LLM_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="mt-1 text-[10.5px] text-gray-500">
              LLM sẽ (1) sửa lỗi OCR — chính tả, dính chữ, dấu thanh; (2) thay thế lingva.ml để dịch chất lượng cao hơn.
            </p>
          </div>

          {needKey && (
            <div>
              <label className="mb-1 block font-medium text-gray-700">API Key</label>
              <div className="flex gap-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.api_key || ''}
                  onChange={e => update({ api_key: e.target.value })}
                  placeholder={prov.value === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="rounded border border-gray-300 px-2 text-gray-600 hover:bg-gray-50"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1 text-[10.5px] text-amber-700">⚠ Lưu localStorage, không mã hoá. Không dùng key production.</p>
            </div>
          )}

          <div>
            <label className="mb-1 block font-medium text-gray-700">Model</label>
            <input
              type="text"
              value={draft.model || ''}
              onChange={e => update({ model: e.target.value })}
              placeholder={prov.defaultModel || 'model-name'}
              className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {needBase && (
            <div>
              <label className="mb-1 block font-medium text-gray-700">Base URL</label>
              <input
                type="text"
                value={draft.base_url || ''}
                onChange={e => update({ base_url: e.target.value })}
                placeholder={prov.defaultBase || 'https://...'}
                className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {testStatus && (
            <div className={`rounded border px-2.5 py-1.5 text-[11px] ${testStatus.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900'}`}>
              {testStatus.ok ? (
                <>✓ {testStatus.model} OK. Reply: <span className="font-mono">{testStatus.reply || '(rỗng)'}</span></>
              ) : (
                <>✗ {testStatus.error || 'Lỗi'}</>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <button
            type="button"
            onClick={test}
            disabled={testing || (draft.provider || 'none') === 'none'}
            className="rounded border border-blue-300 bg-white px-3 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
          >
            {testing ? 'Đang test...' : 'Test kết nối'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-[11px] hover:bg-gray-100">Huỷ</button>
            <button type="button" onClick={() => onSave(draft)} className="rounded bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700">Lưu</button>
          </div>
        </div>
      </div>
    </div>
  )
}
