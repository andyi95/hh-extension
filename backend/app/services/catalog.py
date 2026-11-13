from tortoise.exceptions import IntegrityError
from tortoise.expressions import Q
from tortoise.functions import Avg, Count
from tortoise.queryset import QuerySet

from app.models import Company, Review, Vacancy
from app.schemas.catalog import CompanyIn, RatingSummary, VacancyIn


async def _get_or_create_company(data: CompanyIn) -> Company:
    if data.hh_id is not None:
        lookup = {"hh_id": data.hh_id}
    else:
        # Работодатель без страницы на hh.ru: ищем по названию среди таких же.
        lookup = {"hh_id": None, "name": data.name}

    company = await Company.get_or_none(**lookup)
    if company is None:
        try:
            return await Company.create(hh_id=data.hh_id, name=data.name)
        except IntegrityError:
            # Параллельный запрос успел создать ту же компанию.
            company = await Company.get(**lookup)
    if company.name != data.name:
        company.name = data.name
        await company.save(update_fields=["name", "updated_at"])
    return company


async def upsert_vacancy(hh_id: str, data: VacancyIn) -> Vacancy:
    """Создаёт или обновляет вакансию данными со страницы hh.ru.

    Поля, которые не переданы (description, company = null), не затирают уже
    сохранённые: расширение может прислать неполные данные, например со страницы поиска.
    """
    company = await _get_or_create_company(data.company) if data.company else None

    vacancy = await Vacancy.get_or_none(hh_id=hh_id)
    if vacancy is None:
        try:
            vacancy = await Vacancy.create(
                hh_id=hh_id,
                title=data.title,
                description=data.description,
                url=data.url,
                company=company,
            )
        except IntegrityError:
            vacancy = await Vacancy.get(hh_id=hh_id)
        else:
            await vacancy.fetch_related("company")
            return vacancy

    vacancy.title = data.title
    vacancy.url = data.url
    if data.description is not None:
        vacancy.description = data.description
    if company is not None:
        vacancy.company = company
    await vacancy.save()
    await vacancy.fetch_related("company")
    return vacancy


async def rating_summary(reviews: QuerySet[Review]) -> RatingSummary:
    row = await reviews.annotate(average=Avg("rating"), count=Count("id")).values(
        "average", "count"
    )
    average, count = (row[0]["average"], row[0]["count"]) if row else (None, 0)
    return RatingSummary(
        average=round(float(average), 2) if average is not None else None, count=count or 0
    )


def public_reviews_for_vacancy(vacancy: Vacancy) -> QuerySet[Review]:
    return Review.filter(vacancy=vacancy, is_public=True)


def public_reviews_for_company(company: Company) -> QuerySet[Review]:
    return Review.filter(Q(vacancy__company=company), is_public=True)
