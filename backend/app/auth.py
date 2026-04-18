from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Request, Response, status

from app.config import settings
from app.users import authenticate_user, get_user_by_username


TOKEN_COOKIE_NAME = "dashboard_token"


def create_access_token(username: str, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_exp_minutes
    )
    payload = {"sub": username, "role": role, "exp": expires_at}
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=TOKEN_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.access_token_exp_minutes * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(TOKEN_COOKIE_NAME, path="/")


def require_user(request: Request) -> dict[str, str]:
    token = request.cookies.get(TOKEN_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        payload = jwt.decode(token, settings.app_secret_key, algorithms=["HS256"])
        username = payload.get("sub")
        role = payload.get("role")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = get_user_by_username(username)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not allowed",
        )

    return {"username": user.username, "role": user.role}


def require_admin(request: Request) -> dict[str, str]:
    user = require_user(request)
    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user
