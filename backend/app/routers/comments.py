from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/comments", tags=["comments"])


class CommentCreate(BaseModel):
    submission_id: str
    body: str = Field(min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def _get_comment_or_404(comment_id: str) -> dict:
    row = (
        supabase_admin.table("comments")
        .select("*")
        .eq("id", comment_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return row.data


def _require_author(comment: dict, user: JWTPayload) -> None:
    if comment.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_comment(
    body: CommentCreate,
    user: JWTPayload = Depends(get_current_user),
):
    row = (
        supabase_admin.table("comments")
        .insert(
            {
                "submission_id": body.submission_id,
                "user_id": user.sub,
                "user_email": user.email or "",
                "body": body.body,
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create comment",
        )
    return row.data[0]


@router.patch("/{comment_id}")
def update_comment(
    comment_id: str,
    body: CommentUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    comment = _get_comment_or_404(comment_id)
    _require_author(comment, user)
    row = (
        supabase_admin.table("comments")
        .update({"body": body.body})
        .eq("id", comment_id)
        .execute()
    )
    return row.data[0] if row.data else comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    comment = _get_comment_or_404(comment_id)
    _require_author(comment, user)
    supabase_admin.table("comments").delete().eq("id", comment_id).execute()
    return None
