#!/usr/bin/env python3
"""
Omnichannel Hub - Startup script

This script:
1. Creates environment variables from config.env
2. Starts the FastAPI backend server on port 8080
3. Runs in background and manages lifecycle
"""

import subprocess
import sys
import os
from pathlib import Path

# Add parent to path for imports
SCRIPT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))


def load_env_from_file(env_file: Path) -> dict:
    """Load environment variables from .env file."""
    env_vars = {}
    
    if not env_file.exists():
        print(f"⚠️  Environment file not found: {env_file}")
        return env_vars
    
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            
            # Parse KEY=VALUE format
            if '=' in line:
                key, _, value = line.partition('=')
                key = key.strip()
                value = value.strip()
                
                # Remove inline comments
                if ' #' in value:
                    value = value.split(' #')[0].strip()
                
                env_vars[key] = value
    
    return env_vars


def start_backend_server(env_file: Path):
    """Start FastAPI backend server."""
    
    print("=" * 60)
    print("🚀 OMNICHANNEL HUB BACKEND SERVER")
    print("=" * 60)
    print()
    
    # Load environment from config file
    env_vars = load_env_from_file(env_file)
    
    if not env_vars:
        print("❌ No environment variables loaded. Check config.env file.")
        return False
    
    print("📄 Environment variables loaded:")
    for key, value in env_vars.items():
        # Redact sensitive values
        redacted_value = "*" * min(8, len(value)) if len(value) <= 8 else value[:3] + "***" + value[-3:]
        print(f"   {key}={redacted_value}")
    print()
    
    # Set environment variables
    for key, value in env_vars.items():
        os.environ[key] = value
    
    # Check if FastAPI dependencies are installed
    try:
        import fastapi
        import uvicorn
        print("✅ FastAPI and Uvicorn installed")
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print()
        print("   Installing...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "fastapi", "uvicorn[standard]"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✅ Dependencies installed successfully")
        else:
            print(f"❌ Failed to install dependencies: {result.stderr}")
            return False
    
    print()
    print("📡 Starting backend server...")
    print()
    
    print("✅ Backend server starting!")
    print()
    print("📍 API Endpoints:")
    print("   GET    /api/v1/omni/conversations      - List all conversations")
    print("   POST   /api/v1/omni/conversations/{chat_id}/messages  - Send message")
    print("   GET    /api/v1/omni/conversations/{chat_id}/messages?limit=50 - Chat history")
    print("   POST   /api/v1/omni/conversations/read-all         - Mark all as read")
    print("   POST   /api/v1/auth/zalo/qrcode/init              - Init QR login")
    print("   GET    /api/v1/auth/zalo/qrcode/poll/{chat_id}    - Poll QR status")
    print()
    print(f"🌐 Server running at http://{os.environ.get('OMNICHANNEL_HOST', '0.0.0.0')}:{os.environ.get('OMNICHANNEL_API_PORT', 8080)}")
    print()
    print("=" * 60)
    print("✅ OMNICHANNEL HUB READY!")
    print("=" * 60)
    print()

    # Run Uvicorn in the current process so PM2 manages the real server
    # lifecycle instead of a short-lived wrapper around a child process.
    try:
        uvicorn.run(
            "api_server:app",
            host=os.environ.get("OMNICHANNEL_HOST", "0.0.0.0"),
            port=int(os.environ.get("OMNICHANNEL_API_PORT", "8080")),
        )
        return True
        
    except Exception as e:
        print(f"❌ Failed to start backend server: {e}")
        return False


def main():
    """Main entry point."""
    
    # Find config file
    config_file = Path(__file__).parent / "config.env"
    
    if not config_file.exists():
        print(f"❌ Configuration file not found: {config_file}")
        print()
        print("Please create the config file first:")
        print(f"   touch {config_file}")
        print()
        print("Or copy from template:")
        print(f"   cp {config_file}.example {config_file}")
        return False
    
    return start_backend_server(config_file)


if __name__ == "__main__":
    import time
    main()
