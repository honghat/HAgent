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
