from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.models import AuthSession, User

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _session_from_token(token: str) -> AuthSession:
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
        session_id = payload["sid"]
    except (jwt.PyJWTError, ValueError):
        raise _unauthorized("Invalid or expired token") from None

    # Проверяем сессию в БД, чтобы logout и отзыв сессии действовали сразу,
    # а не после истечения access-токена.
    session = (
        await AuthSession.filter(id=session_id, user_id=user_id).select_related("user").first()
    )
    if session is None or session.revoked_at is not None or not session.user.is_active:
        raise _unauthorized("Session is no longer valid")
    return session


async def get_current_session(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthSession:
    if credentials is None:
        raise _unauthorized()
    return await _session_from_token(credentials.credentials)


async def get_optional_session(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthSession | None:
    """Сессия, если заголовок передан. Переданный, но невалидный токен — 401,
    а не молчаливый игнор: иначе /auth/login мог бы не слить данные устройства."""
    if credentials is None:
        return None
    return await _session_from_token(credentials.credentials)


async def get_current_user(
    session: Annotated[AuthSession, Depends(get_current_session)],
) -> User:
    return session.user


async def require_registered(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_registered:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration required")
    return user


CurrentSession = Annotated[AuthSession, Depends(get_current_session)]
OptionalSession = Annotated[AuthSession | None, Depends(get_optional_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
RegisteredUser = Annotated[User, Depends(require_registered)]


@dataclass
class Pagination:
    limit: int
    offset: int


def pagination(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


PageParams = Annotated[Pagination, Depends(pagination)]
