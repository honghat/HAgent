#!/usr/bin/env python3
import json
import sys

from zlapi import ZaloAPI


def parse_cookie(cookie):
    result = {}
    for item in (cookie or "").split(";"):
        if "=" in item:
            key, value = item.strip().split("=", 1)
            if key:
                result[key] = value
    return result


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


def text_from_message(msg):
    if not isinstance(msg, dict):
        return str(msg or "")
    value = pick(msg, "content", "text", "message", "body", "msg", "href", "url")
    if isinstance(value, dict):
        return str(pick(value, "title", "text", "content", "href", "url") or json.dumps(value, ensure_ascii=False))
    if value:
        return str(value)
    msg_type = pick(msg, "msgType", "type")
    return f"[{msg_type}]" if msg_type else ""


def normalize_message(msg, fallback_thread_id="", own_id=""):
    if not isinstance(msg, dict):
        return None
    content = text_from_message(msg).strip()
    if not content:
        return None
    author_id = str(pick(msg, "uidFrom", "fromId", "authorId", "senderId", "ownerId"))
    if own_id and author_id in ("", "0"):
        author_id = str(own_id)
    author_name = str(pick(msg, "dName", "displayName", "fromDName", "senderName", "name", "zaloName") or "")
    external_id = str(pick(msg, "msgId", "id", "cliMsgId", "msg_id") or f"{fallback_thread_id}:{content[:80]}")
    return {
        "external_id": external_id,
        "cli_msg_id": str(pick(msg, "cliMsgId", "clientMsgId", "cli_msg_id") or ""),
        "msg_type": str(pick(msg, "msgType", "type") or "webchat"),
        "author_id": author_id,
        "author_name": author_name,
        "content": content,
        "created_at": pick(msg, "ts", "time", "createdTime", "timestamp"),
    }


def normalize_thread(item, source_key="", own_id=""):
    if not isinstance(item, dict):
        return None
    author_id = str(pick(item, "uidFrom", "fromId", "authorId", "senderId", "ownerId"))
    target_id = str(pick(item, "idTo", "threadId", "uid", "id", "userId", "toid", "fromUid"))
    type_value = str(pick(item, "type", "threadType", "isGroup")).lower()
    is_group = source_key == "groupMsgs" or type_value in ("1", "group", "true")
    thread_id = target_id if is_group or author_id in ("", "0", str(own_id)) else author_id
    if not thread_id:
        return None

    last_msg = pick(item, "lastMsg", "lastMessage", "msgInfo", "message")
    last_text = text_from_message(last_msg if isinstance(last_msg, dict) else item)
    messages = []
    for key in ("msgs", "messages", "msgInfos", "listMsgs"):
        raw = item.get(key)
        if isinstance(raw, list):
            messages = [m for m in (normalize_message(x, thread_id, own_id) for x in raw) if m]
            break
    if not messages and isinstance(last_msg, dict):
        msg = normalize_message(last_msg, thread_id, own_id)
        if msg:
            messages = [msg]
    if not messages and ("msgId" in item or "cliMsgId" in item):
        msg = normalize_message(item, thread_id, own_id)
        if msg:
            messages = [msg]

    name = pick(item, "groupName", "group_name", "displayName", "name", "globalId") if is_group else pick(item, "displayName", "zaloName", "name", "dName", "globalId")
    return {
        "thread_id": thread_id,
        "name": str(name or thread_id),
        "avatar": str(pick(item, "avatar", "avt", "thumbnail") or ""),
        "last_message": last_text,
        "unread": int(pick(item, "unreadCount", "unread") or 0),
        "thread_type": "group" if is_group else "user",
        "messages": messages,
    }


def normalize_friend(item):
    if not isinstance(item, dict):
        return None
    friend_id = str(pick(item, "userId", "uid", "id", "user_id"))
    if not friend_id:
        return None
    name = str(pick(item, "displayName", "zaloName", "name", "dName", "fullname", "fullName") or friend_id)
    avatar = str(pick(item, "avatar", "avt", "thumbnail", "photo") or "")
    return {
        "friend_id": friend_id,
        "name": name,
        "avatar": avatar,
    }


def normalize_group(item):
    if not isinstance(item, dict):
        return None
    group_id = str(pick(item, "groupId", "grid", "id", "threadId"))
    if not group_id:
        return None
    name = str(pick(item, "name", "groupName", "displayName", "title") or group_id)
    avatar = str(pick(item, "avatar", "avt", "thumbnail", "photo") or "")
    return {
        "group_id": group_id,
        "name": name,
        "avatar": avatar,
    }


def collect_group_ids(node):
    ids = []
    if isinstance(node, dict):
        grid_map = node.get("gridVerMap")
        if isinstance(grid_map, dict):
            ids.extend(str(k) for k in grid_map.keys())
        for key in ("groups", "items", "list", "data"):
            value = node.get(key)
            if isinstance(value, list):
                for item in value:
                    group = normalize_group(item)
                    if group:
                        ids.append(group["group_id"])
    elif isinstance(node, list):
        for item in node:
            group = normalize_group(item)
            if group:
                ids.append(group["group_id"])
    return list(dict.fromkeys(ids))


def thread_from_marker(item, friend_names, group_names):
    if not isinstance(item, dict):
        return None
    thread_id = str(pick(item, "idTo", "threadId", "uid", "id"))
    if not thread_id:
        return None
    is_group = str(pick(item, "isGroup", "type", "threadType")).lower() in ("1", "group", "true")
    return {
        "thread_id": thread_id,
        "name": group_names.get(thread_id) if is_group else friend_names.get(thread_id, thread_id),
        "avatar": "",
        "last_message": "",
        "unread": 0,
        "thread_type": "group" if is_group else "user",
        "messages": [],
    }


def collect_threads(node, source_key="", own_id=""):
    threads = []
    if isinstance(node, list):
        normalized = [normalize_thread(item, source_key, own_id) for item in node if isinstance(item, dict)]
        normalized = [item for item in normalized if item]
        if normalized:
            return normalized
        for item in node:
            threads.extend(collect_threads(item, source_key, own_id))
    elif isinstance(node, dict):
        for key in ("conversations", "convInfos", "msgs", "items", "list", "data"):
            if key in node:
                threads.extend(collect_threads(node[key], key, own_id))
        if "groupMsgs" in node:
            threads.extend(collect_threads(node["groupMsgs"], "groupMsgs", own_id))
        if not threads:
            normalized = normalize_thread(node, source_key, own_id)
            if normalized:
                threads.append(normalized)
    return threads


def recent_group_messages(bot, thread_id, own_id=""):
    try:
        raw = plain(bot.getRecentGroup(thread_id))
    except Exception:
        return []
    candidates = []
    if isinstance(raw, dict):
        for key in ("groupMsgs", "msgs", "messages", "msgInfos", "listMsgs"):
            value = raw.get(key)
            if isinstance(value, list):
                candidates = value
                break
    elif isinstance(raw, list):
        candidates = raw
    return [msg for msg in (normalize_message(item, thread_id, own_id) for item in candidates) if msg]


def enrich_recent_messages(bot, threads, own_id=""):
    enriched = []
    for thread in threads:
        if not isinstance(thread, dict):
            continue
        copy = dict(thread)
        if copy.get("thread_type") == "group" and copy.get("thread_id"):
            recent = recent_group_messages(bot, copy["thread_id"], own_id)
            if len(recent) > len(copy.get("messages") or []):
                copy["messages"] = recent
                if recent:
                    copy["last_message"] = recent[-1].get("content") or copy.get("last_message", "")
        enriched.append(copy)
    return enriched


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI. Reconnect Zalo QR to capture IMEI.")

    bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
    own_id = str(getattr(getattr(bot, "_state", None), "user_id", "") or getattr(bot, "user_id", "") or getattr(bot, "uid", "") or "")
    raw = plain(bot.getLastMsgs())
    friends = []
    friends_error = ""
    try:
        friends_raw = plain(bot.fetchAllFriends())
        friends = [item for item in (normalize_friend(x) for x in friends_raw or []) if item]
    except Exception as exc:
        friends_error = str(exc)

    friend_names = {item["friend_id"]: item["name"] for item in friends}
    group_names = {}
    groups_error = ""
    try:
        groups_raw = plain(bot.fetchAllGroups())
        for group_id in collect_group_ids(groups_raw):
            group_names[group_id] = group_id
    except Exception as exc:
        groups_error = str(exc)

    threads = collect_threads(raw, own_id=own_id)
    marker_threads = []
    if isinstance(raw, dict):
        for key in ("clearUnreads", "clearUnreadsReact"):
            for item in raw.get(key) or []:
                thread = thread_from_marker(item, friend_names, group_names)
                if thread:
                    marker_threads.append(thread)

    by_id = {}
    for thread in threads + marker_threads:
        if thread and thread.get("thread_id"):
            by_id[thread["thread_id"]] = {**by_id.get(thread["thread_id"], {}), **thread}
    threads = list(by_id.values())
    threads = enrich_recent_messages(bot, threads, own_id=own_id)
    print(json.dumps({
        "own_id": own_id,
        "threads": threads,
        "friends": friends,
        "friends_error": friends_error,
        "groups_error": groups_error,
        "raw_type": type(raw).__name__,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
