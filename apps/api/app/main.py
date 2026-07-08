from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import router as api_v1_router
from app.core.config import Settings
from app.store import InMemoryStore


def create_app(settings: Settings | None = None) -> FastAPI:
  resolved_settings = settings or Settings()
  fastapi_app = FastAPI(title=resolved_settings.PROJECT_NAME)
  fastapi_app.state.settings = resolved_settings
  fastapi_app.state.store = InMemoryStore(resolved_settings)
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
