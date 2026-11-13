from tortoise import fields
from tortoise.models import Model

from app.models.base import TimestampMixin


class User(TimestampMixin, Model):
    """Пользователь расширения.

    Создаётся анонимным (email и пароль пустые) при первом запуске расширения.
    Регистрация проставляет email и пароль этому же пользователю, история сохраняется.
    """
    id = fields.IntField(primary_key=True)
    email = fields.CharField(max_length=320, unique=True, null=True)
    password_hash = fields.CharField(max_length=255, null=True)
    display_name = fields.CharField(max_length=100, null=True)
    is_active = fields.BooleanField(default=True)

    sessions: fields.ReverseRelation["AuthSession"]

    class Meta:
        table = "users"

    @property
    def is_registered(self) -> bool:
        return self.email is not None


class AuthSession(Model):
    """Сессия одной установки расширения, хранит хеш refresh-токена."""
    id = fields.UUIDField(primary_key=True)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="sessions", on_delete=fields.CASCADE
    )
    refresh_token_hash = fields.CharField(max_length=64, unique=True)
    prev_refresh_token_hash = fields.CharField(max_length=64, null=True, db_index=True)
    rotated_at = fields.DatetimeField(null=True)
    device_label = fields.CharField(max_length=200, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    last_used_at = fields.DatetimeField()
    expires_at = fields.DatetimeField()
    revoked_at = fields.DatetimeField(null=True)

    class Meta:
        table = "auth_sessions"
