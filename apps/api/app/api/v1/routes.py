from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.auth import service as auth_service
from app.cases import service as cases_service
from app.core.config import Settings
from app.evidence import service as evidence_service
from app.evidence.service import EvidenceUploadError
from app.events import service as events_service
from app.schemas import (
  CreateCaseInput,
  CreateDocumentInput,
  LoginInput,
  RequestCodeInput,
  SelectPlanInput,
  SubmitReviewInput,
  UpdateDocumentInput,
  User,
)
from app.store import AppStore, InvalidStateError
from app.workflows import service as assessment_service

router = APIRouter()


def _get_store(request: Request) -> AppStore:
  return request.app.state.store


def _get_settings(request: Request) -> Settings:
  return request.app.state.settings


def _get_current_user(
  store: Annotated[AppStore, Depends(_get_store)],
  authorization: Annotated[str | None, Header()] = None,
) -> User:
  token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else None
  if not token:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="AUTH_REQUIRED")
  user = auth_service.get_current_user(store, token)
  if user is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="AUTH_REQUIRED")
  return user


def _get_current_lawyer(current_user: Annotated[User, Depends(_get_current_user)]) -> User:
  if current_user.role != "lawyer":
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
  return current_user


@router.get("/health")
def health(settings: Annotated[Settings, Depends(_get_settings)]) -> dict[str, str | bool]:
  return {
    "ok": True,
    "service": settings.PROJECT_NAME,
    "storage": settings.STORAGE_BACKEND,
    "llmConfigured": settings.llm_configured,
    "langfuseConfigured": settings.langfuse_configured,
  }


@router.post("/auth/request-code")
def request_code(
  payload: RequestCodeInput,
  store: Annotated[AppStore, Depends(_get_store)],
) -> dict[str, str]:
  return auth_service.request_login_code(store, payload.phone).model_dump()


@router.post("/auth/login")
def login(
  payload: LoginInput,
  store: Annotated[AppStore, Depends(_get_store)],
):
  session = auth_service.login_with_code(store, payload.phone, payload.code)
  if session is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_CODE")
  return session


@router.get("/me")
def me(current_user: Annotated[User, Depends(_get_current_user)]):
  return {"user": current_user}


@router.get("/messages")
def messages(
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  return {"messages": store.list_messages(current_user.id)}


@router.post("/messages/{message_id}/read")
def mark_message_read(
  message_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  message = store.mark_message_read(current_user.id, message_id)
  if message is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MESSAGE_NOT_FOUND")
  return {"message": message}


@router.get("/cases")
def list_cases(
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  return {"cases": cases_service.list_cases(store, current_user.id)}


@router.post("/cases", status_code=status.HTTP_201_CREATED)
def create_case(
  payload: CreateCaseInput,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  return {"case": cases_service.create_case(store, current_user.id, payload)}


@router.get("/cases/{case_id}")
def get_case(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  law_case = cases_service.get_case(store, current_user.id, case_id)
  if law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"case": law_case}


@router.get("/cases/{case_id}/work-items")
def case_work_items(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  items = store.list_case_work_items(current_user.id, case_id)
  if items is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"workItems": items}


@router.get("/cases/{case_id}/documents")
def case_documents(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  documents = store.list_case_documents(current_user.id, case_id)
  if documents is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"documents": documents}


@router.post("/cases/{case_id}/documents/{document_id}/approve")
def approve_document(
  case_id: str,
  document_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  try:
    result = store.approve_document(current_user.id, case_id, document_id)
  except InvalidStateError as exc:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
  if result is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND")
  law_case, document = result
  return {"case": law_case, "document": document}


@router.post("/cases/{case_id}/evidence/{category_id}")
async def upload_evidence(
  case_id: str,
  category_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
  file: UploadFile = File(...),
):
  try:
    evidence_file = await evidence_service.upload_evidence(
      store,
      current_user.id,
      case_id,
      category_id,
      file,
    )
  except EvidenceUploadError as exc:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
  law_case = cases_service.get_case(store, current_user.id, case_id)
  if evidence_file is None or law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="UPLOAD_FAILED")
  return {"case": law_case, "file": evidence_file}


@router.post("/cases/{case_id}/evaluate")
def evaluate_case(
  case_id: str,
  current_user: Annotated[User, Depends(_get_current_user)],
  store: Annotated[AppStore, Depends(_get_store)],
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
  store: Annotated[AppStore, Depends(_get_store)],
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
  store: Annotated[AppStore, Depends(_get_store)],
):
  try:
    law_case = cases_service.select_plan(store, current_user.id, case_id, payload.planId)
  except InvalidStateError as exc:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
  if law_case is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"case": law_case}


@router.get("/lawyer/tasks")
def lawyer_tasks(
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  tasks = store.list_lawyer_tasks(current_lawyer.id)
  return {"tasks": tasks or []}


@router.get("/lawyer/tasks/{task_id}")
def lawyer_task(
  task_id: str,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  task = store.get_lawyer_task(current_lawyer.id, task_id)
  if task is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TASK_NOT_FOUND")
  law_case = store.get_lawyer_case(current_lawyer.id, task.caseId)
  return {"task": task, "case": law_case}


@router.post("/lawyer/tasks/{task_id}/review")
def submit_lawyer_review(
  task_id: str,
  payload: SubmitReviewInput,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  result = store.submit_review(current_lawyer.id, task_id, payload)
  if result is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TASK_NOT_FOUND")
  law_case, work_item, review = result
  return {"case": law_case, "workItem": work_item, "review": review}


@router.post("/lawyer/cases/{case_id}/documents", status_code=status.HTTP_201_CREATED)
def create_lawyer_document(
  case_id: str,
  payload: CreateDocumentInput,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  document = store.create_document(current_lawyer.id, case_id, payload)
  if document is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"document": document}


@router.get("/lawyer/cases/{case_id}/documents")
def lawyer_case_documents(
  case_id: str,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  documents = store.list_lawyer_case_documents(current_lawyer.id, case_id)
  if documents is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CASE_NOT_FOUND")
  return {"documents": documents}


@router.patch("/lawyer/cases/{case_id}/documents/{document_id}")
def update_lawyer_document(
  case_id: str,
  document_id: str,
  payload: UpdateDocumentInput,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  try:
    document = store.update_document(current_lawyer.id, case_id, document_id, payload)
  except InvalidStateError as exc:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
  if document is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND")
  return {"document": document}


@router.delete("/lawyer/cases/{case_id}/documents/{document_id}")
def archive_lawyer_document(
  case_id: str,
  document_id: str,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  try:
    document = store.archive_document(current_lawyer.id, case_id, document_id)
  except InvalidStateError as exc:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
  if document is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND")
  return {"document": document}


@router.post("/lawyer/cases/{case_id}/documents/{document_id}/submit")
def submit_lawyer_document(
  case_id: str,
  document_id: str,
  current_lawyer: Annotated[User, Depends(_get_current_lawyer)],
  store: Annotated[AppStore, Depends(_get_store)],
):
  try:
    document = store.submit_document(current_lawyer.id, case_id, document_id)
  except InvalidStateError as exc:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
  if document is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND")
  return {"document": document}
