from tortoise import fields, timezone
from tortoise.models import Model

from app.models.base import TimestampMixin
from app.models.catalog import Vacancy
from app.models.enums import ApplicationStatusEnum
from app.models.user import User


class Application(TimestampMixin, Model):
    """Отклик пользователя на вакансию."""
    id = fields.IntField(primary_key=True)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="applications", on_delete=fields.CASCADE
    )
    vacancy: fields.ForeignKeyRelation[Vacancy] = fields.ForeignKeyField(
        "models.Vacancy", related_name="applications", on_delete=fields.CASCADE
    )
    applied_at = fields.DatetimeField(default=timezone.now)
    cover_letter = fields.TextField(null=True)
    # Последний статус из истории — для фильтров и бейджа на странице вакансии.
    current_status = fields.CharEnumField(
        ApplicationStatusEnum, max_length=20, default=ApplicationStatusEnum.SENT
    )

    statuses: fields.ReverseRelation["ApplicationStatus"]

    class Meta:
        table = "applications"
        unique_together = (("user", "vacancy"),)


class ApplicationStatus(Model):
    """Запись истории статусов отклика."""
    id = fields.IntField(primary_key=True)
    application: fields.ForeignKeyRelation[Application] = fields.ForeignKeyField(
        "models.Application", related_name="statuses", on_delete=fields.CASCADE
    )
    status = fields.CharEnumField(ApplicationStatusEnum, max_length=20)
    changed_at = fields.DatetimeField(default=timezone.now)
    comment = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "application_statuses"
        ordering = ["changed_at", "id"]
