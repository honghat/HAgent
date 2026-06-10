/**
 * useAgentStream — Subscribe SSE từ /api/agent/stream
 *
 * Tự động kết nối khi mount, reconnect khi mất kết nối, cleanup khi unmount.
 *
 * @param {function} onEvent - callback(event) nhận mọi event từ agent
 * @param {object} options
 * @param {boolean} options.enabled - bật/tắt stream (default: true)
 *
 * @example
 * useAgentStream((event) => {
 *   if (event.type === 'agent.data' && event.tab === 'jobs') {
 *     setJobs(event.payload);
 *   }
 * });
 */
import { useEffect, useRef } from 'react';

const AGENT_STREAM_URL = '/api/agent/stream';
const RECONNECT_DELAY = 3000; // ms

export function useAgentStream(onEvent, { enabled = true } = {}) {
  const esRef = useRef(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimer = useRef(null);

  // Luôn giữ onEvent ref mới nhất để tránh stale closure
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem('token') || '';
    if (!token) return;

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const url = `${AGENT_STREAM_URL}?t=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEventRef.current?.(event);
        } catch {
          // ignore parse error
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect sau 3s
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled]);
}
