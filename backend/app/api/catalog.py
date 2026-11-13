from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from tortoise.queryset import QuerySet

from app.api.deps import CurrentUser, PageParams
from app.models import Company, Review, Vacancy
from app.schemas.catalog import (
    CompanyDetailOut,
    CompanyOut,
    PublicReviewOut,
    VacancyDetailOut,
    VacancyIn,
    VacancyOut,
)
from app.schemas.common import Page
from app.services.catalog import (
    public_reviews_for_company,
    public_reviews_for_vacancy,
    rating_summary,
    upsert_vacancy,
)

HhIdPath = Annotated[str, Path(pattern=r"^\d{1,20}$", description="ID на hh.ru")]

vacancies = APIRouter(prefix="/vacancies", tags=["vacancies"])
companies = APIRouter(prefix="/companies", tags=["companies"])


async def _get_vacancy(hh_id: str) -> Vacancy:
    vacancy = await Vacancy.get_or_none(hh_id=hh_id).select_related("company")
    if vacancy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
    return vacancy


async def _get_company(hh_id: str) -> Company:
    company = await Company.get_or_none(hh_id=hh_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    return company


async def _public_page(reviews: QuerySet[Review], page: PageParams) -> Page[PublicReviewOut]:
    total = await reviews.count()
    items = (
        await reviews.select_related("vacancy")
        .order_by("-created_at", "-id")
        .offset(page.offset)
        .limit(page.limit)
    )
    return Page[PublicReviewOut](
        items=[PublicReviewOut.model_validate(r) for r in items], total=total
    )


@vacancies.put("/{hh_id}", response_model=VacancyOut)
async def put_vacancy(hh_id: HhIdPath, body: VacancyIn, _user: CurrentUser):
    """Сохраняет данные вакансии, которые расширение спарсило со страницы hh.ru."""
    return await upsert_vacancy(hh_id, body)


@vacancies.get("/{hh_id}", response_model=VacancyDetailOut)
async def get_vacancy(hh_id: HhIdPath):
    vacancy = await _get_vacancy(hh_id)
    return VacancyDetailOut(
        **VacancyOut.model_validate(vacancy).model_dump(),
        rating=await rating_summary(public_reviews_for_vacancy(vacancy)),
    )


@vacancies.get("/{hh_id}/reviews", response_model=Page[PublicReviewOut])
async def get_vacancy_reviews(hh_id: HhIdPath, page: PageParams):
    vacancy = await _get_vacancy(hh_id)
    return await _public_page(public_reviews_for_vacancy(vacancy), page)


@companies.get("/{hh_id}", response_model=CompanyDetailOut)
async def get_company(hh_id: HhIdPath):
    company = await _get_company(hh_id)
    return CompanyDetailOut(
        **CompanyOut.model_validate(company).model_dump(),
        rating=await rating_summary(public_reviews_for_company(company)),
    )


@companies.get("/{hh_id}/reviews", response_model=Page[PublicReviewOut])
async def get_company_reviews(hh_id: HhIdPath, page: PageParams):
    company = await _get_company(hh_id)
    return await _public_page(public_reviews_for_company(company), page)
