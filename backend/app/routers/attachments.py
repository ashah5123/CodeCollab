import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import JWTPayload, get_current_user
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/submissions", tags=["attachments"])

BUCKET = "submission-attachments"
MAX_BYTES = 10 * 1024 * 1024  # 10 MB

ALLOWED_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "text/plain", "text/markdown", "text/csv",
    "application/json",
    "application/zip", "application/x-tar", "application/gzip",
}


def _ensure_bucket() -> None:
    try:
        supabase_admin.storage.create_bucket(
            BUCKET, options={"public": True, "allowedMimeTypes": list(ALLOWED_TYPES)}
        )
    except Exception:
        pass  # Bucket already exists — safe to ignore


@router.post("/{submission_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    submission_id: str,
    file: UploadFile = File(...),
    user: JWTPayload = Depends(get_current_user),
):
    _ensure_bucket()

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large (max 10 MB)",
        )

    safe_name = (file.filename or "file").replace(" ", "_")
    storage_path = f"{submission_id}/{uuid.uuid4().hex[:8]}_{safe_name}"
    content_type = file.content_type or "application/octet-stream"

    try:
        supabase_admin.storage.from_(BUCKET).upload(
            storage_path,
            content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {exc}",
        ) from exc

    public_url = supabase_admin.storage.from_(BUCKET).get_public_url(storage_path)

    row = (
        supabase_admin.table("submission_attachments")
        .insert(
            {
                "submission_id": submission_id,
                "filename": file.filename or "file",
                "storage_path": storage_path,
                "url": public_url,
                "size": len(content),
                "content_type": content_type,
                "uploaded_by": user.sub,
            }
        )
        .execute()
    )
    if not row.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save attachment metadata",
        )
    return row.data[0]


@router.get("/{submission_id}/attachments")
def list_attachments(
    submission_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    rows = (
        supabase_admin.table("submission_attachments")
        .select("*")
        .eq("submission_id", submission_id)
        .order("created_at")
        .execute()
    )
    return rows.data or []


@router.delete("/{submission_id}/attachments/{attachment_id}")
def delete_attachment(
    submission_id: str,
    attachment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    row = (
        supabase_admin.table("submission_attachments")
        .select("*")
        .eq("id", attachment_id)
        .eq("submission_id", submission_id)
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    attachment = row.data[0]
    if attachment.get("uploaded_by") != user.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the uploader")

    try:
        supabase_admin.storage.from_(BUCKET).remove([attachment["storage_path"]])
    except Exception:
        pass  # Storage delete failure should not block DB cleanup

    supabase_admin.table("submission_attachments").delete().eq("id", attachment_id).execute()
    return {"message": "Attachment deleted"}
