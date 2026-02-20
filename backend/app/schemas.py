from uuid import UUID

from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    name: str = Field(default="Untitled Room", min_length=1, max_length=255)


class RoomResponse(BaseModel):
    id: UUID
    name: str
    invite_slug: str
    created_by: UUID
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class RoomWithDocument(BaseModel):
    id: UUID
    name: str
    invite_slug: str
    created_by: UUID
    created_at: str
    updated_at: str
    document_id: UUID | None = None
    document_content: str = ""
    document_language: str = "javascript"

    model_config = {"from_attributes": True}


class JoinRoomRequest(BaseModel):
    invite_slug: str = Field(min_length=1)


class CommentCreate(BaseModel):
    document_id: UUID
    line_number: int = Field(ge=1)
    body: str = Field(min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: UUID
    document_id: UUID
    line_number: int
    author_id: UUID
    body: str
    created_at: str
    resolved_at: str | None

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class ChatMessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    user_id: UUID
    content: str
    created_at: str

    model_config = {"from_attributes": True}


# Collab rooms (real-time collaborative coding)
class CollabRoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=1000)
    language: str = Field(default="python", max_length=50)


class CollabRoomResponse(BaseModel):
    id: UUID
    name: str
    description: str = ""
    language: str
    code: str = ""
    created_by: UUID
    creator_email: str | None = None
    is_active: bool = True
    created_at: str
    member_count: int = 0

    model_config = {"from_attributes": True}


class CollabRoomDetail(BaseModel):
    id: UUID
    name: str
    description: str = ""
    language: str
    code: str
    created_by: UUID
    creator_email: str | None = None
    is_active: bool
    created_at: str
    is_member: bool = False

    model_config = {"from_attributes": True}


class CollabRoomCodeUpdate(BaseModel):
    code: str
