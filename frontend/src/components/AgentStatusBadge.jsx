import { useAgentStore } from '../lib/AgentStore.jsx'

const STATUS_LABEL = {
  idle: 'sẵn sàng',
  running: 'đang chạy',
  thinking: 'đang nghĩ',
  error: 'lỗi',
}

const STATUS_DOT = {
  idle: 'bg-emerald-500',
  running: 'bg-amber-500 animate-pulse',
  thinking: 'bg-sky-500 animate-pulse',
  error: 'bg-red-500',
}

export default function AgentStatusBadge({ tab }) {
  const { state, clearNotification } = useAgentStore()
  const lastNotif = state.notifications[0]
  const progress = tab && state.progress[tab] != null ? state.progress[tab] : null

  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.connected ? 'bg-emerald-500' : 'bg-gray-300'}`}
        title={state.connected ? 'SSE connected' : 'SSE offline'} />
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[state.agentStatus] || 'bg-gray-300'}`}
        title={`Agent: ${STATUS_LABEL[state.agentStatus] || state.agentStatus}`} />
      {state.agentStatus !== 'idle' && (
        <span className="text-gray-500">{STATUS_LABEL[state.agentStatus] || state.agentStatus}</span>
      )}
      {state.currentTool && (
        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700" title={`Đang gọi ${state.currentTool.toolset || ''}`}>
          {state.currentTool.emoji || '🔧'} {state.currentTool.name}
        </span>
      )}
      {progress != null && (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
          {progress}%
        </span>
      )}
      {lastNotif && (
        <button
          onClick={() => clearNotification(lastNotif.id)}
          className="ml-1 max-w-[180px] truncate rounded-full bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-700 hover:bg-purple-100"
          title={lastNotif.message}
        >
          {lastNotif.message}
        </button>
      )}
    </div>
  )
}
