from __future__ import annotations

import datetime
import json
import ssl
from urllib.parse import urlparse

import paho.mqtt.client as mqtt

from facebook._utils import generate_session_id, generate_client_id, json_minimal


class listeningEvent:
    def __init__(self, dataFB: dict, on_message_callback=None):
        self.dataFB = dataFB
        self.bodyResults = {
            "body": None,
            "timestamp": 0,
            "userID": 0,
            "messageID": None,
            "replyToID": 0,
            "type": None,
            "attachments": {"id": 0, "url": None},
        }
        self.syncToken = None
        self.lastSeqID = None
        self._on_message = on_message_callback
        self.mqtt = None
        self.retry_count = 0
        self.max_retries = 3

    def get_last_seq_id(self):
        print(f"[{datetime.datetime.now()}] last_seq_id not available via MQTT alone")
        return None

    def connect_mqtt(self):
        self.retry_count = 0

        chat_on = json_minimal(True)
        session_id = generate_session_id()
        user = {
            "u": self.dataFB["FacebookID"],
            "s": session_id,
            "chat_on": chat_on,
            "fg": False,
            "d": generate_client_id(),
            "ct": "websocket",
            "aid": 219994525426954,
            "mqtt_sid": "",
            "cp": 3,
            "ecp": 10,
            "st": "/t_ms",
            "pm": [],
            "dc": "",
            "no_auto_fg": True,
            "gas": None,
            "pack": [],
        }

        host = f"wss://edge-chat.facebook.com/chat?region=eag&sid={session_id}"
        options = {
            "client_id": "mqttwsclient",
            "username": json_minimal(user),
            "clean": True,
            "ws_options": {
                "headers": {
                    "Cookie": self.dataFB["cookieFacebook"],
                    "Origin": "https://www.facebook.com",
                    "User-Agent": "Mozilla/5.0 (Linux; Android 9; SM-G973U Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36",
                    "Referer": "https://www.facebook.com/",
                    "Host": "edge-chat.facebook.com",
                },
            },
            "keepalive": 10,
        }

        def _messenger_queue_publish(client, userdata, flags, rc):
            if self.lastSeqID is None:
                self.lastSeqID = 0

            queue = {
                "sync_api_version": 10,
                "max_deltas_able_to_process": 1000,
                "delta_batch_size": 500,
                "encoding": "JSON",
                "entity_fbid": self.dataFB["FacebookID"],
                "orca_version": "1.2.0",
            }

            if self.syncToken is None:
                topics = "/messenger_sync_create_queue"
                queue["initial_titan_sequence_id"] = self.lastSeqID
                queue["device_params"] = None
            else:
                topics = "/messenger_sync_get_diffs"
                queue["last_seq_id"] = self.lastSeqID
                queue["sync_token"] = self.syncToken

            client.publish(topics, json_minimal(queue), qos=1, retain=False)

        def on_message(client, userdata, msg):
            try:
                j = json.loads(msg.payload.decode())
                if j.get("deltas") is not None:
                    delta = j["deltas"][0]
                    meta = delta.get("messageMetadata")
                    if meta is not None:
                        thread_key = meta.get("threadKey", {})
                        other_user = thread_key.get("otherUserFbId")
                        thread_fbid = thread_key.get("threadFbId")

                        self.bodyResults["body"] = delta.get("body")
                        self.bodyResults["timestamp"] = meta.get("timestamp", 0)
                        self.bodyResults["userID"] = meta.get("actorFbId", 0)
                        self.bodyResults["messageID"] = meta.get("messageId")
                        self.bodyResults["replyToID"] = other_user or thread_fbid or 0
                        self.bodyResults["type"] = "user" if other_user is not None else "thread"

                        attachments = delta.get("attachments") or []
                        if attachments:
                            try:
                                blob = attachments[0].get("mercury", {}).get("blob_attachment", {}).get("preview", {})
                                self.bodyResults["attachments"]["id"] = attachments[0].get("fbid", 0)
                                self.bodyResults["attachments"]["url"] = blob.get("uri", "")
                            except (KeyError, TypeError, IndexError):
                                pass

                        if self._on_message:
                            self._on_message(dict(self.bodyResults))

                if "syncToken" in j and "firstDeltaSeqId" in j:
                    self.syncToken = j["syncToken"]
                    self.lastSeqID = j.get("lastIssuedSeqId") or j.get("firstDeltaSeqId")
                    self.retry_count = 0
                    return

                if "lastIssuedSeqId" in j:
                    self.lastSeqID = j["lastIssuedSeqId"]

                if "errorCode" in j:
                    error = j["errorCode"]
                    print(f"[{datetime.datetime.now()}] MQTT error: {error}")

                    if error == 100:
                        print("Queue overflow - resetting...")
                        self.syncToken = None
                        self.retry_count += 1
                        self.lastSeqID = 0
                        if self.retry_count > self.max_retries:
                            self.mqtt.disconnect()
                            return
                        queue = {
                            "sync_api_version": 10,
                            "max_deltas_able_to_process": 1000,
                            "delta_batch_size": 500,
                            "encoding": "JSON",
                            "entity_fbid": self.dataFB["FacebookID"],
                            "initial_titan_sequence_id": self.lastSeqID,
                            "device_params": None,
                            "orca_version": "1.2.0",
                        }
                        client.publish(
                            "/messenger_sync_create_queue",
                            json_minimal(queue),
                            qos=1,
                            retain=False,
                        )
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass

        def on_disconnect(client, userdata, rc):
            print(f"[{datetime.datetime.now()}] MQTT disconnected: {rc}")
            if rc != 0:
                import time as t_mod
                t_mod.sleep(10)
                self.connect_mqtt()

        self.mqtt = mqtt.Client(
            client_id=options["client_id"],
            clean_session=options["clean"],
            protocol=mqtt.MQTTv31,
            transport="websockets",
        )

        self.mqtt.tls_set(
            certfile=None,
            keyfile=None,
            cert_reqs=ssl.CERT_NONE,
            tls_version=ssl.PROTOCOL_TLSv1_2,
        )

        self.mqtt.on_connect = _messenger_queue_publish
        self.mqtt.on_message = on_message
        self.mqtt.on_disconnect = on_disconnect

        self.mqtt.username_pw_set(username=options["username"])
        parsed_host = urlparse(host)

        self.mqtt.ws_set_options(
            path=f"{parsed_host.path}?{parsed_host.query}",
            headers=options["ws_options"]["headers"],
        )

        self.mqtt.connect(
            host=options["ws_options"]["headers"]["Host"],
            port=443,
            keepalive=options["keepalive"],
        )
        self.mqtt.loop_forever()
