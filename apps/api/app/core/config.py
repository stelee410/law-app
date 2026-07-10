import json
import re
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
  SMS_CODE_TTL: str | None = None
  SMS_ENABLED: bool = True
  SMS_PROVIDER: Literal["mock", "log", "aliyun"] = "mock"
  SMS_CODE_LENGTH: int = 6
  SMS_SEND_COOLDOWN_SECONDS: int = 60
  SMS_SEND_COOLDOWN: str | None = None
  SMS_MAX_ATTEMPTS: int = 5
  ALIYUN_SMS_ACCESS_KEY_ID: str | None = None
  ALIYUN_SMS_ACCESS_KEY_SECRET: SecretStr | None = None
  ALIYUN_SMS_REGION_ID: str = "cn-hangzhou"
  ALIYUN_SMS_ENDPOINT: str = "https://dysmsapi.aliyuncs.com"
  ALIYUN_SMS_SIGN_NAME: str | None = None
  ALIYUN_SMS_TEMPLATE_REGISTER: str | None = None
  ALIYUN_SMS_TEMPLATE_LOGIN: str | None = None
  ALIYUN_SMS_TEMPLATE_CODE_PARAM: str = "code"
  ALIYUN_SMS_REQUEST_TIMEOUT_SECONDS: float = 5.0
  ALIYUN_SMS_REQUEST_TIMEOUT: str | None = None
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
  ADMIN_PASSWORD: SecretStr | None = None

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

  @model_validator(mode="after")
  def sync_sms_duration_aliases(self) -> "Settings":
    if self.SMS_CODE_TTL:
      self.OTP_EXPIRE_MINUTES = max(1, int(_parse_duration_seconds(self.SMS_CODE_TTL, "SMS_CODE_TTL") / 60))
    if self.SMS_SEND_COOLDOWN:
      self.SMS_SEND_COOLDOWN_SECONDS = max(0, int(_parse_duration_seconds(self.SMS_SEND_COOLDOWN, "SMS_SEND_COOLDOWN")))
    if self.ALIYUN_SMS_REQUEST_TIMEOUT:
      self.ALIYUN_SMS_REQUEST_TIMEOUT_SECONDS = _parse_duration_seconds(
        self.ALIYUN_SMS_REQUEST_TIMEOUT,
        "ALIYUN_SMS_REQUEST_TIMEOUT",
      )
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


_DURATION_PATTERN = re.compile(r"^(?P<value>\d+(?:\.\d+)?)(?P<unit>ms|s|m|h)?$")


def _parse_duration_seconds(value: str, field_name: str) -> float:
  matched = _DURATION_PATTERN.fullmatch(value.strip().lower())
  if matched is None:
    raise ValueError(f"{field_name} must use a duration such as 5s, 5m, or 1h")
  amount = float(matched.group("value"))
  unit = matched.group("unit") or "s"
  multipliers = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}
  return amount * multipliers[unit]

@lru_cache
def get_settings() -> Settings:
  return Settings()
