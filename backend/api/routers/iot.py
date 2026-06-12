"""IoT router — điều khiển thiết bị nhà thông minh Tuya (quạt, máy tính)."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from tools.tuya_tools import DEVICES, control_device, get_device_status
from api.routers.auth import _get_user_id

router = APIRouter(prefix="/api/iot", tags=["iot"])


class ControlBody(BaseModel):
    action: str  # 'on' | 'off' | 'bật' | 'tắt'


def _unique_devices():
    """Trả về danh sách thiết bị duy nhất (gộp các alias trỏ cùng id)."""
    seen, out = set(), []
    for key, info in DEVICES.items():
        if info["id"] in seen:
            continue
        seen.add(info["id"])
        out.append({"key": key, "name": info["name"], "icon": info["icon"]})
    return out


@router.get("/devices")
async def list_devices(request: Request):
    _get_user_id(request)
    return {"devices": _unique_devices()}


@router.get("/devices/{key}/status")
async def device_status(key: str, request: Request):
    _get_user_id(request)
    res = await run_in_threadpool(get_device_status, key)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Lỗi không xác định"))
    return {"is_on": res.get("is_on", False), "name": res.get("device_name", key)}


@router.post("/devices/{key}/control")
async def device_control(key: str, body: ControlBody, request: Request):
    _get_user_id(request)
    res = await run_in_threadpool(control_device, key, body.action)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("formatted_output", "Điều khiển thất bại"))
    return {"success": True, "message": res.get("formatted_output", "")}
