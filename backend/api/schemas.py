from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    agentId: str | None = None


class SessionResponse(BaseModel):
    session_id: str
    title: str
    status: str = "idle"
    agentId: str | None = None


class SessionListItem(BaseModel):
    id: str
    title: str
    status: str
    agentId: str | None = None


class MessageRequest(BaseModel):
    content: str = Field(min_length=1)
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)


class MessageResponse(BaseModel):
    session_id: str
    status: str
    reply: str
    messageId: str | None = None
    usage: dict = {}


class SessionMessageItem(BaseModel):
    id: str
    role: str
    content: str
    createdAt: str
    provider: str | None = None
    usage: dict | None = None


class AsyncMessageResponse(BaseModel):
    taskId: str
    messageId: str | None = None
    status: str


class PasteRequest(BaseModel):
    content: str = Field(min_length=1)
    provider: str | None = None


class StopResponse(BaseModel):
    session_id: str
    stopped: bool


class WorkspaceResponse(BaseModel):
    session_id: str
    tools: list[dict] = []
    todos: list[dict] = []
    summary: dict = {}


class OmniConversation(BaseModel):
    id: str
    sender: str
    content: str = ""
    channel: str
    avatar: str = ""
    is_pinned: bool = False
    unread: bool = False
    thread_type: str = "personal"
    external_id: str = ""
    created_at: str | None = None
    updated_at: str | None = None


class OmniMessage(BaseModel):
    id: str
    sender_type: str
    content: str = ""
    reply_to: dict | None = None
    external_author_name: str | None = None
    reactions: dict = {}
    status: str = "sent"
    created_at: str | None = None


class OmniContact(BaseModel):
    id: str
    sender: str
    external_id: str = ""
    avatar: str = ""
    has_conversation: bool = False
    channel: str


class OmniStats(BaseModel):
    sent: int = 0
    received: int = 0
    total: int = 0
    by_conversation: list[dict] = []


class OmniSendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    reply_to_id: str | None = None


class OmniRenameRequest(BaseModel):
    custom_name: str = Field(min_length=1, max_length=200)


class OmniReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class OmniSyncMessagesRequest(BaseModel):
    maxThreads: int = Field(default=12, ge=1, le=500)
    maxMessages: int = Field(default=30, ge=1, le=500)


class OmniConnectFacebookRequest(BaseModel):
    cookie: str = Field(min_length=1)


class OmniQRStatusResponse(BaseModel):
    session: str
    status: str
    detail: str | None = None
