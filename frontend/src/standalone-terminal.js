import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './standalone-terminal.css'

const DEFAULT_CWD = '/Users/nguyenhat/HAgent'
const TERM_THEME = {
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
}

const root = document.getElementById('terminal-root')
root.innerHTML = `
  <div class="terminal-page">
    <header class="terminal-bar">
      <div class="terminal-brand">
        <span id="terminal-led" class="terminal-led"></span>
        <span>HAgent Terminal</span>
      </div>
      <input id="terminal-cwd" class="terminal-path" aria-label="Working directory" />
      <button id="terminal-connect" class="terminal-button is-primary" type="button">Connect</button>
      <button id="terminal-disconnect" class="terminal-button is-danger" type="button">Close</button>
      <button data-key="ctrl-c" class="terminal-button is-compact" type="button" title="Ctrl+C">^C</button>
      <button data-key="ctrl-d" class="terminal-button is-compact" type="button" title="Ctrl+D">^D</button>
      <button data-key="ctrl-l" class="terminal-button is-compact" type="button" title="Ctrl+L">CLR</button>
      <div id="terminal-status" class="terminal-status">idle</div>
    </header>
    <main class="terminal-surface">
      <div id="terminal-host" class="terminal-host"></div>
    </main>
  </div>
`

const host = document.getElementById('terminal-host')
const cwdInput = document.getElementById('terminal-cwd')
const statusEl = document.getElementById('terminal-status')
const ledEl = document.getElementById('terminal-led')
const connectBtn = document.getElementById('terminal-connect')
const disconnectBtn = document.getElementById('terminal-disconnect')

let ws = null
let resizeObserver = null

const params = new URLSearchParams(window.location.search)
cwdInput.value = params.get('cwd') || localStorage.getItem('hagent_terminal_cwd') || DEFAULT_CWD

const term = new XTerm({
  fontSize: 13,
  lineHeight: 1.35,
  letterSpacing: 0,
  fontWeight: 500,
  fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  theme: TERM_THEME,
  cursorBlink: true,
  scrollback: 10000000,
  convertEol: true,
})

const fit = new FitAddon()
term.loadAddon(fit)
term.open(host)

function setStatus(text, connected = false) {
  statusEl.textContent = text
  ledEl.classList.toggle('is-connected', connected)
}

function token() {
  return localStorage.getItem('token') || params.get('t') || 'hat'
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

function resize() {
  try {
    fit.fit()
    send({ type: 'resize', cols: term.cols, rows: term.rows })
  } catch {
    /* noop */
  }
}

function websocketUrl(cwd) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${proto}//${window.location.host}/api/ws/workspace/terminal`)
  url.searchParams.set('t', token())
  url.searchParams.set('cwd', cwd)
  url.searchParams.set('cols', String(term.cols || 80))
  url.searchParams.set('rows', String(term.rows || 24))
  url.searchParams.set('session', 'hagent-standalone')
  return url.toString()
}

function disconnect() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (ws) {
    try { ws.close() } catch { /* noop */ }
    ws = null
  }
  setStatus('closed')
}

function connect() {
  disconnect()
  const cwd = cwdInput.value.trim() || DEFAULT_CWD
  cwdInput.value = cwd
  localStorage.setItem('hagent_terminal_cwd', cwd)
  setStatus('connecting')
  term.writeln('\x1b[36m[connecting]\x1b[0m')
  resize()

  ws = new WebSocket(websocketUrl(cwd))
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    setStatus('connected', true)
    resize()
    term.focus()
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      term.write(event.data)
      return
    }
    term.write(new Uint8Array(event.data))
  }

  ws.onerror = () => {
    setStatus('error')
    term.writeln('\r\n\x1b[31m[terminal websocket error]\x1b[0m')
  }

  ws.onclose = () => {
    setStatus('disconnected')
    term.writeln('\r\n\x1b[33m[disconnected]\x1b[0m')
  }

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
}

term.onData((data) => send({ type: 'input', data }))
window.addEventListener('resize', resize)
connectBtn.addEventListener('click', connect)
disconnectBtn.addEventListener('click', disconnect)
cwdInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') connect()
})

document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('click', () => {
    const keys = { 'ctrl-c': '\x03', 'ctrl-d': '\x04', 'ctrl-l': '\x0c' }
    send({ type: 'input', data: keys[button.getAttribute('data-key')] || '' })
    term.focus()
  })
})

window.setTimeout(() => {
  resize()
  connect()
}, 0)
