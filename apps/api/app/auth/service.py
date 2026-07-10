from datetime import UTC, datetime, timedelta

from app.auth.sms import send_verification_code
from app.core.config import Settings
from app.schemas import AuthToken, LoginCodeResponse, User
from app.store import AppStore


class SmsCooldownError(Exception):
  pass


def request_login_code(store: AppStore, settings: Settings, phone: str, purpose: str) -> LoginCodeResponse:
  last_requested_at = store.get_login_code_requested_at(phone, purpose)
  cooldown = timedelta(seconds=settings.SMS_SEND_COOLDOWN_SECONDS)
  if last_requested_at is not None and last_requested_at + cooldown > datetime.now(UTC):
    raise SmsCooldownError("SMS_TOO_FREQUENT")
  code = send_verification_code(settings, phone, purpose)
  otp = store.request_login_code(phone, code, purpose)
  expose_code = settings.SMS_PROVIDER == "mock" or (settings.SMS_PROVIDER == "log" and settings.DEBUG)
  return LoginCodeResponse(
    phone=otp["phone"],
    expiresAt=otp["expiresAt"],
    mockCode=otp["code"] if expose_code else None,
  )


def login_with_code(store: AppStore, phone: str, code: str) -> AuthToken | None:
  return store.login_with_code(phone, code)


def login_with_password(store: AppStore, phone: str, password: str) -> AuthToken | None:
  return store.login_with_password(phone, password)


def get_current_user(store: AppStore, token: str) -> User | None:
  return store.get_user_by_token(token)
