import json
from functools import lru_cache
from typing import Any

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  APP_ENV: str = "development"
  PROJECT_NAME: str = "law-ai-api"
  VERSION: str = "0.1.0"
  DEBUG: bool = False
  API_V1_STR: str = "/api/v1"
  ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["*"])
  MOCK_OTP_CODE: str = "123456"
  OTP_EXPIRE_MINUTES: int = 5
  TOKEN_EXPIRE_DAYS: int = 7
  DATABASE_URL: str | None = None
  OPENAI_API_BASE: str | None = None
  OPENAI_API_KEY: SecretStr | None = None
  DEFAULT_LLM_MODEL: str | None = None
  DEFAULT_LLM_TEMPERATURE: float = 0.7
  LANGFUSE_PUBLIC_KEY: str | None = None
  LANGFUSE_SECRET_KEY: SecretStr | None = None
  LANGFUSE_HOST: str | None = None

  model_config = SettingsConfigDict(env_file=".env", extra="ignore")

  @field_validator("ALLOWED_ORIGINS", mode="before")
  @classmethod
  def parse_allowed_origins(cls, value: Any) -> Any:
    if isinstance(value, str):
      if value.strip().startswith("["):
        return json.loads(value)
      return [origin.strip() for origin in value.split(",") if origin.strip()]
    return value


@lru_cache
def get_settings() -> Settings:
  return Settings()
