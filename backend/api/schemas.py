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
    images: list[str] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)
    contextLength: int | None = Field(default=None, gt=0)
    agent_mode: str | None = Field(default=None, max_length=32)
    force_professor: bool | None = None


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
    journal: list[dict] = Field(default_factory=list)


class AsyncMessageResponse(BaseModel):
    taskId: str
    messageId: str | None = None
    status: str


class PasteRequest(BaseModel):
    content: str = Field(min_length=1)
    provider: str | None = None


class RawMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    provider: str | None = None
    assistant: str | None = None


class StopResponse(BaseModel):
    session_id: str
    stopped: bool


class SteerRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class SteerResponse(BaseModel):
    session_id: str
    accepted: bool


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


# New schemas for media handling
class OmniSendMediaRequest(BaseModel):
    """Request to send media (image/file) to a conversation."""
    image_path: str | None = None
    image_paths: list[str] | None = None
    media_urls: list[str] | None = None
    file_url: str | None = None
    file_path: str | None = None  # Local file path (for Zalo send_local_file)
    caption: str = ""
    optimize: bool = True  # Auto-optimize images for platform


class OmniPasteClipboardRequest(BaseModel):
    """Request to paste image from clipboard."""
    caption: str = ""


class OmniImageInfoResponse(BaseModel):
    """Response with image information."""
    format: str
    mode: str
    width: int
    height: int
    size_bytes: int
    size_mb: float
