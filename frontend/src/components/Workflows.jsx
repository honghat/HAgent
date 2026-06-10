import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  CirclePlay,
  Cloud,
  Clock,
  Coins,
  Code2,
  Database,
  Flame,
  GitFork,
  GitMerge,
  Hourglass,
  ListFilter,
  Maximize2,
  MessageCircle,
  MinusCircle,
  MousePointerClick,
  Newspaper,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Terminal,
  Share2,
  TextCursorInput,
  Trash2,
  Wrench,
  X,
  XCircle,
  Webhook,
} from 'lucide-react'

const NODE_TYPES = {
  trigger: {
    label: 'Manual Trigger',
    detail: 'Run workflow manually',
    icon: CirclePlay,
    color: 'bg-emerald-500',
    hidden: true,
    inputs: [{ label: 'Manual run payload', path: 'workflow.input', detail: 'Payload khi bấm Run hoặc test workflow' }],
    outputs: [{ label: 'Dữ liệu bắt đầu', path: 'output', detail: 'Trả nguyên payload đầu vào cho node kế tiếp' }],
  },
  manual_trigger: {
    label: 'Manual Trigger',
    detail: 'Run workflow manually',
    icon: MousePointerClick,
    color: 'bg-emerald-500',
    group: 'Core',
    inputs: [{ label: 'Manual run payload', path: 'workflow.input', detail: 'Payload khi bấm Run hoặc test workflow' }],
    outputs: [{ label: 'Manual item', path: 'output', detail: 'Dữ liệu bắt đầu workflow' }],
  },
  schedule_trigger: {
    label: 'Schedule Trigger',
    detail: 'Run on a schedule',
    icon: Clock,
    color: 'bg-emerald-600',
    group: 'Core',
    inputs: [{ label: 'Schedule rule', path: 'config.schedule', detail: 'Lịch chạy như cron/daily/hourly; backend scheduler đọc config trigger' }],
    outputs: [{ label: 'Schedule item', path: 'output', detail: 'Payload khi lịch kích hoạt workflow' }],
  },
  webhook_trigger: {
    label: 'Webhook',
    detail: 'Receive HTTP requests',
    icon: Webhook,
    color: 'bg-orange-500',
    group: 'Core',
    inputs: [{ label: 'Incoming request', path: 'workflow.input', detail: 'Payload HTTP gửi vào workflow' }],
    outputs: [{ label: 'Request data', path: 'output', detail: 'Body/query/headers của request đầu vào' }],
  },
  http_request: {
    label: 'HTTP Request',
    detail: 'Make an HTTP request',
    icon: Webhook,
    color: 'bg-sky-500',
    group: 'Core',
    inputs: [{ label: 'Request input', path: 'input', detail: 'Dữ liệu từ node trước; dùng làm body khi method POST/PUT/PATCH nếu không cấu hình body' }],
    outputs: [
      { label: 'Response body', path: 'output.body', detail: 'JSON/text body trả về' },
      { label: 'Status code', path: 'output.status', detail: 'HTTP status code' },
    ],
  },
  set: {
    label: 'Edit Fields (Set)',
    detail: 'Create or edit item fields',
    icon: PencilLine,
    color: 'bg-blue-500',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Item từ node trước' }],
    outputs: [{ label: 'Edited item', path: 'output', detail: 'Item sau khi thêm/sửa field' }],
  },
  format_output: {
    label: 'Format Output',
    detail: 'Render text with variables',
    icon: TextCursorInput,
    color: 'bg-teal-600',
    group: 'Core',
    inputs: [{ label: 'Input data', path: 'input', detail: 'Dữ liệu dùng để render template' }],
    outputs: [
      { label: 'Formatted message', path: 'output.message', detail: 'Text đã render để gửi sang Zalo/Telegram' },
      { label: 'Original data', path: 'output', detail: 'Giữ dữ liệu gốc nếu include_input=true' },
    ],
  },
  if: {
    label: 'IF',
    detail: 'Route by condition',
    icon: GitFork,
    color: 'bg-amber-500',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Item để kiểm tra điều kiện' }],
    outputs: [
      { label: 'Matched', path: 'output.matched', detail: 'true/false theo điều kiện' },
      { label: 'Item', path: 'output.input', detail: 'Item gốc đi qua node IF' },
    ],
  },
  switch: {
    label: 'Switch',
    detail: 'Route by value',
    icon: ListFilter,
    color: 'bg-amber-600',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Item để so khớp rule' }],
    outputs: [
      { label: 'Matched output', path: 'output.matched', detail: 'Rule đầu tiên khớp' },
      { label: 'Item', path: 'output.input', detail: 'Item gốc đi qua node Switch' },
    ],
  },
  merge: {
    label: 'Merge',
    detail: 'Combine input branches',
    icon: GitMerge,
    color: 'bg-purple-600',
    group: 'Core',
    inputs: [{ label: 'Branch inputs', path: 'input', detail: 'Một hoặc nhiều input từ các nhánh trước' }],
    outputs: [{ label: 'Merged item', path: 'output', detail: 'Dữ liệu đã gộp theo config.mode' }],
  },
  code: {
    label: 'Code',
    detail: 'Run JavaScript/Python-like transform',
    icon: Code2,
    color: 'bg-slate-800',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Dữ liệu truyền vào đoạn code' }],
    outputs: [{ label: 'Code result', path: 'output', detail: 'Kết quả sau khi chạy expression/code' }],
  },
  wait: {
    label: 'Wait',
    detail: 'Delay before continuing',
    icon: Hourglass,
    color: 'bg-stone-600',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Item giữ lại trong lúc chờ' }],
    outputs: [{ label: 'Delayed item', path: 'output', detail: 'Item sau khi hết thời gian chờ' }],
  },
  no_op: {
    label: 'No Operation, do nothing',
    detail: 'Pass data through',
    icon: MinusCircle,
    color: 'bg-gray-600',
    group: 'Core',
    inputs: [{ label: 'Input item', path: 'input', detail: 'Dữ liệu từ node trước' }],
    outputs: [{ label: 'Same item', path: 'output', detail: 'Trả nguyên input' }],
  },
  webhook: {
    label: 'HTTP Request',
    detail: 'Make an HTTP request',
    icon: Webhook,
    color: 'bg-sky-500',
    hidden: true,
    inputs: [{ label: 'Dữ liệu gọi API', path: 'input', detail: 'Dữ liệu từ node trước; dùng làm body khi method POST/PUT/PATCH nếu không cấu hình body' }],
    outputs: [
      { label: 'Phản hồi API', path: 'output.body', detail: 'JSON/text body trả về' },
      { label: 'HTTP status', path: 'output.status', detail: 'HTTP status code' },
    ],
  },
  ai: {
    label: 'AI',
    detail: 'Xử lý bằng model',
    icon: Bot,
    color: 'bg-violet-500',
    inputs: [{ label: 'Dữ liệu cho AI', path: 'input', detail: 'Dữ liệu được gửi vào user message của model' }],
    outputs: [
      { label: 'Câu trả lời AI', path: 'output.content', detail: 'Nội dung model trả lời' },
      { label: 'Token usage', path: 'output.usage', detail: 'Thông tin token nếu provider trả về' },
    ],
  },
  agent: {
    label: 'Agent',
    detail: 'Chạy agent nội bộ',
    icon: Bot,
    color: 'bg-fuchsia-600',
    inputs: [{ label: 'Prompt cho agent', path: 'input', detail: 'Dữ liệu được đưa vào prompt agent' }],
    outputs: [
      { label: 'Phản hồi agent', path: 'output.content', detail: 'Phản hồi của agent' },
      { label: 'Session agent', path: 'output.session_id', detail: 'Session agent được tạo cho lần chạy' },
    ],
  },
  tool: {
    label: 'Tool',
    detail: 'Chạy tool backend',
    icon: Wrench,
    color: 'bg-cyan-700',
    inputs: [{ label: 'Tham số tool', path: 'input', detail: 'Args từ node trước, hoặc config.args nếu đã khai báo' }],
    outputs: [{ label: 'Kết quả tool', path: 'output', detail: 'Kết quả tool trả về, có thể là JSON hoặc content text' }],
  },
  condition: {
    label: 'IF',
    detail: 'Route by condition',
    icon: GitFork,
    color: 'bg-amber-500',
    hidden: true,
    inputs: [{ label: 'Dữ liệu kiểm tra', path: 'input', detail: 'Payload để kiểm tra config.field/config.equals' }],
    outputs: [
      { label: 'Kết quả rẽ nhánh', path: 'output.matched', detail: 'true/false theo điều kiện' },
      { label: 'Giá trị đọc được', path: 'output.value', detail: 'Giá trị thực tế đọc từ field' },
      { label: 'Dữ liệu gốc', path: 'output.input', detail: 'Payload gốc được giữ lại' },
    ],
  },
  database: {
    label: 'Lưu dữ liệu',
    detail: 'Ghi artifact của run',
    icon: Database,
    color: 'bg-slate-700',
    inputs: [{ label: 'Dữ liệu cần lưu', path: 'input', detail: 'Payload cần lưu thành artifact' }],
    outputs: [
      { label: 'Artifact đã lưu', path: 'output.artifact_id', detail: 'ID artifact đã lưu' },
      { label: 'Payload đã lưu', path: 'output.payload', detail: 'Payload đã lưu' },
    ],
  },
  rss: {
    label: 'RSS',
    detail: 'Lấy tin từ nguồn RSS',
    icon: Newspaper,
    color: 'bg-orange-500',
    inputs: [{ label: 'Nguồn RSS', path: 'config.url', detail: 'URL RSS; không phụ thuộc node trước' }],
    outputs: [
      { label: 'Bản tin RSS', path: 'output.message', detail: 'Tin đã format để gửi đi' },
      { label: 'Danh sách tin', path: 'output.items', detail: 'Danh sách tin' },
      { label: 'Số tin', path: 'output.count', detail: 'Số tin lấy được' },
    ],
  },
  telegram: {
    label: 'Telegram',
    detail: 'Gửi tin nhắn Telegram',
    icon: Send,
    color: 'bg-sky-600',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '…hoặc để trống dùng token từ .env' },
      { key: 'chat_id', label: 'Chat ID', type: 'text', placeholder: '…hoặc để trống dùng TELEGRAM_HOME_CHANNEL' },
    ],
    inputs: [
      { label: 'Tin nhắn cần gửi', path: 'input.message', detail: 'Tin nhắn từ node trước; fallback là toàn bộ input dạng JSON' },
      { label: 'Bot Token', path: 'config.bot_token', detail: 'Token bot Telegram; mặc định từ .env' },
      { label: 'Chat ID', path: 'config.chat_id', detail: 'Chat đích; mặc định TELEGRAM_HOME_CHANNEL' },
    ],
    outputs: [
      { label: 'Kết quả gửi Telegram', path: 'output.sent', detail: 'true khi gửi thành công' },
      { label: 'ID tin Telegram', path: 'output.message_id', detail: 'ID message Telegram' },
    ],
  },
  price_report: {
    label: 'Giá vàng/bạc',
    detail: 'Lấy giá vàng và bạc',
    icon: Coins,
    color: 'bg-yellow-600',
    inputs: [{ label: 'Nguồn giá', path: 'config.gold_url/config.silver_url', detail: 'Nguồn giá; mặc định dùng DOJI và giabac.org' }],
    outputs: [
      { label: 'Tin giá vàng/bạc', path: 'output.message', detail: 'Bản tin giá vàng/bạc đã format' },
      { label: 'Dòng vàng chọn', path: 'output.gold.selected', detail: 'Dòng vàng được chọn' },
      { label: 'Dòng bạc chọn', path: 'output.silver.selected', detail: 'Dòng bạc được chọn' },
    ],
  },
  shell: {
    label: 'Shell',
    detail: 'Chạy lệnh bash/zsh',
    icon: Terminal,
    color: 'bg-gray-800',
    fields: [
      { key: 'command', label: 'Command', type: 'text', placeholder: 'ví dụ: ~/HAgent/scripts/backup-psql-to-gdrive.sh' },
      { key: 'timeout', label: 'Timeout (giây)', type: 'number', placeholder: '600' },
    ],
    inputs: [
      { label: 'Lệnh shell', path: 'config.command', detail: 'Lệnh chạy trong /bin/zsh -lc' },
      { label: 'Timeout', path: 'config.timeout', detail: 'Số giây tối đa (mặc định 600)' },
    ],
    outputs: [
      { label: 'Thành công', path: 'output.ok', detail: 'true khi exit code = 0' },
      { label: 'Exit code', path: 'output.exit_code', detail: 'Mã thoát của lệnh' },
      { label: 'Stdout', path: 'output.stdout', detail: '4KB cuối stdout' },
      { label: 'Stderr', path: 'output.stderr', detail: '4KB cuối stderr' },
    ],
  },
  drive_backup: {
    label: 'Backup Google Drive',
    detail: 'Zip data/config/workspace rồi upload Drive',
    icon: Cloud,
    color: 'bg-emerald-600',
    fields: [
      { key: 'scope', label: 'Scope', type: 'select', options: [
        { value: 'data', label: 'Data + config (mặc định)' },
        { value: 'config', label: 'Chỉ config' },
        { value: 'workspace', label: 'Workspace nhẹ' },
      ] },
      { key: 'folder_id', label: 'Folder ID', type: 'text', placeholder: 'Để trống = root folder Drive đã cấu hình' },
    ],
    inputs: [
      { label: 'Scope', path: 'config.scope', detail: 'data | config | workspace' },
      { label: 'Folder ID Drive', path: 'config.folder_id', detail: 'ID folder đích; trống = root' },
    ],
    outputs: [
      { label: 'File Drive', path: 'output.file', detail: 'Metadata file đã upload (id, name, webViewLink)' },
      { label: 'Kích thước backup', path: 'output.size', detail: 'Bytes của file zip đã upload' },
    ],
  },
  zalo: {
    label: 'Zalo',
    detail: 'Gửi tin nhắn Zalo',
    icon: MessageCircle,
    color: 'bg-blue-600',
    inputs: [{ label: 'Tin nhắn cần gửi', path: 'input.message', detail: 'Tin nhắn từ node trước; fallback là toàn bộ input dạng JSON' }],
    outputs: [
      { label: 'Kết quả gửi Zalo', path: 'output.sent', detail: 'true khi gửi thành công' },
      { label: 'Chi tiết gửi Zalo', path: 'output.result', detail: 'Metadata trả về từ Zalo bridge' },
    ],
  },
  job_search: {
    label: 'Tìm việc',
    detail: 'Lọc job mới phù hợp',
    icon: BriefcaseBusiness,
    color: 'bg-indigo-600',
    inputs: [{ label: 'Tiêu chí tìm việc', path: 'config.keywords/location/sources', detail: 'Tiêu chí lọc job từ cache' }],
    outputs: [
      { label: 'Bản tin việc làm', path: 'output.message', detail: 'Bản tóm tắt job đã format' },
      { label: 'Danh sách job', path: 'output.jobs', detail: 'Danh sách job khớp' },
      { label: 'Số job', path: 'output.count', detail: 'Số job khớp' },
    ],
  },
  facebook_hot_topics: {
    label: 'Hot Facebook',
    detail: 'Tìm chủ đề đang nổi',
    icon: Flame,
    color: 'bg-rose-500',
    inputs: [{ label: 'Khoảng quét Facebook', path: 'config.days_old/limit', detail: 'Khoảng thời gian và số tin Facebook cần phân tích' }],
    outputs: [
      { label: 'Bản tin chủ đề hot', path: 'output.message', detail: 'Bản tin chủ đề đã format' },
      { label: 'Chủ đề nổi bật', path: 'output.topics', detail: 'Danh sách chủ đề nổi bật' },
      { label: 'Số tin đã đọc', path: 'output.count', detail: 'Số tin đã đọc' },
    ],
  },
  facebook: {
    label: 'Facebook',
    detail: 'Gửi Messenger/Omni',
    icon: MessageCircle,
    color: 'bg-blue-700',
    inputs: [{ label: 'Tin nhắn Facebook', path: 'input.message/content', detail: 'Tin nhắn từ node trước hoặc config.message' }],
    outputs: [
      { label: 'Kết quả gửi Facebook', path: 'output.sent', detail: 'true khi gửi thành công' },
      { label: 'Chi tiết gửi', path: 'output.result', detail: 'Metadata trả về từ Omni sender' },
    ],
  },
  facebook_page_post: {
    label: 'FB Page Post',
    detail: 'Đăng bài lên Page feed',
    icon: Share2,
    color: 'bg-blue-700',
    inputs: [{ label: 'Nội dung bài đăng', path: 'input.message/content', detail: 'Nội dung bài đăng hoặc config.message' }],
    outputs: [
      { label: 'Kết quả đăng Page', path: 'output.posted', detail: 'true khi đăng thành công' },
      { label: 'ID bài viết Page', path: 'output.post_id', detail: 'ID bài viết trên Page' },
    ],
  },
}

const NODE_WIDTH = 248
const NODE_HEIGHT = 88

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
  const panMovedRef = useRef(false)
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
  const [showNodeSearch, setShowNodeSearch] = useState(false)
  const [nodeSearch, setNodeSearch] = useState('')
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [listRunningIds, setListRunningIds] = useState([])
  const [lastRun, setLastRun] = useState(null)
  const [runs, setRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [configDraft, setConfigDraft] = useState('{}')
  const [configError, setConfigError] = useState('')
  const [selectedNodeTab, setSelectedNodeTab] = useState('parameters')
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [panning, setPanning] = useState(null)

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || null
  const selectedNodeParents = selectedNode ? parentNodesFor(selectedNode.id) : []
  const selectedNodeInputVars = selectedNode ? runtimeInputVariables(selectedNode) : []
  const selectedNodeOutputVars = selectedNode ? outputVariables(selectedNode) : []
  const selectedNodeMeta = selectedNode ? nodeMeta(selectedNode) : null
  const selectedRunStep = selectedNode && selectedRun?.steps
    ? selectedRun.steps.find((step) => step.node_id === selectedNode.id)
    : null
  const filteredNodeTypes = Object.entries(NODE_TYPES).filter(([type, meta]) => {
    if (meta.hidden) return false
    const query = nodeSearch.trim()
    if (!query) return true
    const words = query.toLowerCase().split(/\s+/)
    return words.every((word) =>
      [type, meta.label, meta.detail, meta.group]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(word))
    )
  })
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

  function nodeMeta(node) {
    return NODE_TYPES[node?.type] || NODE_TYPES.webhook
  }

  function parentNodesFor(nodeId) {
    return graph.edges
      .filter((edge) => edge.to === nodeId)
      .map((edge) => graph.nodes.find((node) => node.id === edge.from))
      .filter(Boolean)
  }

  function runtimeInputVariables(node) {
    if (!node) return []
    const parents = parentNodesFor(node.id)
    if (parents.length === 0) {
      return [{ label: 'Dữ liệu khởi tạo', path: 'workflow.input', detail: 'Payload ban đầu của lần chạy' }]
    }
    if (parents.length === 1) {
      const parent = parents[0]
      const parentOutput = outputVariables(parent)[0] || { label: 'Output node trước', path: `${parent.id}.output` }
      return [{ ...parentOutput, detail: `Nhận từ ${parent.title || parent.id}` }]
    }
    return parents.map((parent) => ({
      ...(outputVariables(parent)[0] || { label: 'Output node trước', path: `${parent.id}.output` }),
      detail: `Nhận từ ${parent.title || parent.id}`,
    }))
  }

  function outputVariables(node) {
    if (!node) return []
    const meta = nodeMeta(node)
    return (meta.outputs || [{ label: 'Output của node', path: 'output', detail: 'Output của node' }]).map((item) => {
      const suffix = item.path === 'output' ? '' : item.path.replace(/^output\.?/, '.')
      return {
        label: item.label || 'Output của node',
        path: `${node.id}.output${suffix}`,
        detail: item.detail,
      }
    })
  }

  useEffect(() => {
    loadWorkflows()
  }, [])

  useEffect(() => {
    if (screen === 'editor' && graph.nodes.length > 0) {
      const isMobile = window.innerWidth < 640
      if (isMobile) {
        requestAnimationFrame(() => fitWorkflowToView())
      }
    }
  }, [screen])

  useEffect(() => {
    setConfigDraft(JSON.stringify(selectedNode?.config || {}, null, 2))
    setConfigError('')
  }, [selectedId, selectedNode?.config])

  useEffect(() => {
    setSelectedNodeTab('parameters')
  }, [selectedId])

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
    setShowNodeSearch(false)
    setNodeSearch('')
    setFocusedNodeId(null)
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
    setShowNodeSearch(false)
    setNodeSearch('')
    setFocusedNodeId(null)
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

  async function runWorkflowFromList(event, item) {
    event.stopPropagation()
    if (!item?.id || listRunningIds.includes(item.id)) return
    setListRunningIds((current) => [...current, item.id])
    setStatus(`Đang chạy ${item.name}...`)
    try {
      const response = await fetch(`/api/workflows/${item.id}/run`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ input: {} }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setWorkflows((current) => current.map((workflow) => (
        workflow.id === item.id ? { ...workflow, last_run: data } : workflow
      )))
      setStatus(data.status === 'success' ? `${item.name}: chạy thành công` : `${item.name}: chạy lỗi`)
    } catch (error) {
      const failedRun = {
        id: `local-error-${Date.now()}`,
        status: 'error',
        error: error.message,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      }
      setWorkflows((current) => current.map((workflow) => (
        workflow.id === item.id ? { ...workflow, last_run: failedRun } : workflow
      )))
      setStatus(`${item.name}: không chạy được workflow: ${error.message}`)
    } finally {
      setListRunningIds((current) => current.filter((id) => id !== item.id))
    }
  }

  async function toggleSchedule(event, item) {
    event.stopPropagation()
    if (!item?.id) return
    try {
      const response = await fetch(`/api/workflows/${item.id}/schedule`, {
        method: 'PATCH',
        headers: authHeaders(token),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setWorkflows((current) => current.map((w) =>
        w.id === item.id
          ? { ...w, schedule: { ...(w.schedule || {}), enabled: data.schedule_enabled } }
          : w
      ))
      setStatus(data.message)
    } catch (error) {
      setStatus(`Lỗi: ${error.message}`)
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
      y: 120 + (graph.nodes.length % 3) * 150,
      config: defaultNodeConfig(type),
    }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }))
    setSelectedId(null)
    setShowNodePicker(false)
    setShowNodeSearch(false)
    setNodeSearch('')
  }

  function defaultNodeConfig(type) {
    if (type === 'schedule_trigger') return { type: 'daily', time: '09:00' }
    if (type === 'http_request') return { method: 'GET', url: '' }
    if (type === 'set') return { include_input: true, fields: [] }
    if (type === 'format_output') {
      return {
        include_input: true,
        output_field: 'message',
        template: 'Xin chào {{ name }}',
      }
    }
    if (type === 'if') return { field: '', operation: 'equals', equals: true }
    if (type === 'switch') return { field: '', rules: [] }
    if (type === 'merge') return { mode: 'append' }
    if (type === 'wait') return { seconds: 1 }
    if (type === 'code') return { fields: [] }
    if (type === 'webhook_trigger') return { path: '' }
    if (type === 'drive_backup') return { scope: 'data', folder_id: '' }
    if (type === 'shell') return { command: '', timeout: 600 }
    return {}
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
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(nodeId)
    setPanning(null)
    setShowNodePicker(false)
  }

  function startPan(event) {
    if (draggingId || connectionDraft) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panMovedRef.current = false
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    })
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

  function movePan(event) {
    if (!panning) return
    const dx = event.clientX - panning.startX
    const dy = event.clientY - panning.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMovedRef.current = true
    setView((current) => ({
      ...current,
      x: panning.viewX + dx,
      y: panning.viewY + dy,
    }))
  }

  function finishPan() {
    setPanning(null)
  }

  function startConnection(event, nodeId) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
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

  function focusNode(node) {
    if (!node || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scale = Math.max(0.7, Math.min(1, view.scale || 1))
    setFocusedNodeId(node.id)
    setSelectedId(null)
    setShowResults(false)
    setView({
      scale,
      x: rect.width / 2 - (node.x + NODE_WIDTH / 2) * scale,
      y: rect.height / 2 - (node.y + NODE_HEIGHT / 2) * scale,
    })
  }

  function buildOrthogonalPath(x1, y1, x2, y2) {
    if (Math.abs(y2 - y1) < 4) {
      return `M ${x1} ${y1} L ${x2} ${y2}`
    }

    const radius = 18
    const direction = x2 >= x1 ? 1 : -1
    const elbowX = x1 + direction * Math.max(36, Math.abs(x2 - x1) / 2)
    const verticalDirection = y2 >= y1 ? 1 : -1
    const corner = Math.min(radius, Math.abs(y2 - y1) / 2, Math.abs(elbowX - x1), Math.abs(x2 - elbowX))

    return [
      `M ${x1} ${y1}`,
      `L ${elbowX - direction * corner} ${y1}`,
      `Q ${elbowX} ${y1} ${elbowX} ${y1 + verticalDirection * corner}`,
      `L ${elbowX} ${y2 - verticalDirection * corner}`,
      `Q ${elbowX} ${y2} ${elbowX + direction * corner} ${y2}`,
      `L ${x2} ${y2}`,
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

  function workflowScheduleLabel(item = { graph }) {
    const dbSchedule = item.schedule
    if (dbSchedule && dbSchedule.interval_seconds) {
      const hours = Math.round(dbSchedule.interval_seconds / 3600)
      const label = hours >= 24 ? `${hours / 24} ngày 1 lần` : `${hours}h 1 lần`
      if (!dbSchedule.enabled) return label
      return dbSchedule.next_run_at
        ? `${label} · hẹn ${new Date(dbSchedule.next_run_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
        : label
    }
    const currentGraph = item.graph || graph || {}
    const gSchedule = currentGraph.schedule || currentGraph.nodes?.find((node) => (
      node.type === 'trigger' || node.type === 'schedule_trigger'
    ))?.config
    if (!gSchedule || !gSchedule.time) return ''
    if (gSchedule.type === 'daily') {
      const [hourText, minuteText = '00'] = String(gSchedule.time).split(':')
      const hour = Number(hourText)
      const minute = Number(minuteText)
      const timeLabel = minute === 0 ? `${hour}h sáng` : `${hour}h${String(minute).padStart(2, '0')} sáng`
      return `${timeLabel} hằng ngày`
    }
    return gSchedule.label || ''
  }

  function workflowRunLabel(item) {
    const isRunning = listRunningIds.includes(item.id)
    if (isRunning) return { tone: 'running', text: 'Đang chạy', Icon: CirclePlay }
    const run = item.last_run
    if (!run) return { tone: 'idle', text: 'Chưa chạy', Icon: CirclePlay }
    if (run.status === 'success') return { tone: 'success', text: 'Lần cuối thành công', Icon: CheckCircle2 }
    if (run.status === 'running') return { tone: 'running', text: 'Lần cuối đang chạy', Icon: CirclePlay }
    return { tone: 'error', text: 'Lần cuối thất bại', Icon: XCircle }
  }

  function workflowRunClass(tone) {
    if (tone === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    if (tone === 'error') return 'bg-rose-50 text-rose-700 border-rose-100'
    if (tone === 'running') return 'bg-amber-50 text-amber-700 border-amber-100'
    return 'bg-gray-50 text-gray-500 border-gray-100'
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
              workflows.map((item) => {
                const runState = workflowRunLabel(item)
                const RunIcon = runState.Icon
                const isListRunning = listRunningIds.includes(item.id)
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openWorkflow(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openWorkflow(item)
                    }}
                    className="flex w-full items-center justify-between gap-4 border-b border-black/[0.05] px-5 py-4 text-left last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-950">{item.name}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-gray-500">{item.description || 'Chưa có mô tả'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {workflowScheduleLabel(item) ? (
                          <span className={`text-xs font-medium ${item.schedule?.enabled === false ? 'text-gray-400' : 'text-emerald-700'}`}>
                            {item.schedule?.enabled === false ? '⏸ ' : ''}{workflowScheduleLabel(item)}
                          </span>
                        ) : null}
                        <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium ${workflowRunClass(runState.tone)}`}>
                          <RunIcon className={`h-3.5 w-3.5 ${isListRunning ? 'animate-pulse' : ''}`} />
                          {runState.text}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-sm text-gray-400 sm:inline">{item.graph?.nodes?.length || 0} nodes</span>
                      <button
                        type="button"
                        onClick={(event) => toggleSchedule(event, item)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
                          item.schedule?.enabled
                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                        title={item.schedule?.enabled ? 'Tắt lịch' : 'Bật lịch'}
                        aria-label={item.schedule?.enabled ? 'Tắt lịch' : 'Bật lịch'}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          {!item.schedule?.enabled && <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>}
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => runWorkflowFromList(event, item)}
                        disabled={isListRunning}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={isListRunning ? 'Đang chạy' : 'Chạy workflow'}
                        aria-label={isListRunning ? 'Đang chạy workflow' : 'Chạy workflow'}
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })
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
    <div className="relative flex h-full min-h-0 bg-[#f7f7f4] text-gray-950">
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
              onClick={() => {
                setShowNodePicker((value) => !value)
                setNodeSearch('')
              }}
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
            onPointerDown={startPan}
            onPointerMove={(event) => {
              moveNode(event)
              moveConnection(event)
              movePan(event)
            }}
            onPointerUp={() => {
              finishDrag()
              finishConnection()
              finishPan()
            }}
            onPointerCancel={() => {
              finishDrag()
              finishConnection()
              finishPan()
            }}
            onClick={() => {
              if (panMovedRef.current) {
                panMovedRef.current = false
                return
              }
              setSelectedId(null)
              setShowNodePicker(false)
              setShowNodeSearch(false)
            }}
            className={`relative flex-1 overflow-hidden bg-white ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ touchAction: 'none' }}
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
                <path key={edge.id} d={edge.d} fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
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
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="5 5"
                />
              ) : null}
            </svg>

            {graph.nodes.map((node) => {
              const meta = nodeMeta(node)
              const Icon = meta.icon
              const selected = selectedId === node.id
              const focused = focusedNodeId === node.id
              return (
                <div
                  key={node.id}
                  style={{
                    left: toScreenX(node.x),
                    top: toScreenY(node.y),
                    transform: `scale(${view.scale})`,
                    transformOrigin: 'top left',
                  }}
                  onPointerDown={(event) => startDrag(event, node.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    finishDrag()
                    setShowResults(false)
                    setSelectedId(node.id)
                  }}
                  className={`absolute z-10 w-[248px] cursor-move rounded-xl border bg-white shadow-sm ${
                    selected
                      ? 'border-gray-950 ring-2 ring-black/10'
                      : focused
                        ? 'border-amber-500 ring-4 ring-amber-300/30'
                        : 'border-gray-400'
                  }`}
                >
                  <button
                    onPointerUp={(event) => {
                      event.stopPropagation()
                      finishConnection(node.id)
                    }}
                    className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-gray-400 bg-white hover:border-gray-950"
                    title="Input"
                    aria-label="Input"
                  />
                  <button
                    onPointerDown={(event) => startConnection(event, node.id)}
                    className={`absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 ${
                      connectionDraft?.from === node.id ? 'border-gray-950 bg-gray-950' : 'border-gray-400 bg-white hover:border-gray-950'
                    }`}
                    title="Output"
                    aria-label="Output"
                  />

                  <div className="flex h-[88px] items-center gap-3 px-4 py-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${meta.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{node.title}</div>
                      <div className="mt-1 truncate text-xs text-gray-500">{meta.label} · {meta.detail}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {selectedNode ? (
            <aside onClick={(event) => event.stopPropagation()} className="w-80 shrink-0 overflow-auto border-l border-black/[0.06] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-gray-950">{selectedNode.title}</h2>
                  <p className="mt-1 text-xs text-gray-500">{selectedNodeMeta?.label} · {selectedNodeMeta?.detail}</p>
                </div>
                <button onClick={() => setSelectedId(null)} className="text-xs font-medium text-gray-400 hover:text-gray-900">
                  Đóng
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 rounded-xl border border-black/[0.08] bg-gray-50 p-1 text-xs font-medium">
                {[
                  ['parameters', 'Parameters'],
                  ['input', 'Input'],
                  ['output', 'Output'],
                  ['photo', 'Photo'],
                  ['animate', 'Animate'],
                  ['tts', 'TTS'],
                  ['video_ai', 'Video AI'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedNodeTab(id)}
                    className={`h-8 rounded-lg ${selectedNodeTab === id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {selectedNodeTab === 'parameters' ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-500">Tên node</span>
                      <input
                        value={selectedNode.title}
                        onChange={(event) => updateSelected({ title: event.target.value })}
                        className="h-10 w-full rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                      />
                    </label>
                    {selectedNodeMeta?.fields?.length > 0 && (
                      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-gray-50 p-3">
                        <span className="block text-xs font-semibold text-gray-700">Cấu hình nhanh</span>
                        {selectedNodeMeta.fields.map((field) => {
                          const handleChange = (value) => {
                            const newConfig = { ...(selectedNode.config || {}), [field.key]: value }
                            setConfigDraft(JSON.stringify(newConfig, null, 2))
                            updateSelected({ config: newConfig })
                          }
                          return (
                            <label key={field.key} className="block">
                              <span className="mb-1 block text-xs text-gray-500">{field.label}</span>
                              {field.type === 'select' ? (
                                <select
                                  value={selectedNode.config?.[field.key] || ''}
                                  onChange={(e) => handleChange(e.target.value)}
                                  className="h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-sm outline-none focus:border-black/25"
                                >
                                  {(field.options || []).map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={field.type || 'text'}
                                  value={selectedNode.config?.[field.key] || ''}
                                  placeholder={field.placeholder || ''}
                                  onChange={(e) => handleChange(e.target.value)}
                                  className="h-10 w-full rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                                />
                              )}
                            </label>
                          )
                        })}
                      </div>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-500">Config JSON</span>
                      <textarea
                        value={configDraft}
                        onChange={(event) => {
                          setConfigDraft(event.target.value)
                          if (configError) setConfigError('')
                        }}
                        className="h-56 w-full rounded-xl border border-black/[0.08] p-3 font-mono text-xs leading-5 outline-none focus:border-black/25"
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
                ) : null}

                {selectedNodeTab === 'input' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-gray-950">Connection input</div>
                        <div className="text-[11px] text-gray-400">
                          {selectedNodeParents.length ? `${selectedNodeParents.length} node trước` : 'Từ Run'}
                        </div>
                      </div>
                      <div className="mt-2 space-y-2">
                        {selectedNodeInputVars.map((item) => (
                          <div key={item.path} className="rounded-lg bg-white p-2">
                            <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                            <code className="mt-1 block break-all rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-700">
                              {item.path}
                            </code>
                            <div className="mt-1 text-[11px] leading-4 text-gray-500">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950">Input schema</div>
                      <div className="mt-2 space-y-2">
                        {(selectedNodeMeta?.inputs || []).map((item) => (
                          <div key={item.path} className="rounded-lg border border-black/[0.06] p-2">
                            <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                            <code className="mt-1 block break-all font-mono text-[11px] text-gray-600">{item.path}</code>
                            <div className="mt-1 text-[11px] leading-4 text-gray-500">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="mb-2 text-xs font-semibold text-gray-950">Input thực tế lần chạy</div>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-3 text-[11px] leading-5 text-gray-100">
                        {formatJson(selectedRunStep?.input) || 'Chưa có dữ liệu run cho node này.'}
                      </pre>
                    </section>
                  </div>
                ) : null}

                {selectedNodeTab === 'output' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950">Output variables</div>
                      <div className="mt-2 space-y-2">
                        {selectedNodeOutputVars.map((item) => (
                          <div key={item.path} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                            <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                            <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-indigo-700">
                              {item.path}
                            </code>
                            <div className="mt-1 text-[11px] leading-4 text-gray-500">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="mb-2 text-xs font-semibold text-gray-950">Output thực tế lần chạy</div>
                      {selectedRunStep?.error && (
                        <div className="mb-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{selectedRunStep.error}</div>
                      )}
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-3 text-[11px] leading-5 text-gray-100">
                        {formatJson(selectedRunStep?.output) || 'Chưa có dữ liệu run cho node này.'}
                      </pre>
                    </section>
                  </div>
                ) : null}

                {selectedNodeTab === 'photo' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950 mb-3">Generate Photo</div>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Prompt</span>
                        <textarea
                          placeholder="Mô tả ảnh muốn tạo..."
                          className="w-full h-24 rounded-xl border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Model</span>
                        <select className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25">
                          <option>flux-dev</option>
                          <option>flux-schnell</option>
                          <option>sd3</option>
                        </select>
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Size</span>
                        <select className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25">
                          <option>1024x1024</option>
                          <option>1280x720</option>
                          <option>720x1280</option>
                        </select>
                      </label>
                      <button className="w-full h-10 rounded-xl bg-gray-950 text-sm font-medium text-white">
                        Generate
                      </button>
                    </section>
                  </div>
                ) : null}

                {selectedNodeTab === 'animate' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950 mb-3">Image to Video</div>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Image URL</span>
                        <input
                          type="text"
                          placeholder="https://..."
                          className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Motion Prompt</span>
                        <textarea
                          placeholder="Mô tả chuyển động..."
                          className="w-full h-20 rounded-xl border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Duration (s)</span>
                        <input
                          type="number"
                          defaultValue={3}
                          min={1}
                          max={10}
                          className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <button className="w-full h-10 rounded-xl bg-gray-950 text-sm font-medium text-white">
                        Generate Video
                      </button>
                    </section>
                  </div>
                ) : null}

                {selectedNodeTab === 'tts' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950 mb-3">Text to Speech</div>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Text</span>
                        <textarea
                          placeholder="Nhập văn bản cần đọc..."
                          className="w-full h-32 rounded-xl border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Voice</span>
                        <select className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25">
                          <option>vi-VN-HoaiMyNeural</option>
                          <option>vi-VN-NamMinhNeural</option>
                          <option>en-US-JennyNeural</option>
                        </select>
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Speed</span>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          defaultValue="1"
                          className="w-full"
                        />
                      </label>
                      <button className="w-full h-10 rounded-xl bg-gray-950 text-sm font-medium text-white">
                        Generate Audio
                      </button>
                    </section>
                  </div>
                ) : null}

                {selectedNodeTab === 'video_ai' ? (
                  <div className="space-y-4">
                    <section className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="text-xs font-semibold text-gray-950 mb-3">AI Video Script</div>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Topic</span>
                        <input
                          type="text"
                          placeholder="Chủ đề video..."
                          className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Style</span>
                        <select className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25">
                          <option>Educational</option>
                          <option>Entertainment</option>
                          <option>Marketing</option>
                          <option>Tutorial</option>
                        </select>
                      </label>
                      <label className="block mb-3">
                        <span className="mb-1 block text-xs text-gray-500">Duration (min)</span>
                        <input
                          type="number"
                          defaultValue={1}
                          min={1}
                          max={10}
                          className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-sm outline-none focus:border-black/25"
                        />
                      </label>
                      <button className="w-full h-10 rounded-xl bg-gray-950 text-sm font-medium text-white">
                        Generate Script
                      </button>
                    </section>
                  </div>
                ) : null}
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
                        <div className="mb-2 text-xs font-semibold text-gray-950">Dữ liệu qua từng node</div>
                        {(selectedRun.steps || []).length === 0 ? (
                          <div className="rounded-xl border border-dashed border-black/[0.12] bg-white px-3 py-4 text-xs text-gray-500">
                            Run này chưa có log input/output từng node.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {(selectedRun.steps || []).map((step) => (
                              <div key={step.id || step.node_id} className="rounded-xl border border-black/[0.08] bg-white p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-gray-900">
                                      {step.node_title || step.node_id}
                                    </div>
                                    <div className="mt-0.5 truncate text-[11px] text-gray-400">{step.node_type || step.node_id}</div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    step.status === 'success'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : step.status === 'running'
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-rose-50 text-rose-700'
                                  }`}
                                  >
                                    {step.status}
                                  </span>
                                </div>
                                {step.error && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{step.error}</div>}
                                <div className="mt-3 space-y-2">
                                  <div>
                                    <div className="mb-1 text-[11px] font-semibold text-emerald-700">Input</div>
                                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-emerald-50 p-2 text-[11px] leading-5 text-gray-700">
                                      {formatJson(step.input) || '(trống)'}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-[11px] font-semibold text-indigo-700">Output</div>
                                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-indigo-50 p-2 text-[11px] leading-5 text-gray-700">
                                      {formatJson(step.output) || '(trống)'}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

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
            <span>
              {status || `${graph.nodes.length} nodes · ${graph.edges.length} links${workflowScheduleLabel() ? ` · ${workflowScheduleLabel()}` : ''}`}
            </span>
            {lastRun && (
              <span className={lastRun.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}>
                Run gần nhất: {lastRun.status}
              </span>
            )}
          </div>
        </footer>
      </section>

      {showNodePicker ? (
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(event) => event.stopPropagation()} className="absolute inset-x-4 bottom-4 z-20 flex max-h-[50vh] flex-col rounded-2xl border border-black/[0.08] bg-white p-3 shadow-xl sm:inset-auto sm:right-5 sm:top-5 sm:w-72 sm:max-h-[calc(100vh-130px)]">
          <div className="mb-2 shrink-0 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Thêm node</div>
          <div className="relative mb-3 shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={nodeSearch}
              onChange={(event) => setNodeSearch(event.target.value)}
              placeholder="Search node..."
              className="h-10 w-full rounded-xl border border-black/[0.08] bg-white pl-9 pr-3 text-sm outline-none focus:border-black/25"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredNodeTypes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/[0.12] px-3 py-4 text-center text-xs text-gray-500">
                Không tìm thấy node.
              </div>
            ) : null}
            {filteredNodeTypes.map(([type, meta]) => {
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
                    <span className="block text-xs text-gray-500">
                      {meta.group ? `${meta.group} · ` : ''}{meta.detail}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
