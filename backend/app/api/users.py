from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentSession, CurrentUser
from app.core.security import hash_password, verify_password
from app.schemas.auth import UserOut, UserUpdate
from app.services.sessions import revoke_other_sessions

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdate, session: CurrentSession):
    user = session.user
    changes = body.model_dump(exclude_unset=True)

    if "display_name" in changes:
        user.display_name = body.display_name

    if body.new_password is not None:
        if not user.is_registered:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration required")
        if body.current_password is None or not verify_password(
            body.current_password, user.password_hash
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
        user.password_hash = hash_password(body.new_password)
        # Смена пароля выкидывает все остальные устройства.
        await revoke_other_sessions(user, keep=session)

    await user.save()
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser):
    """Удаляет пользователя и все его данные: сессии, отклики, отзывы."""
    await user.delete()
