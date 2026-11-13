from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, StringConstraints

HhId = Annotated[str, StringConstraints(pattern=r"^\d{1,20}$")]


def _ensure_utc(value: datetime) -> datetime:
    # Время без часового пояса считаем UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_ensure_utc)]


class Page[T](BaseModel):
    items: list[T]
    total: int
