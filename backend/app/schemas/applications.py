from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import ApplicationStatusEnum
from app.schemas.catalog import VacancyOut, VacancyUpsertIn
from app.schemas.common import UtcDatetime


class ApplicationCreate(BaseModel):
    vacancy: VacancyUpsertIn
    applied_at: UtcDatetime | None = None
    cover_letter: str | None = Field(None, max_length=20_000)


class ApplicationUpdate(BaseModel):
    applied_at: UtcDatetime | None = None
    cover_letter: str | None = Field(None, max_length=20_000)


class StatusCreate(BaseModel):
    status: ApplicationStatusEnum
    changed_at: UtcDatetime | None = None
    comment: str | None = Field(None, max_length=5_000)


class StatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ApplicationStatusEnum
    changed_at: datetime
    comment: str | None


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vacancy: VacancyOut
    applied_at: datetime
    cover_letter: str | None
    current_status: ApplicationStatusEnum
    created_at: datetime
    updated_at: datetime


class ApplicationDetailOut(ApplicationOut):
    statuses: list[StatusOut]
