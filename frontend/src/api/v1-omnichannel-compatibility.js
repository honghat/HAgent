// ============================================================
// V1 Omnichannel API Compatibility Layer
// ============================================================
// Purpose: Bridge frontend paths with backend v1 API endpoints
// Author: HAgent Prime
// Date: May 2026
// ============================================================

const API_BASE = '/api/v1';

// Override omniApi methods to use v1 paths
export function applyV1Compatibility() {
    // Helper function to add compatibility layer
    const makeOmniAPI = (originalApi) => ({
        getConversations: async (platform) => {
            console.log('[V1 API] Conversations request:', platform || 'all');
            
            // First try new path, then fallback to v1
            let response;
            try {
                response = await fetch(`${API_BASE}/omni/conversations?platform=${platform}`);
            } catch (error) {
                console.log('[V1 API] Conversations fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        sendMessage: async (chatId, message, replyTo = null) => {
            console.log('[V1 API] Sending message to:', chatId);

            const payload = { chatId, message };
            if (replyTo) payload.replyTo = replyTo;
            
            // Try new path first, then v1
            let response;
            try {
                response = await fetch(`${API_BASE}/omni/conversations/${chatId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } catch (error) {
                console.log('[V1 API] sendMessage fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        getChatHistory: async (chatId, limit = 50) => {
            console.log('[V1 API] Loading history for:', chatId);

            const params = new URLSearchParams({ limit });
            let response;
            try {
                response = await fetch(`${API_BASE}/omni/conversations/${chatId}/messages?${params}`);
            } catch (error) {
                console.log('[V1 API] getChatHistory fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        markAllAsRead: async () => {
            console.log('[V1 API] Marking all conversations as read');

            let response;
            try {
                response = await fetch(`${API_BASE}/omni/conversations/read-all`, { method: "POST" });
            } catch (error) {
                console.log('[V1 API] markAllAsRead fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        initZaloQrLogin: async () => {
            console.log('[V1 API] Initiating Zalo QR login');

            let response;
            try {
                // Try v1 path first
                response = await fetch(`${API_BASE}/auth/zalo/qrcode/init`, { method: "POST" });
            } catch (error) {
                console.log('[V1 API] initZaloQrLogin fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        pollZaloQrStatus: async (chatId) => {
            console.log('[V1 API] Polling QR status for:', chatId);

            let response;
            try {
                response = await fetch(`${API_BASE}/auth/zalo/qrcode/poll/${chatId}`, { method: "GET" });
            } catch (error) {
                console.log('[V1 API] pollZaloQrStatus fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        getStatus: async () => {
            console.log('[V1 API] Checking platform status');

            let response;
            try {
                // Try v1 path first  
                response = await fetch(`${API_BASE}/status`, { method: "GET" });
            } catch (error) {
                console.log('[V1 API] getStatus fallback failed:', error.message);
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            return await response.json();
        },
        
        // Track status internally for UI indicators
        _status: "initializing"
    });

    return makeOmniAPI;
}

// Export for use in components
export const OmniChatV1Bridge = {
    applyCompatibility: () => {
        console.log('[OmniChat] Applying V1 API compatibility layer...');
        return applyV1Compatibility();
    }
};

console.log('[V1 Bridge] OmniChat V1 compatibility module loaded');
