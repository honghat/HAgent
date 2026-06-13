from __future__ import annotations

import json
import random
import time

import requests

from facebook._utils import gen_threading_id, mainRequests, formAll


class api:
    def __init__(self):
        self.dataFB: dict | None = None
        self.content: str | None = None
        self.ID: str | None = None
        self.typeAttachment: str | None = None
        self.attachmentID: str | int | list | None = None
        self.typeChat: str | None = None
        self.replyStatus: bool | None = None
        self.messageID: str | None = None
        self.results: dict = {}
        self.properties = [
            "is_unread", "is_cleared", "is_forward", "is_filtered_content",
            "is_filtered_content_bh", "is_filtered_content_account",
            "is_filtered_content_quasar", "is_filtered_content_invalid_app",
            "is_spoof_warning",
        ]
        self.dictAttachment = {
            "gif": "gif_ids",
            "image": "image_ids",
            "video": "video_ids",
            "file": "file_ids",
            "audio": "audio_ids",
        }

    def send(
        self,
        dataFB: dict,
        contentSend: str,
        threadID: str,
        typeAttachment: str | None = None,
        attachmentID: str | int | list | None = None,
        typeChat: str | None = None,
        replyMessage: bool | None = None,
        messageID: str | None = None,
    ) -> dict:
        self.dataFB = dataFB
        self.content = str(contentSend)
        self.ID = threadID
        self.typeAttachment = typeAttachment
        self.attachmentID = attachmentID
        self.typeChat = typeChat
        self.replyStatus = replyMessage
        self.messageID = messageID

        self.sendMessage()
        self.removeValueToInputed()
        return self.results

    def removeValueToInputed(self):
        self.typeAttachment = None
        self.attachmentID = None
        self.typeChat = None
        self.replyStatus = None
        self.messageID = None

    def attributeValues(self):
        for prop in self.properties:
            if self.dataForm.get(prop) is None:
                self.dataForm[prop] = False

    def attachmentCheck(self):
        if self.typeAttachment is not None and self.attachmentID is not None:
            self.dataForm["has_attachment"] = True
            dictKey = self.dictAttachment.get(self.typeAttachment)
            if dictKey is None:
                return
            if isinstance(self.attachmentID, list):
                for j, idAttach in enumerate(self.attachmentID):
                    self.dataForm[f"{dictKey}[{j}]"] = idAttach
            else:
                self.dataForm[f"{dictKey}[0]"] = self.attachmentID

    def removeDataAttachmentCheck(self):
        if not self.dataForm.get("has_attachment"):
            return
        dictKey = self.dictAttachment.get(self.typeAttachment)
        if dictKey is None:
            return
        if isinstance(self.attachmentID, list):
            for ij in range(len(self.attachmentID)):
                self.dataForm.pop(f"{dictKey}[{ij}]", None)
        else:
            self.dataForm.pop(f"{dictKey}[0]", None)
        self.dataForm.pop("has_attachment", None)

    def replyCheck(self):
        if self.replyStatus is not None:
            self.dataForm["replied_to_message_id"] = self.messageID

    def sendMessage(self):
        assert self.dataFB is not None
        assert self.ID is not None

        self.dataForm = formAll(self.dataFB, requireGraphql=False)

        if self.typeChat == "user":
            if isinstance(self.ID, list):
                for i, threadID in enumerate(self.ID):
                    self.dataForm[f"specific_to_list[{i}]"] = f"fbid:{threadID}"
                self.dataForm[f"specific_to_list[{len(self.ID)}]"] = f"fbid:{self.dataFB['FacebookID']}"
            else:
                self.dataForm["specific_to_list[0]"] = f"fbid:{self.ID}"
                self.dataForm["specific_to_list[1]"] = f"fbid:{self.dataFB['FacebookID']}"
                self.dataForm["other_user_fbid"] = self.ID
        else:
            self.dataForm["thread_fbid"] = self.ID

        self.attributeValues()
        self.dataForm["action_type"] = "ma-type:user-generated-message"
        self.dataForm["client"] = "mercury"
        self.dataForm["body"] = self.content
        self.dataForm["author"] = f"fbid:{self.dataFB['FacebookID']}"
        self.dataForm["timestamp"] = int(time.time() * 1000)
        self.dataForm["timestamp_absolute"] = "Today"
        self.dataForm["source"] = "source:chat:web"
        self.dataForm["source_tags[0]"] = "source:chat"
        self.dataForm["client_thread_id"] = f"root:{gen_threading_id()}"
        self.dataForm["offline_threading_id"] = gen_threading_id()
        self.dataForm["message_id"] = gen_threading_id()
        self.dataForm["threading_id"] = f"<{int(time.time() * 1000)}:{int(random.random() * 4294967295)}-{hex(int(random.random() * 2 ** 31))[2:]}@mail.projektitan.com>"
        self.dataForm["ephemeral_ttl_mode"] = "0"
        self.dataForm["manual_retry_cnt"] = "0"
        self.dataForm["ui_push_phase"] = "V3"

        self.replyCheck()
        self.attachmentCheck()
        self.sendRequests()
        self.removeDataAttachmentCheck()

    def sendRequests(self):
        assert self.dataFB is not None
        req = mainRequests(
            "https://www.facebook.com/messaging/send/",
            self.dataForm,
            self.dataFB["cookieFacebook"],
        )
        resp = requests.post(**req)
        text = resp.text

        if text.startswith("for (;;);"):
            text = text[len("for (;;);"):]

        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            self.results = {
                "error": 1,
                "ok": False,
                "payload": {
                    "error-decription": f"Facebook returned HTTP {resp.status_code}: {text[:200]}",
                    "error-code": resp.status_code,
                },
            }
            return

        if result.get("payload"):
            actions = result["payload"].get("actions")
            if actions:
                action0 = actions[0]
                self.results = {
                    "success": 1,
                    "ok": True,
                    "payload": {
                        "messageID": action0.get("message_id", ""),
                        "timestamp": action0.get("timestamp", int(time.time() * 1000)),
                    },
                }
                return
        self.results = {
            "error": 1,
            "ok": False,
            "payload": {
                "error-decription": result.get("errorDescription", "Unknown error"),
                "error-code": result.get("error", -1),
            },
        }


def send_message(dataFB: dict, thread_id: str, text: str, typeChat: str | None = None) -> dict:
    sender = api()
    return sender.send(dataFB, text, thread_id, typeChat=typeChat)


def send_message_to_user(dataFB: dict, user_id: str, text: str) -> dict:
    sender = api()
    return sender.send(dataFB, text, user_id, typeChat="user")
