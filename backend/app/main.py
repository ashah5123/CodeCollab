from contextlib import asynccontextmanager
import os
import secrets

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.auth import get_current_user, JWTPayload
from app.routers import collab as collab_router
from app.routers import organisations as organisations_router
from app.routers import leaderboard as leaderboard_router
from app.routers import submissions as submissions_router
from app.routers import comments as comments_router
from app.routers import chat as chat_router
from app.routers import messages as messages_router
from app.routers import notifications as notifications_router
from app.routers import execute as execute_router
from app.routers import attachments as attachments_router
from app.routers import comment_votes as comment_votes_router
from app.schemas import (
    RoomCreate,
    RoomResponse,
    RoomWithDocument,
    JoinRoomRequest,
)
from app.supabase_client import supabase_admin


def generate_invite_slug() -> str:
    return secrets.token_urlsafe(12)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="CodeCollab API",
    description="Real-time collaborative coding platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(collab_router.router)
app.include_router(organisations_router.router)
app.include_router(leaderboard_router.router)
app.include_router(submissions_router.router, prefix="/api/v1")
app.include_router(comments_router.router, prefix="/api/v1")
app.include_router(chat_router.router, prefix="/api/v1")
app.include_router(messages_router.router, prefix="/api/v1")
app.include_router(notifications_router.router, prefix="/api/v1")
app.include_router(execute_router.router, prefix="/api/v1")
app.include_router(attachments_router.router, prefix="/api/v1")
app.include_router(comment_votes_router.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/rooms", response_model=RoomWithDocument)
def create_room(
    body: RoomCreate,
    user: JWTPayload = Depends(get_current_user),
):
    slug = generate_invite_slug()
    user_id = user.sub

    room_row = (
        supabase_admin.table("rooms")
        .insert(
            {
                "name": body.name,
                "invite_slug": slug,
                "created_by": user_id,
            }
        )
        .execute()
    )
    if not room_row.data or len(room_row.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create room",
        )
    room = room_row.data[0]
    room_id = room["id"]

    supabase_admin.table("room_members").insert(
        {"room_id": room_id, "user_id": user_id, "role": "owner"}
    ).execute()

    doc_row = (
        supabase_admin.table("documents")
        .insert(
            {
                "room_id": room_id,
                "content": "",
                "language": "javascript",
            }
        )
        .execute()
    )
    doc = doc_row.data[0] if doc_row.data else {}

    return RoomWithDocument(
        id=room["id"],
        name=room["name"],
        invite_slug=room["invite_slug"],
        created_by=room["created_by"],
        created_at=room["created_at"],
        updated_at=room["updated_at"],
        document_id=doc.get("id"),
        document_content=doc.get("content", ""),
        document_language=doc.get("language", "javascript"),
    )


@app.get("/rooms", response_model=list[RoomResponse])
def list_rooms(user: JWTPayload = Depends(get_current_user)):
    members = (
        supabase_admin.table("room_members")
        .select("room_id")
        .eq("user_id", user.sub)
        .execute()
    )
    if not members.data:
        return []
    room_ids = [m["room_id"] for m in members.data]
    rooms = (
        supabase_admin.table("rooms")
        .select("*")
        .in_("id", room_ids)
        .order("updated_at", desc=True)
        .execute()
    )
    return [RoomResponse(**r) for r in (rooms.data or [])]


@app.get("/rooms/{room_id}", response_model=RoomWithDocument)
def get_room(
    room_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    room = (
        supabase_admin.table("rooms")
        .select("*")
        .eq("id", room_id)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    member = (
        supabase_admin.table("room_members")
        .select("id")
        .eq("room_id", room_id)
        .eq("user_id", user.sub)
        .execute()
    )
    if not member.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this room")

    doc = (
        supabase_admin.table("documents")
        .select("*")
        .eq("room_id", room_id)
        .single()
        .execute()
    )
    d = doc.data if doc.data else {}
    return RoomWithDocument(
        id=room.data["id"],
        name=room.data["name"],
        invite_slug=room.data["invite_slug"],
        created_by=room.data["created_by"],
        created_at=room.data["created_at"],
        updated_at=room.data["updated_at"],
        document_id=d.get("id"),
        document_content=d.get("content", ""),
        document_language=d.get("language", "javascript"),
    )


@app.post("/rooms/join", response_model=RoomWithDocument)
def join_room(
    body: JoinRoomRequest,
    user: JWTPayload = Depends(get_current_user),
):
    room = (
        supabase_admin.table("rooms")
        .select("*")
        .eq("invite_slug", body.invite_slug)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    room_id = room.data["id"]
    supabase_admin.table("room_members").upsert(
        [{"room_id": room_id, "user_id": user.sub, "role": "member"}],
        on_conflict="room_id,user_id",
    ).execute()

    doc = (
        supabase_admin.table("documents")
        .select("*")
        .eq("room_id", room_id)
        .single()
        .execute()
    )
    d = doc.data if doc.data else {}
    return RoomWithDocument(
        id=room.data["id"],
        name=room.data["name"],
        invite_slug=room.data["invite_slug"],
        created_by=room.data["created_by"],
        created_at=room.data["created_at"],
        updated_at=room.data["updated_at"],
        document_id=d.get("id"),
        document_content=d.get("content", ""),
        document_language=d.get("language", "javascript"),
    )
