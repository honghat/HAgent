import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus,
  Folder,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  KeyRound,
  List,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react'
import PtyTerminal from './PtyTerminal'
import CodeEditor from './CodeEditor'

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function compactPath(path = '') {
  if (!path) return ''
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 4) return path
  return `.../${parts.slice(-4).join('/')}`
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatMtime(mtime) {
  if (!mtime) return ''
  const d = new Date(mtime * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: '2-digit', month: 'short', day: 'numeric' })
}

function detectEol(text = '') {
  if (text.includes('\r\n')) return 'CRLF'
  if (text.includes('\r')) return 'CR'
  return 'LF'
}

function PromptInput({ onSubmit, initialValue }) {
  const [val, setVal] = useState(initialValue || '')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(val) }}>
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        className="mb-3 h-9 w-full rounded-lg border border-slate-700 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none focus:border-amber-500"
        placeholder="Tên..."
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onSubmit('')} className="rounded-md px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Hủy</button>
        <button type="submit" className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400">OK</button>
      </div>
    </form>
  )
}

export default function CodeWorkspace({ token }) {
  const ptyRef = useRef(null)
  const [roots, setRoots] = useState([])
  const [root, setRoot] = useState('')
  const [currentDir, setCurrentDir] = useState('')
  const [parentDir, setParentDir] = useState(null)
  const [entries, setEntries] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loadingTree, setLoadingTree] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showFiles, setShowFiles] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)
  const [editorCollapsed, setEditorCollapsed] = useState(true)
  const [activePanel, setActivePanel] = useState('terminal')
  const [terminalCommand, setTerminalCommand] = useState('')
  const [terminalRunning, setTerminalRunning] = useState(false)
  const [terminalLines, setTerminalLines] = useState([
    { type: 'info', text: 'Chọn một workspace trên Mac mini này.' },
  ])
  const [commitMsg, setCommitMsg] = useState('')
  const [gitCommitting, setGitCommitting] = useState(false)
  const [gitPushing, setGitPushing] = useState(false)
  const [gitReverting, setGitReverting] = useState(false)
  const [gitRevertingFile, setGitRevertingFile] = useState(null)
  const [pm2Restarting, setPm2Restarting] = useState(false)
  const [gitStatus, setGitStatus] = useState({ uncommitted: 0, unpushed: 0 })
  const [gitChanges, setGitChanges] = useState([])
  const [sudoPassword, setSudoPassword] = useState('')
  const [sudoPasswordExpiry, setSudoPasswordExpiry] = useState(0)
  const [sudoPrompt, setSudoPrompt] = useState(null) // { command } when modal is open
  const [sudoPromptValue, setSudoPromptValue] = useState('')
  const [terminalInputFocused, setTerminalInputFocused] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [vpHeight, setVpHeight] = useState(null) // visualViewport.height when keyboard open
  const [terminalComposing, setTerminalComposing] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [splitTerminal, setSplitTerminal] = useState(false)
  const [terminalHidden, setTerminalHidden] = useState(false)
  const [commitComposing, setCommitComposing] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [prompt, setPrompt] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const ctxRef = useRef(null)

  const dirty = content !== savedContent
  const lineCount = useMemo(() => content ? content.split('\n').length : 0, [content])
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery])

  useEffect(() => {
    loadRoots()
  }, [])

  useEffect(() => {
    if (currentDir) {
      loadDirectory(currentDir)
      fetchGitStatus()
      fetchGitChanges()
    }
  }, [currentDir, showHidden])

  useEffect(() => {
    setSearchQuery('')
  }, [currentDir])

  useEffect(() => {
    if (!currentDir) return
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchGitStatus()
      fetchGitChanges()
    }, 5000)
    return () => clearInterval(interval)
  }, [currentDir])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(Math.round(inset))
      if (inset > 100) {
        setVpHeight(Math.round(viewport.height))
      } else {
        setVpHeight(null)
      }
      // On mobile: force resize event so xterm can re-fit into available space
      window.dispatchEvent(new Event('resize'))
    }
    updateKeyboardInset()
    viewport.addEventListener('resize', updateKeyboardInset)
    viewport.addEventListener('scroll', updateKeyboardInset)
    window.addEventListener('resize', updateKeyboardInset)
    return () => {
      viewport.removeEventListener('resize', updateKeyboardInset)
      viewport.removeEventListener('scroll', updateKeyboardInset)
      window.removeEventListener('resize', updateKeyboardInset)
    }
  }, [])

  async function loadRoots() {
    try {
      const response = await fetch('/api/workspace/roots', { headers: authHeaders(token) })
      const data = await response.json()
      const nextRoots = data.roots || []
      setRoots(nextRoots)
      if (nextRoots[0]) {
        setRoot(nextRoots[0].path)
        setCurrentDir(nextRoots[0].path)
      }
    } catch (err) {
      addTerminalLine(`Cannot load workspace roots: ${err.message}`, 'error')
    }
  }

  async function loadDirectory(path) {
    setLoadingTree(true)
    try {
      const response = await fetch(`/api/workspace/list?path=${encodeURIComponent(path)}&showHidden=${showHidden}`, {
        headers: authHeaders(token),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Cannot list directory')
      setEntries(data.entries || [])
      setParentDir(data.parent)
    } catch (err) {
      addTerminalLine(`List error: ${err.message}`, 'error')
    } finally {
      setLoadingTree(false)
    }
  }

  async function openFile(file) {
    if (file.type === 'directory') {
      setCurrentDir(file.path)
      return
    }
    if (!file.readable) {
      addTerminalLine(`Skipped unsupported file: ${file.name}`, 'error')
      return
    }
    setLoadingFile(true)
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`, {
        headers: authHeaders(token),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Cannot open file')
      setActiveFile(data)
      setContent(data.content || '')
      setSavedContent(data.content || '')
      setEditorCollapsed(false)
      addTerminalLine(`Opened ${compactPath(data.path)}`, 'ok')
    } catch (err) {
      addTerminalLine(`Open error: ${err.message}`, 'error')
    } finally {
      setLoadingFile(false)
    }
  }

  async function saveFile() {
    if (!activeFile || saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/workspace/file', {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile.path, content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Cannot save file')
      setSavedContent(content)
      setActiveFile(file => file ? { ...file, size: data.size, mtime: data.mtime } : file)
      addTerminalLine(`Saved ${compactPath(activeFile.path)}`, 'ok')
    } catch (err) {
      addTerminalLine(`Save error: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  function addTerminalLine(text, type = 'info') {
    setTerminalLines(lines => [...lines, { text, type }].slice(-60))
  }

  async function runGitCommand(command) {
    if (!currentDir) return
    try {
      const response = await fetch('/api/workspace/terminal', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: currentDir, timeout: 30 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Git command failed')
      if (data.cwd && data.cwd !== currentDir) setCurrentDir(data.cwd)
      const out = data.output === '(no output)' ? '' : (data.output || '')
      if (out) addTerminalLine(out, data.ok ? 'ok' : 'error')
      return data
    } catch (err) {
      addTerminalLine(err.message, 'error')
      throw err
    }
  }

  async function gitRaw(command) {
    if (!currentDir) return null
    try {
      const res = await fetch('/api/workspace/terminal', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: currentDir, timeout: 15 }),
      })
      const data = await res.json()
      if (data?.output === '(no output)') data.output = ''
      return data
    } catch { return null }
  }

  async function fetchGitStatus() {
    if (!currentDir) return
    try {
      const res = await gitRaw('git status --porcelain')
      const lines = (res?.output || '').split('\n').filter(Boolean)
      const uncommitted = lines.length
      const logRes = await gitRaw('git log --oneline @{u}..HEAD 2>/dev/null || true')
      const unpushed = (logRes?.output || '').split('\n').filter(Boolean).length
      setGitStatus({ uncommitted, unpushed })
    } catch { setGitStatus({ uncommitted: 0, unpushed: 0 }) }
  }

  async function fetchGitChanges() {
    if (!currentDir) return
    try {
      const res = await gitRaw('git status --porcelain')
      const lines = (res?.output || '').split('\n').filter(Boolean)
      setGitChanges(lines)
    } catch { setGitChanges([]) }
  }

  async function handleGitCommit() {
    const msg = commitMsg.trim()
    if (!msg) return
    setGitCommitting(true)
    try {
      await runGitCommand(`git add -A && git commit -m "${msg.replace(/"/g, '\\"')}"`)
      setCommitMsg('')
      await fetchGitStatus()
      await fetchGitChanges()
    } finally {
      setGitCommitting(false)
    }
  }

  async function handleGitPush() {
    setGitPushing(true)
    try {
      await runGitCommand('git push')
      await fetchGitStatus()
      await fetchGitChanges()
    } finally {
      setGitPushing(false)
    }
  }

  async function handleGitRevert() {
    if (!confirm('Revert tất cả thay đổi chưa commit? Hành động này không thể hoàn tác.')) return
    setGitReverting(true)
    try {
      if (activeFile) {
        await runGitCommand(`git checkout -- "${activeFile.path}"`)
      } else {
        await runGitCommand('git checkout -- .')
      }
      if (activeFile) {
        const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(activeFile.path)}`, {
          headers: authHeaders(token),
        })
        const data = await response.json()
        if (response.ok) {
          setContent(data.content || '')
          setSavedContent(data.content || '')
        }
      }
      await fetchGitStatus()
      await fetchGitChanges()
    } finally {
      setGitReverting(false)
    }
  }

  async function handlePm2Restart() {
    setPm2Restarting(true)
    try {
      // Gửi lệnh trực tiếp vào terminal thay vì gọi API
      ptyRef.current?.sendKey('pm2 restart all\n')
    } finally {
      setPm2Restarting(false)
    }
  }

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  function handleCtxMenu(e, entry) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, entry })
  }

  useLayoutEffect(() => {
    if (!ctxMenu || !ctxRef.current) return
    const el = ctxRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 8
    let nx = ctxMenu.x
    let ny = ctxMenu.y
    if (nx + rect.width + pad > vw) nx = Math.max(pad, vw - rect.width - pad)
    if (ny + rect.height + pad > vh) ny = Math.max(pad, vh - rect.height - pad)
    if (nx !== ctxMenu.x || ny !== ctxMenu.y) {
      setCtxMenu(m => m ? { ...m, x: nx, y: ny } : m)
    }
  }, [ctxMenu?.x, ctxMenu?.y])

  async function ctxActionNewFile() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    setPrompt({ type: 'new-file', dir: entry.type === 'directory' ? entry.path : currentDir })
  }

  async function ctxActionNewFolder() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    setPrompt({ type: 'new-folder', dir: entry.type === 'directory' ? entry.path : currentDir })
  }

  async function ctxActionRename() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    setPrompt({ type: 'rename', entry, initialValue: entry.name || entry.path.split('/').pop() })
  }

  async function ctxActionDelete() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    const name = entry.name || entry.path.split('/').pop()
    if (!confirm(`Xoá "${name}"?`)) return
    try {
      const res = await fetch('/api/workspace/delete', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path }),
      })
      const data = await res.json()
      addTerminalLine(data.message || (res.ok ? 'Đã xoá' : 'Xoá thất bại'), res.ok ? 'ok' : 'error')
      if (res.ok) loadDirectory(currentDir)
    } catch (err) {
      addTerminalLine(`Xoá thất bại: ${err.message}`, 'error')
    }
  }

  async function ctxActionCopyPath() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    navigator.clipboard.writeText(entry.path)
    addTerminalLine('Đã sao chép đường dẫn', 'ok')
  }

  async function ctxActionCopyRelative() {
    const entry = ctxMenu?.entry
    setCtxMenu(null)
    if (!entry) return
    const rel = entry.path.startsWith(currentDir + '/') ? entry.path.slice(currentDir.length + 1) : entry.path
    navigator.clipboard.writeText(rel)
    addTerminalLine('Đã sao chép đường dẫn tương đối', 'ok')
  }

  async function submitPrompt(name) {
    const p = prompt
    setPrompt(null)
    if (!name || !p) return
    let ok = false
    try {
      if (p.type === 'new-file') {
        const path = p.dir + '/' + name
        const res = await fetch('/api/workspace/create-file', {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: '' }),
        })
        const data = await res.json()
        ok = res.ok
        addTerminalLine(ok ? `Đã tạo ${name}` : (data.detail || 'Tạo thất bại'), ok ? 'ok' : 'error')
      } else if (p.type === 'new-folder') {
        const path = p.dir + '/' + name
        const res = await fetch('/api/workspace/mkdir', {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        })
        const data = await res.json()
        ok = res.ok
        addTerminalLine(ok ? `Đã tạo thư mục ${name}` : (data.detail || 'Tạo thất bại'), ok ? 'ok' : 'error')
      } else if (p.type === 'rename') {
        const dir = p.entry.path.substring(0, p.entry.path.lastIndexOf('/'))
        const newPath = dir + '/' + name
        const res = await fetch('/api/workspace/rename', {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p.entry.path, new_path: newPath }),
        })
        const data = await res.json()
        ok = res.ok
        addTerminalLine(ok ? `Đã đổi tên thành ${name}` : (data.detail || 'Đổi tên thất bại'), ok ? 'ok' : 'error')
      }
      if (ok) loadDirectory(currentDir)
    } catch (err) {
      addTerminalLine(`Thất bại: ${err.message}`, 'error')
    }
  }

  async function handleRevertFile(file) {
    if (!confirm(`Revert file "${file}"?`)) return
    setGitRevertingFile(file)
    try {
      await runGitCommand(`git checkout -- "${file}"`)
      if (activeFile) {
        const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(activeFile.path)}`, {
          headers: authHeaders(token),
        })
        const data = await response.json()
        if (response.ok) {
          setContent(data.content || '')
          setSavedContent(data.content || '')
        }
      }
      await fetchGitChanges()
      await fetchGitStatus()
    } finally {
      setGitRevertingFile(null)
    }
  }

  async function runTerminalCommand(event) {
    event?.preventDefault()
    if (terminalComposing) return
    const command = terminalCommand.trim()
    if (!command || terminalRunning || !currentDir) return
    await executeTerminal(command)
  }

  function submitSudoPrompt(event) {
    event?.preventDefault()
    if (!sudoPrompt) return
    const command = sudoPrompt.command
    const password = sudoPromptValue
    setSudoPrompt(null)
    setSudoPromptValue('')
    executeTerminal(command, password)
  }

  function cancelSudoPrompt() {
    setSudoPrompt(null)
    setSudoPromptValue('')
  }

  return (
    <div className="flex h-full min-h-0 bg-[#0b1020] text-slate-100">
      <aside className="hidden w-[260px] shrink-0 border-r border-slate-800 bg-[#0f172a] md:flex md:flex-col">
        <div className="border-b border-slate-800 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Workspace</span>
          </div>
          <select
            value={root}
            onChange={event => {
              setRoot(event.target.value)
              setCurrentDir(event.target.value)
              setActiveFile(null)
              setContent('')
              setSavedContent('')
            }}
            className="h-8 w-full rounded-lg border border-slate-700 bg-[#0b1020] px-2 text-xs text-slate-200 outline-none"
            style={{ fontSize: 12, lineHeight: '16px' }}
          >
            {roots.map(item => (
              <option key={item.path} value={item.path}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="flex h-8 items-center gap-2 border-b border-slate-800 px-2 text-xs leading-5 text-slate-400">
          <button
            onClick={() => parentDir && setCurrentDir(parentDir)}
            disabled={!parentDir}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-800 disabled:opacity-30"
            title="Lên thư mục cha"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 truncate">{compactPath(currentDir)}</span>
          <button
            onClick={() => setShowHidden(v => !v)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-slate-800 ${showHidden ? 'text-amber-300' : 'text-slate-500'}`}
            title={showHidden ? 'Ẩn file/folder ẩn' : 'Hiện file/folder ẩn'}
          >
            {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="flex h-8 items-center gap-1.5 border-b border-slate-800 px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm file..."
            className="h-6 min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-500 hover:text-slate-200"
              title="Xoá tìm kiếm"
            >
              ×
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 custom-scrollbar">
          {loadingTree ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tải...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="px-2 py-3 text-xs text-slate-500">
              {searchQuery ? 'Không khớp' : 'Thư mục rỗng'}
            </div>
          ) : filteredEntries.map(entry => (
            <button
              key={entry.path}
              onClick={() => openFile(entry)}
              onContextMenu={e => handleCtxMenu(e, entry)}
              className={`flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] leading-5 transition-all ${
                activeFile?.path === entry.path ? 'border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 shadow-[inset_2px_0_0_rgba(34,211,238,0.9)]' : 'border border-transparent text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              } ${entry.is_gitignored ? 'opacity-40' : ''}`}
              title={entry.path}
            >
              {entry.type === 'directory' ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <FileCode2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, lineHeight: '20px' }}>{entry.name}</span>
              {entry.type === 'directory' && <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />}
              {entry.type === 'file' && (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                  {entry.mtime ? <span className="text-slate-600">{formatMtime(entry.mtime)}</span> : null}
                  <span>{formatSize(entry.size)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col" style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}>
        {/* Mobile workspace selector */}
        <div className="flex h-9 items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-3 md:hidden">
          <Code2 className="h-4 w-4 shrink-0 text-amber-400" />
          <select
            value={root}
            onChange={event => {
              setRoot(event.target.value)
              setCurrentDir(event.target.value)
              setActiveFile(null)
              setContent('')
              setSavedContent('')
            }}
            className="h-8 flex-1 rounded-lg border border-slate-700 bg-[#0b1020] px-2 text-xs text-slate-200 outline-none hagent-code-mobile-select"
          >
            {roots.map(item => (
              <option key={item.path} value={item.path}>{item.name}</option>
            ))}
          </select>
        </div>

        {/* Mobile file browser toggle & tree */}
        <div className="md:hidden">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="flex h-8 w-full items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-3 text-left text-[10px] text-slate-400 hover:text-slate-200"
          >
            <Folder className="h-3 w-3 text-amber-400" />
            {showFiles ? 'Ẩn file browser' : 'Hiện file browser'}
            <span className="ml-auto text-[9px] text-slate-600">{entries.length} items</span>
          </button>

          {showFiles && (
            <div className="border-b border-slate-800 bg-[#0b1020]">
              <div className="flex h-8 items-center gap-2 border-b border-slate-800 px-2">
                <button
                  onClick={() => parentDir && setCurrentDir(parentDir)}
                  disabled={!parentDir}
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{compactPath(currentDir)}</span>
                <button
                  onClick={() => setShowHidden(v => !v)}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-slate-800 ${showHidden ? 'text-amber-300' : 'text-slate-500'}`}
                  title={showHidden ? 'Ẩn file/folder ẩn' : 'Hiện file/folder ẩn'}
                >
                  {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex h-8 items-center gap-1.5 border-b border-slate-800 px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm file..."
                  className="h-6 min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-slate-500 hover:text-slate-200"
                  >×</button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto p-1.5 custom-scrollbar">
                {loadingTree ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang tải...
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-slate-500">
                    {searchQuery ? 'Không khớp' : 'Thư mục rỗng'}
                  </div>
                ) : (
                  filteredEntries.map(entry => (
                    <button
                      key={entry.path}
                      onClick={() => openFile(entry)}
                      onContextMenu={e => handleCtxMenu(e, entry)}
                      className={`flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] leading-5 transition-all ${
                        activeFile?.path === entry.path
                          ? 'border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 shadow-[inset_2px_0_0_rgba(34,211,238,0.9)]'
                          : 'border border-transparent text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                      } ${entry.is_gitignored ? 'opacity-40' : ''}`}
                      title={entry.path}
                    >
                      {entry.type === 'directory' ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      ) : (
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {entry.type === 'directory' && <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />}
                      {entry.type === 'file' && (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                          {entry.mtime ? <span className="text-slate-600">{formatMtime(entry.mtime)}</span> : null}
                          <span>{formatSize(entry.size)}</span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <header className="flex h-12 shrink-0 items-center justify-between border-b border-cyan-400/15 bg-[#101827] px-3 shadow-[inset_0_-1px_0_rgba(34,211,238,0.08)]">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold leading-5 text-slate-100">
              {activeFile ? compactPath(activeFile.path) : 'Chọn file trong workspace'}
            </div>
            <div className="text-xs leading-5 text-slate-400">
              {activeFile ? (
                <>
                  <span className="text-amber-300/80">{(activeFile.language || 'txt').toUpperCase()}</span>
                  {` · ${lineCount} lines · ${formatSize(activeFile.size)} · ${detectEol(content)} · UTF-8`}
                  {activeFile.mtime ? ` · ${formatMtime(activeFile.mtime)}` : ''}
                  {dirty ? <span className="ml-1 text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.75)]">●</span> : null}
                </>
              ) : 'Mac mini filesystem'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditorCollapsed(v => !v)}
              className={`flex h-7 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[10px] font-medium text-violet-100 hover:bg-violet-500/20`}
              title={editorCollapsed ? 'Hiện khung soạn thảo' : 'Ẩn khung soạn thảo'}
            >
              <EyeOff className="h-3 w-3" />
              {editorCollapsed ? 'Hiện editor' : 'Ẩn editor'}
            </button>
            <button onClick={copyCode} disabled={!activeFile} className="flex h-7 items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 text-[10px] font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40">
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              Sao chép
            </button>
            <button onClick={saveFile} disabled={!activeFile || !dirty || saving} className="flex h-7 items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Lưu
            </button>
          </div>
        </header>

        <div className={`grid min-h-0 flex-1 ${terminalCollapsed ? 'grid-rows-[minmax(0,1fr)_34px_34px]' : editorCollapsed ? 'grid-rows-[0px_34px_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)_34px_360px] md:grid-rows-[minmax(0,1fr)_34px_340px]'}`}>
          <section className={`min-h-0 overflow-hidden border-b border-slate-800 bg-[#0b1020]`}>
            {loadingFile ? (
              <div className="flex h-full items-center justify-center gap-2 text-[9px] text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang mở file...
              </div>
            ) : activeFile ? (
              <CodeEditor
                value={content}
                onChange={value => setContent(value)}
                filename={activeFile.name || activeFile.path}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Code2 className="mb-3 h-6 w-8 text-slate-700" />
                <p className="text-[11px] font-semibold text-slate-300">Chọn workspace và mở file</p>
                <p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">Duyệt các thư mục được phép trên Mac mini như HAgent, thư mục home và /Volumes/HatAI.</p>
              </div>
            )}
          </section>

          <div className="flex h-[34px] items-center gap-2 border-b border-amber-400/15 bg-[#101827] px-2">
            <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <input
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="commit message..."
              className="h-7 min-w-0 flex-1 rounded-md border border-amber-400/20 bg-[#07111f] px-2 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-300/60 hagent-code-git-input"
              onCompositionStart={() => setCommitComposing(true)}
              onCompositionEnd={() => setCommitComposing(false)}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing || commitComposing) return
                if (e.key === 'Enter') handleGitCommit()
              }}
            />
            {gitStatus?.uncommitted > 0 && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-300">{gitStatus.uncommitted}</span>
            )}
            <button
              onClick={handleGitCommit}
              disabled={!commitMsg.trim() || gitCommitting}
              className="flex h-7 items-center gap-1 rounded-md border border-amber-400/25 bg-amber-500/10 px-2 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-40"
            >
              {gitCommitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Commit'}
            </button>
            <button
              onClick={handleGitPush}
              disabled={gitPushing}
              className="flex h-7 items-center gap-1 rounded-md border border-sky-400/25 bg-sky-500/10 px-2 text-[10px] font-medium text-sky-100 hover:bg-sky-500/20 disabled:opacity-40"
            >
              {gitPushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3" />}
              Push
              {gitStatus?.unpushed > 0 && (
                <span className="rounded bg-sky-500/15 px-1 text-[9px] text-sky-300">{gitStatus.unpushed}</span>
              )}
            </button>
            <button
              onClick={handlePm2Restart}
              disabled={pm2Restarting}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-teal-400/25 bg-teal-500/10 px-2 text-[10px] font-medium text-teal-100 hover:bg-teal-500/20 disabled:opacity-40"
              title="pm2 restart all"
            >
              {pm2Restarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              PM2
            </button>
            <button
              onClick={handleGitRevert}
              disabled={gitReverting || !gitStatus?.uncommitted}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-red-800/50 px-2 text-[10px] font-medium text-red-300 hover:bg-red-900/30 disabled:opacity-40"
              title="Revert thay đổi"
            >
              {gitReverting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Revert
            </button>
          </div>

          <aside className="flex min-h-0 flex-col bg-[#101827]">
            <div className="flex h-[34px] shrink-0 items-center border-b border-cyan-400/15 text-[11px] font-semibold">
              {[
                ['terminal', Terminal, 'Terminal'],
                ['changes', List, 'Changes'],
              ].map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setActivePanel(id)}
                  className={`flex h-full items-center gap-1.5 border-r border-slate-800 px-2.5 ${
                    activePanel === id ? 'bg-cyan-500/10 text-cyan-100 shadow-[inset_0_-2px_0_rgba(34,211,238,0.75)]' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {id === 'changes' && gitChanges.length > 0 && (
                    <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-300">{gitChanges.length}</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setSplitTerminal(v => !v)}
                className={`ml-auto flex h-full items-center gap-1 px-2.5 ${splitTerminal ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-200'}`}
                title={splitTerminal ? 'Gộp terminal' : 'Chia đôi terminal (2 cửa sổ)'}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTerminalCollapsed(v => !v)}
                className="flex h-full items-center gap-1 px-2.5 text-slate-500 hover:text-slate-200"
                title={terminalCollapsed ? 'Mở terminal' : 'Thu gọn terminal'}
              >
                {terminalCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {!terminalCollapsed && (
            <div className="min-h-0 flex-1 overflow-hidden p-1.5 custom-scrollbar">
              <div className={`h-full ${splitTerminal && activePanel === 'terminal' ? 'grid grid-cols-2 gap-1.5' : ''}`} style={{ display: activePanel === 'terminal' ? '' : 'none' }}>
                <PtyTerminal ref={ptyRef} token={token} cwd={currentDir} active={!terminalCollapsed && activePanel === 'terminal'} keyboardInset={keyboardInset} vpHeight={vpHeight} session="hagent-main" />
                {splitTerminal && activePanel === 'terminal' && (
                  <PtyTerminal token={token} cwd={currentDir} active={!terminalCollapsed && activePanel === 'terminal'} keyboardInset={keyboardInset} vpHeight={vpHeight} session="hagent-split" />
                )}
              </div>
              <div className="h-full overflow-y-auto font-mono text-[9px]" style={{ display: activePanel === 'changes' ? '' : 'none' }}>
                {gitChanges.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-500">Không có thay đổi</div>
                ) : (
                  <div className="space-y-[1px]">
                    {gitChanges.map((line, i) => {
                      const status = line.slice(0, 2)
                      const file = line.slice(3)
                      let color
                      if (status.includes('M')) color = 'text-amber-300'
                      else if (status.includes('A')) color = 'text-emerald-300'
                      else if (status.includes('D')) color = 'text-red-300'
                      else if (status.startsWith('??')) color = 'text-slate-400'
                      else color = 'text-sky-300'
                      const fullPath = currentDir + '/' + file
                      return (
                        <div key={i} className={`flex items-center gap-2 rounded px-1.5 py-[2px] hover:bg-slate-800/60 ${color}`}>
                          <span className="w-8 shrink-0">{status}</span>
                          <span
                            className="cursor-pointer truncate hover:underline"
                            onClick={() => handleOpenFile(fullPath)}
                            title={fullPath}
                          >
                            {file}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {gitChanges.length > 0 && gitStatus?.uncommitted > 0 && (
                  <div className="mt-1 flex items-center gap-2 border-t border-slate-800 pt-1 text-[9px] text-slate-500">
                    <span>{gitStatus.uncommitted} file{gitStatus.uncommitted > 1 ? 's' : ''} chưa staged</span>
                    {gitStatus.unpushed > 0 && <span>· {gitStatus.unpushed} commit{gitStatus.unpushed > 1 ? 's' : ''} chưa push</span>}
                  </div>
                )}
              </div>
            </div>
            )}
          </aside>
        </div>
      </main>
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-slate-700 bg-[#1e293b] py-1 shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button onClick={ctxActionNewFile} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-slate-300 hover:bg-slate-700">
            <FilePlus className="h-3 w-3" /> File mới
          </button>
          <button onClick={ctxActionNewFolder} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-slate-300 hover:bg-slate-700">
            <FolderPlus className="h-3 w-3" /> Thư mục mới
          </button>
          <div className="mx-2 my-1 h-px bg-slate-700" />
          <button onClick={ctxActionRename} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-slate-300 hover:bg-slate-700">
            <FileCode2 className="h-3 w-3" /> Đổi tên
          </button>
          <button onClick={ctxActionDelete} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-red-300 hover:bg-red-900/30">
            <Trash2 className="h-3 w-3" /> Xoá
          </button>
          <div className="mx-2 my-1 h-px bg-slate-700" />
          <button onClick={ctxActionCopyPath} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-slate-300 hover:bg-slate-700">
            <Copy className="h-3 w-3" /> Copy đường dẫn
          </button>
          <button onClick={ctxActionCopyRelative} className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] text-slate-300 hover:bg-slate-700">
            <Copy className="h-3 w-3" /> Copy đường dẫn tương đối
          </button>
        </div>
      )}

      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPrompt(null)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#0f172a] p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 text-xs font-semibold text-slate-100">
              {prompt.type === 'new-file' ? 'Nhập tên file mới' : prompt.type === 'new-folder' ? 'Nhập tên thư mục mới' : 'Nhập tên mới'}
            </div>
            <PromptInput onSubmit={submitPrompt} initialValue={prompt.initialValue} />
          </div>
        </div>
      )}

      {sudoPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitSudoPrompt}
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#0f172a] p-4 shadow-2xl"
          >
            <div className="mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-slate-100">Cần quyền sudo</span>
            </div>
            <p className="mb-3 truncate font-mono text-[11px] text-slate-400" title={sudoPrompt.command}>
              {sudoPrompt.command}
            </p>
            <input
              type="password"
              autoFocus
              value={sudoPromptValue}
              onChange={event => setSudoPromptValue(event.target.value)}
              placeholder="Mật khẩu sudo"
              className="mb-3 h-9 w-full rounded-lg border border-slate-700 bg-[#0b1020] px-3 text-sm text-slate-100 outline-none focus:border-amber-500"
            />
            <p className="mb-3 text-[10px] text-slate-500">Mật khẩu chỉ giữ tạm trong RAM 5 phút, không lưu xuống ổ.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelSudoPrompt}
                className="rounded-md px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!sudoPromptValue}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-40"
              >
                Chạy
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
