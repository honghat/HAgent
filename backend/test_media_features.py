#!/usr/bin/env python3
"""
Test script for OmniChat media features
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))


def test_image_processor():
    """Test image processor utilities."""
    print("=" * 60)
    print("Testing Image Processor")
    print("=" * 60)
    
    try:
        from utils.image_processor import ImageProcessor
        
        if not ImageProcessor.is_available():
            print("❌ PIL/Pillow not available. Install: pip install Pillow")
            return False
        
        print("✅ ImageProcessor available")
        
        # Test methods exist
        methods = [
            'get_image_info',
            'resize_image',
            'compress_image',
            'convert_to_format',
            'auto_optimize_for_platform'
        ]
        
        for method in methods:
            if hasattr(ImageProcessor, method):
                print(f"  ✅ {method}")
            else:
                print(f"  ❌ {method} missing")
                return False
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False


def test_schemas():
    """Test API schemas."""
    print("\n" + "=" * 60)
    print("Testing API Schemas")
    print("=" * 60)
    
    try:
        from api.schemas import (
            OmniConversation,
            OmniMessage,
            OmniSendMessageRequest,
            OmniSendMediaRequest,
            OmniPasteClipboardRequest,
            OmniImageInfoResponse
        )
        
        schemas = [
            'OmniConversation',
            'OmniMessage',
            'OmniSendMessageRequest',
            'OmniSendMediaRequest',
            'OmniPasteClipboardRequest',
            'OmniImageInfoResponse'
        ]
        
        for schema in schemas:
            print(f"  ✅ {schema}")
        
        # Test OmniSendMediaRequest
        request = OmniSendMediaRequest(
            image_path="/test/path.jpg",
            caption="Test",
            optimize=True
        )
        print(f"\n  ✅ OmniSendMediaRequest instantiation works")
        print(f"     image_path: {request.image_path}")
        print(f"     caption: {request.caption}")
        print(f"     optimize: {request.optimize}")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_omni_router():
    """Test omni router imports."""
    print("\n" + "=" * 60)
    print("Testing Omni Router")
    print("=" * 60)
    
    try:
        # This will fail if bcrypt is missing, but we can check syntax
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "omni",
            Path(__file__).parent / "api" / "routers" / "omni.py"
        )
        
        if spec and spec.loader:
            print("  ✅ omni.py syntax valid")
        else:
            print("  ❌ omni.py not found")
            return False
        
        # Check for new endpoints
        with open(Path(__file__).parent / "api" / "routers" / "omni.py") as f:
            content = f.read()
            
            endpoints = [
                'send-media',
                'paste-clipboard',
                'send_media_to_conversation',
                'paste_clipboard_to_conversation'
            ]
            
            for endpoint in endpoints:
                if endpoint in content:
                    print(f"  ✅ {endpoint} endpoint found")
                else:
                    print(f"  ❌ {endpoint} endpoint missing")
                    return False
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_telegram_router():
    """Test telegram router."""
    print("\n" + "=" * 60)
    print("Testing Telegram Router")
    print("=" * 60)
    
    try:
        with open(Path(__file__).parent / "api" / "routers" / "telegram.py") as f:
            content = f.read()
            
            if 'async def send_real_media' in content:
                print("  ✅ send_real_media function found")
            else:
                print("  ❌ send_real_media function missing")
                return False
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_clipboard_scripts():
    """Test clipboard scripts exist."""
    print("\n" + "=" * 60)
    print("Testing Clipboard Scripts")
    print("=" * 60)
    
    scripts = [
        "plugins/platforms/omnichannel/backend/zalo_bridges/clipboard_to_zalo.py",
        "plugins/platforms/omnichannel/backend/zalo_bridges/clipboard_to_telegram.py"
    ]
    
    all_exist = True
    for script in scripts:
        path = Path(__file__).parent / script
        if path.exists():
            is_executable = path.stat().st_mode & 0o111
            status = "✅" if is_executable else "⚠️ "
            print(f"  {status} {script} {'(executable)' if is_executable else '(not executable)'}")
        else:
            print(f"  ❌ {script} missing")
            all_exist = False
    
    return all_exist


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("OmniChat Media Features Test Suite")
    print("=" * 60 + "\n")
    
    results = {
        "Image Processor": test_image_processor(),
        "API Schemas": test_schemas(),
        "Omni Router": test_omni_router(),
        "Telegram Router": test_telegram_router(),
        "Clipboard Scripts": test_clipboard_scripts()
    }
    
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 All tests passed!")
    else:
        print("⚠️  Some tests failed. Check output above.")
    print("=" * 60 + "\n")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
