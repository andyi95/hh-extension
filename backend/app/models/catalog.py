from tortoise import fields
from tortoise.models import Model

from app.models.base import TimestampMixin


class Company(TimestampMixin, Model):
    """Работодатель. Общий каталог для всех пользователей."""

    id = fields.IntField(primary_key=True)
    # ID работодателя на hh.ru (hh.ru/employer/<id>); пусто, если ссылки на работодателя нет.
    hh_id = fields.CharField(max_length=20, unique=True, null=True)
    name = fields.CharField(max_length=255)

    vacancies: fields.ReverseRelation["Vacancy"]

    class Meta:
        table = "companies"


class Vacancy(TimestampMixin, Model):
    """Вакансия. Общий каталог для всех пользователей."""

    id = fields.IntField(primary_key=True)
    # ID вакансии на hh.ru (hh.ru/vacancy/<id>).
    hh_id = fields.CharField(max_length=20, unique=True)
    # null — работодатель скрыт.
    company: fields.ForeignKeyNullableRelation[Company] = fields.ForeignKeyField(
        "models.Company", related_name="vacancies", null=True, on_delete=fields.SET_NULL
    )
    title = fields.CharField(max_length=500)
    description = fields.TextField(null=True)
    url = fields.CharField(max_length=500)

    class Meta:
        table = "vacancies"
