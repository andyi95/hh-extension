from datetime import datetime

from tortoise import timezone
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from app.models import Application, ApplicationStatus, ApplicationStatusEnum, User
from app.schemas.applications import SyncItem, SyncResult
from app.services.catalog import upsert_vacancy

S = ApplicationStatusEnum
# Порядок воронки: синхронизация с hh только продвигает статус вперёд.
_FUNNEL_RANK = {S.SENT: 0, S.VIEWED: 1, S.TEST_TASK: 2, S.INTERVIEW: 3, S.OFFER: 4}
_FINAL = {S.REJECTED, S.CLOSED}
SYNC_COMMENT = "hh.ru"


def _sync_moves_forward(current: ApplicationStatusEnum, incoming: ApplicationStatusEnum) -> bool:
    if incoming == current or current in _FINAL:
        return False
    if incoming in _FINAL:
        return True
    return _FUNNEL_RANK[incoming] > _FUNNEL_RANK[current]


async def apply_synced_status(
    application: Application, status: ApplicationStatusEnum, changed_at: datetime | None
) -> bool:
    """Добавляет статус, пришедший с hh.ru, если он продвигает отклик вперёд.

    Статусы, которые пользователь поставил вручную (например, offer, когда hh ещё
    показывает «Собеседование»), синхронизация не откатывает. Возвращает True, если статус добавлен.
    """
    if not _sync_moves_forward(application.current_status, status):
        return False
    latest = (
        await ApplicationStatus.filter(application=application)
        .order_by("-changed_at", "-id")
        .first()
    )
    when = changed_at or timezone.now()
    # Запись должна стать текущей, даже если hh отдал время раньше последней ручной записи.
    if latest is not None and latest.changed_at > when:
        when = latest.changed_at
    await ApplicationStatus.create(
        application=application, status=status, changed_at=when, comment=SYNC_COMMENT
    )
    await recalc_current_status(application)
    return True


async def sync_applications(user: User, items: list[SyncItem]) -> SyncResult:
    """Импорт и обновление откликов со страницы «Отклики» hh.ru."""
    result = SyncResult()
    for item in items:
        try:
            async with in_transaction():
                vacancy = await upsert_vacancy(item.vacancy.hh_id, item.vacancy)
                application = await Application.get_or_none(user=user, vacancy=vacancy)
                if application is None:
                    applied_at = item.applied_at or timezone.now()
                    application = await Application.create(
                        user=user, vacancy=vacancy, applied_at=applied_at, current_status=S.SENT
                    )
                    await ApplicationStatus.create(
                        application=application,
                        status=S.SENT,
                        changed_at=applied_at,
                        comment=SYNC_COMMENT,
                    )
                    await apply_synced_status(application, item.status, item.changed_at)
                    result.created += 1
                elif await apply_synced_status(application, item.status, item.changed_at):
                    result.updated += 1
                else:
                    result.unchanged += 1
        except IntegrityError:
            # Параллельная синхронизация из другой вкладки уже создала этот отклик.
            result.unchanged += 1
    return result


async def recalc_current_status(application: Application) -> None:
    """Ставит current_status по самой свежей записи истории (по changed_at)."""
    latest = (
        await ApplicationStatus.filter(application=application)
        .order_by("-changed_at", "-id")
        .first()
    )
    new_status = latest.status if latest else ApplicationStatusEnum.SENT
    if application.current_status != new_status:
        application.current_status = new_status
        await application.save(update_fields=["current_status", "updated_at"])
