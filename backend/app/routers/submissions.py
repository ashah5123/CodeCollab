import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/submissions", tags=["submissions"])


class SubmissionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1)
    language: str = Field(default="python", max_length=50)
    description: str = Field(default="", max_length=2000)


class StatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=50)


class CodeUpdate(BaseModel):
    code: str = Field(min_length=1)


class DescriptionUpdate(BaseModel):
    description: str = Field(max_length=2000)


def _notify_mentions(comment_body: str, submission_id: str, from_email: str) -> None:
    """Parse @email mentions and silently create in-app notifications for each mentioned user."""
    try:
        # Match @user@domain.tld — the full email address after the leading @
        emails = set(re.findall(r"@([\w.+-]+@[\w.+-]+\.[a-zA-Z]{2,})", comment_body))
        for email in emails:
            if email == from_email:
                continue
            # Look up user_id by email — try comments table first, then submissions
            result = (
                supabase_admin.table("comments")
                .select("user_id")
                .eq("user_email", email)
                .limit(1)
                .execute()
            )
            if not result.data:
                result = (
                    supabase_admin.table("submissions")
                    .select("user_id")
                    .eq("user_email", email)
                    .limit(1)
                    .execute()
                )
            if not result.data:
                continue
            target_user_id = result.data[0]["user_id"]
            supabase_admin.table("notifications").insert(
                {
                    "user_id": target_user_id,
                    "message": f"{from_email} mentioned you in a review comment",
                    "type": "mention",
                    "is_read": False,
                }
            ).execute()
    except Exception:
        pass  # Never block comment creation due to notification errors


def _get_submission_or_404(submission_id: str) -> dict:
    try:
        row = (
            supabase_admin.table("submissions")
            .select("*")
            .eq("id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return row.data[0]


def _require_owner(submission: dict, user: JWTPayload) -> None:
    if submission.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")


@router.get("")
def list_submissions(user: JWTPayload = Depends(get_current_user)):
    rows = (
        supabase_admin.table("submissions")
        .select("*")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return rows.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    user: JWTPayload = Depends(get_current_user),
):
    logger.info("create_submission: user=%s email=%s title=%r", user.sub, user.email, body.title)
    try:
        row = (
            supabase_admin.table("submissions")
            .insert(
                {
                    "user_id": user.sub,
                    "user_email": user.email or "",
                    "title": body.title,
                    "code": body.code,
                    "language": body.language,
                    "problem_description": body.description,
                    "status": "open",
                }
            )
            .execute()
        )
    except Exception as exc:
        logger.error("create_submission: DB insert failed for user=%s: %s", user.sub, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission",
        ) from exc
    if not row.data:
        logger.error("create_submission: insert returned no data for user=%s", user.sub)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission",
        )
    logger.info("create_submission: created submission id=%s for user=%s", row.data[0].get("id"), user.sub)
    return row.data[0]


@router.get("/{submission_id}")
def get_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("submissions")
            .select("id, user_id, user_email, title, code, language, status, problem_description, created_at")
            .eq("id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    submission = row.data[0]

    comments_row = (
        supabase_admin.table("comments")
        .select("*")
        .eq("submission_id", submission_id)
        .order("created_at", desc=False)
        .execute()
    )
    submission["comments"] = comments_row.data or []
    return submission


@router.get("/{submission_id}/comments")
def list_submission_comments(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    rows = (
        supabase_admin.table("comments")
        .select("*")
        .eq("submission_id", submission_id)
        .order("created_at", desc=False)
        .execute()
    )
    return rows.data or []


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    line_number: int | None = None


@router.post("/{submission_id}/comments", status_code=status.HTTP_201_CREATED)
def add_submission_comment(
    submission_id: str,
    body: CommentCreate,
    user: JWTPayload = Depends(get_current_user),
):
    _get_submission_or_404(submission_id)
    row = (
        supabase_admin.table("comments")
        .insert(
            {
                "submission_id": submission_id,
                "user_id": user.sub,
                "user_email": user.email or "",
                "body": body.body,
                "line_number": body.line_number if body.line_number is not None else 0,
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create comment",
        )
    comment = row.data[0]
    # Fire-and-forget: notify any @mentioned users
    _notify_mentions(body.body, submission_id, user.email or "")
    return comment


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.put("/{submission_id}/comments/{comment_id}")
def edit_submission_comment(
    submission_id: str,
    comment_id: str,
    body: CommentUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("comments")
            .select("*")
            .eq("id", comment_id)
            .eq("submission_id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    comment = row.data[0]
    if comment.get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")
    updated = (
        supabase_admin.table("comments")
        .update({"body": body.body})
        .eq("id", comment_id)
        .execute()
    )
    return updated.data[0] if updated.data else comment


@router.delete("/{submission_id}/comments/{comment_id}")
def delete_submission_comment(
    submission_id: str,
    comment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    try:
        row = (
            supabase_admin.table("comments")
            .select("user_id")
            .eq("id", comment_id)
            .eq("submission_id", submission_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found") from exc
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if row.data[0].get("user_id") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the author")
    supabase_admin.table("comments").delete().eq("id", comment_id).execute()
    return {"message": "Comment deleted successfully"}


@router.patch("/{submission_id}/status")
def update_submission_status(
    submission_id: str,
    body: StatusUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"status": body.status})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.patch("/{submission_id}/code")
def update_submission_code(
    submission_id: str,
    body: CodeUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"code": body.code})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.patch("/{submission_id}/description")
def update_submission_description(
    submission_id: str,
    body: DescriptionUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    row = (
        supabase_admin.table("submissions")
        .update({"problem_description": body.description})
        .eq("id", submission_id)
        .execute()
    )
    return row.data[0] if row.data else submission


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    submission = _get_submission_or_404(submission_id)
    _require_owner(submission, user)
    supabase_admin.table("submissions").delete().eq("id", submission_id).execute()
    return None
