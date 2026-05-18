import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  CirclePlay,
  Coins,
  Database,
  GitBranch,
  Maximize2,
  MessageCircle,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
  Webhook,
} from 'lucide-react'

const NODE_TYPES = {
  trigger: {
    label: 'Trigger',
    detail: 'Bắt đầu flow',
    icon: CirclePlay,
    color: 'bg-emerald-500',
  },
  webhook: {
    label: 'HTTP',
    detail: 'Gọi API hoặc nhận dữ liệu',
    icon: Webhook,
    color: 'bg-sky-500',
  },
  ai: {
    label: 'AI',
    detail: 'Xử lý bằng model',
    icon: Bot,
    color: 'bg-violet-500',
  },
  condition: {
    label: 'Điều kiện',
    detail: 'Rẽ nhánh theo logic',
    icon: GitBranch,
    color: 'bg-amber-500',
  },
  database: {
    label: 'Lưu dữ liệu',
    detail: 'Ghi artifact của run',
    icon: Database,
    color: 'bg-slate-700',
  },
  rss: {
    label: 'RSS',
    detail: 'Lấy tin từ nguồn RSS',
    icon: Newspaper,
    color: 'bg-orange-500',
  },
  telegram: {
    label: 'Telegram',
    detail: 'Gửi tin nhắn Telegram',
    icon: Send,
    color: 'bg-sky-600',
  },
  price_report: {
    label: 'Giá vàng/bạc',
    detail: 'Lấy giá vàng và bạc',
    icon: Coins,
    color: 'bg-yellow-600',
  },
  zalo: {
    label: 'Zalo',
    detail: 'Gửi tin nhắn Zalo',
    icon: MessageCircle,
    color: 'bg-blue-600',
  },
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 60

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function emptyGraph() {
  return { nodes: [], edges: [] }
}

export default function Workflows({ token }) {
  const canvasRef = useRef(null)
  const [screen, setScreen] = useState('list')
  const [workflows, setWorkflows] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [graph, setGraph] = useState(emptyGraph())
  const [selectedId, setSelectedId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [connectionDraft, setConnectionDraft] = useState(null)
  const [showNodePicker, setShowNodePicker] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [runs, setRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [configDraft, setConfigDraft] = useState('{}')
  const [configError, setConfigError] = useState('')
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || null
  const toScreenX = (x) => view.x + x * view.scale
  const toScreenY = (y) => view.y + y * view.scale
  const toGraphX = (x) => (x - view.x) / view.scale
  const toGraphY = (y) => (y - view.y) / view.scale
  const edgePaths = graph.edges
    .map((edge) => {
      const from = graph.nodes.find((node) => node.id === edge.from)
      const to = graph.nodes.find((node) => node.id === edge.to)
      if (!from || !to) return null
      const x1 = from.x + NODE_WIDTH
      const y1 = from.y + NODE_HEIGHT / 2
      const x2 = to.x
      const y2 = to.y + NODE_HEIGHT / 2
      return { id: edge.id, d: buildOrthogonalPath(toScreenX(x1), toScreenY(y1), toScreenX(x2), toScreenY(y2)) }
    })
    .filter(Boolean)

  useEffect(() => {
    loadWorkflows()
  }, [])

  useEffect(() => {
    setConfigDraft(JSON.stringify(selectedNode?.config || {}, null, 2))
    setConfigError('')
  }, [selectedId, selectedNode])

  async function loadWorkflows() {
    setLoading(true)
    try {
      const response = await fetch('/api/workflows', { headers: authHeaders(token) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : [])
      setStatus('')
    } catch (error) {
      setStatus(`Không tải được workflow: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  function openWorkflow(item) {
    setActiveId(item.id)
    setName(item.name || '')
    setDescription(item.description || '')
    setGraph(item.graph || emptyGraph())
    setSelectedId(null)
    setConnectionDraft(null)
    setShowNodePicker(false)
    setLastRun(null)
    setRuns([])
    setSelectedRun(null)
    setShowResults(false)
    setView({ x: 0, y: 0, scale: 1 })
    setScreen('editor')
  }

  function resetEditor() {
    setActiveId(null)
    setName('')
    setDescription('')
    setGraph(emptyGraph())
    setSelectedId(null)
    setConnectionDraft(null)
    setShowNodePicker(false)
    setRuns([])
    setSelectedRun(null)
    setShowResults(false)
  }

  async function createWorkflow() {
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Workflow mới',
          description: '',
          graph: emptyGraph(),
        }),
      })
      const item = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(item.detail || `HTTP ${response.status}`)
      setWorkflows((current) => [item, ...current])
      openWorkflow(item)
      setStatus('Đã tạo workflow')
    } catch (error) {
      setStatus(`Không tạo được workflow: ${error.message}`)
    }
  }

  async function saveWorkflow() {
    if (!activeId || saving) return
    setSaving(true)
    try {
      const response = await fetch(`/api/workflows/${activeId}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ name, description, graph }),
      })
      const item = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(item.detail || `HTTP ${response.status}`)
      setWorkflows((current) => current.map((workflow) => (workflow.id === item.id ? item : workflow)))
      setStatus('Đã lưu')
    } catch (error) {
      setStatus(`Không lưu được workflow: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkflow() {
    if (!activeId || !window.confirm('Xóa workflow này?')) return
    try {
      const response = await fetch(`/api/workflows/${activeId}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setWorkflows((current) => current.filter((item) => item.id !== activeId))
      resetEditor()
      setScreen('list')
      setStatus('Đã xóa workflow')
    } catch (error) {
      setStatus(`Không xóa được workflow: ${error.message}`)
    }
  }

  async function runWorkflow() {
    if (!activeId || running) return
    setRunning(true)
    setStatus('Đang chạy workflow...')
    try {
      const response = await fetch(`/api/workflows/${activeId}/run`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ input: {} }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setLastRun(data)
      setSelectedRun(data)
      setShowResults(true)
      loadRuns(activeId)
      setStatus(data.status === 'success' ? 'Chạy thành công' : `Chạy lỗi: ${data.error || 'unknown error'}`)
    } catch (error) {
      setStatus(`Không chạy được workflow: ${error.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function loadRuns(workflowId = activeId, options = {}) {
    if (!workflowId) return []
    setLoadingRuns(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/runs?limit=20`, { headers: authHeaders(token) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      const items = Array.isArray(data.runs) ? data.runs : []
      setRuns(items)
      if (options.selectFirst && items[0]) openRun(workflowId, items[0].id, { reveal: false })
      return items
    } catch (error) {
      setStatus(`Không tải được kết quả lưu: ${error.message}`)
      return []
    } finally {
      setLoadingRuns(false)
    }
  }

  async function openRun(workflowId, runId, options = {}) {
    if (!workflowId || !runId) return
    try {
      const response = await fetch(`/api/workflows/${workflowId}/runs/${runId}`, { headers: authHeaders(token) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setSelectedRun(data)
      setSelectedId(null)
      if (options.reveal !== false) setShowResults(true)
    } catch (error) {
      setStatus(`Không mở được kết quả lưu: ${error.message}`)
    }
  }

  async function deleteSavedResult(artifactId) {
    if (!activeId || !artifactId || !window.confirm('Xóa kết quả lưu này?')) return
    try {
      const response = await fetch(`/api/workflows/${activeId}/artifacts/${artifactId}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setSelectedRun((current) => {
        if (!current) return current
        return {
          ...current,
          artifacts: (current.artifacts || []).filter((artifact) => artifact.id !== artifactId),
        }
      })
      setStatus('Đã xóa kết quả lưu')
    } catch (error) {
      setStatus(`Không xóa được kết quả lưu: ${error.message}`)
    }
  }

  function addNode(type) {
    const meta = NODE_TYPES[type]
    const id = `node-${Date.now()}`
    const node = {
      id,
      type,
      title: meta.label,
      x: 120 + graph.nodes.length * 36,
      y: 120 + (graph.nodes.length % 3) * 110,
      config: {},
    }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }))
    setSelectedId(null)
    setShowNodePicker(false)
  }

  function updateSelected(updates) {
    if (!selectedId) return
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedId ? { ...node, ...updates } : node)),
    }))
  }

  function deleteSelectedNode() {
    if (!selectedId) return
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== selectedId),
      edges: current.edges.filter((edge) => edge.from !== selectedId && edge.to !== selectedId),
    }))
    setSelectedId(null)
  }

  function startDrag(event, nodeId) {
    event.stopPropagation()
    setDraggingId(nodeId)
    setShowNodePicker(false)
  }

  function moveNode(event) {
    if (!draggingId || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(24, toGraphX(event.clientX - rect.left) - NODE_WIDTH / 2)
    const y = Math.max(24, toGraphY(event.clientY - rect.top) - NODE_HEIGHT / 2)
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === draggingId ? { ...node, x, y } : node)),
    }))
  }

  function finishDrag() {
    setDraggingId(null)
  }

  function startConnection(event, nodeId) {
    event.stopPropagation()
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const node = graph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    setConnectionDraft({
      from: nodeId,
      x1: node.x + NODE_WIDTH,
      y1: node.y + NODE_HEIGHT / 2,
      x2: toGraphX(event.clientX - rect.left),
      y2: toGraphY(event.clientY - rect.top),
    })
  }

  function moveConnection(event) {
    if (!connectionDraft || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    setConnectionDraft((current) => ({
      ...current,
      x2: toGraphX(event.clientX - rect.left),
      y2: toGraphY(event.clientY - rect.top),
    }))
  }

  function finishConnection(targetId = null) {
    if (!connectionDraft) return
    if (targetId && targetId !== connectionDraft.from) {
      const exists = graph.edges.some((edge) => edge.from === connectionDraft.from && edge.to === targetId)
      if (!exists) {
        setGraph((current) => ({
          ...current,
          edges: [...current.edges, { id: `edge-${Date.now()}`, from: connectionDraft.from, to: targetId }],
        }))
      }
    }
    setConnectionDraft(null)
  }

  function applyConfigDraft() {
    if (!selectedNode) return
    try {
      updateSelected({ config: JSON.parse(configDraft) })
      setConfigError('')
    } catch {
      setConfigError('JSON không hợp lệ')
    }
  }

  function fitWorkflowToView() {
    if (!canvasRef.current || graph.nodes.length === 0) return
    const rect = canvasRef.current.getBoundingClientRect()
    const padding = 72
    const minX = Math.min(...graph.nodes.map((node) => node.x))
    const minY = Math.min(...graph.nodes.map((node) => node.y))
    const maxX = Math.max(...graph.nodes.map((node) => node.x + NODE_WIDTH))
    const maxY = Math.max(...graph.nodes.map((node) => node.y + NODE_HEIGHT))
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const scale = Math.min(
      1,
      Math.max(0.45, Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height))
    )
    setSelectedId(null)
    setShowNodePicker(false)
    setView({
      scale,
      x: (rect.width - width * scale) / 2 - minX * scale,
      y: (rect.height - height * scale) / 2 - minY * scale,
    })
  }

  function buildOrthogonalPath(x1, y1, x2, y2) {
    const radius = 12
    const direction = x2 >= x1 ? 1 : -1
    const elbowX = x1 + direction * Math.max(32, Math.abs(x2 - x1) / 2)
    const verticalDirection = y2 >= y1 ? 1 : -1
    const safeRadius = Math.min(radius, Math.abs(y2 - y1) / 2, Math.abs(elbowX - x1), Math.abs(x2 - elbowX))

    if (Math.abs(y2 - y1) < 2) {
      return `M ${x1} ${y1} H ${x2}`
    }

    return [
      `M ${x1} ${y1}`,
      `H ${elbowX - direction * safeRadius}`,
      `Q ${elbowX} ${y1} ${elbowX} ${y1 + verticalDirection * safeRadius}`,
      `V ${y2 - verticalDirection * safeRadius}`,
      `Q ${elbowX} ${y2} ${elbowX + direction * safeRadius} ${y2}`,
      `H ${x2}`,
    ].join(' ')
  }

  function formatJson(value) {
    if (value === undefined || value === null) return ''
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  if (screen === 'home') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex h-16 items-center justify-between border-b border-black/[0.06] px-5">
          <div>
            <h1 className="text-lg font-semibold text-gray-950">Workflows</h1>
          </div>
          {workflows.length > 0 && (
            <button
              onClick={() => setScreen('list')}
              className="inline-flex h-10 items-center rounded-xl border border-black/[0.08] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Xem danh sách
            </button>
          )}
        </header>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">Bắt đầu một workflow</h2>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Tạo flow mới rồi thêm từng node khi bạn cần. Không có gì hiển thị sẵn trước khi bạn bắt đầu.
            </p>
            <button
              onClick={createWorkflow}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gray-950 px-5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Tạo workflow
            </button>
          </div>
        </div>

        <footer className="border-t border-black/[0.06] px-5 py-3 text-xs text-gray-500">
          {loading ? 'Đang tải...' : status || 'Sẵn sàng'}
        </footer>
      </div>
    )
  }

  if (screen === 'list') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f7f7f4]">
        <header className="flex h-16 items-center justify-between border-b border-black/[0.06] bg-white px-5">
          <div>
            <h1 className="text-lg font-semibold text-gray-950">Workflows</h1>
            <p className="text-sm text-gray-500">{workflows.length} workflow</p>
          </div>
          <button onClick={createWorkflow} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-medium text-white">
            <Plus className="h-4 w-4" />
            Tạo workflow
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            {workflows.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-950">Chưa có workflow</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">Tạo workflow đầu tiên rồi thêm node theo nhu cầu của bạn.</p>
                <button onClick={createWorkflow} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  Tạo workflow
                </button>
              </div>
            ) : (
              workflows.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openWorkflow(item)}
                  className="flex w-full items-center justify-between border-b border-black/[0.05] px-5 py-4 text-left last:border-b-0 hover:bg-gray-50"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-950">{item.name}</div>
                    <div className="mt-1 text-sm text-gray-500">{item.description || 'Chưa có mô tả'}</div>
                  </div>
                  <div className="text-sm text-gray-400">{item.graph?.nodes?.length || 0} nodes</div>
                </button>
              ))
            )}
          </div>
        </div>

        <footer className="border-t border-black/[0.06] bg-white px-5 py-3 text-xs text-gray-500">
          {loading ? 'Đang tải...' : status || 'Sẵn sàng'}
        </footer>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-[#f7f7f4] text-gray-950">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-black/[0.06] bg-white px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setScreen('list')} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] text-gray-500 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-[180px] bg-transparent text-lg font-semibold outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fitWorkflowToView}
              title="Xem toàn quy trình"
              aria-label="Xem toàn quy trình"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-gray-700 hover:bg-gray-50"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setSelectedId(null)
                if (showResults) {
                  setShowResults(false)
                } else {
                  setShowResults(true)
                  loadRuns(activeId, { selectFirst: !selectedRun })
                }
              }}
              title="Kết quả lưu"
              aria-label="Kết quả lưu"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${
                showResults
                  ? 'border-gray-950 bg-gray-950 text-white'
                  : 'border-black/[0.08] bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Database className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowNodePicker((value) => !value)}
              title="Thêm node"
              aria-label="Thêm node"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={runWorkflow}
              disabled={!activeId || running}
              title={running ? 'Đang chạy' : 'Run'}
              aria-label={running ? 'Đang chạy' : 'Run'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              onClick={saveWorkflow}
              title={saving ? 'Đang lưu' : 'Lưu'}
              aria-label={saving ? 'Đang lưu' : 'Lưu'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-950 text-white"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              onClick={deleteWorkflow}
              title="Xóa workflow"
              aria-label="Xóa workflow"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <div
            ref={canvasRef}
            onMouseMove={(event) => {
              moveNode(event)
              moveConnection(event)
            }}
            onMouseUp={() => {
              finishDrag()
              finishConnection()
            }}
            onMouseLeave={() => {
              finishDrag()
              finishConnection()
            }}
            onClick={() => {
              setSelectedId(null)
              setShowNodePicker(false)
            }}
            className="relative flex-1 overflow-hidden bg-white"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.10)_1px,transparent_0)] [background-size:22px_22px]" />

            {graph.nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowNodePicker(true)
                  }}
                  className="rounded-2xl border border-dashed border-black/[0.14] bg-white px-6 py-5 text-center shadow-sm"
                >
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-950 text-white">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-medium">Thêm node đầu tiên</div>
                </button>
              </div>
            ) : null}

            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {edgePaths.map((edge) => (
                <path key={edge.id} d={edge.d} fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
              ))}
              {connectionDraft ? (
                <path
                  d={buildOrthogonalPath(
                    toScreenX(connectionDraft.x1),
                    toScreenY(connectionDraft.y1),
                    toScreenX(connectionDraft.x2),
                    toScreenY(connectionDraft.y2)
                  )}
                  fill="none"
                  stroke="#111827"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="5 5"
                />
              ) : null}
            </svg>

            {graph.nodes.map((node) => {
              const meta = NODE_TYPES[node.type] || NODE_TYPES.webhook
              const Icon = meta.icon
              const selected = selectedId === node.id
              return (
                <div
                  key={node.id}
                  style={{
                    left: toScreenX(node.x),
                    top: toScreenY(node.y),
                    transform: `scale(${view.scale})`,
                    transformOrigin: 'top left',
                  }}
                  onMouseDown={(event) => startDrag(event, node.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    finishDrag()
                    setShowResults(false)
                    setSelectedId(node.id)
                  }}
                  className={`absolute z-10 w-[220px] cursor-move rounded-xl border bg-white shadow-sm ${
                    selected ? 'border-gray-950 ring-2 ring-black/10' : 'border-gray-400'
                  }`}
                >
                  <button
                    onMouseUp={(event) => {
                      event.stopPropagation()
                      finishConnection(node.id)
                    }}
                    className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-gray-500 bg-white"
                    title="Thả vào đây để nối"
                  />
                  <button
                    onMouseDown={(event) => startConnection(event, node.id)}
                    className={`absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border ${
                      connectionDraft?.from === node.id ? 'border-gray-950 bg-gray-950' : 'border-gray-500 bg-white'
                    }`}
                    title="Kéo để nối"
                  />

                  <div className="flex h-[60px] items-center gap-3 px-4">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{node.title}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{meta.detail}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {showNodePicker ? (
            <div className="absolute right-5 top-5 z-20 w-72 rounded-2xl border border-black/[0.08] bg-white p-3 shadow-xl">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Thêm node</div>
              <div className="space-y-1">
                {Object.entries(NODE_TYPES).map(([type, meta]) => {
                  const Icon = meta.icon
                  return (
                    <button
                      key={type}
                      onClick={() => addNode(type)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-50"
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-gray-950">{meta.label}</span>
                        <span className="block text-xs text-gray-500">{meta.detail}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {selectedNode ? (
            <aside onClick={(event) => event.stopPropagation()} className="w-80 shrink-0 border-l border-black/[0.06] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-950">{selectedNode.title}</h2>
                <button onClick={() => setSelectedId(null)} className="text-xs font-medium text-gray-400 hover:text-gray-900">
                  Đóng
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Tên node</span>
                  <input
                    value={selectedNode.title}
                    onChange={(event) => updateSelected({ title: event.target.value })}
                    className="h-10 w-full rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Config JSON</span>
                  <textarea
                    value={configDraft}
                    onChange={(event) => {
                      setConfigDraft(event.target.value)
                      if (configError) setConfigError('')
                    }}
                    className="h-44 w-full rounded-xl border border-black/[0.08] p-3 font-mono text-xs leading-5 outline-none focus:border-black/25"
                  />
                </label>
                <div className="flex gap-2">
                  <button onClick={applyConfigDraft} className="h-10 rounded-xl bg-gray-950 px-4 text-sm font-medium text-white">
                    Áp dụng
                  </button>
                  <button onClick={deleteSelectedNode} className="h-10 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600">
                    Xóa node
                  </button>
                </div>
                {configError && <p className="text-xs text-rose-600">{configError}</p>}
              </div>
            </aside>
          ) : showResults ? (
            <aside onClick={(event) => event.stopPropagation()} className="w-[380px] shrink-0 border-l border-black/[0.06] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-950">Kết quả lưu</h2>
                  <p className="mt-1 text-xs text-gray-500">Lịch sử chạy và artifact của workflow.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadRuns(activeId)}
                    title="Tải lại"
                    aria-label="Tải lại kết quả lưu"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] text-gray-600 hover:bg-gray-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingRuns ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowResults(false)}
                    title="Ẩn"
                    aria-label="Ẩn kết quả lưu"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[128px_1fr] gap-3">
                <div className="max-h-[calc(100vh-210px)] space-y-2 overflow-auto pr-1">
                  {runs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-black/[0.12] px-3 py-4 text-xs leading-5 text-gray-500">
                      Chưa có lần chạy nào. Bấm Run để tạo kết quả.
                    </div>
                  ) : (
                    runs.map((run) => (
                      <button
                        key={run.id}
                        onClick={() => openRun(activeId, run.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                          selectedRun?.id === run.id ? 'border-gray-950 bg-gray-50' : 'border-black/[0.08] hover:bg-gray-50'
                        }`}
                      >
                        <div className={run.status === 'success' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-600'}>
                          {run.status}
                        </div>
                        <div className="mt-1 truncate text-gray-400">{run.started_at}</div>
                      </button>
                    ))
                  )}
                </div>

                <div className="min-w-0 max-h-[calc(100vh-210px)] overflow-auto rounded-2xl border border-black/[0.08] bg-[#fafafa] p-3">
                  {!selectedRun ? (
                    <div className="py-10 text-center text-xs text-gray-500">Chọn một lần chạy để xem chi tiết.</div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-950">Run</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {selectedRun.started_at} · {selectedRun.status}
                        </div>
                        {selectedRun.error && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{selectedRun.error}</div>}
                      </div>

                      <section>
                        <div className="mb-2 text-xs font-semibold text-gray-950">Artifact đã lưu</div>
                        {(selectedRun.artifacts || []).length === 0 ? (
                          <div className="rounded-xl border border-dashed border-black/[0.12] bg-white px-3 py-4 text-xs text-gray-500">
                            Run này chưa có artifact, hoặc đã bị xóa.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {(selectedRun.artifacts || []).map((artifact) => (
                              <div key={artifact.id} className="rounded-xl border border-black/[0.08] bg-white p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-gray-900">{artifact.node_id}</div>
                                    <div className="truncate text-[11px] text-gray-400">{artifact.created_at}</div>
                                  </div>
                                  <button
                                    onClick={() => deleteSavedResult(artifact.id)}
                                    title="Xóa kết quả lưu"
                                    aria-label="Xóa kết quả lưu"
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-3 text-[11px] leading-5 text-gray-100">
                                  {formatJson(artifact.payload)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <section>
                        <div className="mb-2 text-xs font-semibold text-gray-950">Output cuối</div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-[11px] leading-5 text-gray-700">
                          {formatJson(selectedRun.output)}
                        </pre>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="border-t border-black/[0.06] bg-white px-5 py-3 text-xs text-gray-500">
          <div className="flex items-center justify-between gap-4">
            <span>{status || `${graph.nodes.length} nodes · ${graph.edges.length} links`}</span>
            {lastRun && (
              <span className={lastRun.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}>
                Run gần nhất: {lastRun.status}
              </span>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
