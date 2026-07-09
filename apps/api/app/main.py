from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import router as api_v1_router
from app.core.config import Settings
from app.core.database import Database
from app.core.schema import initialize_schema
from app.store import AppStore, InMemoryStore, PostgresStore


def create_store(settings: Settings) -> tuple[AppStore, Database | None]:
  if settings.STORAGE_BACKEND == "postgres":
    database = Database(settings)
    database.open()
    initialize_schema(database)
    return PostgresStore(settings, database), database
  return InMemoryStore(settings), None


def create_app(settings: Settings | None = None) -> FastAPI:
  resolved_settings = settings or Settings()
  store, database = create_store(resolved_settings)
  if resolved_settings.ADMIN_PHONE and resolved_settings.ADMIN_NAME:
    admin_password = resolved_settings.ADMIN_PASSWORD.get_secret_value() if resolved_settings.ADMIN_PASSWORD else None
    store.create_admin(resolved_settings.ADMIN_PHONE, resolved_settings.ADMIN_NAME, admin_password)

  @asynccontextmanager
  async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.settings = resolved_settings
    app.state.store = store
    app.state.database = database
    try:
      yield
    finally:
      if database is not None:
        database.close()

  fastapi_app = FastAPI(title=resolved_settings.PROJECT_NAME, lifespan=lifespan)
  fastapi_app.state.settings = resolved_settings
  fastapi_app.state.store = store
  fastapi_app.state.database = database
  fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=resolved_settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
  )
  fastapi_app.include_router(api_v1_router, prefix=resolved_settings.API_V1_STR)
  return fastapi_app

app = create_app()
