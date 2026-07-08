import json
from functools import lru_cache
from typing import Any, Literal
from urllib.parse import quote

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  APP_ENV: str = "development"
  PROJECT_NAME: str = "law-ai-api"
  VERSION: str = "0.1.0"
  DEBUG: bool = False
  API_V1_STR: str = "/api/v1"
  ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["*"])
  STORAGE_BACKEND: Literal["memory", "postgres"] = "memory"
  UPLOAD_DIR: str = "uploads"
  MOCK_OTP_CODE: str = "123456"
  OTP_EXPIRE_MINUTES: int = 5
  TOKEN_EXPIRE_DAYS: int = 7
  DATABASE_URL: str | None = None
  POSTGRES_HOST: str = "localhost"
  POSTGRES_DB: str = "postgres"
  POSTGRES_USER: str = "postgres"
  POSTGRES_PORT: int = 5432
  POSTGRES_PASSWORD: SecretStr | None = None
  POSTGRES_POOL_SIZE: int = 5
  POSTGRES_MAX_OVERFLOW: int = 10
  JWT_SECRET_KEY: SecretStr | None = None
  JWT_ALGORITHM: str = "HS256"
  JWT_ACCESS_TOKEN_EXPIRE_DAYS: int | None = None
  OPENAI_API_BASE: str | None = None
  OPENAI_API_KEY: SecretStr | None = None
  DEFAULT_LLM_MODEL: str | None = None
  DEFAULT_LLM_TEMPERATURE: float = 0.7
  LANGFUSE_PUBLIC_KEY: str | None = None
  LANGFUSE_SECRET_KEY: SecretStr | None = None
  LANGFUSE_HOST: str | None = None
  LOG_LEVEL: str = "INFO"
  LOG_FORMAT: Literal["console", "json"] = "console"
  ADMIN_PHONE: str | None = None
  ADMIN_NAME: str | None = None

  model_config = SettingsConfigDict(env_file=(".env", "apps/api/.env"), extra="ignore")

  @field_validator("ALLOWED_ORIGINS", mode="before")
  @classmethod
  def parse_allowed_origins(cls, value: Any) -> Any:
    if isinstance(value, str):
      if value.strip().startswith("["):
        return json.loads(value)
      return [origin.strip() for origin in value.split(",") if origin.strip()]
    return value

  @model_validator(mode="after")
  def sync_token_expiry(self) -> "Settings":
    if self.JWT_ACCESS_TOKEN_EXPIRE_DAYS is not None:
      self.TOKEN_EXPIRE_DAYS = self.JWT_ACCESS_TOKEN_EXPIRE_DAYS
    return self

  @property
  def postgres_dsn(self) -> str:
    if self.DATABASE_URL:
      return self.DATABASE_URL
    password = self.POSTGRES_PASSWORD.get_secret_value() if self.POSTGRES_PASSWORD else ""
    return (
      f"postgresql://{quote(self.POSTGRES_USER)}:{quote(password)}"
      f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    )

  @property
  def llm_configured(self) -> bool:
    return bool(self.OPENAI_API_BASE and self.OPENAI_API_KEY and self.DEFAULT_LLM_MODEL)

  @property
  def langfuse_configured(self) -> bool:
    return bool(self.LANGFUSE_PUBLIC_KEY and self.LANGFUSE_SECRET_KEY and self.LANGFUSE_HOST)


@lru_cache
def get_settings() -> Settings:
  return Settings()
