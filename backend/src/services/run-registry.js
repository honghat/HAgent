const activeRuns = new Map();

function createAbortError(reason = 'Run aborted') {
  const error = new Error(reason);
  error.name = 'AbortError';
  return error;
}

export function registerSessionRun(sessionId, metadata = {}) {
  if (!sessionId) throw new Error('sessionId is required');

  const existing = activeRuns.get(sessionId);
  if (existing && !existing.controller.signal.aborted) {
    existing.controller.abort('Replaced by a newer run');
  }

  const controller = new AbortController();
  const entry = {
    sessionId,
    controller,
    startedAt: Date.now(),
    metadata,
  };

  activeRuns.set(sessionId, entry);
  return entry;
}

export function getSessionRun(sessionId) {
  return activeRuns.get(sessionId) || null;
}

export function stopSessionRun(sessionId, reason = 'Stopped by user') {
  const entry = activeRuns.get(sessionId);
  if (!entry) return { stopped: false, reason: 'not_found' };
  if (!entry.controller.signal.aborted) {
    entry.controller.abort(reason);
  }
  return { stopped: true, reason: 'aborted' };
}

export function clearSessionRun(sessionId, controller = null) {
  const entry = activeRuns.get(sessionId);
  if (!entry) return false;
  if (controller && entry.controller !== controller) return false;
  activeRuns.delete(sessionId);
  return true;
}

export function throwIfAborted(signal, reason = 'Run aborted') {
  if (signal?.aborted) {
    throw createAbortError(signal.reason || reason);
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted/i.test(error?.message || '');
}
