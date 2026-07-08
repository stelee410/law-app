from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.auth import service as auth_service
from app.cases import service as cases_service
from app.core.config import Settings
from app.evidence import service as evidence_service
from app.events import service as events_service
from app.schemas import CreateCaseInput, LoginInput, RequestCodeInput, SelectPlanInput, User
from app.store import InMemoryStore
from app.workflows import service as assessment_service

router = APIRouter()


def _get_store(request: Request) -> InMemoryStore:
  return request.app.state.store


def _get_settings(request: Request) -> Settings:
  return request.app.state.settings


def _get_current_user(
  store: Annotated[InMemoryStore, Depends(_get_store)],
  authorization: Annotated[str | None, Header()] = None,
) -> User:
  token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else None
  if not token:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="AUTH_REQUIRED")
  user = auth_service.get_current_user(store, token)
  if user is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="AUTH_REQUIRED")
  return user


@router.get("/health")
def health(settings: Annotated[Settings, Depends(_get_settings)]) -> dict[str, str | bool]:
  return {"ok": True, "service": settings.PROJECT_NAME, "storage": "memory"}


@router.post("/auth/request-code")
def request_code(
  payload: RequestCodeInput,
  store: Annotated[InMemoryStore, Depends(_get_store)],
) -> dict[str, str]:
  return auth_service.request_login_code(store, payload.phone).model_dump()


@router.post("/auth/login")
def login(
  payload: LoginInput,
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  session = auth_service.login_with_code(store, payload.phone, payload.code)
  if session is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_CODE")
  return session


@router.get("/me")
def me(current_user: Annotated[User, Depends(_get_current_user)]):
  return {"user": current_user}


@router.get("/cases")
def list_cases(
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  return {"cases": cases_service.list_cases(store, current_user.id)}


@router.post("/cases", status_code=status.HTTP_201_CREATED)
def create_case(
  payload: CreateCaseInput,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  return {"case": cases_service.create_case(store, current_user.id, payload)}


@router.get("/cases/{case_id}")
def get_case(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  law_case = cases_service.get_case(store, current_user.id, case_id)
  if law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"case": law_case}


@router.post("/cases/{case_id}/evidence/{category_id}")
async def upload_evidence(
  case_id: str,
  category_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
  file: UploadFile = File(...),
):
  evidence_file = await evidence_service.upload_evidence(
    store,
    current_user.id,
    case_id,
    category_id,
    file,
  )
  law_case = cases_service.get_case(store, current_user.id, case_id)
  if evidence_file is None or law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="UPLOAD_FAILED")
  return {"case": law_case, "file": evidence_file}


@router.post("/cases/{case_id}/evaluate")
def evaluate_case(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  job = assessment_service.start_case_assessment(store, current_user.id, case_id)
  law_case = cases_service.get_case(store, current_user.id, case_id)
  if job is None or law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"case": law_case, "job": job}


@router.get("/cases/{case_id}/events")
def case_events(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  events = events_service.stream_case_events(store, current_user.id, case_id)
  if events is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return StreamingResponse(
    events_service.to_sse(events),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
  )


@router.post("/cases/{case_id}/plan")
def select_plan(
  case_id: str,
  payload: SelectPlanInput,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[InMemoryStore, Depends(_get_store)],
):
  law_case = cases_service.select_plan(store, current_user.id, case_id, payload.planId)
  if law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"case": law_case}
