from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite://db.sqlite3"

    # Обязательно переопределить в .env для любого окружения, кроме локальной разработки.
    jwt_secret: str = "dev-insecure-secret-change-me-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_ttl_min: int = 30
    # Скользящий срок: продлевается при каждом refresh. Для анонимного пользователя
    # потеря refresh-токена означает потерю доступа к данным, поэтому срок большой.
    refresh_ttl_days: int = 365
    # Сколько секунд после ротации ещё принимается предыдущий refresh-токен
    # (на случай, если ответ на /auth/refresh не дошёл до расширения).
    refresh_grace_sec: int = 120

    # dev: любое расширение; prod: конкретный ID, например chrome-extension://abcdef...
    cors_origin_regex: str = r"chrome-extension://.*"


settings = Settings()
