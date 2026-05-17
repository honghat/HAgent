// ============================================================
// OmniChat API Proxy Routes
// ============================================================
// Purpose: Proxy requests to Omnichannel backend API server
// Author: HAgent Prime
// Date: May 2026
// ============================================================

import { createProxyMiddleware } from 'http-proxy-middleware';

// Configure proxy for OmniChat backend
export function configureOmniChatRoutes(app, server) {
    // Proxy all OmniChat API routes to backend server (port 8080)
    const omniChatBackendUrl = 'http://127.0.0.1:8080';
    
    app.use('/api/omni/', createProxyMiddleware({
        target: omniChatBackendUrl,
        changeOrigin: true,
        ws: true, // WebSocket support
        secure: false,
        logger: (req, res) => {
            console.log(`[OmniChat] ${req.method} ${req.url}`);
        },
        onError: (err, req, res) => {
            console.error('[OmniChat Proxy Error]', err);
            
            // Return proper error response to frontend
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Proxy error',
                    message: 'Failed to connect to OmniChat backend server'
                });
            }
        }
    }));
    
    // Health check endpoint
    app.get('/api/omni/status', (req, res) => {
        try {
            const healthResponse = fetch(`${omniChatBackendUrl}/api/status`);
            healthResponse.then(res2 => res.json(res2)).catch(e => {
                console.error('OmniChat status check failed:', e);
                res.status(503).json({ healthy: false, error: 'OmniChat backend not running' });
            });
        } catch (error) {
            console.error('[OmniChat] Health check failed:', error);
            res.status(503).json({ 
                healthy: false,
                message: 'OmniChat backend server is not running'
            });
        }
    });
}

// Alternative: Simple route handling without proxy middleware
export function addOmniChatRoutes(app) {
    app.use('/api/omni/*', (req, res, next) => {
        console.log(`[OmniChat Router] ${req.method} ${req.path}`);
        
        // Check if OmniChat backend is running
        fetch('http://127.0.0.1:8080/api/status')
            .then(res => res.json())
            .then(backendStatus => {
                if (backendStatus.connected) {
                    // Proxy request to backend
                    const proxyReq = fetch(req.url, {
                        method: req.method,
                        headers: req.headers,
                        body: req.body
                    });
                    
                    return new Promise((resolve, reject) => {
                        proxyReq.then(resp => resolve(resp))
                            .catch(error => reject(error));
                    })
                    .then(resp => {
                        // Copy response to original request
                        const reader = resp.body.getReader();
                        const dest = new WritableStream({
                            write(chunk, _ctx) { res.write(chunk); },
                            close() { res.close(); }
                        });
                        
                        reader.read().then(({ done, value }) => {
                            if (done) return;
                            res.write(value);
                            reader.read();
                        }).catch(reject);
                    });
                } else {
                    // Backend not running - return error
                    res.status(503).json({
                        healthy: false,
                        message: 'OmniChat backend server is not running',
                        startup_info: {
                            command: './omnichannel-backend-migration.sh start',
                            status: 'not_running'
                        }
                    });
                }
            })
            .catch(err => {
                console.error('[OmniChat Router] Proxy error:', err);
                res.status(503).json({ 
                    healthy: false, 
                    message: 'Failed to proxy to OmniChat backend',
                    debug: err.message 
                });
            });
    });
}
