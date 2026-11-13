# HH Tracker — бэкенд

FastAPI + Tortoise ORM + SQLite. API для расширения hh.ru: трекинг откликов и статусов, отзывы о вакансиях и работодателях.

## Запуск

Все команды — из каталога `backend/`, venv лежит в корне репозитория.

```bash
../venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env              # и задать JWT_SECRET
../venv/Scripts/python -m tortoise migrate
../venv/Scripts/python -m uvicorn app.main:app --reload
```

Swagger: http://127.0.0.1:8000/docs

## Миграции

Используются встроенные миграции Tortoise ORM 1.x (Aerich для tortoise>=1.0 больше не нужен). Конфиг CLI — `[tool.tortoise]` в `pyproject.toml`, файлы — `app/migrations/`.

```bash
../venv/Scripts/python -m tortoise makemigrations   # после изменения моделей
../venv/Scripts/python -m tortoise migrate
```

Docstring модели становится комментарием таблицы. Не ставьте в нём `;`: SQLite-редактор миграций Tortoise 1.1.9 режет SQL по этому символу.

## Модель данных

- `Company`, `Vacancy` — общий каталог, ключ — ID с hh.ru (`hh.ru/employer/<id>`, `hh.ru/vacancy/<id>`). `Vacancy.company = null` — работодатель скрыт.
- `Application` — отклик пользователя (один на вакансию), `ApplicationStatus` — история статусов. `Application.current_status` — последний статус по `changed_at`.
- Статусы: `sent` (отправлено/ожидание), `viewed`, `test_task`, `interview`, `offer`, `rejected`, `closed` (вакансия закрыта/удалена).
- `Review` — отзыв пользователя о вакансии (один на вакансию). Публичные отзывы другим показываются без автора. Рейтинг компании — среднее по публичным отзывам её вакансий.
- `User` — анонимный пользователь устройства или зарегистрированный аккаунт; `AuthSession` — сессия одной установки расширения.

## Авторизация для расширения

Регистрация необязательна: по умолчанию расширение работает с токеном устройства.

1. **Первый запуск** — `POST /auth/device {device_label}` создаёт анонимного пользователя и возвращает `access_token` (JWT, 30 мин) и `refresh_token` (365 дней, срок продлевается при каждом refresh). Сохраните оба в `chrome.storage.local`.
2. **Запросы** — заголовок `Authorization: Bearer <access_token>`. На 401 сделайте `POST /auth/refresh {refresh_token}` и повторите запрос.
3. **Регистрация** (для синхронизации между устройствами) — `POST /auth/register {email, password}` с токеном устройства. Это тот же пользователь: история остаётся, токены продолжают работать.
4. **Вход на другом устройстве** — `POST /auth/login {email, password}` **с токеном устройства** в заголовке. Отклики и отзывы этого устройства перенесутся в аккаунт: по одной вакансии истории статусов объединятся, из двух отзывов останется более свежий. Анонимный пользователь устройства удаляется, старые токены перестают работать — сохраните новые из ответа.
5. **Выход** — `POST /auth/logout` (только для аккаунта), затем снова `POST /auth/device`. У анонима выхода нет: данные удаляются через `DELETE /users/me`.

Что важно для клиента:
- Refresh-токен меняется при каждом `/auth/refresh`. Делайте refresh в одном месте (service worker) и не запускайте два параллельно. Если ответ потерялся, старый токен ещё `REFRESH_GRACE_SEC` секунд (120 по умолчанию) обменивается на новую пару.
- Для анонима потеря refresh-токена означает потерю доступа к данным. Стоит предлагать регистрацию.
- Публиковать отзывы (`is_public=true`) может только зарегистрированный пользователь (иначе 403). Приватные отзывы и трекинг доступны всем.
- Запросы к API делайте из service worker: в MV3 content scripts подчиняются CORS страницы hh.ru.

## Основные эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| PUT | `/vacancies/{hh_id}` | сохранить данные вакансии со страницы |
| GET | `/vacancies/{hh_id}`, `/companies/{hh_id}` | карточка + публичный рейтинг (без авторизации) |
| GET | `/vacancies/{hh_id}/reviews`, `/companies/{hh_id}/reviews` | публичные отзывы (без авторизации) |
| POST | `/applications` | отклик + данные вакансии одним запросом |
| GET | `/applications?vacancy_hh_id=&status=` | свои отклики; по `vacancy_hh_id` — «откликались ли на эту вакансию» |
| POST/DELETE | `/applications/{id}/statuses[/{status_id}]` | история статусов |
| POST/GET/PATCH/DELETE | `/reviews` | свои отзывы |

Полный список — в Swagger.

## Пока не сделано

Подтверждение email, rate-limit на `/auth/device`, очистка заброшенных анонимных пользователей, автотесты.
