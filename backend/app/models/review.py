from tortoise import fields
from tortoise.models import Model
from tortoise.validators import MaxValueValidator, MinValueValidator

from app.models.base import TimestampMixin
from app.models.catalog import Vacancy
from app.models.user import User


class Review(TimestampMixin, Model):
    """Отзыв пользователя о вакансии. Публичные отзывы показываются другим без автора."""

    id = fields.IntField(primary_key=True)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="reviews", on_delete=fields.CASCADE
    )
    vacancy: fields.ForeignKeyRelation[Vacancy] = fields.ForeignKeyField(
        "models.Vacancy", related_name="reviews", on_delete=fields.CASCADE
    )
    rating = fields.SmallIntField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    text = fields.TextField(null=True)
    is_public = fields.BooleanField(default=False)

    class Meta:
        table = "reviews"
        unique_together = (("user", "vacancy"),)
