"""
GET /api/v1/leaderboard — top 10 by submissions, comments, and reactions received.
"""
from fastapi import APIRouter, Depends

from app.auth import get_current_user, JWTPayload
from app.supabase_client import supabase_admin

router = APIRouter(prefix="/api/v1", tags=["leaderboard"])


@router.get("/leaderboard")
def get_leaderboard(user: JWTPayload = Depends(get_current_user)):
    """
    Return top 10 users by most submissions, most comments, and most reactions received.
    Each list contains { user_id, user_email, count }.
    """
    r = supabase_admin.rpc("get_leaderboard").execute()
    if not r.data:
        return {
            "by_submissions": [],
            "by_comments": [],
            "by_reactions_received": [],
        }
    data = r.data
    if isinstance(data, list) and len(data) > 0:
        data = data[0]
    return {
        "by_submissions": data.get("by_submissions") or [],
        "by_comments": data.get("by_comments") or [],
        "by_reactions_received": data.get("by_reactions_received") or [],
    }
