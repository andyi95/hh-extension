from dataclasses import dataclass
from datetime import timedelta

from tortoise import timezone

from app.config import settings
from app.core.security import create_access_token, generate_refresh_token, hash_token
from app.models import AuthSession, User


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


def _issue(session: AuthSession, refresh_token: str) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(session.user_id, session.id),
        refresh_token=refresh_token,
        expires_in=settings.access_ttl_min * 60,
    )


async def create_session(user: User, device_label: str | None) -> TokenPair:
    refresh_token = generate_refresh_token()
    now = timezone.now()
    session = await AuthSession.create(
        user=user,
        refresh_token_hash=hash_token(refresh_token),
        device_label=device_label,
        last_used_at=now,
        expires_at=now + timedelta(days=settings.refresh_ttl_days),
    )
    return _issue(session, refresh_token)


async def rotate_refresh(refresh_token: str) -> TokenPair | None:
    """Выдаёт новую пару токенов по refresh-токену, старый перестаёт действовать.

    Предыдущий токен принимается ещё REFRESH_GRACE_SEC после ротации: если ответ на
    прошлый refresh потерялся, расширение не теряет сессию (а аноним — свои данные).
    Возвращает None, если токен неизвестен, просрочен или сессия отозвана.
    """
    token_hash = hash_token(refresh_token)
    now = timezone.now()

    session = (
        await AuthSession.filter(refresh_token_hash=token_hash).select_related("user").first()
    )
    is_current = session is not None
    if session is None:
        session = (
            await AuthSession.filter(prev_refresh_token_hash=token_hash)
            .select_related("user")
            .first()
        )
        grace = timedelta(seconds=settings.refresh_grace_sec)
        if session is None or session.rotated_at is None or now - session.rotated_at > grace:
            return None

    if session.revoked_at is not None or session.expires_at <= now or not session.user.is_active:
        return None

    new_token = generate_refresh_token()
    if is_current:
        # Обычная ротация: текущий токен становится «предыдущим», окно отсчитывается от сейчас.
        session.prev_refresh_token_hash = token_hash
        session.rotated_at = now
    # При повторе со старым токеном окно не продлеваем; токен, который клиент
    # так и не получил, просто заменяется новым.
    session.refresh_token_hash = hash_token(new_token)
    session.last_used_at = now
    session.expires_at = now + timedelta(days=settings.refresh_ttl_days)
    await session.save()
    return _issue(session, new_token)


async def revoke_session(session: AuthSession) -> None:
    session.revoked_at = timezone.now()
    await session.save(update_fields=["revoked_at"])


async def revoke_other_sessions(user: User, keep: AuthSession) -> None:
    await AuthSession.filter(user=user, revoked_at=None).exclude(id=keep.id).update(
        revoked_at=timezone.now()
    )
