from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, VerifyMismatchError

from app.core.config import Settings

_password_hasher = PasswordHasher()


def hash_password(raw: str) -> str:
  return _password_hasher.hash(raw)


def verify_password(raw: str, hashed: str | None) -> bool:
  if not hashed:
    return False
  try:
    return _password_hasher.verify(hashed, raw)
  except (Argon2Error, VerifyMismatchError):
    return False


def create_access_token(settings: Settings, *, subject: str) -> tuple[str, datetime]:
  now = datetime.now(UTC)
  expires_at = now + timedelta(days=settings.TOKEN_EXPIRE_DAYS)
  secret = _jwt_secret(settings)
  token = jwt.encode(
    {
      "sub": subject,
      "iat": int(now.timestamp()),
      "exp": int(expires_at.timestamp()),
      "jti": uuid4().hex,
    },
    secret,
    algorithm=settings.JWT_ALGORITHM,
  )
  return token, expires_at


def decode_access_token(settings: Settings, token: str) -> str:
  payload = jwt.decode(token, _jwt_secret(settings), algorithms=[settings.JWT_ALGORITHM])
  subject = payload.get("sub")
  if not isinstance(subject, str) or not subject:
    raise jwt.InvalidTokenError("missing subject")
  return subject


def _jwt_secret(settings: Settings) -> str:
  if settings.JWT_SECRET_KEY is not None:
    return settings.JWT_SECRET_KEY.get_secret_value()
  return "dev-only-law-ai-secret"
