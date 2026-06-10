"""Frontend endpoints for read-only app inspection tools."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.routers.auth import _get_user_id
from api.services.ttv_api_capture import analyze_capture_text, load_profile
from api.services import ttv_hagent_proxy
from api.services.tangthuvien_api import load_ttv_config, save_ttv_config
from tools.app_api_discovery_tool import discover_app_apis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app-tools", tags=["app-tools"])


class AppApiDiscoveryRequest(BaseModel):
    app: str = Field(default="TruyenCV", min_length=1, max_length=200)
    include_live_connections: bool = True
    limit: int = Field(default=100, ge=10, le=300)


class TtvCaptureAnalyzeRequest(BaseModel):
    capture_text: str = Field(..., min_length=20, max_length=2_000_000)
    save_profile: bool = True


class TtvProxyStartRequest(BaseModel):
    port: int = Field(default=8899, ge=1024, le=65535)
    clear_capture: bool = False


class TtvGenreRequest(BaseModel):
    genre_type: str = Field(default="", max_length=100)


class TtvClearRequest(BaseModel):
    clear_capture: bool = True


@router.post("/discover-app-apis")
async def discover_app_api_endpoint(body: AppApiDiscoveryRequest, request: Request):
    """Expose discover_app_apis to the authenticated frontend."""
    _get_user_id(request)
    try:
        raw = discover_app_apis(
            app=body.app,
            include_live_connections=body.include_live_connections,
            limit=body.limit,
        )
        data = json.loads(raw)
    except Exception as exc:
        logger.exception("App API discovery failed for %s", body.app)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    return data


@router.post("/ttv/analyze-capture")
async def analyze_ttv_capture_endpoint(body: TtvCaptureAnalyzeRequest, request: Request):
    """Phân tích HAR/cURL capture từ iPad/iPhone app TTV và lưu profile đã sanitize."""
    _get_user_id(request)
    try:
        return analyze_capture_text(body.capture_text, save_profile=body.save_profile)
    except Exception as exc:
        logger.exception("TTV capture analysis failed")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/ttv/profile")
async def get_ttv_capture_profile(request: Request):
    """Lấy profile TTV đã lưu từ lần phân tích HAR/cURL gần nhất."""
    _get_user_id(request)
    return load_profile()


@router.get("/ttv/genre")
async def get_ttv_genre(request: Request):
    """Lấy cấu hình `type` thể loại đang dùng cho API get_list_story_type."""
    _get_user_id(request)
    return {"genre_type": load_ttv_config().get("genre_type", "")}


@router.post("/ttv/genre")
async def set_ttv_genre(body: TtvGenreRequest, request: Request):
    """Đặt giá trị `type` thể loại để lấy danh sách truyện qua API."""
    _get_user_id(request)
    return save_ttv_config({"genre_type": body.genre_type.strip()})


@router.post("/ttv/genre/detect")
async def detect_ttv_genre(request: Request):
    """Tự dò `type` thể loại mới nhất từ capture (cần addon mới giữ query value)."""
    _get_user_id(request)
    return ttv_hagent_proxy.detect_genre_type(save=True)


@router.get("/ttv/proxy/status")
async def get_ttv_proxy_status(request: Request):
    """Trạng thái HAgent MITM proxy cho iPad/iPhone."""
    _get_user_id(request)
    return ttv_hagent_proxy.status()


@router.post("/ttv/proxy/start")
async def start_ttv_proxy(body: TtvProxyStartRequest, request: Request):
    """Start HAgent-managed mitmdump proxy."""
    _get_user_id(request)
    try:
        return ttv_hagent_proxy.start(port=body.port, clear_capture=body.clear_capture)
    except Exception as exc:
        logger.exception("Failed to start HAgent TTV proxy")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/ttv/proxy/stop")
async def stop_ttv_proxy(request: Request):
    """Stop HAgent-managed mitmdump proxy."""
    _get_user_id(request)
    return ttv_hagent_proxy.stop()


@router.post("/ttv/proxy/clear")
async def clear_ttv_proxy_capture(request: Request):
    """Clear sanitized proxy capture file."""
    _get_user_id(request)
    return ttv_hagent_proxy.clear_capture()


@router.post("/ttv/proxy/analyze")
async def analyze_ttv_proxy_capture(request: Request):
    """Analyze sanitized records captured by HAgent proxy and save TTV profile."""
    _get_user_id(request)
    try:
        return ttv_hagent_proxy.analyze(save_profile=True)
    except Exception as exc:
        logger.exception("Failed to analyze HAgent TTV proxy capture")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ttv/proxy/import")
async def import_ttv_proxy_capture(request: Request):
    """Nhập truyện/chương từ JSON response capture được qua iPad proxy."""
    _get_user_id(request)
    try:
        return ttv_hagent_proxy.import_captured_stories(fetch_missing_content=True, content_limit=1000)
    except Exception as exc:
        logger.exception("Failed to import HAgent TTV proxy capture")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ttv/stories/clear")
async def clear_ttv_stories(body: TtvClearRequest, request: Request):
    """Xoá toàn bộ truyện/chương TTV trong DB, mặc định xoá cả capture cũ để không tự nhập lại."""
    _get_user_id(request)
    try:
        return ttv_hagent_proxy.clear_imported_ttv_stories(clear_capture_file=body.clear_capture)
    except Exception as exc:
        logger.exception("Failed to clear imported TTV stories")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/ttv/proxy/log")
async def get_ttv_proxy_log(request: Request):
    """Tail mitmdump log."""
    _get_user_id(request)
    return ttv_hagent_proxy.tail_log()
