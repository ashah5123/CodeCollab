from fastapi import APIRouter, Depends

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: JWTPayload = Depends(get_current_user)):
    rows = (
        supabase_admin.table("notifications")
        .select("*")
        .eq("user_id", user.sub)
        .order("created_at", desc=True)
        .execute()
    )
    return rows.data or []


@router.patch("/read")
def mark_all_read(user: JWTPayload = Depends(get_current_user)):
    supabase_admin.table("notifications").update({"is_read": True}).eq(
        "user_id", user.sub
    ).eq("is_read", False).execute()
    return {"ok": True}
