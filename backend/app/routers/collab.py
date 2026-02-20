from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user, JWTPayload
from app.schemas import (
    CollabRoomCreate,
    CollabRoomResponse,
    CollabRoomDetail,
    CollabRoomCodeUpdate,
)
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/collab", tags=["collab"])


@router.get("/rooms", response_model=list[CollabRoomResponse])
def list_collab_rooms(user: JWTPayload = Depends(get_current_user)):
    """List all active collab rooms."""
    rows = (
        supabase_admin.table("collab_rooms")
        .select("*")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    rooms = rows.data or []
    if not rooms:
        return []

    room_ids = [r["id"] for r in rooms]
    members = (
        supabase_admin.table("collab_room_members")
        .select("room_id")
        .in_("room_id", room_ids)
        .execute()
    )
    member_counts: dict[str, int] = {}
    for m in members.data or []:
        rid = m["room_id"]
        member_counts[rid] = member_counts.get(rid, 0) + 1

    return [
        CollabRoomResponse(
            id=r["id"],
            name=r["name"],
            description=r.get("description") or "",
            language=r.get("language") or "python",
            code=r.get("code") or "",
            created_by=r["created_by"],
            creator_email=r.get("creator_email"),
            is_active=r.get("is_active", True),
            created_at=r["created_at"],
            member_count=member_counts.get(r["id"], 0),
        )
        for r in rooms
    ]


@router.post("/rooms", response_model=CollabRoomResponse)
def create_collab_room(
    body: CollabRoomCreate,
    user: JWTPayload = Depends(get_current_user),
):
    """Create a new collab room."""
    user_id = user.sub
    email = user.email or ""

    room_row = (
        supabase_admin.table("collab_rooms")
        .insert(
            {
                "name": body.name,
                "description": body.description,
                "language": body.language,
                "code": "",
                "created_by": user_id,
                "creator_email": email,
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

    supabase_admin.table("collab_room_members").insert(
        {
            "room_id": room["id"],
            "user_id": user_id,
            "user_email": email,
            "user_color": None,
        }
    ).execute()

    return CollabRoomResponse(
        id=room["id"],
        name=room["name"],
        description=room.get("description") or "",
        language=room.get("language") or "python",
        code=room.get("code") or "",
        created_by=room["created_by"],
        creator_email=room.get("creator_email"),
        is_active=room.get("is_active", True),
        created_at=room["created_at"],
        member_count=1,
    )


@router.get("/rooms/{room_id}", response_model=CollabRoomDetail)
def get_collab_room(
    room_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Get room details and current code."""
    room = (
        supabase_admin.table("collab_rooms")
        .select("*")
        .eq("id", room_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    r = room.data

    member = (
        supabase_admin.table("collab_room_members")
        .select("id")
        .eq("room_id", room_id)
        .eq("user_id", user.sub)
        .execute()
    )
    is_member = bool(member.data and len(member.data) > 0)

    return CollabRoomDetail(
        id=r["id"],
        name=r["name"],
        description=r.get("description") or "",
        language=r.get("language") or "python",
        code=r.get("code") or "",
        created_by=r["created_by"],
        creator_email=r.get("creator_email"),
        is_active=r.get("is_active", True),
        created_at=r["created_at"],
        is_member=is_member,
    )


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collab_room(
    room_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Delete room (creator only)."""
    room = (
        supabase_admin.table("collab_rooms")
        .select("created_by")
        .eq("id", room_id)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    if room.data["created_by"] != user.sub:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can delete this room",
        )
    supabase_admin.table("collab_rooms").delete().eq("id", room_id).execute()
    return None


@router.post("/rooms/{room_id}/join", response_model=CollabRoomDetail)
def join_collab_room(
    room_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Join a collab room."""
    room = (
        supabase_admin.table("collab_rooms")
        .select("*")
        .eq("id", room_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    r = room.data

    supabase_admin.table("collab_room_members").upsert(
        {
            "room_id": room_id,
            "user_id": user.sub,
            "user_email": user.email or "",
            "user_color": None,
        },
        on_conflict="room_id,user_id",
    ).execute()

    return CollabRoomDetail(
        id=r["id"],
        name=r["name"],
        description=r.get("description") or "",
        language=r.get("language") or "python",
        code=r.get("code") or "",
        created_by=r["created_by"],
        creator_email=r.get("creator_email"),
        is_active=r.get("is_active", True),
        created_at=r["created_at"],
        is_member=True,
    )


@router.post("/rooms/{room_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_collab_room(
    room_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Leave a collab room."""
    supabase_admin.table("collab_room_members").delete().eq(
        "room_id", room_id
    ).eq("user_id", user.sub).execute()
    return None


@router.patch("/rooms/{room_id}/code")
def save_collab_room_code(
    room_id: str,
    body: CollabRoomCodeUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    """Save current code snapshot to database."""
    member = (
        supabase_admin.table("collab_room_members")
        .select("id")
        .eq("room_id", room_id)
        .eq("user_id", user.sub)
        .execute()
    )
    if not member.data or len(member.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member to save code",
        )
    room = (
        supabase_admin.table("collab_rooms")
        .select("id")
        .eq("id", room_id)
        .single()
        .execute()
    )
    if not room.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    supabase_admin.table("collab_rooms").update({"code": body.code}).eq(
        "id", room_id
    ).execute()
    return {"ok": True}