from app.config import settings

# Общий конфиг для приложения (RegisterTortoise) и CLI миграций (`python -m tortoise ...`).
TORTOISE_ORM = {
    "connections": {"default": settings.database_url},
    "apps": {
        "models": {
            "models": ["app.models"],
            "default_connection": "default",
            "migrations": "app.migrations",
        },
    },
    "use_tz": True,
    "timezone": "UTC",
}
