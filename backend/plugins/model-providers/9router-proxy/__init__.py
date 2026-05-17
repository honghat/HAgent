# 9Router Proxy for HAgent
# Forward requests to localhost:20128

import http.client

def get_9router_info():
    """Get 9Router dashboard info"""
    return {
        "name": "9Router",
        "enabled": True,
        "version": "latest",
        "dashboard_url": "http://localhost:20128/dashboard",
        "api_url": "http://localhost:20128/v1"
    }

def proxy_request(path):
    """Proxy request to 9Router backend"""
    try:
        conn = http.client.HTTPConnection("localhost", 20128)
        conn.request("GET", path)
        response = conn.getresponse()
        return {
            "status": response.status,
            "headers": dict(response.getheaders()),
            "body": response.read().decode('utf-8', errors='ignore')
        }
    except Exception as e:
        return {"error": str(e)}
