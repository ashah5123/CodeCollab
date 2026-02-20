"""
Organisations router. Uses organisation_id (not org_id) to match DB schema
for organisation_members and org_chat_messages.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/organisations", tags=["organisations"])


@router.get("")
def list_organisations(user: JWTPayload = Depends(get_current_user)):
    """List organisations the user is a member of."""
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


@router.get("/{organisation_id}")
def get_organisation(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Get one organisation by id."""
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


@router.post("")
def create_organisation(
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Create organisation and add creator as owner."""
    name = body.get("name") or "New Organisation"
    slug = body.get("slug") or name.lower().replace(" ", "-")[:50]
    row = (
        supabase_admin.table("organisations")
        .insert({"name": name, "slug": slug, "created_by": user.sub})
        .execute()
    )
    if not row.data or len(row.data) == 0:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create")
    org = row.data[0]
    supabase_admin.table("organisation_members").insert(
        {"organisation_id": org["id"], "user_id": user.sub, "role": "owner"}
    ).execute()
    return org


@router.get("/{organisation_id}/members")
def list_organisation_members(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """List members of an organisation. Uses organisation_id."""
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


@router.post("/{organisation_id}/join")
def join_organisation(
    organisation_id: str,
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Join by invite_code. Body can contain invite_code or use org lookup."""
    invite_code = body.get("invite_code")
    if invite_code:
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
    org = (
        supabase_admin.table("organisations")
        .select("id")
        .eq("id", organisation_id)
        .single()
        .execute()
    )
    if not org.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    supabase_admin.table("organisation_members").upsert(
        {"organisation_id": organisation_id, "user_id": user.sub, "role": "member"},
        on_conflict="organisation_id,user_id",
    ).execute()
    return {"joined": organisation_id}


@router.get("/{organisation_id}/chat")
def list_org_chat_messages(
    organisation_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    """List org chat messages. Uses organisation_id."""
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


@router.post("/{organisation_id}/chat")
def post_org_chat_message(
    organisation_id: str,
    body: dict,
    user: JWTPayload = Depends(get_current_user),
):
    """Post a message to org chat. Uses organisation_id."""
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
