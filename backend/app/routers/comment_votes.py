from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import JWTPayload, get_current_user
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/comments", tags=["votes"])


class VotePayload(BaseModel):
    vote: int = Field(..., description="1 for upvote, -1 for downvote, 0 to remove")


def _tally(votes: list[dict], user_id: str) -> dict:
    upvotes   = sum(1 for v in votes if v["vote"] == 1)
    downvotes = sum(1 for v in votes if v["vote"] == -1)
    user_vote = next((v["vote"] for v in votes if v["user_id"] == user_id), 0)
    return {
        "upvotes": upvotes,
        "downvotes": downvotes,
        "net": upvotes - downvotes,
        "user_vote": user_vote,
    }


@router.post("/{comment_id}/vote")
def upsert_vote(
    comment_id: str,
    body: VotePayload,
    user: JWTPayload = Depends(get_current_user),
):
    if body.vote == 0:
        supabase_admin.table("comment_votes").delete().eq("comment_id", comment_id).eq(
            "user_id", user.sub
        ).execute()
        return {"vote": 0, "net": 0}

    if body.vote not in (1, -1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="vote must be 1, -1, or 0")

    existing = (
        supabase_admin.table("comment_votes")
        .select("id")
        .eq("comment_id", comment_id)
        .eq("user_id", user.sub)
        .execute()
    )

    if existing.data:
        row = (
            supabase_admin.table("comment_votes")
            .update({"vote": body.vote})
            .eq("comment_id", comment_id)
            .eq("user_id", user.sub)
            .execute()
        )
    else:
        row = (
            supabase_admin.table("comment_votes")
            .insert({"comment_id": comment_id, "user_id": user.sub, "vote": body.vote})
            .execute()
        )

    return row.data[0] if row.data else {"vote": body.vote}


@router.delete("/{comment_id}/vote", status_code=200)
def remove_vote(
    comment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    supabase_admin.table("comment_votes").delete().eq("comment_id", comment_id).eq(
        "user_id", user.sub
    ).execute()
    return {"message": "Vote removed"}


@router.get("/{comment_id}/votes")
def get_comment_votes(
    comment_id: str,
    user: JWTPayload = Depends(get_current_user),
):
    rows = (
        supabase_admin.table("comment_votes")
        .select("*")
        .eq("comment_id", comment_id)
        .execute()
    )
    return _tally(rows.data or [], user.sub)
