from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

HTTPBearerScheme = HTTPBearer(auto_error=False)


class JWTPayload(BaseModel):
    sub: str
    email: str | None = None
    role: str | None = None


def decode_supabase_token(token: str) -> JWTPayload:
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            audience="authenticated",
            algorithms=["HS256"],
        )
        return JWTPayload(
            sub=payload.get("sub", ""),
            email=payload.get("email"),
            role=payload.get("role"),
        )
    except JWTError as e:
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
    return decode_supabase_token(cred.credentials)
