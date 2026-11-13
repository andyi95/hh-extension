from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, PageParams
from app.models import Review, User, Vacancy
from app.schemas.common import Page
from app.schemas.reviews import ReviewCreate, ReviewOut, ReviewUpdate

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _check_can_publish(user: User, is_public: bool | None) -> None:
    # Токены устройства бесплатны, поэтому публиковать могут только зарегистрированные.
    if is_public and not user.is_registered:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration required to publish reviews")


async def _get_own(user: User, review_id: int) -> Review:
    review = await Review.get_or_none(id=review_id, user=user).select_related("vacancy")
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    return review


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(body: ReviewCreate, user: CurrentUser):
    _check_can_publish(user, body.is_public)
    vacancy = await Vacancy.get_or_none(hh_id=body.vacancy_hh_id)
    if vacancy is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Vacancy not found; save it via PUT /vacancies/{hh_id}"
        )
    if await Review.exists(user=user, vacancy=vacancy):
        raise HTTPException(status.HTTP_409_CONFLICT, "Review for this vacancy exists")
    review = await Review.create(
        user=user,
        vacancy=vacancy,
        rating=body.rating,
        text=body.text,
        is_public=body.is_public,
    )
    return await _get_own(user, review.id)


@router.get("", response_model=Page[ReviewOut])
async def list_reviews(
    user: CurrentUser,
    page: PageParams,
    vacancy_hh_id: Annotated[str | None, Query(pattern=r"^\d{1,20}$")] = None,
):
    query = Review.filter(user=user)
    if vacancy_hh_id is not None:
        query = query.filter(vacancy__hh_id=vacancy_hh_id)
    total = await query.count()
    items = (
        await query.select_related("vacancy")
        .order_by("-updated_at", "-id")
        .offset(page.offset)
        .limit(page.limit)
    )
    return Page[ReviewOut](items=[ReviewOut.model_validate(r) for r in items], total=total)


@router.patch("/{review_id}", response_model=ReviewOut)
async def update_review(review_id: int, body: ReviewUpdate, user: CurrentUser):
    review = await _get_own(user, review_id)
    _check_can_publish(user, body.is_public)
    changes = body.model_dump(exclude_unset=True)
    # rating и is_public не могут быть null; text можно очистить.
    for field in ("rating", "is_public"):
        if field in changes and changes[field] is None:
            del changes[field]
    if changes:
        review.update_from_dict(changes)
        await review.save()
    return review


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(review_id: int, user: CurrentUser):
    review = await _get_own(user, review_id)
    await review.delete()
