from app.models import Application, ApplicationStatus, ApplicationStatusEnum


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
