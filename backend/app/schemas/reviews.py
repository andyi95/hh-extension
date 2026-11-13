from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import VacancyBriefOut
from app.schemas.common import HhId

Rating = Annotated[int, Field(ge=1, le=5)]
ReviewText = Annotated[str, Field(max_length=10_000)]


class ReviewCreate(BaseModel):
    vacancy_hh_id: HhId
    rating: Rating
    text: ReviewText | None = None
    is_public: bool = False


class ReviewUpdate(BaseModel):
    rating: Rating | None = None
    text: ReviewText | None = None
    is_public: bool | None = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vacancy: VacancyBriefOut
    rating: int
    text: str | None
    is_public: bool
    created_at: datetime
    updated_at: datetime
