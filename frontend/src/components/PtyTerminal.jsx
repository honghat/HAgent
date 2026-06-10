import { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const PtyTerminal = forwardRef(({ token, cwd, active = true, keyboardInset = 0, vpHeight = null, session = null }, ref) => {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const fitRef = useRef(null)
  const outerRef = useRef(null)
  const [boundCwd, setBoundCwd] = useState(null)
  const [autoYes, setAutoYes] = useState(false)

  const connectingRef = useRef(true)
  const autoYesRef = useRef(false)
  const autoYesBufRef = useRef('')
  const autoYesTimerRef = useRef(null)

  useEffect(() => { autoYesRef.current = autoYes }, [autoYes])

  useEffect(() => {
    if (cwd && cwd !== boundCwd) setBoundCwd(cwd)
  }, [cwd, boundCwd])

  useEffect(() => {
    if (!containerRef.current || !boundCwd) return undefined

    connectingRef.current = true
    const term = new XTerm({
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0,
      fontWeight: 500,
      fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: {
        background: '#07111f',
        foreground: '#e5edf8',
        cursor: '#fbbf24',
        cursorAccent: '#07111f',
        selectionBackground: '#1d4ed8',
        black: '#0f172a',
        red: '#fb7185',
        green: '#86efac',
        yellow: '#fde68a',
        blue: '#7dd3fc',
        magenta: '#d8b4fe',
        cyan: '#67e8f9',
        white: '#e5edf8',
        brightBlack: '#64748b',
        brightRed: '#fda4af',
        brightGreen: '#bbf7d0',
        brightYellow: '#fef3c7',
        brightBlue: '#bae6fd',
        brightMagenta: '#e9d5ff',
        brightCyan: '#a5f3fc',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      scrollback: 10000000,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    try { fit.fit() } catch { /* noop */ }
    termRef.current = term
    fitRef.current = fit
    term.write('\x1b[2mĐang kết nối...\x1b[0m')

    term.attachCustomWheelEventHandler((ev) => {
      try { term.focus() } catch { /* noop */ }
      const viewport = term.element && term.element.querySelector('.xterm-viewport')
      if (viewport) {
        viewport.scrollTop += ev.deltaY
      } else {
        const lines = Math.sign(ev.deltaY) * Math.max(1, Math.round(Math.abs(ev.deltaY) / 24))
        try { term.scrollLines(-lines) } catch { /* noop */ }
      }
      return false
    })

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/ws/workspace/terminal?t=${encodeURIComponent(token || 'hat')}&cwd=${encodeURIComponent(boundCwd)}&cols=${term.cols}&rows=${term.rows}${session ? `&session=${encodeURIComponent(session)}` : ''}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
    const YES_PATTERNS = [
      /\(y\/n\)/i,
      /\[y\/n\]/i,
      /\(yes\/no\)/i,
      /\[yes\/no\]/i,
      /\byes\/no\b/i,
      /\?\s*\(?y\b/i,
      /\byes\b/i,
      /press\s+(enter|return|any\s+key)/i,
      /continue\?/i,
      /proceed\?/i,
      /do you want/i,
      /are you sure/i,
      /\by\b\s*\/.*\bn\b/i,
    ]
    const checkAutoYes = (chunk) => {
      autoYesBufRef.current = (autoYesBufRef.current + chunk).replace(ANSI_RE, '').slice(-512)
      const tail = autoYesBufRef.current
      if (!YES_PATTERNS.some(re => re.test(tail))) return
      if (autoYesTimerRef.current) return
      autoYesTimerRef.current = setTimeout(() => {
        autoYesTimerRef.current = null
        if (!autoYesRef.current) return
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: '\r' }))
        }
        autoYesBufRef.current = ''
      }, 250)
    }

    ws.onopen = () => {
      term.write('\x1b[2K\r')
      connectingRef.current = false
      term.focus()
    }
    ws.onmessage = (event) => {
      connectingRef.current = false
      let data = event.data
      if (typeof data === 'string') {
        if (autoYesRef.current) checkAutoYes(data)
        term.write(data)
      } else {
        if (autoYesRef.current) {
          try { checkAutoYes(new TextDecoder().decode(new Uint8Array(data))) } catch { /* noop */ }
        }
        term.write(new Uint8Array(data))
      }
    }
    ws.onclose = () => { try { term.write('\r\n\x1b[33m[disconnected]\x1b[0m\r\n') } catch { /* noop */ } }
    ws.onerror = () => { try { term.write('\r\n\x1b[31m[lỗi kết nối]\x1b[0m\r\n') } catch { /* noop */ } }

    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    const sendResize = () => {
      try {
        fit.fit()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch { /* noop */ }
    }
    const ro = new ResizeObserver(sendResize)
    ro.observe(containerRef.current)
    window.addEventListener('resize', sendResize)

    const cont = containerRef.current
    let touchY = null
    const onTouchStart = (e) => {
      if (e.touches.length === 1) touchY = e.touches[0].clientY
    }
    const onTouchMove = (e) => {
      if (touchY === null || e.touches.length !== 1) return
      const y = e.touches[0].clientY
      const dy = touchY - y
      const lineH = 18
      const lines = Math.trunc(dy / lineH)
      if (lines !== 0) {
        try { term.scrollLines(lines) } catch { /* noop */ }
        touchY = y + (dy - lines * lineH)
        e.preventDefault()
      }
    }
    const onTouchEnd = () => { touchY = null }
    cont.addEventListener('touchstart', onTouchStart, { passive: true })
    cont.addEventListener('touchmove', onTouchMove, { passive: false })
    cont.addEventListener('touchend', onTouchEnd, { passive: true })
    cont.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      try { dataSub.dispose() } catch { /* noop */ }
      try { ro.disconnect() } catch { /* noop */ }
      if (autoYesTimerRef.current) { clearTimeout(autoYesTimerRef.current); autoYesTimerRef.current = null }
      autoYesBufRef.current = ''
      window.removeEventListener('resize', sendResize)
      try {
        cont.removeEventListener('touchstart', onTouchStart)
        cont.removeEventListener('touchmove', onTouchMove)
        cont.removeEventListener('touchend', onTouchEnd)
        cont.removeEventListener('touchcancel', onTouchEnd)
      } catch { /* noop */ }
      try { ws.close() } catch { /* noop */ }
      try { term.dispose() } catch { /* noop */ }
      termRef.current = null
      wsRef.current = null
      fitRef.current = null
    }
  }, [token, boundCwd])

  useEffect(() => {
    if (!active) return
    const term = termRef.current
    const fit = fitRef.current
    const ws = wsRef.current
    if (!term || !fit) return
    try {
      fit.fit()
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
      term.focus()
    } catch { /* noop */ }
  }, [active])

  // Mobile keyboard: scroll terminal container into view when keyboard opens
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined
    const vp = window.visualViewport
    const el = containerRef.current
    if (!el) return undefined
    const onVpChange = () => {
      const inset = window.innerHeight - vp.height
      if (inset > 100 && el) {
        // Keyboard is open — scroll the actual terminal into view
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
    vp.addEventListener('resize', onVpChange)
    return () => vp.removeEventListener('resize', onVpChange)
  }, [])

  const sendKey = (data) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
    try { termRef.current?.focus() } catch { /* noop */ }
  }

  const mobileInputRef = useRef(null)
  const focusMobileInput = () => {
    try { mobileInputRef.current?.focus() } catch { /* noop */ }
  }
  const onMobileInputChange = (e) => {
    const val = e.target.value
    if (val) {
      sendKey(val)
      e.target.value = ''
    }
  }
  const onMobileInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      sendKey('\r')
    } else if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault()
      sendKey('\x7f')
    }
  }

  useImperativeHandle(ref, () => ({
    sendKey: (data) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
      try { termRef.current?.focus() } catch { /* noop */ }
    },
  }))

  const btnClass = 'group relative flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-white/5 px-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700/80 active:bg-slate-600'
  const tipClass = 'pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[10px] font-normal text-slate-100 opacity-0 shadow-lg ring-1 ring-slate-700 transition-opacity duration-150 group-hover:opacity-100'

  const Btn = ({ onClick, tip, label, accent }) => (
    <button type="button" onClick={onClick} title={tip} aria-label={tip} className={`${btnClass} ${accent || ''}`}>
      {label}
      <span className={tipClass}>{tip}</span>
    </button>
  )

  return (
    <div ref={outerRef} className="hagent-pty-terminal flex w-full flex-col bg-[#07111f] overflow-hidden" style={vpHeight ? { height: vpHeight } : { height: '100%', minHeight: 0 }}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-cyan-400/20 bg-[#0b1424] px-2 py-1">
        <span className="mr-1 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
        <Btn onClick={() => sendKey('\x02c')} tip="Tab mới (Ctrl+B C)" label="+" accent="bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" />
        <Btn onClick={() => sendKey('\x02p')} tip="Tab trước (Ctrl+B P)" label="‹" accent="bg-sky-500/10 text-sky-200 hover:bg-sky-500/20" />
        <Btn onClick={() => sendKey('\x02n')} tip="Tab sau (Ctrl+B N)" label="›" accent="bg-sky-500/10 text-sky-200 hover:bg-sky-500/20" />
        <Btn onClick={() => sendKey('\x02&')} tip="Đóng tab (Ctrl+B &)" label="×" accent="bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" />
        <span className="mx-0.5 h-4 w-px bg-slate-700" />
        <Btn onClick={() => sendKey('\x02d')} tip="Detach (Ctrl+B D)" label="⏏" accent="bg-violet-500/10 text-violet-200 hover:bg-violet-500/20" />
        <span className="mx-0.5 h-4 w-px bg-slate-700" />
        <Btn onClick={() => sendKey('\x03')} tip="Ctrl+C — Ngắt lệnh" label="^C" accent="bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" />
        <Btn onClick={() => sendKey('\x04')} tip="Ctrl+D — EOF / thoát" label="^D" accent="bg-amber-500/10 text-amber-200 hover:bg-amber-500/20" />
        <Btn onClick={() => sendKey('\x1a')} tip="Ctrl+Z — Tạm dừng" label="^Z" accent="bg-amber-500/10 text-amber-200 hover:bg-amber-500/20" />
        <Btn onClick={() => sendKey('\x0c')} tip="Ctrl+L — Xoá màn hình" label="CLR" accent="bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20" />
        <span className="mx-0.5 h-4 w-px bg-slate-700" />
        <Btn onClick={() => sendKey('\x1b')} tip="Esc" label="ESC" accent="bg-slate-500/10 text-slate-200 hover:bg-slate-500/20" />
        <Btn onClick={() => sendKey('\t')} tip="Tab — autocomplete" label="TAB" accent="bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20" />
        <Btn onClick={() => sendKey('\x1b[A')} tip="Lệnh trước (lịch sử)" label="↑" accent="bg-teal-500/10 text-teal-200 hover:bg-teal-500/20" />
        <Btn onClick={() => sendKey('\x1b[B')} tip="Lệnh sau (lịch sử)" label="↓" accent="bg-teal-500/10 text-teal-200 hover:bg-teal-500/20" />
        <span className="mx-0.5 h-4 w-px bg-slate-700" />
        <button
          type="button"
          onClick={() => setAutoYes(!autoYes)}
          title={autoYes ? "Tắt Auto Yes" : "Bật Auto Yes"}
          className={`${btnClass} ${autoYes ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30' : 'bg-slate-500/10 text-slate-400'}`}
        >
          Auto Y
          <span className={tipClass}>{autoYes ? "Tắt Auto Yes" : "Bật Auto Yes — tự động trả lời y cho prompts"}</span>
        </button>
      </div>
      <input
        ref={mobileInputRef}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="Gõ lệnh ở đây (mobile)..."
        onChange={onMobileInputChange}
        onKeyDown={onMobileInputKeyDown}
        className="block shrink-0 border-b border-cyan-400/20 bg-[#0b1424] px-3 py-2 text-[13px] font-mono text-slate-100 outline-none placeholder:text-slate-500 sm:hidden"
      />
      <div ref={containerRef} className="min-h-0 flex-1" onClick={() => { try { termRef.current?.focus() } catch { /* noop */ } }} />
    </div>
  )
})

export default PtyTerminal
