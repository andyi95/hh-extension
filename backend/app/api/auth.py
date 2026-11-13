from fastapi import APIRouter, HTTPException, status
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from app.api.deps import CurrentSession, CurrentUser, OptionalSession
from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.auth import DeviceIn, LoginIn, RefreshIn, RegisterIn, TokenOut, UserOut
from app.services.merge import merge_users
from app.services.sessions import create_session, revoke_session, rotate_refresh

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/device", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register_device(body: DeviceIn | None = None):
    """Первый запуск расширения: анонимный пользователь + токены устройства."""
    async with in_transaction():
        user = await User.create()
        return await create_session(user, body.device_label if body else None)


@router.post("/register", response_model=UserOut)
async def register(body: RegisterIn, user: CurrentUser):
    """Превращает анонимного пользователя устройства в аккаунт. История сохраняется."""
    if user.is_registered:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already registered")
    email = body.email.lower()
    if await User.exists(email=email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered, log in instead")

    user.email = email
    user.password_hash = hash_password(body.password)
    if body.display_name is not None:
        user.display_name = body.display_name
    try:
        await user.save(update_fields=["email", "password_hash", "display_name", "updated_at"])
    except IntegrityError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Email already registered, log in instead"
        ) from None
    return user


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, current: OptionalSession):
    """Вход в аккаунт. Если запрос пришёл с токеном анонимного пользователя этого
    устройства, его отклики и отзывы переносятся в аккаунт."""
    account = await User.get_or_none(email=body.email.lower())
    if not verify_password(body.password, account.password_hash if account else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not account.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    device_label = body.device_label or (current.device_label if current else None)
    async with in_transaction():
        if current is not None:
            if not current.user.is_registered:
                # Анонимный пользователь удаляется вместе со своей сессией.
                await merge_users(source=current.user, target=account)
            else:
                # Повторный вход или смена аккаунта на устройстве.
                await revoke_session(current)
        return await create_session(account, device_label)


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn):
    pair = await rotate_refresh(body.refresh_token)
    if pair is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(session: CurrentSession):
    if not session.user.is_registered:
        # У анонима нет способа войти обратно — данные были бы потеряны.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Anonymous device session cannot log out; use DELETE /users/me to erase data",
        )
    await revoke_session(session)
