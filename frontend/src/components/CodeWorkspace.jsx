import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  Folder,
  Loader2,
  Play,
  Save,
  Sparkles,
  Terminal,
  Wrench,
} from 'lucide-react'

const providerModels = {
  gemini: 'gemini',
  deepseek: 'deepseek',
  cx: 'cx',
  openai: 'openai',
  anthropic: 'anthropic',
  ollama: 'ollama',
  lmstudio: 'lmstudio',
  llamacpp: 'llamacpp',
  lmstudio_local: 'lmstudio_local',
}

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

export default function CodeWorkspace({ token, provider }) {
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
  const [showFiles, setShowFiles] = useState(false)
  const [activePanel, setActivePanel] = useState('terminal')
  const [terminalLines, setTerminalLines] = useState([
    { type: 'info', text: 'Chọn một workspace trên Mac mini này.' },
  ])
  const [aiPrompt, setAiPrompt] = useState('Rà soát file này và đề xuất cải thiện cụ thể.')
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const dirty = content !== savedContent
  const lineCount = useMemo(() => content ? content.split('\n').length : 0, [content])

  useEffect(() => {
    loadRoots()
  }, [])

  useEffect(() => {
    if (currentDir) loadDirectory(currentDir)
  }, [currentDir])

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
      const response = await fetch(`/api/workspace/list?path=${encodeURIComponent(path)}`, {
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

  async function runAiReview() {
    if (!activeFile || aiLoading) return
    setAiLoading(true)
    setAiResult('')
    setActivePanel('ai')
    addTerminalLine(`AI review: ${compactPath(activeFile.path)}`, 'info')
    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: providerModels[provider] || provider || 'lmstudio',
          messages: [
            { role: 'system', content: 'You are a concise senior code reviewer. Focus on concrete bugs, risks, and small improvements.' },
            { role: 'user', content: `${aiPrompt}\n\nFile: ${activeFile.path}\n\n\`\`\`${activeFile.language || ''}\n${content}\n\`\`\`` },
          ],
          max_tokens: 1000,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'AI review failed')
      setAiResult(data.choices?.[0]?.message?.content || 'No response.')
      addTerminalLine('AI review completed.', 'ok')
    } catch (err) {
      const message = `AI review error: ${err.message}`
      setAiResult(message)
      addTerminalLine(message, 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const problems = activeFile ? [
    { line: 1, text: dirty ? 'Unsaved changes in editor.' : 'No local diagnostics.' },
  ] : [{ line: 0, text: 'Open a text file to see diagnostics.' }]

  return (
    <div className="flex h-full min-h-0 bg-[#0b1020] text-slate-100">
      <aside className="hidden w-[220px] shrink-0 border-r border-slate-800 bg-[#0f172a] md:flex md:flex-col">
        <div className="border-b border-slate-800 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Workspace</span>
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
            className="h-7 w-full rounded-lg border border-slate-700 bg-[#0b1020] px-2 text-[10px] text-slate-200 outline-none"
            style={{ fontSize: 10, lineHeight: '14px' }}
          >
            {roots.map(item => (
              <option key={item.path} value={item.path}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="flex h-7 items-center gap-2 border-b border-slate-800 px-2 text-[10px] leading-4 text-slate-400">
          <button
            onClick={() => parentDir && setCurrentDir(parentDir)}
            disabled={!parentDir}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-800 disabled:opacity-30"
            title="Lên thư mục cha"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="truncate">{compactPath(currentDir)}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 custom-scrollbar">
          {loadingTree ? (
            <div className="flex items-center gap-2 px-2 py-3 text-[10px] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tải...
            </div>
          ) : entries.map(entry => (
            <button
              key={entry.path}
              onClick={() => openFile(entry)}
              className={`flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-left text-[10px] leading-4 transition-all ${
                activeFile?.path === entry.path ? 'bg-amber-500/15 text-amber-200' : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
              title={entry.path}
            >
              {entry.type === 'directory' ? <Folder className="h-3 w-3 shrink-0 text-amber-400" /> : <FileCode2 className="h-3 w-3 shrink-0 text-sky-300" />}
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 10, lineHeight: '14px' }}>{entry.name}</span>
              {entry.type === 'directory' && <ChevronRight className="h-2.5 w-2.5 shrink-0 text-slate-600" />}
              {entry.type === 'file' && <span className="shrink-0 text-[8px] text-slate-600">{formatSize(entry.size)}</span>}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile workspace selector */}
        <div className="flex h-9 items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-3 md:hidden">
          <Code2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <select
            value={root}
            onChange={event => {
              setRoot(event.target.value)
              setCurrentDir(event.target.value)
              setActiveFile(null)
              setContent('')
              setSavedContent('')
            }}
            className="h-7 flex-1 rounded-lg border border-slate-700 bg-[#0b1020] px-2 text-[10px] text-slate-200 outline-none"
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
              <div className="flex h-7 items-center gap-2 border-b border-slate-800 px-2">
                <button
                  onClick={() => parentDir && setCurrentDir(parentDir)}
                  disabled={!parentDir}
                  className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="truncate text-[10px] text-slate-400">{compactPath(currentDir)}</span>
              </div>
              <div className="max-h-48 overflow-y-auto p-1.5 custom-scrollbar">
                {loadingTree ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-[10px] text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang tải...
                  </div>
                ) : entries.length === 0 ? (
                  <div className="px-2 py-3 text-[10px] text-slate-500">Thư mục rỗng</div>
                ) : (
                  entries.map(entry => (
                    <button
                      key={entry.path}
                      onClick={() => openFile(entry)}
                      className={`flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-left text-[10px] leading-4 transition-all ${
                        activeFile?.path === entry.path
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                      }`}
                      title={entry.path}
                    >
                      {entry.type === 'directory' ? (
                        <Folder className="h-3 w-3 shrink-0 text-amber-400" />
                      ) : (
                        <FileCode2 className="h-3 w-3 shrink-0 text-sky-300" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {entry.type === 'directory' && <ChevronRight className="h-2.5 w-2.5 shrink-0 text-slate-600" />}
                      {entry.type === 'file' && (
                        <span className="shrink-0 text-[8px] text-slate-600">{formatSize(entry.size)}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 bg-[#101827] px-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-slate-100">
              {activeFile ? compactPath(activeFile.path) : 'Chọn file trong workspace'}
            </div>
            <div className="text-[10px] text-slate-500">
              {activeFile ? `${(activeFile.language || 'txt').toUpperCase()} · ${lineCount} lines · ${formatSize(activeFile.size)}` : 'Mac mini filesystem'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={copyCode} disabled={!activeFile} className="flex h-6 items-center gap-1 rounded-md border border-slate-700 px-1.5 text-[9px] text-slate-300 hover:bg-slate-800 disabled:opacity-40">
              {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              Sao chép
            </button>
            <button onClick={saveFile} disabled={!activeFile || !dirty || saving} className="flex h-6 items-center gap-1 rounded-md border border-slate-700 px-1.5 text-[9px] text-slate-300 hover:bg-slate-800 disabled:opacity-40">
              {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
              Lưu
            </button>
            <button onClick={runAiReview} disabled={!activeFile || aiLoading} className="flex h-6 items-center gap-1 rounded-md bg-amber-500 px-2 text-[9px] font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              {aiLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
              Rà soát
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_118px]">
          <section className="min-h-0 border-b border-slate-800 bg-[#0b1020]">
            {loadingFile ? (
              <div className="flex h-full items-center justify-center gap-2 text-[9px] text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang mở file...
              </div>
            ) : activeFile ? (
              <textarea
                value={content}
                onChange={event => setContent(event.target.value)}
                spellCheck={false}
                className="h-full w-full resize-none bg-[#0b1020] p-3 font-mono text-[12px] leading-6 text-slate-100 outline-none selection:bg-amber-400/25"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Code2 className="mb-3 h-6 w-8 text-slate-700" />
                <p className="text-[11px] font-semibold text-slate-300">Chọn workspace và mở file</p>
                <p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">Duyệt các thư mục được phép trên Mac mini như HAgent, thư mục home và /Volumes/HatAI.</p>
              </div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col bg-[#101827]">
            <div className="flex h-7 shrink-0 items-center border-b border-slate-800 text-[9px] font-medium">
              {[
                ['terminal', Terminal, 'Terminal'],
                ['problems', AlertCircle, 'Vấn đề'],
                ['ai', Bot, 'AI'],
              ].map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setActivePanel(id)}
                  className={`flex h-full items-center gap-1.5 border-r border-slate-800 px-2.5 ${
                    activePanel === id ? 'bg-[#0b1020] text-slate-100' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
              {activePanel === 'terminal' && (
                <div className="space-y-1.5 font-mono text-[10px] leading-5">
                  {terminalLines.map((line, index) => (
                    <div key={`${line.text}-${index}`} className={line.type === 'error' ? 'text-red-300' : line.type === 'ok' ? 'text-emerald-300' : 'text-slate-400'}>
                      <span className="mr-2 text-slate-600">$</span>{line.text}
                    </div>
                  ))}
                  <button onClick={() => addTerminalLine(`Current directory: ${currentDir}`, 'info')} className="mt-1 flex h-7 items-center gap-1.5 rounded-md border border-slate-700 px-2 text-[11px] text-slate-300 hover:bg-slate-800">
                    <Play className="h-3 w-3" />
                    In thư mục hiện tại
                  </button>
                </div>
              )}

              {activePanel === 'problems' && (
                <div className="space-y-1.5">
                  {problems.map(problem => (
                    <div key={`${problem.line}-${problem.text}`} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-left">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
                        <Wrench className="h-3 w-3 text-amber-300" />
                        {problem.line ? `Dòng ${problem.line}` : 'Workspace'}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">{problem.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {activePanel === 'ai' && (
                <div className="grid h-full min-h-0 grid-cols-[190px_minmax(0,1fr)] gap-2">
                  <div className="space-y-1.5">
                    <textarea
                      value={aiPrompt}
                      onChange={event => setAiPrompt(event.target.value)}
                      className="h-12 w-full resize-none rounded-md border border-slate-700 bg-[#0b1020] p-2 text-slate-200 outline-none focus:border-amber-500/60"
                      style={{ fontSize: 9, lineHeight: '14px' }}
                    />
                    <button onClick={runAiReview} disabled={!activeFile || aiLoading} className="flex h-6 w-full items-center justify-center gap-1 rounded-md bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50" style={{ fontSize: 9 }}>
                      {aiLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                      Rà soát file hiện tại
                    </button>
                  </div>
                  <div className="min-h-0 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950/50 p-2 text-slate-300 custom-scrollbar" style={{ fontSize: 9, lineHeight: '15px' }}>
                    {aiResult || 'Kết quả rà soát AI sẽ hiện ở đây.'}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
