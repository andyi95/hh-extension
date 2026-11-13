from app.models import Application, ApplicationStatus, ApplicationStatusEnum, Review, User
from app.services.applications import recalc_current_status


async def _merge_applications(source: User, target: User) -> None:
    target_by_vacancy = {a.vacancy_id: a for a in await Application.filter(user=target)}

    for app in await Application.filter(user=source):
        existing = target_by_vacancy.get(app.vacancy_id)
        if existing is None:
            await Application.filter(id=app.id).update(user=target)
            continue

        # Один и тот же отклик записан на двух устройствах: объединяем историю.
        await ApplicationStatus.filter(application_id=app.id).update(application=existing)
        # Начальный статус sent оставляем один — самый ранний.
        sent_ids = await ApplicationStatus.filter(
            application=existing, status=ApplicationStatusEnum.SENT
        ).order_by("changed_at", "id").values_list("id", flat=True)
        if len(sent_ids) > 1:
            await ApplicationStatus.filter(id__in=sent_ids[1:]).delete()

        existing.applied_at = min(existing.applied_at, app.applied_at)
        if not existing.cover_letter and app.cover_letter:
            existing.cover_letter = app.cover_letter
        await existing.save()
        await recalc_current_status(existing)
        await app.delete()


async def _merge_reviews(source: User, target: User) -> None:
    target_by_vacancy = {r.vacancy_id: r for r in await Review.filter(user=target)}

    for review in await Review.filter(user=source):
        existing = target_by_vacancy.get(review.vacancy_id)
        if existing is not None:
            # Конфликт: остаётся более свежий отзыв.
            if existing.updated_at >= review.updated_at:
                await review.delete()
                continue
            await existing.delete()
        await Review.filter(id=review.id).update(user=target)


async def merge_users(source: User, target: User) -> None:
    """Переносит отклики и отзывы анонимного пользователя source в аккаунт target
    и удаляет source вместе с его сессиями. Вызывать внутри транзакции."""
    if source.is_registered:
        raise ValueError("Only anonymous users can be merged into an account")
    await _merge_applications(source, target)
    await _merge_reviews(source, target)
    await source.delete()
