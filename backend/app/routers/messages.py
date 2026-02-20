from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/messages", tags=["messages"])


class DirectMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


@router.get("/conversations")
def list_conversations(user: JWTPayload = Depends(get_current_user)):
    """Return each distinct conversation partner with their latest message."""
    sent = (
        supabase_admin.table("direct_messages")
        .select("recipient_id, recipient_email, content, created_at")
        .eq("sender_id", user.sub)
        .order("created_at", desc=True)
        .execute()
    )
    received = (
        supabase_admin.table("direct_messages")
        .select("sender_id, sender_email, content, created_at")
        .eq("recipient_id", user.sub)
        .order("created_at", desc=True)
        .execute()
    )

    # Build a map of partner_id -> latest message snippet
    partners: dict[str, dict] = {}
    for msg in sent.data or []:
        pid = msg["recipient_id"]
        if pid not in partners:
            partners[pid] = {
                "user_id": pid,
                "user_email": msg.get("recipient_email", ""),
                "last_message": msg["content"],
                "last_at": msg["created_at"],
            }
    for msg in received.data or []:
        pid = msg["sender_id"]
        if pid not in partners:
            partners[pid] = {
                "user_id": pid,
                "user_email": msg.get("sender_email", ""),
                "last_message": msg["content"],
                "last_at": msg["created_at"],
            }

    return sorted(partners.values(), key=lambda x: x["last_at"], reverse=True)


@router.get("/{other_user_id}")
def get_conversation(
    other_user_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Return full message thread between current user and another user."""
    sent = (
        supabase_admin.table("direct_messages")
        .select("*")
        .eq("sender_id", user.sub)
        .eq("recipient_id", other_user_id)
        .execute()
    )
    received = (
        supabase_admin.table("direct_messages")
        .select("*")
        .eq("sender_id", other_user_id)
        .eq("recipient_id", user.sub)
        .execute()
    )
    all_messages = (sent.data or []) + (received.data or [])
    all_messages.sort(key=lambda m: m["created_at"])
    return all_messages


@router.post("/{other_user_id}", status_code=status.HTTP_201_CREATED)
def send_message(
    other_user_id: str,
    body: DirectMessageCreate,
    user: JWTPayload = Depends(get_current_user),
):
    if other_user_id == user.sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send a message to yourself",
        )
    row = (
        supabase_admin.table("direct_messages")
        .insert(
            {
                "sender_id": user.sub,
                "sender_email": user.email or "",
                "recipient_id": other_user_id,
                "content": body.content,
                "is_read": False,
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message",
        )
    return row.data[0]


@router.patch("/{other_user_id}/read")
def mark_as_read(
    other_user_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Mark all messages from other_user_id to current user as read."""
    supabase_admin.table("direct_messages").update({"is_read": True}).eq(
        "sender_id", other_user_id
    ).eq("recipient_id", user.sub).eq("is_read", False).execute()
    return {"ok": True}
