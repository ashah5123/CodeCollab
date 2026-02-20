from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

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


def _get_submission_or_404(submission_id: str) -> dict:
    row = (
        supabase_admin.table("submissions")
        .select("*")
        .eq("id", submission_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return row.data


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
    row = (
        supabase_admin.table("submissions")
        .insert(
            {
                "user_id": user.sub,
                "user_email": user.email or "",
                "title": body.title,
                "code": body.code,
                "language": body.language,
                "description": body.description,
                "status": "pending",
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission",
        )
    return row.data[0]


@router.get("/{submission_id}")
def get_submission(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    return _get_submission_or_404(submission_id)


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
        .update({"description": body.description})
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
