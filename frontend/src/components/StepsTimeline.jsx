import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function StepsTimeline({ steps, fileChanges, isLoading }) {
  const [expanded, setExpanded] = useState(false)
  const [diffExpanded, setDiffExpanded] = useState({})
  const [stepExpanded, setStepExpanded] = useState({})
  const [detailStep, setDetailStep] = useState(null)
  const [detailFile, setDetailFile] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  const hasSteps = steps && steps.length > 0
  const hasFileChanges = fileChanges && fileChanges.length > 0
  const doneCount = hasSteps ? steps.filter((s) => s.status === 'done').length : 0
  const isExpanded = expanded

  const toggleDiff = (idx) => {
    setDiffExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }
  const toggleStep = (idx) => {
    setStepExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }
  const openDetail = (step) => setDetailStep(step)
  const closeDetail = () => { setDetailStep(null); setCopied(false) }
  const openFileDetail = (fc) => setDetailFile(fc)
  const closeFileDetail = () => { setDetailFile(null); setCopiedKey('') }

  useEffect(() => {
    if (!detailStep && !detailFile) return
    const onKey = (e) => { if (e.key === 'Escape') { closeDetail(); closeFileDetail() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailStep, detailFile])

  if (!hasSteps && !hasFileChanges) return null

  const copyDetail = async () => {
    if (!detailStep) return
    const text = [
      detailStep.label || '',
      detailStep.detail ? '\nMô tả: ' + detailStep.detail : '',
      detailStep.input ? '\nIN: ' + detailStep.input : '',
      detailStep.output ? '\nOUT: ' + detailStep.output : ''
    ].join('').trim()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || '')
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(''), 1500)
    } catch {}
  }

  return (
    <>
    <div className="flex justify-start animate-fade-in mt-2 w-full">
      <div className="w-full max-w-[92vw] sm:max-w-[70%]">
        <div className="rounded-2xl border border-black/[0.06] bg-white/90 backdrop-blur-sm shadow-sm overflow-hidden">
          {/* Header — ẩn trên mobile, always visible on desktop */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 border-b border-black/[0.04] bg-gray-50/60 text-left hover:bg-gray-100/60 transition-colors"
          >
            {isLoading ? (
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gray-400/40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-500" />
              </span>
            ) : (
              <span className="flex h-4 w-4 items-center justify-center text-emerald-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </span>
            )}
            <span className="text-[12px] font-semibold text-gray-600 tracking-wide flex-1">
              {isLoading ? 'Đang xử lý' : 'Hoàn thành'}{hasSteps ? ` · ${doneCount}/${steps.length} bước` : ''}{hasFileChanges && hasSteps ? ' · ' : ''}{hasFileChanges ? `${fileChanges.length} file` : ''}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Expanded content */}
          {isExpanded && (
            <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
              {/* Tool timeline */}
              {hasSteps && (
              <div className="px-4 py-2.5 space-y-0">
                {steps.map((s, idx) => {
                  const isStepOpen = stepExpanded[idx]
                  return (
                  <div key={s.id} className="flex items-start gap-3 relative">
                    {idx < steps.length - 1 && (
                      <div className="absolute left-[9px] top-5 bottom-0 w-px bg-gray-200" />
                    )}
                    <div className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center mt-0.5">
                      {s.status === 'done' ? (
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        </span>
                      ) : s.status === 'running' ? (
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gray-200 text-gray-600">
                          <span className="block h-2 w-2 rounded-full bg-gray-500 animate-pulse" />
                        </span>
                      ) : (
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-gray-200 bg-white" />
                      )}
                    </div>
                    <button type="button" onClick={() => toggleStep(idx)} onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); openDetail(s) }} className="min-w-0 flex-1 text-left" title="Nháy đúp xem chi tiết">
                      <div className={`py-1 text-[12.5px] leading-4 truncate ${
                        s.status === 'running'
                          ? 'text-gray-800 font-semibold'
                          : s.status === 'done'
                            ? 'text-gray-500'
                            : 'text-gray-400'
                      }`}>
                        {s.icon && <span className="mr-1.5">{s.icon}</span>}
                        {s.label}
                        {s.count != null && s.status === 'done' && (
                          <span className="ml-1.5 text-[10px] text-gray-400 font-normal">({s.count})</span>
                        )}
                        {(s.detail || s.input || s.output) && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`inline-block ml-1.5 text-gray-300 transition-transform ${isStepOpen ? 'rotate-180' : ''}`}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        )}
                      </div>
                      {isStepOpen && (s.detail || s.input || s.output) && (
                        <div className="mt-1 mb-2 space-y-1.5 bg-gray-50 border border-gray-200 rounded-md p-2 text-gray-700">
                          {s.detail && <div className="text-[11px] font-sans text-gray-400">Mô tả: {s.detail}</div>}
                          {s.input && (
                            <div>
                              <div className="text-[9px] uppercase tracking-wider font-bold text-gray-400">IN (Arguments)</div>
                              <pre className="text-[10.5px] leading-[1.3] font-mono overflow-x-auto whitespace-pre-wrap mt-0.5 max-h-40 bg-white border border-gray-100 rounded p-1">{s.input}</pre>
                            </div>
                          )}
                          {s.output && (
                            <div>
                              <div className="text-[9px] uppercase tracking-wider font-bold text-gray-400">OUT (Result)</div>
                              <pre className="text-[10.5px] leading-[1.3] font-mono overflow-x-auto whitespace-pre-wrap mt-0.5 max-h-60 bg-white border border-gray-100 rounded p-1">{s.output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                )})}
              </div>
              )}

              {/* File changes */}
              {fileChanges && fileChanges.length > 0 && <FileChanges fileChanges={fileChanges} diffExpanded={diffExpanded} toggleDiff={toggleDiff} onOpenDetail={openFileDetail} />}
            </div>
          )}
        </div>
      </div>
    </div>
    {detailStep && createPortal(
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-3 animate-fade-in" onClick={closeDetail}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-black/[0.08] bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/[0.06] bg-gray-50/70">
            {detailStep.icon && <span className="text-[15px]">{detailStep.icon}</span>}
            <div className="min-w-0 flex-1 text-[13px] font-semibold text-gray-800 truncate">{detailStep.label || 'Chi tiết'}</div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${detailStep.status === 'done' ? 'bg-emerald-100 text-emerald-700' : detailStep.status === 'running' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
              {detailStep.status === 'done' ? 'xong' : detailStep.status === 'running' ? 'đang chạy' : 'chờ'}
            </span>
            {detailStep.count != null && <span className="shrink-0 text-[11px] text-gray-400">({detailStep.count})</span>}
            <button type="button" onClick={closeDetail} className="ml-1 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">ID</div>
              <div className="text-[12px] font-mono text-gray-700 break-all">{detailStep.id}</div>
            </div>
            {detailStep.detail && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Mô tả</div>
                <div className="text-[12px] text-gray-700 font-sans">{detailStep.detail}</div>
              </div>
            )}
            {detailStep.input && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">IN (Arguments)</div>
                <pre className="text-[11.5px] leading-[1.4] font-mono bg-gray-50 border border-gray-200 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap text-gray-800 max-h-48">{detailStep.input}</pre>
              </div>
            )}
            {detailStep.output && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">OUT (Result)</div>
                <pre className="text-[11.5px] leading-[1.4] font-mono bg-gray-50 border border-gray-200 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap text-gray-800 max-h-80">{detailStep.output}</pre>
              </div>
            )}
            {!detailStep.detail && !detailStep.input && !detailStep.output && (
              <div className="text-[12px] text-gray-400 italic">Step này không có nội dung chi tiết.</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-black/[0.06] bg-gray-50/40">
            <button type="button" onClick={copyDetail} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white hover:bg-black'}`}>
              {copied ? '✓ Đã copy' : 'Copy'}
            </button>
            <button type="button" onClick={closeDetail} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-100">Đóng</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    {detailFile && createPortal(
      <div className="fixed inset-0 z-[200] flex items-stretch sm:items-center justify-center bg-black/40 backdrop-blur-sm p-3 animate-fade-in" onClick={closeFileDetail}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl max-h-full sm:max-h-[88vh] flex flex-col rounded-2xl border border-black/[0.08] bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/[0.06] bg-gray-50/70">
            <span className="text-gray-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-gray-900 truncate" title={detailFile.path}>{detailFile.path || detailFile.tool || 'file'}</div>
              <div className="mt-0.5 flex items-center gap-3 text-[10.5px] text-gray-500">
                {detailFile.tool && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{detailFile.tool}</span>}
                <span className="text-emerald-600 font-semibold tabular-nums">+{detailFile.added || 0}</span>
                <span className="text-red-500 font-semibold tabular-nums">-{detailFile.removed || 0}</span>
                <span>{(detailFile.patches || []).length} patch{(detailFile.patches || []).length === 1 ? '' : 'es'}</span>
              </div>
            </div>
            <button type="button" onClick={() => copyText(detailFile.path || '', 'path')} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${copiedKey === 'path' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {copiedKey === 'path' ? '✓' : 'Copy path'}
            </button>
            <button type="button" onClick={() => copyText((detailFile.patches || []).map((p) => p.diff || '').join('\n\n'), 'diff')} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${copiedKey === 'diff' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white hover:bg-black'}`}>
              {copiedKey === 'diff' ? '✓' : 'Copy diff'}
            </button>
            <button type="button" onClick={closeFileDetail} className="ml-1 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-900">
            {(detailFile.patches || []).length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-gray-400 italic">Không có patch để hiển thị.</div>
            )}
            {(detailFile.patches || []).map((p, pi) => (
              <div key={pi} className="border-b border-gray-800 last:border-0">
                {p.filename && (
                  <div className="px-3 py-1.5 text-[11px] text-gray-300 font-mono bg-gray-800/80 sticky top-0">{p.filename}</div>
                )}
                <pre className="text-[12px] leading-[1.5] font-mono p-2 m-0">
                  {(p.diff || '').split('\n').map((line, li) => {
                    let lineClass = 'text-gray-300'
                    let prefix = ' '
                    if (line.startsWith('+')) { lineClass = 'text-green-400 bg-green-500/10'; prefix = '+' }
                    else if (line.startsWith('-')) { lineClass = 'text-red-400 bg-red-500/10'; prefix = '-' }
                    else if (line.startsWith('@@')) { lineClass = 'text-purple-400 bg-purple-500/10'; prefix = '' }
                    else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:')) { lineClass = 'text-gray-500'; prefix = '' }
                    return <div key={li} className={`${lineClass} px-2 whitespace-pre`}>{prefix}{line}</div>
                  })}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}

function FileChanges({ fileChanges, diffExpanded, toggleDiff, onOpenDetail }) {
  const [fcExpanded, setFcExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const showCount = 3
  const display = (fcExpanded && !collapsed) ? fileChanges : fileChanges.slice(0, showCount)

  const hasPatches = fileChanges.some((fc) => fc.patches && fc.patches.length > 0)

  return (
    <div className="border-t border-black/[0.04] px-4 py-2.5 bg-gray-50/40">
      <button
        type="button"
        onClick={() => {
          setFcExpanded((e) => !e)
          setCollapsed(false)
        }}
        className="flex w-full items-center gap-2 mb-2 text-left hover:opacity-80 transition-opacity"
      >
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Thay đổi file</span>
        <span className="text-[10px] text-gray-400 font-medium">{fileChanges.length} file{fileChanges.length > 1 ? 's' : ''}</span>
        {fileChanges.length > showCount && (
          <span className="text-[10px] text-gray-400">
            {fcExpanded ? 'thu gọn' : `+${fileChanges.length - showCount}`}
          </span>
        )}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`ml-auto text-gray-400 transition-transform ${fcExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className="space-y-1">
        {display.map((fc, i) => {
          const fullPath = fc.path || ''
          const parts = fullPath.split('/').filter(Boolean)
          const fileName = parts.pop() || fc.tool || 'file'
          // Show last 2 directory segments with ellipsis prefix if truncated
          const maxDirSegments = 2
          const dirParts = parts.length > maxDirSegments ? ['...', ...parts.slice(-maxDirSegments)] : parts
          const dirPath = dirParts.join('/')
          const totalChanges = (fc.added || 0) + (fc.removed || 0)
          const maxBlocks = 5
          const addBlocks = totalChanges > 0 ? Math.max(1, Math.round((fc.added / totalChanges) * maxBlocks)) : 0
          const removeBlocks = totalChanges > 0 ? Math.max(0, maxBlocks - addBlocks) : 0
          const idx = fcExpanded ? i : i
          const isDiffOpen = diffExpanded[idx]
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => hasPatches && toggleDiff(idx)}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpenDetail?.(fc) }}
                title="Nháy đúp xem chi tiết file"
                className={`flex w-full items-center gap-2 text-[12px] leading-5 group text-left ${hasPatches ? 'cursor-pointer hover:bg-white/60 rounded' : ''}`}
              >
                <span className="text-gray-400 text-[11px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-700" title={fc.path}>
                  {dirPath && <span className="text-gray-400 font-normal">{dirPath}/</span>}
                  {fileName}
                </span>
                <span className="shrink-0 text-emerald-600 font-semibold text-[11px] tabular-nums w-7 text-right">+{fc.added}</span>
                <span className="shrink-0 text-red-500 font-semibold text-[11px] tabular-nums w-7 text-right">-{fc.removed}</span>
                <span className="shrink-0 flex gap-px">
                  {Array.from({ length: addBlocks }).map((_, bi) => (
                    <span key={`a${bi}`} className="inline-block h-2 w-1.5 rounded-[1px] bg-emerald-500" />
                  ))}
                  {Array.from({ length: removeBlocks }).map((_, bi) => (
                    <span key={`r${bi}`} className="inline-block h-2 w-1.5 rounded-[1px] bg-red-400" />
                  ))}
                  {totalChanges === 0 && (
                    <span className="inline-block h-2 w-1.5 rounded-[1px] bg-gray-300" />
                  )}
                </span>
                {hasPatches && (
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 text-gray-300 transition-transform ${isDiffOpen ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>
              {/* Diff view */}
              {isDiffOpen && fc.patches && fc.patches.length > 0 && (
                <div className="ml-5 mt-1 mb-1.5 bg-gray-900 rounded-md overflow-hidden">
                  {fc.patches.map((p, pi) => (
                    <div key={pi}>
                      {p.filename && (
                        <div className="px-3 py-1 text-[10px] text-gray-400 font-mono bg-gray-800/60">
                          {p.filename}
                        </div>
                      )}
                      <pre className="text-[11px] leading-[1.4] font-mono overflow-x-auto p-2 m-0">
                        {p.diff?.split('\n').map((line, li) => {
                          let lineClass = 'text-gray-300'
                          let prefix = ' '
                          if (line.startsWith('+')) {
                            lineClass = 'text-green-400 bg-green-500/10'
                            prefix = '+'
                          } else if (line.startsWith('-')) {
                            lineClass = 'text-red-400 bg-red-500/10'
                            prefix = '-'
                          } else if (line.startsWith('@@')) {
                            lineClass = 'text-purple-400 bg-purple-500/10'
                            prefix = ''
                          } else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:')) {
                            lineClass = 'text-gray-500'
                            prefix = ''
                          }
                          return (
                            <div key={li} className={`${lineClass} px-2 whitespace-pre`}>
                              {prefix}{line}
                            </div>
                          )
                        })}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {fileChanges.length > showCount && !fcExpanded && (
          <div className="text-[11px] text-gray-400 px-6">…</div>
        )}
      </div>
      {/* Summary footer */}
      <div className="mt-2 pt-1.5 border-t border-black/[0.04] flex items-center gap-3 text-[10.5px] text-gray-400 font-medium">
        <span>{fileChanges.length} file{fileChanges.length > 1 ? 's' : ''} changed</span>
        <span className="text-emerald-600">+{fileChanges.reduce((a, f) => a + (f.added || 0), 0)}</span>
        <span className="text-red-500">-{fileChanges.reduce((a, f) => a + (f.removed || 0), 0)}</span>
      </div>
    </div>
  )
}
