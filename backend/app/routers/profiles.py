"""
Profiles router.

Run the following SQL in your Supabase SQL editor to create the required table:

    create table if not exists public.profiles (
        id          uuid primary key default gen_random_uuid(),
        user_id     uuid not null unique references auth.users(id) on delete cascade,
        username    text not null unique,
        bio         text,
        avatar_url  text,
        created_at  timestamptz not null default now()
    );

    alter table public.profiles enable row level security;
    create policy "Public profiles are viewable by everyone"
        on public.profiles for select using (true);
    create policy "Users can update their own profile"
        on public.profiles for update using (auth.uid() = user_id);

Route order matters: PUT /me must be declared before GET /{username} so
FastAPI does not treat the literal string "me" as a username path parameter.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/profiles", tags=["profiles"])


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=500)


# ── 1. PUT /profiles/me — must come before /{username} ───────────────────────

@router.put("/me")
def update_my_profile(
    body: ProfileUpdate,
    user: JWTPayload = Depends(get_current_user),
):
    """Create or update the current user's profile."""
    try:
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided")

        existing = (
            supabase_admin.table("profiles")
            .select("id")
            .eq("user_id", user.sub)
            .execute()
        )

        if existing.data:
            row = (
                supabase_admin.table("profiles")
                .update(updates)
                .eq("user_id", user.sub)
                .execute()
            )
        else:
            row = (
                supabase_admin.table("profiles")
                .insert({"user_id": user.sub, **updates})
                .execute()
            )

        if not row.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save profile")
        return row.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ── 2. GET /profiles/{username} ───────────────────────────────────────────────

@router.get("/{username}")
def get_profile(username: str):
    """Return a public profile by username. No auth required."""
    try:
        row = (
            supabase_admin.table("profiles")
            .select("id, user_id, username, bio, avatar_url, created_at")
            .eq("username", username)
            .single()
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        return row.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ── 3. GET /profiles/{username}/submissions ───────────────────────────────────

@router.get("/{username}/submissions")
def get_user_submissions(
    username: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Return all submissions by the user identified by username."""
    try:
        profile = (
            supabase_admin.table("profiles")
            .select("user_id")
            .eq("username", username)
            .single()
            .execute()
        )
        if not profile.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

        rows = (
            supabase_admin.table("submissions")
            .select("id, title, language, status, created_at, user_email")
            .eq("user_id", profile.data["user_id"])
            .order("created_at", desc=True)
            .execute()
        )
        return rows.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ── 4. GET /profiles/{username}/activity ──────────────────────────────────────

@router.get("/{username}/activity")
def get_user_activity(
    username: str,
    user: JWTPayload = Depends(get_current_user),
):
    """Return all comments left by the user identified by username."""
    try:
        profile = (
            supabase_admin.table("profiles")
            .select("user_id")
            .eq("username", username)
            .single()
            .execute()
        )
        if not profile.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

        rows = (
            supabase_admin.table("comments")
            .select("id, submission_id, body, line_number, created_at, user_email")
            .eq("user_id", profile.data["user_id"])
            .order("created_at", desc=True)
            .execute()
        )
        return rows.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
