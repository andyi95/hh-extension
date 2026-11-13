from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from tortoise import timezone
from tortoise.functions import Count
from tortoise.transactions import in_transaction

from app.api.deps import CurrentUser, PageParams
from app.models import Application, ApplicationStatus, ApplicationStatusEnum, User
from app.schemas.applications import (
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationOut,
    ApplicationStats,
    ApplicationUpdate,
    StatusCreate,
    StatusOut,
    SyncIn,
    SyncResult,
)
from app.schemas.common import Page
from app.services.applications import recalc_current_status, sync_applications
from app.services.catalog import upsert_vacancy

HhIdQuery = Query(pattern=r"^\d{1,20}$")

router = APIRouter(prefix="/applications", tags=["applications"])


async def _get_own(user: User, application_id: int) -> Application:
    application = await Application.get_or_none(id=application_id, user=user).select_related(
        "vacancy__company"
    )
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application


async def _detail(application: Application) -> ApplicationDetailOut:
    statuses = await ApplicationStatus.filter(application=application)
    return ApplicationDetailOut(
        **ApplicationOut.model_validate(application).model_dump(),
        statuses=[StatusOut.model_validate(s) for s in statuses],
    )


@router.post("", response_model=ApplicationDetailOut, status_code=status.HTTP_201_CREATED)
async def create_application(body: ApplicationCreate, user: CurrentUser):
    """Фиксирует отклик: сохраняет вакансию в каталог и создаёт отклик со статусом sent."""
    async with in_transaction():
        vacancy = await upsert_vacancy(body.vacancy.hh_id, body.vacancy)
        if await Application.exists(user=user, vacancy=vacancy):
            raise HTTPException(status.HTTP_409_CONFLICT, "Application for this vacancy exists")
        applied_at = body.applied_at or timezone.now()
        application = await Application.create(
            user=user,
            vacancy=vacancy,
            applied_at=applied_at,
            cover_letter=body.cover_letter,
            current_status=ApplicationStatusEnum.SENT,
        )
        await ApplicationStatus.create(
            application=application, status=ApplicationStatusEnum.SENT, changed_at=applied_at
        )
    return await _detail(await _get_own(user, application.id))


@router.get("", response_model=Page[ApplicationOut])
async def list_applications(
    user: CurrentUser,
    page: PageParams,
    status_: Annotated[ApplicationStatusEnum | None, Query(alias="status")] = None,
    vacancy_hh_id: Annotated[str | None, HhIdQuery] = None,
    company_hh_id: Annotated[str | None, HhIdQuery] = None,
):
    query = Application.filter(user=user)
    if status_ is not None:
        query = query.filter(current_status=status_)
    if vacancy_hh_id is not None:
        query = query.filter(vacancy__hh_id=vacancy_hh_id)
    if company_hh_id is not None:
        query = query.filter(vacancy__company__hh_id=company_hh_id)

    total = await query.count()
    items = (
        await query.select_related("vacancy__company")
        .order_by("-applied_at", "-id")
        .offset(page.offset)
        .limit(page.limit)
    )
    return Page[ApplicationOut](
        items=[ApplicationOut.model_validate(a) for a in items], total=total
    )


@router.get("/stats", response_model=ApplicationStats)
async def application_stats(user: CurrentUser):
    """Количество своих откликов по текущему статусу."""
    rows = (
        await Application.filter(user=user)
        .annotate(count=Count("id"))
        .group_by("current_status")
        .values("current_status", "count")
    )
    by_status = {row["current_status"]: row["count"] for row in rows}
    return ApplicationStats(total=sum(by_status.values()), by_status=by_status)


@router.post("/sync", response_model=SyncResult)
async def sync(body: SyncIn, user: CurrentUser):
    """Импорт и обновление откликов со страницы Отклики hh.ru."""
    return await sync_applications(user, body.items)


@router.get("/{application_id}", response_model=ApplicationDetailOut)
async def get_application(application_id: int, user: CurrentUser):
    return await _detail(await _get_own(user, application_id))


@router.patch("/{application_id}", response_model=ApplicationDetailOut)
async def update_application(application_id: int, body: ApplicationUpdate, user: CurrentUser):
    application = await _get_own(user, application_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("applied_at") is None:
        changes.pop("applied_at", None)  # дату отклика нельзя обнулить
    if changes:
        application.update_from_dict(changes)
        await application.save()
    return await _detail(application)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(application_id: int, user: CurrentUser):
    application = await _get_own(user, application_id)
    await application.delete()


@router.get("/{application_id}/statuses", response_model=list[StatusOut])
async def list_statuses(application_id: int, user: CurrentUser):
    application = await _get_own(user, application_id)
    return await ApplicationStatus.filter(application=application)


@router.post(
    "/{application_id}/statuses", response_model=StatusOut, status_code=status.HTTP_201_CREATED
)
async def add_status(application_id: int, body: StatusCreate, user: CurrentUser):
    application = await _get_own(user, application_id)
    async with in_transaction():
        record = await ApplicationStatus.create(
            application=application,
            status=body.status,
            changed_at=body.changed_at or timezone.now(),
            comment=body.comment,
        )
        await recalc_current_status(application)
    return record


@router.delete(
    "/{application_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_status(application_id: int, status_id: int, user: CurrentUser):
    """Удаляет ошибочно добавленную запись истории."""
    application = await _get_own(user, application_id)
    record = await ApplicationStatus.get_or_none(id=status_id, application=application)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status not found")
    async with in_transaction():
        await record.delete()
        await recalc_current_status(application)
