from app.schemas import AuthToken, LoginCodeResponse, User
from app.store import InMemoryStore


def request_login_code(store: InMemoryStore, phone: str) -> LoginCodeResponse:
  otp = store.request_login_code(phone)
  return LoginCodeResponse(phone=otp["phone"], expiresAt=otp["expiresAt"], mockCode=otp["code"])


def login_with_code(store: InMemoryStore, phone: str, code: str) -> AuthToken | None:
  return store.login_with_code(phone, code)


def get_current_user(store: InMemoryStore, token: str) -> User | None:
  return store.get_user_by_token(token)
