/**
 * AgentStore — React Context lưu trữ data agent push xuống toàn bộ app.
 *
 * Bọc App.jsx với <AgentStoreProvider> để mọi Hub có thể dùng
 * useAgentStore() mà không cần prop-drilling.
 *
 * Các tab subscribe:
 *   state.jobs        — dữ liệu job hunter
 *   state.video       — tiến độ video pipeline
 *   state.system      — thông số hệ thống (CPU, RAM...)
 *   state.automation  — kết quả automation
 *   state.notifications — thông báo agent
 *   state.agentStatus — trạng thái agent (idle | running | thinking)
 *
 * Agent backend push event dạng:
 *   { type: "agent.data", tab: "jobs", payload: [...] }
 *   { type: "agent.notification", message: "Xong rồi!" }
 *   { type: "agent.progress", tab: "video", percent: 72 }
 *   { type: "agent.status", status: "thinking" }
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
} from 'react';
import { useAgentStream } from '../hooks/useAgentStream';

// ─── State shape ──────────────────────────────────────────────
const initialState = {
  jobs: [],
  video: null,
  system: null,
  automation: [],
  notifications: [],
  agentStatus: 'idle', // idle | running | thinking | error
  progress: {},        // { [tab]: 0-100 }
  connected: false,
  activeJobs: {},      // { [job_id]: { kind, id, status, progress, result, error } }
  currentTool: null,   // { name, emoji, toolset, startedAt } khi agent đang gọi tool
};

// ─── Reducer ──────────────────────────────────────────────────
function agentReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.connected };

    case 'agent.connected':
      return { ...state, connected: true };

    case 'agent.data': {
      const { tab, payload } = action;
      if (!tab) return state;
      return { ...state, [tab]: payload };
    }

    case 'agent.notification':
      return {
        ...state,
        notifications: [
          { id: Date.now(), message: action.message, ts: action.ts },
          ...state.notifications.slice(0, 49), // giữ tối đa 50
        ],
      };

    case 'agent.progress':
      return {
        ...state,
        progress: { ...state.progress, [action.tab]: action.percent },
      };

    case 'agent.status':
      return { ...state, agentStatus: action.status };

    case 'agent.job': {
      if (!action.id) return state;
      const prev = state.activeJobs[action.id] || {};
      return {
        ...state,
        activeJobs: { ...state.activeJobs, [action.id]: { ...prev, ...action } },
      };
    }

    case 'agent.tool_call': {
      // phase: start | done | error
      if (action.phase === 'start') {
        return { ...state, currentTool: { name: action.name, emoji: action.emoji, toolset: action.toolset, startedAt: action.ts } };
      }
      if (action.phase === 'done' || action.phase === 'error') {
        return { ...state, currentTool: null };
      }
      return state;
    }

    case 'CLEAR_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────
const AgentStoreContext = createContext(null);

export function AgentStoreProvider({ children }) {
  const [state, dispatch] = useReducer(agentReducer, initialState);

  const handleEvent = useCallback((event) => {
    dispatch(event); // event.type khớp trực tiếp với action.type
  }, []);

  useAgentStream(handleEvent);

  const clearNotification = useCallback((id) => {
    dispatch({ type: 'CLEAR_NOTIFICATION', id });
  }, []);

  return (
    <AgentStoreContext.Provider value={{ state, dispatch, clearNotification }}>
      {children}
    </AgentStoreContext.Provider>
  );
}

// ─── Hook tiện ích ────────────────────────────────────────────
export function useAgentStore() {
  const ctx = useContext(AgentStoreContext);
  if (!ctx) throw new Error('useAgentStore must be used within AgentStoreProvider');
  return ctx;
}

/** Push event thủ công từ frontend (test / debug) */
export function useBroadcast() {
  const { dispatch } = useAgentStore();
  return dispatch;
}
