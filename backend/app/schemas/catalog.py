from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import HhId


class CompanyIn(BaseModel):
    hh_id: HhId | None = None
    name: str = Field(min_length=1, max_length=255)


class VacancyIn(BaseModel):
    """Данные вакансии, спарсенные расширением со страницы hh.ru."""

    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    url: str = Field(min_length=1, max_length=500)
    company: CompanyIn | None = None


class VacancyUpsertIn(VacancyIn):
    hh_id: HhId


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hh_id: str | None
    name: str


class VacancyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hh_id: str
    title: str
    description: str | None
    url: str
    company: CompanyOut | None


class VacancyBriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hh_id: str
    title: str


class RatingSummary(BaseModel):
    average: float | None
    count: int


class VacancyDetailOut(VacancyOut):
    rating: RatingSummary


class CompanyDetailOut(CompanyOut):
    rating: RatingSummary


class PublicReviewOut(BaseModel):
    """Публичный отзыв — без автора."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    vacancy: VacancyBriefOut
    rating: int
    text: str | None
    created_at: datetime
