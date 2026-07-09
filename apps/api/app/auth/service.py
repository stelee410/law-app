from app.schemas import AuthToken, LoginCodeResponse, User
from app.store import AppStore


def request_login_code(store: AppStore, phone: str) -> LoginCodeResponse:
  otp = store.request_login_code(phone)
  return LoginCodeResponse(phone=otp["phone"], expiresAt=otp["expiresAt"], mockCode=otp["code"])


def login_with_code(store: AppStore, phone: str, code: str) -> AuthToken | None:
  return store.login_with_code(phone, code)


def login_with_password(store: AppStore, phone: str, password: str) -> AuthToken | None:
  return store.login_with_password(phone, password)


def get_current_user(store: AppStore, token: str) -> User | None:
  return store.get_user_by_token(token)
