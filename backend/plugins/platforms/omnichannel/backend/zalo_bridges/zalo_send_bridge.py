#!/usr/bin/env python3
import hashlib
import json
import mimetypes
import os
import sys
import uuid

import requests
from zlapi import ZaloAPI
from zlapi.models import Message, MessageObject, ThreadType


def parse_cookie(cookie):
    result = {}
    for item in (cookie or "").split(";"):
        if "=" in item:
            key, value = item.strip().split("=", 1)
            if key:
                result[key] = value
    return result


def _upload_file(bot, file_path, thread_id, thread_type):
    """
    Upload a local file to Zalo CDN (similar to zlapi's _uploadImage but for files).
    Returns dict with fileUrl, fileId, etc. from Zalo server.
    """
    if not os.path.exists(file_path):
        raise RuntimeError(f"File not found: {file_path}")

    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)

    # Step 1: Init upload session
    client_id = str(int(uuid.uuid4().int >> 64))
    params_init = {
        "zpw_ver": 647,
        "zpw_type": 30,
    }
    payload_init = {
        "params": {
            "clientId": client_id,
            "fileName": file_name,
            "totalSize": file_size,
            "totalChunk": 1,
            "imei": bot._imei,
            "isE2EE": 0,
            "chunkId": 1,
        }
    }

    if thread_type == ThreadType.USER:
        url_upload = "https://tt-files-wpa.chat.zalo.me/api/message/file_original/upload"
        payload_init["params"]["toid"] = str(thread_id)
    elif thread_type == ThreadType.GROUP:
        url_upload = "https://tt-files-wpa.chat.zalo.me/api/group/file_original/upload"
        payload_init["params"]["grid"] = str(thread_id)
    else:
        raise RuntimeError("Thread type is invalid")

    payload_init["params"] = bot._encode(payload_init["params"])
    
    with open(file_path, "rb") as f:
        files = [("chunkContent", f)]
        response = bot._post(url_upload, params=params_init, files=files)
    
    data = response.json()
    if data.get("error_code") != 0:
        raise RuntimeError(f"Upload failed: {data.get('error_message', data.get('data', 'Unknown'))}")
    
    # Decode response
    results = bot._decode(data["data"])
    if isinstance(results, str):
        results = json.loads(results)
    
    upload_data = results.get("data", results)
    
    return {
        "fileUrl": upload_data.get("fileUrl", ""),
        "fileId": upload_data.get("fileId", ""),
        "clientFileId": upload_data.get("clientFileId", client_id),
        "fileName": file_name,
        "fileSize": file_size,
    }


def _send_local_file(bot, file_path, thread_id, thread_type, text=""):
    """
    Upload local file to Zalo CDN then send as message.
    """
    # Step 1: Upload file to Zalo CDN
    upload_info = _upload_file(bot, file_path, thread_id, thread_type)
    
    file_name = upload_info["fileName"]
    file_size = upload_info["fileSize"]
    extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    
    # Step 2: Read local file for checksum
    with open(file_path, "rb") as f:
        file_checksum = hashlib.md5(f.read()).hexdigest()
    
    # Step 3: Send message with file reference
    file_id = str(int(uuid.uuid4().int >> 64))
    params = {
        "zpw_ver": 647,
        "zpw_type": 30,
        "nretry": 0
    }
    
    payload = {
        "params": {
            "fileId": upload_info.get("fileId", file_id),
            "checksum": file_checksum,
            "checksumSha": "",
            "extension": extension,
            "totalSize": file_size,
            "fileName": file_name,
            "clientId": upload_info.get("clientFileId", int(uuid.uuid4().int >> 64)),
            "fType": 1,
            "fileCount": 0,
            "fdata": "{}",
            "fileUrl": upload_info["fileUrl"],
            "zsource": 401,
            "ttl": 0,
        }
    }
    
    if text:
        payload["params"]["description"] = text
    
    if thread_type == ThreadType.USER:
        url = "https://tt-files-wpa.chat.zalo.me/api/message/asyncfile/msg"
        payload["params"]["toid"] = str(thread_id)
        payload["params"]["imei"] = bot._imei
    elif thread_type == ThreadType.GROUP:
        url = "https://tt-files-wpa.chat.zalo.me/api/group/asyncfile/msg"
        payload["params"]["grid"] = str(thread_id)
    else:
        raise RuntimeError("Thread type is invalid")
    
    payload["params"] = bot._encode(payload["params"])
    response = bot._post(url, params=params, data=payload)
    data = response.json()
    results = data.get("data") if data.get("error_code") == 0 else None
    if not results:
        error_code = data.get("error_code")
        error_message = data.get("error_message") or data.get("data")
        raise RuntimeError(f"Send file failed: #{error_code} - {error_message}")
    
    results = bot._decode(results)
    results = results.get("data") if results.get("data") else results
    
    return results


def plain(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [plain(v) for v in value]
    if hasattr(value, "toDict"):
        try:
            return plain(value.toDict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return plain(vars(value))
    return str(value)


def pick(obj, *keys):
    if not isinstance(obj, dict):
        return ""
    for key in keys:
        value = obj.get(key)
        if value not in (None, ""):
            return value
    return ""


def message_object_from_payload(data):
    if not isinstance(data, dict):
        return None
    msg_id = str(pick(data, "msgId", "msg_id", "external_id") or "")
    cli_msg_id = str(pick(data, "cliMsgId", "cli_msg_id", "external_cli_msg_id") or "")
    msg_type = pick(data, "msgType", "msg_type", "external_msg_type") or "webchat"
    if not msg_id or not cli_msg_id:
        return None
    return MessageObject.fromDict({
        "msgId": msg_id,
        "cliMsgId": cli_msg_id,
        "msgType": msg_type,
        "uidFrom": str(pick(data, "uidFrom", "author_id", "external_author_id") or ""),
        "content": str(pick(data, "content", "text") or ""),
        "ts": pick(data, "ts", "created_at", "timestamp") or 0,
    }, None)


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action", "send")).lower()
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    target = str(payload.get("target", "")).strip()
    text = str(payload.get("text", "")).strip()
    thread_type = str(payload.get("thread_type", "user")).lower()
    
    # Image/file parameters
    image_path = str(payload.get("image_path", "")).strip()
    image_paths = payload.get("image_paths", [])  # For multiple images
    file_url = str(payload.get("file_url", "")).strip()
    file_path = str(payload.get("file_path", "")).strip()  # Local file path

    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI. Reconnect Zalo QR to capture IMEI.")
    if not target:
        raise RuntimeError("Missing Zalo target")
    if action in ("send", "reply") and not text and not image_path and not image_paths and not file_url:
        raise RuntimeError("Missing Zalo text, image, or file")
    if action == "send_local_file" and not file_path and not text:
        raise RuntimeError("Missing file_path or text for send_local_file")

    bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
    t_type = ThreadType.GROUP if thread_type == "group" else ThreadType.USER
    
    # Prepare message object if text is provided
    msg = Message(text=text) if text else None
    
    if action == "send_image":
        # Send single image
        if not image_path:
            raise RuntimeError("Missing image_path for send_image action")
        result = bot.sendLocalImage(
            image_path, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "send_images":
        # Send multiple images
        if not image_paths or not isinstance(image_paths, list):
            raise RuntimeError("Missing or invalid image_paths for send_images action")
        result = bot.sendMultiLocalImage(
            image_paths, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "send_file":
        # Send file from URL
        if not file_url:
            raise RuntimeError("Missing file_url for send_file action")
        result = bot.sendRemoteFile(
            file_url, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "send_local_file":
        # Send local file by uploading to Zalo CDN first
        if not file_path:
            raise RuntimeError("Missing file_path for send_local_file action")
        if not os.path.exists(file_path):
            raise RuntimeError(f"File not found: {file_path}")
        result = _send_local_file(bot, file_path, target, t_type, text=text)
    elif action == "react":
        reaction = str(payload.get("emoji", "")).strip()
        message_object = message_object_from_payload(payload.get("message") or {})
        if not reaction:
            raise RuntimeError("Missing reaction emoji")
        if not message_object:
            raise RuntimeError("Thiếu metadata Zalo của tin nhắn nên chưa gửi cảm xúc được.")
        result = bot.sendReaction(message_object, reaction, thread_id=target, thread_type=t_type)
    elif action == "undo":
        message_object = message_object_from_payload(payload.get("message") or {})
        if not message_object:
            raise RuntimeError("Thiếu metadata Zalo của tin nhắn nên chưa thu hồi được.")
        result = bot.undoMessage(message_object.msgId, message_object.cliMsgId, thread_id=target, thread_type=t_type)
    else:
        # Default send or reply
        reply_object = message_object_from_payload(payload.get("reply_to") or {})
        if action == "reply" and reply_object:
            result = bot.replyTo(reply_object, Message(text=text), thread_id=target, thread_type=t_type)
        else:
            result = bot.send(Message(text=text), thread_id=target, thread_type=t_type)
    
    data = plain(result)
    print(json.dumps({
        "ok": True,
        "target": target,
        "msg_id": str(pick(data, "msgId", "globalMsgId", "global_msg_id") or ""),
        "cli_msg_id": str(pick(data, "cliMsgId", "clientMsgId", "client_msg_id") or ""),
        "msg_type": str(pick(data, "msgType", "type") or "webchat"),
        "result": data,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        err_msg = str(exc)
        if "'NoneType' object is not subscriptable" in err_msg:
            err_msg = "Phiên Zalo hết hạn hoặc Cookie/IMEI không hợp lệ. Hãy quét QR lại."
        print(json.dumps({"ok": False, "error": err_msg}, ensure_ascii=False))
        sys.exit(1)
