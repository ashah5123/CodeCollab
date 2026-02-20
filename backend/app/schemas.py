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
