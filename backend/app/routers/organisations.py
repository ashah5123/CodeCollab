"""
Organisations router. Uses organisation_id (not org_id) to match DB schema
for organisation_members and org_chat_messages.

Route order matters: /me must be declared before /{organisation_id} so FastAPI
does not treat the literal string "me" as a UUID path parameter.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/organisations", tags=["organisations"])


# 1. GET /organisations/me — must be first, before /{organisation_id}
@router.get("/me")
def get_my_organisations(user: JWTPayload = Depends(get_current_user)):
    """Return all organisations the current user is a member of."""
    try:
        members = (
            supabase_admin.table("organisation_members")
            .select("organisation_id")
            .eq("user_id", user.sub)
            .execute()
        )
        if not members.data:
            return []
        organisation_ids = [m["organisation_id"] for m in members.data]
        rows = (
            supabase_admin.table("organisations")
            .select("*")
            .in_("id", organisation_ids)
            .execute()
        )
        return rows.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 2. POST /organisations
@router.post("")
def create_organisation(
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Create organisation and add creator as owner."""
    try:
        name = body.get("name") or "New Organisation"
        row = (
            supabase_admin.table("organisations")
            .insert({"name": name, "created_by": user.sub})
            .execute()
        )
        if not row.data or len(row.data) == 0:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create")
        org = row.data[0]
        supabase_admin.table("organisation_members").insert(
            {"organisation_id": org["id"], "user_id": user.sub, "role": "admin"}
        ).execute()
        return org
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 3. POST /organisations/join
@router.post("/join")
def join_organisation_by_code(
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Join an organisation by invite_code."""
    try:
        invite_code = body.get("invite_code")
        if not invite_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invite_code required")
        org = (
            supabase_admin.table("organisations")
            .select("*")
            .eq("invite_code", invite_code)
            .single()
            .execute()
        )
        if not org.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")
        organisation_id = str(org.data["id"])
        supabase_admin.table("organisation_members").upsert(
            {"organisation_id": organisation_id, "user_id": user.sub, "role": "member"},
            on_conflict="organisation_id,user_id",
        ).execute()
        return {"joined": organisation_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 4. GET /organisations/{organisation_id}
@router.get("/{organisation_id}")
def get_organisation(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Get one organisation by id."""
    try:
        row = (
            supabase_admin.table("organisations")
            .select("*")
            .eq("id", organisation_id)
            .single()
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
        member = (
            supabase_admin.table("organisation_members")
            .select("id")
            .eq("organisation_id", organisation_id)
            .eq("user_id", user.sub)
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
        return row.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 5. GET /organisations/{organisation_id}/members
@router.get("/{organisation_id}/members")
def list_organisation_members(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """List members of an organisation."""
    try:
        member = (
            supabase_admin.table("organisation_members")
            .select("id")
            .eq("organisation_id", organisation_id)
            .eq("user_id", user.sub)
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
        rows = (
            supabase_admin.table("organisation_members")
            .select("*")
            .eq("organisation_id", organisation_id)
            .execute()
        )
        return rows.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 6. GET /organisations/{organisation_id}/chat
@router.get("/{organisation_id}/chat")
def list_org_chat_messages(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """List org chat messages."""
    try:
        member = (
            supabase_admin.table("organisation_members")
            .select("id")
            .eq("organisation_id", organisation_id)
            .eq("user_id", user.sub)
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
        rows = (
            supabase_admin.table("org_chat_messages")
            .select("*")
            .eq("organisation_id", organisation_id)
            .order("created_at", desc=False)
            .execute()
        )
        return rows.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 7. DELETE /organisations/{organisation_id}/leave
@router.delete("/{organisation_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_organisation(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Remove the current user from the organisation. Admin/creator cannot leave (403)."""
    try:
        org = (
            supabase_admin.table("organisations")
            .select("created_by")
            .eq("id", organisation_id)
            .single()
            .execute()
        )
        if not org.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
        result = (
            supabase_admin.table("organisation_members")
            .delete()
            .eq("organisation_id", organisation_id)
            .eq("user_id", user.sub)
            .execute()
        )
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 8. POST /organisations/{organisation_id}/chat
@router.post("/{organisation_id}/chat")
def post_org_chat_message(
    organisation_id: str,
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Post a message to org chat."""
    try:
        member = (
            supabase_admin.table("organisation_members")
            .select("id")
            .eq("organisation_id", organisation_id)
            .eq("user_id", user.sub)
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
        content = (body.get("content") or "").strip()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="content required")
        row = (
            supabase_admin.table("org_chat_messages")
            .insert({"organisation_id": organisation_id, "user_id": user.sub, "content": content})
            .execute()
        )
        if not row.data or len(row.data) == 0:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send")
        return row.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
