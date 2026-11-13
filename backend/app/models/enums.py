from enum import StrEnum


class ApplicationStatusEnum(StrEnum):
    SENT = "sent"  # отправлено / ожидание ответа
    VIEWED = "viewed"  # работодатель просмотрел отклик
    TEST_TASK = "test_task"  # тестовое задание
    INTERVIEW = "interview"  # собеседование
    OFFER = "offer"  # оффер
    REJECTED = "rejected"  # отказ
    CLOSED = "closed"  # вакансия закрыта / удалена
