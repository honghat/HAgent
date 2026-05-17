export function useOmnichannel() {
  return {
    sessions: [],
    messages: [],
    activeSession: null,
    setActiveSession: () => {},
    sendMessage: async () => {},
    loading: false,
    error: null,
  }
}
