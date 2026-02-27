import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.supabase_client import supabase_admin

logger = logging.getLogger(__name__)

HTTPBearerScheme = HTTPBearer(auto_error=False)


class JWTPayload(BaseModel):
    sub: str
    email: str | None = None
    role: str | None = None


def get_user_from_token(token: str) -> JWTPayload:
    try:
        response = supabase_admin.auth.get_user(token)
        if response.user is None:
            logger.warning("Auth failed: get_user returned no user (token prefix: %s...)", token[:20])
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        user = response.user
        return JWTPayload(
            sub=str(user.id),
            email=user.email,
            role=getattr(user, "role", None),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Auth exception (token prefix: %s...): %s", token[:20], str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from e


async def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(HTTPBearerScheme),
) -> JWTPayload:
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
        )
    return get_user_from_token(cred.credentials)
