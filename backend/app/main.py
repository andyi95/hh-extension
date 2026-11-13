from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from tortoise.contrib.fastapi import RegisterTortoise
from tortoise.exceptions import IntegrityError

from app.api import applications, auth, catalog, reviews, users
from app.config import settings
from app.db import TORTOISE_ORM


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with RegisterTortoise(app, config=TORTOISE_ORM):
        yield


app = FastAPI(title="HH Tracker API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_request: Request, _exc: IntegrityError) -> JSONResponse:
    # Гонка двух запросов за одну уникальную запись (например, двойной клик «Откликнуться»).
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": "Conflict"})


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(catalog.vacancies)
app.include_router(catalog.companies)
app.include_router(applications.router)
app.include_router(reviews.router)
