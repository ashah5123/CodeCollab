from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class ChatMessageUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class ReactionCreate(BaseModel):
    emoji: str = Field(min_length=1, max_length=10)


def _get_message_or_404(message_id: str) -> dict:
    row = (
        supabase_admin.table("chat_messages")
        .select("*")
        .eq("id", message_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return row.data


def _require_author(message: dict, user: JWTPayload) -> None:
    if message.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")


@router.get("")
def list_messages(user: JWTPayload = Depends(get_current_user)):
    rows = (
        supabase_admin.table("chat_messages")
        .select("*")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    messages = list(reversed(rows.data or []))
    return messages


@router.post("", status_code=status.HTTP_201_CREATED)
def send_message(
    body: ChatMessageCreate,
    user: JWTPayload = Depends(get_current_user),
):
    row = (
        supabase_admin.table("chat_messages")
        .insert(
            {
                "user_id": user.sub,
                "user_email": user.email or "",
                "content": body.content,
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


@router.patch("/{message_id}")
def update_message(
    message_id: str,
    body: ChatMessageUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    message = _get_message_or_404(message_id)
    _require_author(message, user)
    row = (
        supabase_admin.table("chat_messages")
        .update({"content": body.content})
        .eq("id", message_id)
        .execute()
    )
    return row.data[0] if row.data else message


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    message_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    message = _get_message_or_404(message_id)
    _require_author(message, user)
    supabase_admin.table("chat_messages").delete().eq("id", message_id).execute()
    return None


@router.post("/{message_id}/react")
def toggle_reaction(
    message_id: str,
    body: ReactionCreate,
    user: JWTPayload = Depends(get_current_user),
):
    # Verify message exists
    _get_message_or_404(message_id)

    existing = (
        supabase_admin.table("chat_reactions")
        .select("id")
        .eq("message_id", message_id)
        .eq("user_id", user.sub)
        .eq("emoji", body.emoji)
        .execute()
    )
    if existing.data:
        # Toggle off
        supabase_admin.table("chat_reactions").delete().eq("id", existing.data[0]["id"]).execute()
        return {"toggled": "off", "emoji": body.emoji}
    else:
        # Toggle on
        supabase_admin.table("chat_reactions").insert(
            {
                "message_id": message_id,
                "user_id": user.sub,
                "user_email": user.email or "",
                "emoji": body.emoji,
            }
        ).execute()
        return {"toggled": "on", "emoji": body.emoji}
