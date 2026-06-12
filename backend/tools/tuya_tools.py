"""Tuya Smart Device Control Tools."""

import os
import time
import json
import hashlib
import hmac
import requests
from typing import Dict, Any, Optional
from .registry import registry, tool_error, tool_result

# Cấu hình Tuya API
TUYA_CONFIG = {
    "base_url": "https://openapi-sg.iotbing.com",  # Singapore region
    "client_id": os.getenv("TUYA_CLIENT_ID", "jd3uca5tthyqaypvjr88"),
    "client_secret": os.getenv("TUYA_CLIENT_SECRET", "deff5b48842b4f3d8f825877321af62f"),
    "sign_method": "HMAC-SHA256"
}

# Token cache - lưu trong bộ nhớ
_token_cache = {
    "access_token": None,
    "expire_time": 0,  # Unix timestamp khi token hết hạn
    "refresh_token": None
}

# Danh sách thiết bị
DEVICES = {
    "fan": {
        "id": "a37f1fbdb1c7c71cc8j007",
        "name": "Quạt",
        "icon": "🌀",
        "switch_code": "switch_1"
    },
    "quat": {
        "id": "a37f1fbdb1c7c71cc8j007",
        "name": "Quạt",
        "icon": "🌀",
        "switch_code": "switch_1"
    },
    "computer": {
        "id": "a36dae1f494a7136dfyqwe",
        "name": "Máy tính",
        "icon": "💻",
        "switch_code": "switch_1"
    },
    "maytinh": {
        "id": "a36dae1f494a7136dfyqwe",
        "name": "Máy tính",
        "icon": "💻",
        "switch_code": "switch_1"
    },
    "pc": {
        "id": "a36dae1f494a7136dfyqwe",
        "name": "Máy tính",
        "icon": "💻",
        "switch_code": "switch_1"
    }
}


def calc_sign(client_id: str, secret: str, timestamp: str, access_token: str, 
              method: str, url_path: str, body: dict = None) -> str:
    """Tính toán chữ ký HMAC-SHA256 cho Tuya API."""
    if body:
        body_str = json.dumps(body, separators=(',', ':'))
        content_sha256 = hashlib.sha256(body_str.encode('utf-8')).hexdigest()
    else:
        content_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    
    headers_str = ""
    string_to_sign = f"{method}\n{content_sha256}\n{headers_str}\n{url_path}"
    nonce = ""
    sign_str = client_id + access_token + timestamp + nonce + string_to_sign
    
    sign = hmac.new(
        secret.encode('utf-8'),
        sign_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest().upper()
    
    return sign


def get_access_token(force_refresh: bool = False) -> Dict[str, Any]:
    """Tự động lấy token từ Tuya API và thực hiện caching."""
    global _token_cache
    current_time = int(time.time())
    if not force_refresh and _token_cache["access_token"]:
        if current_time < _token_cache["expire_time"] - 300:
            return {
                "success": True,
                "access_token": _token_cache["access_token"]
            }
    
    try:
        url_path = "/v1.0/token?grant_type=1"
        url = f"{TUYA_CONFIG['base_url']}{url_path}"
        timestamp = str(int(time.time() * 1000))
        
        content_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        string_to_sign = f"GET\n{content_sha256}\n\n{url_path}"
        sign_str = TUYA_CONFIG["client_id"] + timestamp + string_to_sign
        
        sign = hmac.new(
            TUYA_CONFIG["client_secret"].encode('utf-8'),
            sign_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest().upper()
        
        headers = {
            "client_id": TUYA_CONFIG["client_id"],
            "sign": sign,
            "t": timestamp,
            "sign_method": TUYA_CONFIG["sign_method"]
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response_data = response.json()
        
        if response.status_code == 200 and response_data.get("success", False):
            result = response_data.get("result", {})
            access_token = result.get("access_token")
            expire_time = result.get("expire_time", 7200)
            refresh_token = result.get("refresh_token")
            
            _token_cache["access_token"] = access_token
            _token_cache["expire_time"] = current_time + expire_time
            _token_cache["refresh_token"] = refresh_token
            
            return {
                "success": True,
                "access_token": access_token
            }
        else:
            error_msg = response_data.get("msg", "Lỗi không xác định")
            return {
                "success": False,
                "error": error_msg
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def send_tuya_command(device_id: str, commands: list) -> Dict[str, Any]:
    """Gửi lệnh điều khiển đến thiết bị Tuya."""
    if not TUYA_CONFIG["client_secret"]:
        return {
            "success": False,
            "error": "Chưa cấu hình client_secret."
        }
    
    token_result = get_access_token()
    if not token_result["success"]:
        return {
            "success": False,
            "error": f"Không thể lấy token: {token_result.get('error', 'Lỗi không xác định')}"
        }
    
    access_token = token_result["access_token"]
    
    try:
        url_path = f"/v1.0/devices/{device_id}/commands"
        url = f"{TUYA_CONFIG['base_url']}{url_path}"
        timestamp = str(int(time.time() * 1000))
        
        payload = {"commands": commands}
        body_str = json.dumps(payload, separators=(',', ':'))
        
        sign = calc_sign(
            client_id=TUYA_CONFIG["client_id"],
            secret=TUYA_CONFIG["client_secret"],
            timestamp=timestamp,
            access_token=access_token,
            method="POST",
            url_path=url_path,
            body=payload
        )
        
        headers = {
            "sign_method": TUYA_CONFIG["sign_method"],
            "client_id": TUYA_CONFIG["client_id"],
            "t": timestamp,
            "mode": "cors",
            "Content-Type": "application/json",
            "sign": sign,
            "access_token": access_token
        }
        
        response = requests.post(url, headers=headers, data=body_str, timeout=10)
        response_data = response.json()
        
        if response.status_code == 200 and response_data.get("success", False):
            return {
                "success": True,
                "result": response_data.get("result", True)
            }
        else:
            return {
                "success": False,
                "error": response_data.get("msg", "Lỗi không xác định")
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def get_device_status(device: str) -> Dict[str, Any]:
    """Lấy trạng thái hiện tại của thiết bị (BẬT/TẮT)."""
    device_key = device.lower().replace(" ", "").replace("_", "")
    device_info = DEVICES.get(device_key)
    if not device_info:
        return {"success": False, "error": f"Thiết bị '{device}' không tồn tại."}
        
    if not TUYA_CONFIG["client_secret"]:
        return {"success": False, "error": "Chưa cấu hình client_secret."}
        
    token_result = get_access_token()
    if not token_result["success"]:
        return {"success": False, "error": f"Không thể lấy token: {token_result.get('error')}"}
        
    access_token = token_result["access_token"]
    
    try:
        url_path = f"/v1.0/devices/{device_info['id']}/status"
        url = f"{TUYA_CONFIG['base_url']}{url_path}"
        timestamp = str(int(time.time() * 1000))
        
        sign = calc_sign(
            client_id=TUYA_CONFIG["client_id"],
            secret=TUYA_CONFIG["client_secret"],
            timestamp=timestamp,
            access_token=access_token,
            method="GET",
            url_path=url_path,
            body=None
        )
        
        headers = {
            "sign_method": TUYA_CONFIG["sign_method"],
            "client_id": TUYA_CONFIG["client_id"],
            "t": timestamp,
            "mode": "cors",
            "Content-Type": "application/json",
            "sign": sign,
            "access_token": access_token
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response_data = response.json()
        
        if response.status_code == 200 and response_data.get("success", False):
            status_list = response_data.get("result", [])
            is_on = False
            for status in status_list:
                if status.get("code") == device_info["switch_code"]:
                    is_on = status.get("value", False)
                    break
            return {
                "success": True,
                "is_on": is_on,
                "device_name": device_info["name"]
            }
        else:
            return {
                "success": False,
                "error": response_data.get("msg", "Lỗi không xác định")
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def control_device(device: str, action: str) -> Dict[str, Any]:
    """Bật/Tắt thiết bị thông minh Tuya."""
    device_key = device.lower().replace(" ", "").replace("_", "")
    device_info = DEVICES.get(device_key)
    
    if not device_info:
        available = ", ".join(set([d["name"] for d in DEVICES.values()]))
        return {
            "success": False,
            "formatted_output": f"❌ Lỗi: Thiết bị '{device}' không tồn tại.\n📋 Thiết bị có sẵn: {available}"
        }
    
    clean_action = action.lower().strip()
    if clean_action not in ["on", "off", "bật", "tắt", "bat", "tat"]:
        return {
            "success": False,
            "formatted_output": "❌ Lỗi: Hành động không hợp lệ. Vui lòng chọn 'on/bật' hoặc 'off/tắt'"
        }
    
    turn_on = clean_action in ["on", "bật", "bat"]
    commands = [{"code": device_info["switch_code"], "value": turn_on}]
    result = send_tuya_command(device_info["id"], commands)
    
    if result["success"]:
        status = "BẬT ✅" if turn_on else "TẮT 🔴"
        output = f"🌀 **Điều khiển {device_info['name']}**: Thành công! Thiết bị đã được {status}"
    else:
        output = f"❌ **Điều khiển {device_info['name']}**: Thất bại. Lỗi: {result.get('error')}"
        
    return {
        "success": result["success"],
        "formatted_output": output
    }


# ── Handler functions ───────────────────────────────────────────────────

async def _handle_list_smart_devices(args: Dict[str, Any], **kwargs) -> str:
    """Liệt kê các thiết bị thông minh trong nhà."""
    seen = set()
    device_list = []
    
    for key, info in DEVICES.items():
        if info["id"] not in seen:
            seen.add(info["id"])
            device_list.append(f"{info['icon']} {info['name']} (ID: {info['id'][:10]}...)")
            
    config_status = "Đã cấu hình API" if TUYA_CONFIG["client_secret"] else "Chưa có client_secret"
    
    output = f"📋 **Danh sách thiết bị thông minh**\n"
    output += "━━━━━━━━━━━━━━━━━━━━\n"
    output += "\n".join(device_list) + "\n"
    output += "━━━━━━━━━━━━━━━━━━━━\n"
    output += f"🔑 Cấu hình API: {config_status}"
    
    return tool_result(formatted_output=output, success=True)


async def _handle_control_fan(args: Dict[str, Any], **kwargs) -> str:
    """Điều khiển Bật/Tắt quạt thông minh."""
    action = args.get("action")
    if not action:
        return tool_error("Yêu cầu tham số 'action'")
    res = control_device("fan", action)
    if res["success"]:
        return tool_result(formatted_output=res["formatted_output"], success=True)
    return tool_error(res["formatted_output"])


async def _handle_control_computer(args: Dict[str, Any], **kwargs) -> str:
    """Điều khiển Bật/Tắt nguồn máy tính."""
    action = args.get("action")
    if not action:
        return tool_error("Yêu cầu tham số 'action'")
    res = control_device("computer", action)
    if res["success"]:
        return tool_result(formatted_output=res["formatted_output"], success=True)
    return tool_error(res["formatted_output"])


# ── Registry Registration ──────────────────────────────────────────────

registry.register(
    name="list_smart_devices",
    toolset="iot",
    schema={
        "name": "list_smart_devices",
        "description": "Liệt kê danh sách tất cả các thiết bị nhà thông minh Tuya có sẵn để điều khiển.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    handler=_handle_list_smart_devices,
    is_async=True,
    emoji="📋",
    plan_safe=True
)

registry.register(
    name="control_fan",
    toolset="iot",
    schema={
        "name": "control_fan",
        "description": "Bật hoặc Tắt quạt thông minh Tuya.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Hành động điều khiển: 'on' hoặc 'bật' để bật quạt; 'off' hoặc 'tắt' để tắt quạt.",
                    "enum": ["on", "off", "bật", "tắt"]
                }
            },
            "required": ["action"]
        }
    },
    handler=_handle_control_fan,
    is_async=True,
    emoji="🌀",
    plan_safe=False
)

registry.register(
    name="control_computer",
    toolset="iot",
    schema={
        "name": "control_computer",
        "description": "Bật hoặc Tắt nguồn máy tính (thông qua ổ cắm thông minh Tuya).",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Hành động điều khiển: 'on' hoặc 'bật' để bật máy tính; 'off' hoặc 'tắt' để tắt máy tính.",
                    "enum": ["on", "off", "bật", "tắt"]
                }
            },
            "required": ["action"]
        }
    },
    handler=_handle_control_computer,
    is_async=True,
    emoji="💻",
    plan_safe=False
)
