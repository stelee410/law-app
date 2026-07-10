import logging
from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Any, Protocol
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.cases.catalog import (
  create_case_stages,
  create_evidence_categories as create_catalog_evidence_categories,
  get_case_type_label,
  normalize_case_type,
)
from app.cases.self_service import (
  SelfServicePayload,
  apply_self_service_outcome,
  build_self_service_payload,
  ensure_ai_notice,
  validate_self_service_body,
)
from app.auth.security import create_access_token, decode_access_token, hash_password, verify_password
from app.core.config import Settings
from app.core.database import Database
from app.schemas import (
  AssessmentJob,
  AssessmentResult,
  AuthToken,
  CaseEvent,
  CaseEventType,
  AdminReviewLawyerInput,
  AdminUpdateUserInput,
  ClientRegisterInput,
  CaseStage,
  CreateCaseInput,
  CreateDocumentInput,
  EvidenceCategory,
  EvidenceFile,
  FullServiceActionInput,
  LawCase,
  LawyerFullServiceActionInput,
  LawyerOnboardingInput,
  LawyerServiceActionInput,
  LegalDocument,
  NotificationMessage,
  PlanId,
  ReviewOpinion,
  SelfServiceActionInput,
  SubmitReviewInput,
  UpdateDocumentInput,
  User,
  WorkItem,
)
from app.workflows.case_assessment import SERVICE_PLANS, assess_case
from app.workflows.llm import generate_self_service_document_body

logger = logging.getLogger("uvicorn.error")


def _build_enhanced_self_service_payload(settings: Settings, law_case: LawCase) -> SelfServicePayload:
  payload = build_self_service_payload(law_case)
  try:
    enhanced = generate_self_service_document_body(settings, law_case, payload.body)
  except Exception as exc:
    logger.info(
      "self_service.llm call_failed case_id=%s reason=unexpected_%s",
      law_case.id,
      exc.__class__.__name__,
    )
    enhanced = None
  if enhanced is not None:
    enhanced_body = ensure_ai_notice(enhanced)
    if validate_self_service_body(law_case.caseType, enhanced_body):
      payload.body = enhanced_body
    else:
      logger.info(
        "self_service.llm validation_failed case_id=%s case_type=%s",
        law_case.id,
        law_case.caseType,
      )
  return payload


class InvalidStateError(Exception):
  pass


class AccountDisabledError(Exception):
  pass


class LastAdminRequiredError(Exception):
  pass


class RoleChangeForbiddenError(Exception):
  pass


class UserNotFoundError(Exception):
  pass


class AppStore(Protocol):
  settings: Settings

  def get_login_code_requested_at(self, phone: str, purpose: str = "login") -> datetime | None: ...
  def request_login_code(self, phone: str, code: str | None = None, purpose: str = "login") -> dict[str, str]: ...
  def login_with_code(self, phone: str, code: str) -> AuthToken | None: ...
  def login_with_password(self, phone: str, password: str) -> AuthToken | None: ...
  def register_client(self, input_data: ClientRegisterInput) -> AuthToken | None: ...
  def onboard_lawyer(self, input_data: LawyerOnboardingInput) -> AuthToken | None: ...
  def get_user_by_token(self, token: str) -> User | None: ...
  def create_admin(self, phone: str, name: str, password: str | None = None) -> User: ...
  def list_admin_users(self) -> list[User]: ...
  def update_user_admin(self, user_id: str, input_data: AdminUpdateUserInput) -> User | None: ...
  def list_lawyer_applications(self) -> list[User]: ...
  def review_lawyer_application(self, user_id: str, input_data: AdminReviewLawyerInput) -> User | None: ...
  def list_admin_cases(self) -> list[LawCase]: ...
  def list_cases(self, user_id: str) -> list[LawCase]: ...
  def get_case(self, user_id: str, case_id: str) -> LawCase | None: ...
  def create_case(self, user_id: str, input_data: CreateCaseInput) -> LawCase: ...
  def add_evidence_file(
    self,
    user_id: str,
    case_id: str,
    category_id: str,
    file_name: str,
    file_size: int,
    mime_type: str,
    storage_path: str | None = None,
  ) -> EvidenceFile | None: ...
  def start_case_assessment(self, user_id: str, case_id: str) -> AssessmentJob | None: ...
  def select_plan(self, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None: ...
  def record_self_service_action(self, user_id: str, case_id: str, input_data: SelfServiceActionInput) -> LawCase | None: ...
  def record_lawyer_service_action(self, user_id: str, case_id: str, input_data: LawyerServiceActionInput) -> LawCase | None: ...
  def record_full_service_action(self, user_id: str, case_id: str, input_data: FullServiceActionInput) -> LawCase | None: ...
  def record_lawyer_full_service_action(self, lawyer_id: str, case_id: str, input_data: LawyerFullServiceActionInput) -> LawCase | None: ...
  def list_messages(self, user_id: str) -> list[NotificationMessage]: ...
  def mark_message_read(self, user_id: str, message_id: str) -> NotificationMessage | None: ...
  def list_case_work_items(self, user_id: str, case_id: str) -> list[WorkItem] | None: ...
  def list_case_documents(self, user_id: str, case_id: str) -> list[LegalDocument] | None: ...
  def approve_document(self, user_id: str, case_id: str, document_id: str) -> tuple[LawCase, LegalDocument] | None: ...
  def list_lawyer_tasks(self, lawyer_id: str) -> list[WorkItem] | None: ...
  def get_lawyer_task(self, lawyer_id: str, task_id: str) -> WorkItem | None: ...
  def get_lawyer_case(self, lawyer_id: str, case_id: str) -> LawCase | None: ...
  def list_lawyer_case_documents(self, lawyer_id: str, case_id: str) -> list[LegalDocument] | None: ...
  def get_lawyer_case_evidence_file(
    self,
    lawyer_id: str,
    case_id: str,
    category_id: str,
    file_id: str,
  ) -> tuple[EvidenceFile, str] | None: ...
  def submit_review(
    self,
    lawyer_id: str,
    task_id: str,
    input_data: SubmitReviewInput,
  ) -> tuple[LawCase, WorkItem, ReviewOpinion] | None: ...
  def create_document(
    self,
    lawyer_id: str,
    case_id: str,
    input_data: CreateDocumentInput,
  ) -> LegalDocument | None: ...
  def update_document(
    self,
    lawyer_id: str,
    case_id: str,
    document_id: str,
    input_data: UpdateDocumentInput,
  ) -> LegalDocument | None: ...
  def archive_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None: ...
  def submit_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None: ...
  def list_events(self, user_id: str, case_id: str) -> list[CaseEvent] | None: ...
  def stream_case_events(self, case_id: str) -> AsyncIterator[CaseEvent]: ...


class InMemoryStore:
  def __init__(self, settings: Settings):
    self.settings = settings
    self._otps: dict[str, tuple[str, datetime, str]] = {}
    self._otp_requested_at: dict[tuple[str, str], datetime] = {}
    self._otp_attempts: dict[tuple[str, str], int] = {}
    self._users_by_phone: dict[str, User] = {}
    self._users_by_id: dict[str, User] = {}
    self._password_hashes_by_user_id: dict[str, str] = {}
    self._sessions: dict[str, tuple[str, datetime]] = {}
    self._cases: dict[str, LawCase] = {}
    self._events: dict[str, list[CaseEvent]] = {}
    self._work_items: dict[str, WorkItem] = {}
    self._review_opinions: dict[str, ReviewOpinion] = {}
    self._documents: dict[str, LegalDocument] = {}
    self._messages: dict[str, NotificationMessage] = {}
    self._evidence_storage_paths: dict[str, str] = {}

  def get_login_code_requested_at(self, phone: str, purpose: str = "login") -> datetime | None:
    return self._otp_requested_at.get((_normalize_phone(phone), purpose))

  def request_login_code(self, phone: str, code: str | None = None, purpose: str = "login") -> dict[str, str]:
    normalized_phone = _normalize_phone(phone)
    expires_at = _now() + timedelta(minutes=self.settings.OTP_EXPIRE_MINUTES)
    resolved_code = code or self.settings.MOCK_OTP_CODE
    self._otps[normalized_phone] = (resolved_code, expires_at, purpose)
    self._otp_requested_at[(normalized_phone, purpose)] = _now()
    self._otp_attempts[(normalized_phone, purpose)] = 0
    return {
      "phone": normalized_phone,
      "code": resolved_code,
      "expiresAt": _iso(expires_at),
    }

  def login_with_code(self, phone: str, code: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    otp = self._otps.get(normalized_phone)
    attempt_key = (normalized_phone, "login")
    if otp is None or self._otp_attempts.get(attempt_key, 0) >= self.settings.SMS_MAX_ATTEMPTS:
      return None
    expected_code, expires_at, purpose = otp
    if expected_code != code or purpose != "login" or expires_at < _now():
      self._otp_attempts[attempt_key] = self._otp_attempts.get(attempt_key, 0) + 1
      return None

    user = self._users_by_phone.get(normalized_phone)
    if user is None:
      user = _new_user(normalized_phone)
      self._users_by_phone[normalized_phone] = user
      self._users_by_id[user.id] = user
    if user.accountStatus == "disabled":
      raise AccountDisabledError("ACCOUNT_DISABLED")
    session = self._create_session(user)
    self._consume_otp(normalized_phone, "login")
    return session

  def login_with_password(self, phone: str, password: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    user = self._users_by_phone.get(normalized_phone)
    if user is None:
      return None
    if user.accountStatus == "disabled":
      raise AccountDisabledError("ACCOUNT_DISABLED")
    if not verify_password(password, self._password_hashes_by_user_id.get(user.id)):
      return None
    return self._create_session(user)

  def register_client(self, input_data: ClientRegisterInput) -> AuthToken | None:
    normalized_phone = _normalize_phone(input_data.phone)
    if not self._verify_otp(normalized_phone, input_data.code):
      return None
    user = self._users_by_phone.get(normalized_phone)
    now = _iso(_now())
    if user is None:
      user = User(
        id=f"user-{uuid4().hex[:8]}",
        phone=normalized_phone,
        name=input_data.name,
        role="client",
        accountStatus="active",
        lawyerReviewStatus="none",
        createdAt=now,
        updatedAt=now,
      )
    else:
      if user.accountStatus == "disabled":
        raise AccountDisabledError("ACCOUNT_DISABLED")
      user.name = input_data.name
      if user.role == "client":
        user.role = "client"
        user.lawyerReviewStatus = "none"
        user.rejectedReason = None
      user.updatedAt = now
    self._users_by_phone[normalized_phone] = user
    self._users_by_id[user.id] = user
    if input_data.password is not None:
      self._password_hashes_by_user_id[user.id] = hash_password(input_data.password)
    session = self._create_session(user)
    self._consume_otp(normalized_phone, "register")
    return session

  def onboard_lawyer(self, input_data: LawyerOnboardingInput) -> AuthToken | None:
    normalized_phone = _normalize_phone(input_data.phone)
    if not self._verify_otp(normalized_phone, input_data.code):
      return None
    user = self._users_by_phone.get(normalized_phone)
    now = _iso(_now())
    if user is None:
      user = User(
        id=f"user-{uuid4().hex[:8]}",
        phone=normalized_phone,
        name=input_data.name,
        role="lawyer",
        accountStatus="active",
        lawyerReviewStatus="pending_review",
        lawFirm=input_data.lawFirm,
        licenseNumber=input_data.licenseNumber,
        practiceRegion=input_data.practiceRegion,
        specialties=input_data.specialties,
        createdAt=now,
        updatedAt=now,
      )
    else:
      if user.accountStatus == "disabled":
        raise AccountDisabledError("ACCOUNT_DISABLED")
      if user.role == "admin":
        raise RoleChangeForbiddenError("FORBIDDEN")
      user.name = input_data.name
      user.role = "lawyer"
      user.lawyerReviewStatus = "pending_review"
      user.rejectedReason = None
      user.lawFirm = input_data.lawFirm
      user.licenseNumber = input_data.licenseNumber
      user.practiceRegion = input_data.practiceRegion
      user.specialties = input_data.specialties
      user.updatedAt = now
    self._users_by_phone[normalized_phone] = user
    self._users_by_id[user.id] = user
    if input_data.password is not None:
      self._password_hashes_by_user_id[user.id] = hash_password(input_data.password)
    session = self._create_session(user)
    self._consume_otp(normalized_phone, "register")
    return session

  def get_user_by_token(self, token: str) -> User | None:
    try:
      user_id = decode_access_token(self.settings, token)
    except Exception:
      user_id = None
    session = self._sessions.get(token)
    if session is None:
      return None
    session_user_id, expires_at = session
    if expires_at < _now():
      self._sessions.pop(token, None)
      return None
    if user_id is not None and user_id != session_user_id:
      return None
    user_id = user_id or session_user_id
    return self._users_by_id.get(user_id)

  def create_admin(self, phone: str, name: str, password: str | None = None) -> User:
    normalized_phone = _normalize_phone(phone)
    user = self._users_by_phone.get(normalized_phone)
    now = _iso(_now())
    if user is None:
      user = User(
        id=f"user-{uuid4().hex[:8]}",
        phone=normalized_phone,
        name=name,
        role="admin",
        accountStatus="active",
        lawyerReviewStatus="none",
        createdAt=now,
        updatedAt=now,
      )
    else:
      user.name = name
      user.role = "admin"
      user.accountStatus = "active"
      user.lawyerReviewStatus = "none"
      user.rejectedReason = None
      user.updatedAt = now
    self._users_by_phone[normalized_phone] = user
    self._users_by_id[user.id] = user
    if password is not None:
      self._password_hashes_by_user_id[user.id] = hash_password(password)
    return user

  def list_admin_users(self) -> list[User]:
    return sorted(self._users_by_id.values(), key=lambda item: item.createdAt, reverse=True)

  def update_user_admin(self, user_id: str, input_data: AdminUpdateUserInput) -> User | None:
    user = self._users_by_id.get(user_id)
    if user is None:
      return None
    if self._would_remove_final_admin(user, input_data):
      raise LastAdminRequiredError("LAST_ADMIN_REQUIRED")
    if input_data.role is not None:
      user.role = input_data.role
      if input_data.role == "lawyer":
        if user.lawyerReviewStatus == "none":
          user.lawyerReviewStatus = "approved"
      else:
        user.lawyerReviewStatus = "none"
        user.rejectedReason = None
    if input_data.accountStatus is not None:
      user.accountStatus = input_data.accountStatus
    user.updatedAt = _iso(_now())
    return user

  def list_lawyer_applications(self) -> list[User]:
    users = [user for user in self._users_by_id.values() if user.role == "lawyer" and user.lawyerReviewStatus != "none"]
    return sorted(users, key=lambda item: item.updatedAt or item.createdAt, reverse=True)

  def review_lawyer_application(self, user_id: str, input_data: AdminReviewLawyerInput) -> User | None:
    user = self._users_by_id.get(user_id)
    if user is None or user.role != "lawyer":
      return None
    user.lawyerReviewStatus = input_data.status
    user.rejectedReason = input_data.rejectedReason if input_data.status == "rejected" else None
    user.accountStatus = "active"
    user.updatedAt = _iso(_now())
    return user

  def list_admin_cases(self) -> list[LawCase]:
    return sorted(self._cases.values(), key=lambda item: item.createdAt, reverse=True)

  def list_cases(self, user_id: str) -> list[LawCase]:
    cases = [case for case in self._cases.values() if case.userId == user_id]
    return sorted(cases, key=lambda item: item.createdAt, reverse=True)

  def get_case(self, user_id: str, case_id: str) -> LawCase | None:
    law_case = self._cases.get(case_id)
    if law_case is None or law_case.userId != user_id:
      return None
    return law_case

  def create_case(self, user_id: str, input_data: CreateCaseInput) -> LawCase:
    law_case = _new_case(user_id, input_data)
    self._cases[law_case.id] = law_case
    self._record_event(
      law_case.id,
      "case.updated",
      "案件已创建",
      f"已提交{get_case_type_label(law_case.caseType)}基础信息。",
    )
    return law_case

  def add_evidence(
    self,
    user_id: str,
    case_id: str,
    category_id: str,
    file_name: str,
    file_size: int,
    mime_type: str,
  ) -> LawCase | None:
    evidence_file = self.add_evidence_file(user_id, case_id, category_id, file_name, file_size, mime_type)
    if evidence_file is None:
      return None
    return self.get_case(user_id, case_id)

  def add_evidence_file(
    self,
    user_id: str,
    case_id: str,
    category_id: str,
    file_name: str,
    file_size: int,
    mime_type: str,
    storage_path: str | None = None,
  ) -> EvidenceFile | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None

    category = next((item for item in law_case.evidence if item.id == category_id), None)
    if category is None:
      return None

    evidence_file = _new_evidence_file(file_name, file_size, mime_type)
    category.files.append(evidence_file)
    if storage_path:
      self._evidence_storage_paths[evidence_file.id] = storage_path
    _mark_evidence_uploaded(law_case, category)
    self._record_event(
      law_case.id,
      "evidence.updated",
      "材料已上传",
      f"已上传{category.name}：{file_name}",
      {"categoryId": category_id, "fileName": file_name, "storagePath": storage_path},
    )
    return evidence_file

  def evaluate_case(self, user_id: str, case_id: str) -> LawCase | None:
    job = self.start_case_assessment(user_id, case_id)
    if job is None:
      return None
    return self.get_case(user_id, case_id)

  def start_case_assessment(self, user_id: str, case_id: str) -> AssessmentJob | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan is not None:
      raise InvalidStateError("PLAN_ALREADY_SELECTED")
    _require_required_evidence(law_case)
    return self._run_assessment(law_case)

  def select_plan(self, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None or law_case.assessment is None:
      return None
    if not any(plan.id == plan_id for plan in law_case.assessment.plans):
      return None
    _require_required_evidence(law_case)
    if law_case.selectedPlan == plan_id:
      return law_case
    if law_case.selectedPlan is not None:
      raise InvalidStateError("INVALID_STATE")

    _apply_selected_plan(law_case, plan_id)
    self_service_payload = _build_enhanced_self_service_payload(self.settings, law_case) if plan_id == "self-service" else None
    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    self._record_event(
      law_case.id,
      "plan.selected",
      "服务方案已选择",
      f"已选择：{selected_plan.name}",
      {"planId": plan_id},
    )
    self._create_plan_follow_up(law_case, user_id, plan_id, self_service_payload)
    return law_case

  def record_self_service_action(self, user_id: str, case_id: str, input_data: SelfServiceActionInput) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan != "self-service":
      raise InvalidStateError("SELF_SERVICE_REQUIRED")

    completed_at = _format_datetime(_now())
    title, message, payload = _apply_self_service_action(law_case, input_data, completed_at)
    task_status = _self_service_work_item_status(input_data)
    for task in self._work_items.values():
      if task.caseId == case_id and task.kind == "ai_guidance":
        task.status = task_status
        task.updatedAt = _iso(_now())
    self._record_event(law_case.id, "stage.changed", title, message, payload)
    self._record_event(
      law_case.id,
      "task.updated",
      "AI自助任务已更新",
      law_case.status,
      {"action": input_data.action, "status": task_status},
    )
    return law_case

  def record_lawyer_service_action(self, user_id: str, case_id: str, input_data: LawyerServiceActionInput) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan != "lawyer-review":
      raise InvalidStateError("LAWYER_SERVICE_REQUIRED")
    if not _has_approved_lawyer_letter(law_case, self._documents.values()):
      raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
    if input_data.action == "record_response" and input_data.response is None:
      raise InvalidStateError("RESPONSE_REQUIRED")

    completed_at = _format_datetime(_now())
    title, message, payload = _apply_lawyer_service_action(law_case, input_data, completed_at)
    if _lawyer_service_needs_follow_up(input_data):
      task, created = self._upsert_lawyer_follow_up_work_item(law_case, input_data.note)
      payload["workItemId"] = task.id
      event_title = "律师协商跟进待办已创建" if created else "律师协商跟进待办已更新"
      self._record_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id})
      self._notify_lawyers(event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
    self._record_event(law_case.id, "stage.changed", title, message, payload)
    return law_case

  def record_full_service_action(self, user_id: str, case_id: str, input_data: FullServiceActionInput) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan != "full-service":
      raise InvalidStateError("FULL_SERVICE_REQUIRED")
    _ensure_full_service_evidence_category(law_case)
    if not _has_approved_lawyer_letter(law_case, self._documents.values()):
      raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
    _validate_full_service_client_action(
      input_data,
      _full_service_send_proof_confirmed(self._work_items.values(), case_id),
      _has_send_proof_file(law_case),
    )

    completed_at = _format_datetime(_now())
    title, message, payload = _apply_full_service_client_action(law_case, input_data, completed_at)
    if input_data.action == "submit_send_proof":
      task, created = self._upsert_full_service_work_item(
        law_case,
        "send_proof_review",
        "发送凭证确认待办",
        _send_proof_review_summary(law_case, input_data),
      )
      payload["workItemId"] = task.id
      event_title = "发送凭证确认待办已创建" if created else "发送凭证确认待办已更新"
      self._record_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id})
      self._notify_lawyers(event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
    if input_data.action == "record_response":
      task, created = self._upsert_full_service_work_item(
        law_case,
        "lawyer_follow_up",
        "对方回应处理待办",
        _full_service_follow_up_summary(law_case, input_data),
      )
      payload["workItemId"] = task.id
      event_title = "对方回应处理待办已创建" if created else "对方回应处理待办已更新"
      self._record_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id})
      self._notify_lawyers(event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
    self._record_event(law_case.id, "stage.changed", title, message, payload)
    return law_case

  def record_lawyer_full_service_action(self, lawyer_id: str, case_id: str, input_data: LawyerFullServiceActionInput) -> LawCase | None:
    if not self._is_lawyer(lawyer_id):
      return None
    law_case = self._cases.get(case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan != "full-service":
      raise InvalidStateError("FULL_SERVICE_REQUIRED")
    if not _has_approved_lawyer_letter(law_case, self._documents.values()):
      raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
    _validate_full_service_lawyer_action(input_data, self._work_items.values(), case_id)

    completed_at = _format_datetime(_now())
    title, message, payload = _apply_full_service_lawyer_action(law_case, input_data, completed_at)
    if input_data.action == "confirm_send_proof":
      self._complete_full_service_work_items(case_id, "send_proof_review", "completed")
      self._create_message(
        law_case.userId or "",
        "task",
        "发送凭证已确认",
        "律师已确认发送凭证，可以继续记录对方回应。",
        f"/cases/{case_id}",
        case_id,
      )
    elif input_data.action == "reject_send_proof":
      self._complete_full_service_work_items(case_id, "send_proof_review", "cancelled")
      self._create_message(
        law_case.userId or "",
        "task",
        "发送凭证需补充",
        input_data.note or "律师未确认当前发送凭证，请补充截图、快递单号或签收记录。",
        f"/cases/{case_id}",
        case_id,
      )
    elif input_data.action in ("decide_response", "prepare_filing", "close_case"):
      follow_up_status = "in_progress" if input_data.decision in ("promised", "installment", "mediation_requested") else "completed"
      self._complete_full_service_work_items(case_id, "lawyer_follow_up", follow_up_status)
    self._record_event(law_case.id, "stage.changed", title, message, payload)
    return law_case

  def list_messages(self, user_id: str) -> list[NotificationMessage]:
    messages = [message for message in self._messages.values() if message.recipientUserId == user_id]
    return sorted(messages, key=lambda item: item.createdAt, reverse=True)

  def mark_message_read(self, user_id: str, message_id: str) -> NotificationMessage | None:
    message = self._messages.get(message_id)
    if message is None or message.recipientUserId != user_id:
      return None
    message.unread = False
    return message

  def list_case_work_items(self, user_id: str, case_id: str) -> list[WorkItem] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    return sorted(
      [item for item in self._work_items.values() if item.caseId == case_id],
      key=lambda item: item.createdAt,
      reverse=True,
    )

  def list_case_documents(self, user_id: str, case_id: str) -> list[LegalDocument] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    return sorted(
      [
        document
        for document in self._documents.values()
        if document.caseId == case_id and document.status in ("pending_client_approval", "approved", "sent")
      ],
      key=lambda item: item.updatedAt,
      reverse=True,
    )

  def approve_document(self, user_id: str, case_id: str, document_id: str) -> tuple[LawCase, LegalDocument] | None:
    law_case = self.get_case(user_id, case_id)
    document = self._documents.get(document_id)
    if law_case is None or document is None or document.caseId != case_id:
      return None
    if document.status != "pending_client_approval":
      raise InvalidStateError("INVALID_STATE")

    document.status = "approved"
    document.updatedBy = user_id
    document.updatedAt = _iso(_now())
    law_case.status = _approved_document_status(document.type)
    _mark_stage_for_document(law_case, document.type)
    self._record_event(
      law_case.id,
      "document.updated",
      "文书已确认",
      f"用户已确认：{document.title}",
      {"documentId": document.id, "documentType": document.type},
    )
    self._create_message(
      law_case.userId or "",
      "document",
      "文书已确认",
      _approved_document_client_message(law_case, document),
      f"/cases/{case_id}",
      case_id,
    )
    self._notify_lawyers(
      "用户已确认文书",
      _approved_document_lawyer_notification(law_case, document),
      f"/lawyer/cases/{case_id}/documents/{document_id}",
      case_id,
    )
    return law_case, document

  def list_lawyer_tasks(self, lawyer_id: str) -> list[WorkItem] | None:
    lawyer = self._users_by_id.get(lawyer_id)
    if lawyer is None or lawyer.role != "lawyer":
      return None
    tasks = [
      item for item in self._work_items.values()
      if item.kind != "ai_guidance" and (item.assigneeId in (None, lawyer_id) or item.status == "pending")
    ]
    return sorted(tasks, key=lambda item: item.createdAt, reverse=True)

  def get_lawyer_task(self, lawyer_id: str, task_id: str) -> WorkItem | None:
    lawyer = self._users_by_id.get(lawyer_id)
    task = self._work_items.get(task_id)
    if lawyer is None or lawyer.role != "lawyer" or task is None or task.kind == "ai_guidance":
      return None
    return task

  def get_lawyer_case(self, lawyer_id: str, case_id: str) -> LawCase | None:
    if not self._is_lawyer(lawyer_id):
      return None
    return self._cases.get(case_id)

  def list_lawyer_case_documents(self, lawyer_id: str, case_id: str) -> list[LegalDocument] | None:
    if not self._is_lawyer(lawyer_id) or case_id not in self._cases:
      return None
    return sorted(
      [document for document in self._documents.values() if document.caseId == case_id],
      key=lambda item: item.updatedAt,
      reverse=True,
    )

  def get_lawyer_case_evidence_file(
    self,
    lawyer_id: str,
    case_id: str,
    category_id: str,
    file_id: str,
  ) -> tuple[EvidenceFile, str] | None:
    if not self._is_lawyer(lawyer_id):
      return None
    can_access_case = any(
      item.caseId == case_id
      and item.kind == "lawyer_review"
      and (item.assigneeId in (None, lawyer_id) or item.status == "pending")
      for item in self._work_items.values()
    )
    if not can_access_case:
      return None
    law_case = self._cases.get(case_id)
    if law_case is None:
      return None
    category = next((item for item in law_case.evidence if item.id == category_id), None)
    if category is None:
      return None
    evidence_file = next((item for item in category.files if item.id == file_id), None)
    storage_path = self._evidence_storage_paths.get(file_id)
    if evidence_file is None or not storage_path:
      return None
    return evidence_file, storage_path

  def submit_review(
    self,
    lawyer_id: str,
    task_id: str,
    input_data: SubmitReviewInput,
  ) -> tuple[LawCase, WorkItem, ReviewOpinion] | None:
    lawyer = self._users_by_id.get(lawyer_id)
    task = self._work_items.get(task_id)
    if lawyer is None or lawyer.role != "lawyer" or task is None or task.kind != "lawyer_review":
      return None
    law_case = self._cases.get(task.caseId)
    if law_case is None:
      return None

    now = _iso(_now())
    task.status = "completed"
    task.assigneeId = lawyer_id
    task.updatedAt = now
    opinion = ReviewOpinion(
      id=f"review-{uuid4().hex[:8]}",
      caseId=law_case.id,
      workItemId=task.id,
      lawyerId=lawyer_id,
      conclusion=input_data.conclusion,
      riskLevel=input_data.riskLevel,
      evidenceGaps=input_data.evidenceGaps,
      advice=input_data.advice,
      nextAction=input_data.nextAction,
      createdAt=now,
    )
    self._review_opinions[opinion.id] = opinion
    law_case.status = "待确认律师意见"
    review_stage = next((stage for stage in law_case.stages if stage.key == "review"), None)
    if review_stage is not None:
      review_stage.status = "done"
      review_stage.at = _format_datetime(_now())
      review_stage.description = "律师已提交复核意见"
    self._record_event(
      law_case.id,
      "review.submitted",
      "律师复核意见已提交",
      input_data.conclusion,
      {"workItemId": task.id, "reviewId": opinion.id, "nextAction": input_data.nextAction},
    )
    self._create_message(
      law_case.userId or "",
      "review",
      "律师复核意见已提交",
      input_data.advice,
      f"/cases/{law_case.id}",
      law_case.id,
    )
    return law_case, task, opinion

  def create_document(
    self,
    lawyer_id: str,
    case_id: str,
    input_data: CreateDocumentInput,
  ) -> LegalDocument | None:
    if not self._is_lawyer(lawyer_id) or case_id not in self._cases:
      return None
    document = _new_document(case_id, lawyer_id, input_data)
    self._documents[document.id] = document
    self._record_event(case_id, "document.updated", "文书草稿已创建", document.title, {"documentId": document.id})
    return document

  def update_document(
    self,
    lawyer_id: str,
    case_id: str,
    document_id: str,
    input_data: UpdateDocumentInput,
  ) -> LegalDocument | None:
    if not self._is_lawyer(lawyer_id):
      return None
    document = self._documents.get(document_id)
    if document is None or document.caseId != case_id:
      return None
    if document.status != "draft":
      raise InvalidStateError("INVALID_STATE")
    _apply_document_update(document, lawyer_id, input_data)
    self._record_event(case_id, "document.updated", "文书草稿已更新", document.title, {"documentId": document.id})
    return document

  def archive_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None:
    if not self._is_lawyer(lawyer_id):
      return None
    document = self._documents.get(document_id)
    if document is None or document.caseId != case_id:
      return None
    if document.status != "draft":
      raise InvalidStateError("INVALID_STATE")
    document.status = "archived"
    document.updatedBy = lawyer_id
    document.updatedAt = _iso(_now())
    self._record_event(case_id, "document.updated", "文书已归档", document.title, {"documentId": document.id})
    return document

  def submit_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None:
    if not self._is_lawyer(lawyer_id):
      return None
    document = self._documents.get(document_id)
    law_case = self._cases.get(case_id)
    if document is None or law_case is None or document.caseId != case_id:
      return None
    if document.status != "draft":
      raise InvalidStateError("INVALID_STATE")
    _require_document_submission_fields(document)
    document.status = "pending_client_approval"
    document.updatedBy = lawyer_id
    document.updatedAt = _iso(_now())
    law_case.status = "文书待用户确认"
    self._record_event(case_id, "document.updated", "文书待确认", document.title, {"documentId": document.id})
    self._create_message(
      law_case.userId or "",
      "document",
      "文书待确认",
      f"律师已提交 {document.title}，请确认后进入下一阶段。",
      f"/cases/{case_id}",
      case_id,
    )
    return document

  def list_events(self, user_id: str, case_id: str) -> list[CaseEvent] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    return self._events.get(case_id, [])

  async def stream_case_events(self, case_id: str) -> AsyncIterator[CaseEvent]:
    for event in self._events.get(case_id, []):
      yield event

  def _run_assessment(self, law_case: LawCase) -> AssessmentJob:
    created_at = _now()
    job_id = f"job-{uuid4().hex[:8]}"
    self._record_event(
      law_case.id,
      "assessment.progress",
      "AI评估已启动",
      "正在梳理材料并生成案件评估。",
      {"jobId": job_id, "step": "started"},
    )
    try:
      law_case.assessment = assess_case(law_case, self.settings)
    except Exception as exc:
      law_case.status = "评估失败"
      completed_at = _now()
      self._record_event(
        law_case.id,
        "assessment.progress",
        "AI评估失败",
        "工作流执行失败，请稍后重试或联系律师复核。",
        {"jobId": job_id, "step": "failed", "errorCode": "WORKFLOW_FAILED"},
      )
      return AssessmentJob(
        id=job_id,
        caseId=law_case.id,
        status="failed",
        errorCode="WORKFLOW_FAILED",
        errorMessage=str(exc),
        createdAt=_iso(created_at),
        completedAt=_iso(completed_at),
      )
    law_case.status = "待选择方案"
    self._record_event(
      law_case.id,
      "assessment.progress",
      "AI评估已完成",
      f"{get_case_type_label(law_case.caseType)}评估参考值为 {law_case.assessment.winRate}%。",
      {"jobId": job_id, "step": "completed"},
    )
    completed_at = _now()
    return AssessmentJob(
      id=job_id,
      caseId=law_case.id,
      status="completed",
      result=law_case.assessment,
      createdAt=_iso(created_at),
      completedAt=_iso(completed_at),
    )

  def _get_or_create_user(self, phone: str) -> User:
    user = self._users_by_phone.get(phone)
    if user is not None:
      return user

    user = _new_user(phone)
    self._users_by_phone[phone] = user
    self._users_by_id[user.id] = user
    return user

  def _verify_otp(self, phone: str, code: str, purpose: str = "register") -> bool:
    otp = self._otps.get(phone)
    attempt_key = (phone, purpose)
    if otp is None or self._otp_attempts.get(attempt_key, 0) >= self.settings.SMS_MAX_ATTEMPTS:
      return False
    expected_code, expires_at, stored_purpose = otp
    if expected_code == code and stored_purpose == purpose and expires_at >= _now():
      return True
    self._otp_attempts[attempt_key] = self._otp_attempts.get(attempt_key, 0) + 1
    return False

  def _consume_otp(self, phone: str, purpose: str) -> None:
    otp = self._otps.get(phone)
    if otp is not None and otp[2] == purpose:
      self._otps.pop(phone, None)
    self._otp_attempts.pop((phone, purpose), None)

  def _create_session(self, user: User) -> AuthToken:
    token, session_expires_at = create_access_token(self.settings, subject=user.id)
    self._sessions[token] = (user.id, session_expires_at)
    return AuthToken(token=token, user=user, expiresAt=_iso(session_expires_at))

  def _would_remove_final_admin(self, user: User, input_data: AdminUpdateUserInput) -> bool:
    if user.role != "admin" or user.accountStatus != "active":
      return False
    will_stop_being_admin = input_data.role is not None and input_data.role != "admin"
    will_be_disabled = input_data.accountStatus == "disabled"
    if not will_stop_being_admin and not will_be_disabled:
      return False
    active_admins = [
      item for item in self._users_by_id.values()
      if item.id != user.id and item.role == "admin" and item.accountStatus == "active"
    ]
    return not active_admins

  def _record_event(
    self,
    case_id: str,
    event_type: CaseEventType,
    title: str,
    message: str,
    payload: dict[str, Any] | None = None,
  ) -> None:
    event = _new_event(case_id, event_type, title, message, payload)
    self._events.setdefault(case_id, []).append(event)

  def _create_plan_follow_up(
    self,
    law_case: LawCase,
    user_id: str,
    plan_id: PlanId,
    self_service_payload: SelfServicePayload | None = None,
  ) -> None:
    if plan_id == "self-service":
      payload = self_service_payload or build_self_service_payload(law_case)
      task = _new_work_item(law_case.id, "ai_guidance", "AI自助处理包", payload.taskSummary)
      task.status = "in_progress"
      task.updatedAt = _iso(_now())
      self._work_items[task.id] = task
      document = _new_document(
        law_case.id,
        user_id,
        CreateDocumentInput(
          type=payload.documentType,
          title=payload.title,
          fields=payload.fields,
          body=payload.body,
        ),
      )
      document.status = "approved"
      self._documents[document.id] = document
      apply_self_service_outcome(law_case, payload, _format_datetime(_now()))
      self._record_event(
        law_case.id,
        "document.updated",
        "AI自助文书已生成",
        payload.title,
        {"documentId": document.id, "documentType": document.type, "source": "ai_self_service"},
      )
      self._record_event(
        law_case.id,
        "task.updated",
        "AI自助处理包已生成",
        payload.taskSummary,
        {"workItemId": task.id},
      )
      self._create_message(
        user_id,
        "document",
        payload.messageTitle,
        payload.messageBody,
        f"/cases/{law_case.id}",
        law_case.id,
      )
      return

    lawyer_id = self._first_lawyer_id()
    task = _new_work_item(
      law_case.id,
      "lawyer_review",
      "律师复核待办",
      f"复核 {law_case.debtorName} 的案件资料、证据和 AI 评估结果。",
      lawyer_id,
    )
    self._work_items[task.id] = task
    self._record_event(law_case.id, "task.created", "律师复核待办已创建", task.summary, {"workItemId": task.id})
    self._create_message(
      user_id,
      "task",
      "律师复核已受理",
      "系统已生成律师复核待办，律师将查看材料并反馈补证或处理建议。",
      f"/cases/{law_case.id}",
      law_case.id,
    )
    self._notify_lawyers("新的律师复核待办", task.summary, f"/lawyer/tasks/{task.id}", law_case.id)

  def _upsert_lawyer_follow_up_work_item(self, law_case: LawCase, note: str | None = None) -> tuple[WorkItem, bool]:
    summary = _lawyer_follow_up_summary(law_case, note)
    existing = next(
      (
        item for item in self._work_items.values()
        if item.caseId == law_case.id and item.kind == "lawyer_follow_up" and item.status in ("pending", "in_progress")
      ),
      None,
    )
    if existing is not None:
      existing.status = "pending"
      existing.summary = summary
      existing.updatedAt = _iso(_now())
      return existing, False
    task = _new_work_item(law_case.id, "lawyer_follow_up", "协商跟进待办", summary, self._first_lawyer_id())
    self._work_items[task.id] = task
    return task, True

  def _upsert_full_service_work_item(
    self,
    law_case: LawCase,
    kind: str,
    title: str,
    summary: str,
  ) -> tuple[WorkItem, bool]:
    existing = next(
      (
        item for item in self._work_items.values()
        if item.caseId == law_case.id and item.kind == kind and item.status in ("pending", "in_progress")
      ),
      None,
    )
    if existing is not None:
      existing.status = "pending"
      existing.title = title
      existing.summary = summary
      existing.updatedAt = _iso(_now())
      return existing, False
    task = _new_work_item(law_case.id, kind, title, summary, self._first_lawyer_id())
    self._work_items[task.id] = task
    return task, True

  def _complete_full_service_work_items(self, case_id: str, kind: str, status: str) -> None:
    for task in self._work_items.values():
      if task.caseId == case_id and task.kind == kind and task.status in ("pending", "in_progress"):
        task.status = status
        task.updatedAt = _iso(_now())

  def _create_message(
    self,
    recipient_user_id: str,
    message_type: str,
    title: str,
    body: str,
    action_href: str,
    case_id: str | None = None,
  ) -> None:
    if not recipient_user_id:
      return
    message = _new_message(recipient_user_id, message_type, title, body, action_href, case_id)
    self._messages[message.id] = message
    if case_id is not None:
      self._record_event(case_id, "notification.created", title, body, {"messageId": message.id})

  def _notify_lawyers(self, title: str, body: str, action_href: str, case_id: str | None = None) -> None:
    for user in self._users_by_id.values():
      if _is_active_approved_lawyer(user):
        self._create_message(user.id, "task", title, body, action_href, case_id)

  def _first_lawyer_id(self) -> str | None:
    lawyer = next((user for user in self._users_by_id.values() if _is_active_approved_lawyer(user)), None)
    return lawyer.id if lawyer is not None else None

  def _is_lawyer(self, user_id: str) -> bool:
    user = self._users_by_id.get(user_id)
    return user is not None and _is_active_approved_lawyer(user)


class PostgresStore:
  def __init__(self, settings: Settings, database: Database):
    self.settings = settings
    self.database = database

  def get_login_code_requested_at(self, phone: str, purpose: str = "login") -> datetime | None:
    normalized_phone = _normalize_phone(phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          "SELECT created_at FROM otp_codes WHERE phone = %s AND purpose = %s",
          (normalized_phone, purpose),
        )
        otp = cursor.fetchone()
    return _parse_iso(otp["created_at"]) if otp is not None else None

  def request_login_code(self, phone: str, code: str | None = None, purpose: str = "login") -> dict[str, str]:
    normalized_phone = _normalize_phone(phone)
    now = _now()
    expires_at = now + timedelta(minutes=self.settings.OTP_EXPIRE_MINUTES)
    resolved_code = code or self.settings.MOCK_OTP_CODE
    with self.database.connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute(
          """
          INSERT INTO otp_codes (phone, code, purpose, attempts, expires_at, created_at)
          VALUES (%s, %s, %s, 0, %s, %s)
          ON CONFLICT (phone, purpose) DO UPDATE
          SET code = EXCLUDED.code, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at
          """,
          (normalized_phone, resolved_code, purpose, _iso(expires_at), _iso(now)),
        )
      conn.commit()
    return {"phone": normalized_phone, "code": resolved_code, "expiresAt": _iso(expires_at)}

  def login_with_code(self, phone: str, code: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          "SELECT code, attempts, expires_at FROM otp_codes WHERE phone = %s AND purpose = %s",
          (normalized_phone, "login"),
        )
        otp = cursor.fetchone()
        if otp is None or _parse_iso(otp["expires_at"]) < _now() or otp["attempts"] >= self.settings.SMS_MAX_ATTEMPTS:
          conn.rollback()
          return None
        if otp["code"] != code:
          cursor.execute(
            "UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = %s AND purpose = %s",
            (normalized_phone, "login"),
          )
          conn.commit()
          return None
        cursor.execute("SELECT * FROM users WHERE phone = %s", (normalized_phone,))
        user_row = cursor.fetchone()
        if user_row is None:
          user = _new_user(normalized_phone)
          self._insert_user(cursor, user)
        else:
          user = _user_from_row(user_row)
        if user.accountStatus == "disabled":
          conn.rollback()
          raise AccountDisabledError("ACCOUNT_DISABLED")
        token, expires_at = self._insert_session(cursor, user.id)
        cursor.execute("DELETE FROM otp_codes WHERE phone = %s AND purpose = %s", (normalized_phone, "login"))
      conn.commit()
    return AuthToken(token=token, user=user, expiresAt=_iso(expires_at))

  def login_with_password(self, phone: str, password: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM users WHERE phone = %s", (normalized_phone,))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        user = _user_from_row(row)
        if user.accountStatus == "disabled":
          conn.rollback()
          raise AccountDisabledError("ACCOUNT_DISABLED")
        if not verify_password(password, row.get("password_hash")):
          conn.rollback()
          return None
        token, expires_at = self._insert_session(cursor, user.id)
      conn.commit()
    return AuthToken(token=token, user=user, expiresAt=_iso(expires_at))

  def register_client(self, input_data: ClientRegisterInput) -> AuthToken | None:
    normalized_phone = _normalize_phone(input_data.phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._verify_otp(cursor, normalized_phone, input_data.code):
          conn.commit()
          return None
        cursor.execute("SELECT * FROM users WHERE phone = %s", (normalized_phone,))
        existing = cursor.fetchone()
        now = _iso(_now())
        if existing is None:
          user = User(
            id=f"user-{uuid4().hex[:8]}",
            phone=normalized_phone,
            name=input_data.name,
            role="client",
            accountStatus="active",
            lawyerReviewStatus="none",
            createdAt=now,
            updatedAt=now,
          )
          self._insert_user(cursor, user)
          self._set_user_password(cursor, user.id, input_data.password)
        else:
          user = _user_from_row(existing)
          if user.accountStatus == "disabled":
            conn.rollback()
            raise AccountDisabledError("ACCOUNT_DISABLED")
          user.name = input_data.name
          if user.role == "client":
            user.role = "client"
            user.lawyerReviewStatus = "none"
            user.rejectedReason = None
          user.updatedAt = now
          self._update_user_row(cursor, user)
          self._set_user_password(cursor, user.id, input_data.password)
        token, expires_at = self._insert_session(cursor, user.id)
        cursor.execute("DELETE FROM otp_codes WHERE phone = %s AND purpose = %s", (normalized_phone, "register"))
      conn.commit()
    return AuthToken(token=token, user=user, expiresAt=_iso(expires_at))

  def onboard_lawyer(self, input_data: LawyerOnboardingInput) -> AuthToken | None:
    normalized_phone = _normalize_phone(input_data.phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._verify_otp(cursor, normalized_phone, input_data.code):
          conn.commit()
          return None
        cursor.execute("SELECT * FROM users WHERE phone = %s", (normalized_phone,))
        existing = cursor.fetchone()
        now = _iso(_now())
        if existing is None:
          user = User(
            id=f"user-{uuid4().hex[:8]}",
            phone=normalized_phone,
            name=input_data.name,
            role="lawyer",
            accountStatus="active",
            lawyerReviewStatus="pending_review",
            lawFirm=input_data.lawFirm,
            licenseNumber=input_data.licenseNumber,
            practiceRegion=input_data.practiceRegion,
            specialties=input_data.specialties,
            createdAt=now,
            updatedAt=now,
          )
          self._insert_user(cursor, user)
          self._set_user_password(cursor, user.id, input_data.password)
        else:
          user = _user_from_row(existing)
          if user.accountStatus == "disabled":
            conn.rollback()
            raise AccountDisabledError("ACCOUNT_DISABLED")
          if user.role == "admin":
            conn.rollback()
            raise RoleChangeForbiddenError("FORBIDDEN")
          user.name = input_data.name
          user.role = "lawyer"
          user.lawyerReviewStatus = "pending_review"
          user.rejectedReason = None
          user.lawFirm = input_data.lawFirm
          user.licenseNumber = input_data.licenseNumber
          user.practiceRegion = input_data.practiceRegion
          user.specialties = input_data.specialties
          user.updatedAt = now
          self._update_user_row(cursor, user)
          self._set_user_password(cursor, user.id, input_data.password)
        token, expires_at = self._insert_session(cursor, user.id)
        cursor.execute("DELETE FROM otp_codes WHERE phone = %s AND purpose = %s", (normalized_phone, "register"))
      conn.commit()
    return AuthToken(token=token, user=user, expiresAt=_iso(expires_at))

  def get_user_by_token(self, token: str) -> User | None:
    try:
      jwt_user_id = decode_access_token(self.settings, token)
    except Exception:
      jwt_user_id = None
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
          SELECT users.*, sessions.expires_at AS session_expires_at
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = %s
          """,
          (token,),
        )
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        if _parse_iso(row["session_expires_at"]) < _now():
          cursor.execute("DELETE FROM sessions WHERE token = %s", (token,))
          conn.commit()
          return None
        if jwt_user_id is not None and jwt_user_id != row["id"]:
          conn.rollback()
          return None
      conn.rollback()
    return _user_from_row(row)

  def create_admin(self, phone: str, name: str, password: str | None = None) -> User:
    normalized_phone = _normalize_phone(phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM users WHERE phone = %s", (normalized_phone,))
        row = cursor.fetchone()
        now = _iso(_now())
        if row is None:
          user = User(
            id=f"user-{uuid4().hex[:8]}",
            phone=normalized_phone,
            name=name,
            role="admin",
            accountStatus="active",
            lawyerReviewStatus="none",
            createdAt=now,
            updatedAt=now,
          )
          self._insert_user(cursor, user)
          self._set_user_password(cursor, user.id, password)
        else:
          user = _user_from_row(row)
          user.name = name
          user.role = "admin"
          user.accountStatus = "active"
          user.lawyerReviewStatus = "none"
          user.rejectedReason = None
          user.updatedAt = now
          self._update_user_row(cursor, user)
          self._set_user_password(cursor, user.id, password)
      conn.commit()
    return user

  def list_admin_users(self) -> list[User]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
      conn.rollback()
    return [_user_from_row(row) for row in rows]

  def update_user_admin(self, user_id: str, input_data: AdminUpdateUserInput) -> User | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        user = _user_from_row(row)
        if self._would_remove_final_admin(cursor, user, input_data):
          conn.rollback()
          raise LastAdminRequiredError("LAST_ADMIN_REQUIRED")
        if input_data.role is not None:
          user.role = input_data.role
          if input_data.role == "lawyer":
            if user.lawyerReviewStatus == "none":
              user.lawyerReviewStatus = "approved"
          else:
            user.lawyerReviewStatus = "none"
            user.rejectedReason = None
        if input_data.accountStatus is not None:
          user.accountStatus = input_data.accountStatus
        user.updatedAt = _iso(_now())
        self._update_user_row(cursor, user)
      conn.commit()
    return user

  def list_lawyer_applications(self) -> list[User]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
          SELECT * FROM users
          WHERE role = 'lawyer' AND lawyer_review_status <> 'none'
          ORDER BY COALESCE(updated_at, created_at) DESC
          """
        )
        rows = cursor.fetchall()
      conn.rollback()
    return [_user_from_row(row) for row in rows]

  def review_lawyer_application(self, user_id: str, input_data: AdminReviewLawyerInput) -> User | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM users WHERE id = %s AND role = 'lawyer'", (user_id,))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        user = _user_from_row(row)
        user.lawyerReviewStatus = input_data.status
        user.rejectedReason = input_data.rejectedReason if input_data.status == "rejected" else None
        user.accountStatus = "active"
        user.updatedAt = _iso(_now())
        self._update_user_row(cursor, user)
      conn.commit()
    return user

  def list_admin_cases(self) -> list[LawCase]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases ORDER BY created_at DESC")
        rows = cursor.fetchall()
        cases = [self._case_from_row(cursor, row) for row in rows]
      conn.rollback()
    return cases

  def list_cases(self, user_id: str) -> list[LawCase]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cursor.fetchall()
        cases = [self._case_from_row(cursor, row) for row in rows]
      conn.rollback()
    return cases

  def get_case(self, user_id: str, case_id: str) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        row = cursor.fetchone()
        law_case = self._case_from_row(cursor, row) if row else None
      conn.rollback()
    return law_case

  def create_case(self, user_id: str, input_data: CreateCaseInput) -> LawCase:
    law_case = _new_case(user_id, input_data)
    with self.database.connection() as conn:
      with conn.cursor() as cursor:
        self._insert_case(cursor, law_case)
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "case.updated",
            "案件已创建",
            f"已提交{get_case_type_label(law_case.caseType)}基础信息。",
          ),
        )
      conn.commit()
    return law_case

  def add_evidence_file(
    self,
    user_id: str,
    case_id: str,
    category_id: str,
    file_name: str,
    file_size: int,
    mime_type: str,
    storage_path: str | None = None,
  ) -> EvidenceFile | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, row)
        category = next((item for item in law_case.evidence if item.id == category_id), None)
        if category is None:
          conn.rollback()
          return None

        evidence_file = _new_evidence_file(file_name, file_size, mime_type)
        category.files.append(evidence_file)
        _mark_evidence_uploaded(law_case, category)
        cursor.execute(
          """
          INSERT INTO evidence_files (id, case_id, category_id, name, size, mime_type, storage_path, uploaded_at)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            evidence_file.id,
            law_case.id,
            category_id,
            file_name,
            file_size,
            mime_type,
            storage_path or "",
            evidence_file.uploadedAt,
          ),
        )
        self._update_case_state(cursor, law_case)
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "evidence.updated",
            "材料已上传",
            f"已上传{category.name}：{file_name}",
            {"categoryId": category_id, "fileName": file_name, "storagePath": storage_path},
          ),
        )
      conn.commit()
    return evidence_file

  def start_case_assessment(self, user_id: str, case_id: str) -> AssessmentJob | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None
    if law_case.selectedPlan is not None:
      raise InvalidStateError("PLAN_ALREADY_SELECTED")
    _require_required_evidence(law_case)
    created_at = _now()
    job_id = f"job-{uuid4().hex[:8]}"
    started_event = _new_event(
      law_case.id,
      "assessment.progress",
      "AI评估已启动",
      "正在梳理材料并生成案件评估。",
      {"jobId": job_id, "step": "started"},
    )
    try:
      law_case.assessment = assess_case(law_case, self.settings)
    except Exception as exc:
      law_case.status = "评估失败"
      completed_at = _now()
      job = AssessmentJob(
        id=job_id,
        caseId=law_case.id,
        status="failed",
        errorCode="WORKFLOW_FAILED",
        errorMessage=str(exc),
        createdAt=_iso(created_at),
        completedAt=_iso(completed_at),
      )
      failed_event = _new_event(
        law_case.id,
        "assessment.progress",
        "AI评估失败",
        "工作流执行失败，请稍后重试或联系律师复核。",
        {"jobId": job_id, "step": "failed", "errorCode": "WORKFLOW_FAILED"},
      )
      self._persist_assessment(law_case, job, [started_event, failed_event])
      return job

    law_case.status = "待选择方案"
    completed_at = _now()
    job = AssessmentJob(
      id=job_id,
      caseId=law_case.id,
      status="completed",
      result=law_case.assessment,
      createdAt=_iso(created_at),
      completedAt=_iso(completed_at),
    )
    completed_event = _new_event(
      law_case.id,
      "assessment.progress",
      "AI评估已完成",
      f"{get_case_type_label(law_case.caseType)}评估参考值为 {law_case.assessment.winRate}%。",
      {"jobId": job_id, "step": "completed"},
    )
    self._persist_assessment(law_case, job, [started_event, completed_event])
    return job

  def select_plan(self, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None or law_case.assessment is None:
      return None
    if not any(plan.id == plan_id for plan in law_case.assessment.plans):
      return None
    _require_required_evidence(law_case)
    if law_case.selectedPlan == plan_id:
      return law_case
    if law_case.selectedPlan is not None:
      raise InvalidStateError("INVALID_STATE")
    _apply_selected_plan(law_case, plan_id)
    self_service_payload = _build_enhanced_self_service_payload(self.settings, law_case) if plan_id == "self-service" else None
    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        self._update_case_state(cursor, law_case)
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "plan.selected",
            "服务方案已选择",
            f"已选择：{selected_plan.name}",
            {"planId": plan_id},
          ),
        )
        self._create_plan_follow_up(cursor, law_case, user_id, plan_id, self_service_payload)
      conn.commit()
    return law_case

  def record_self_service_action(self, user_id: str, case_id: str, input_data: SelfServiceActionInput) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, row)
        if law_case.selectedPlan != "self-service":
          conn.rollback()
          raise InvalidStateError("SELF_SERVICE_REQUIRED")

        completed_at = _format_datetime(_now())
        title, message, payload = _apply_self_service_action(law_case, input_data, completed_at)
        task_status = _self_service_work_item_status(input_data)
        self._update_case_state(cursor, law_case)
        cursor.execute(
          """
          UPDATE work_items
          SET status = %s, updated_at = %s
          WHERE case_id = %s AND kind = 'ai_guidance'
          """,
          (task_status, _iso(_now()), case_id),
        )
        self._insert_event(cursor, _new_event(law_case.id, "stage.changed", title, message, payload))
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "task.updated",
            "AI自助任务已更新",
            law_case.status,
            {"action": input_data.action, "status": task_status},
          ),
        )
      conn.commit()
    return law_case

  def record_lawyer_service_action(self, user_id: str, case_id: str, input_data: LawyerServiceActionInput) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, row)
        if law_case.selectedPlan != "lawyer-review":
          conn.rollback()
          raise InvalidStateError("LAWYER_SERVICE_REQUIRED")
        if not self._has_approved_lawyer_letter(cursor, case_id):
          conn.rollback()
          raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
        if input_data.action == "record_response" and input_data.response is None:
          conn.rollback()
          raise InvalidStateError("RESPONSE_REQUIRED")

        completed_at = _format_datetime(_now())
        title, message, payload = _apply_lawyer_service_action(law_case, input_data, completed_at)
        self._update_case_state(cursor, law_case)
        if _lawyer_service_needs_follow_up(input_data):
          task, created = self._upsert_lawyer_follow_up_work_item(cursor, law_case, input_data.note)
          payload["workItemId"] = task.id
          event_title = "律师协商跟进待办已创建" if created else "律师协商跟进待办已更新"
          self._insert_event(
            cursor,
            _new_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id}),
          )
          self._notify_lawyers(cursor, event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
        self._insert_event(cursor, _new_event(law_case.id, "stage.changed", title, message, payload))
      conn.commit()
    return law_case

  def record_full_service_action(self, user_id: str, case_id: str, input_data: FullServiceActionInput) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, row)
        if law_case.selectedPlan != "full-service":
          conn.rollback()
          raise InvalidStateError("FULL_SERVICE_REQUIRED")
        _ensure_full_service_evidence_category(law_case)
        if not self._has_approved_lawyer_letter(cursor, case_id):
          conn.rollback()
          raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
        _validate_full_service_client_action(
          input_data,
          self._full_service_send_proof_confirmed(cursor, case_id),
          _has_send_proof_file(law_case),
        )

        completed_at = _format_datetime(_now())
        title, message, payload = _apply_full_service_client_action(law_case, input_data, completed_at)
        self._update_case_state(cursor, law_case)
        if input_data.action == "submit_send_proof":
          task, created = self._upsert_full_service_work_item(
            cursor,
            law_case,
            "send_proof_review",
            "发送凭证确认待办",
            _send_proof_review_summary(law_case, input_data),
          )
          payload["workItemId"] = task.id
          event_title = "发送凭证确认待办已创建" if created else "发送凭证确认待办已更新"
          self._insert_event(cursor, _new_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id}))
          self._notify_lawyers(cursor, event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
        if input_data.action == "record_response":
          task, created = self._upsert_full_service_work_item(
            cursor,
            law_case,
            "lawyer_follow_up",
            "对方回应处理待办",
            _full_service_follow_up_summary(law_case, input_data),
          )
          payload["workItemId"] = task.id
          event_title = "对方回应处理待办已创建" if created else "对方回应处理待办已更新"
          self._insert_event(cursor, _new_event(law_case.id, "task.created" if created else "task.updated", event_title, task.summary, {"workItemId": task.id}))
          self._notify_lawyers(cursor, event_title, task.summary, f"/lawyer/tasks/{task.id}", law_case.id)
        self._insert_event(cursor, _new_event(law_case.id, "stage.changed", title, message, payload))
      conn.commit()
    return law_case

  def record_lawyer_full_service_action(self, lawyer_id: str, case_id: str, input_data: LawyerFullServiceActionInput) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM cases WHERE id = %s", (case_id,))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, row)
        if law_case.selectedPlan != "full-service":
          conn.rollback()
          raise InvalidStateError("FULL_SERVICE_REQUIRED")
        if not self._has_approved_lawyer_letter(cursor, case_id):
          conn.rollback()
          raise InvalidStateError("APPROVED_LAWYER_LETTER_REQUIRED")
        work_items = self._full_service_case_work_items(cursor, case_id)
        _validate_full_service_lawyer_action(input_data, work_items, case_id)

        completed_at = _format_datetime(_now())
        title, message, payload = _apply_full_service_lawyer_action(law_case, input_data, completed_at)
        self._update_case_state(cursor, law_case)
        if input_data.action == "confirm_send_proof":
          self._complete_full_service_work_items(cursor, case_id, "send_proof_review", "completed")
          self._insert_message(
            cursor,
            _new_message(
              law_case.userId or "",
              "task",
              "发送凭证已确认",
              "律师已确认发送凭证，可以继续记录对方回应。",
              f"/cases/{case_id}",
              case_id,
            ),
          )
        elif input_data.action == "reject_send_proof":
          self._complete_full_service_work_items(cursor, case_id, "send_proof_review", "cancelled")
          self._insert_message(
            cursor,
            _new_message(
              law_case.userId or "",
              "task",
              "发送凭证需补充",
              input_data.note or "律师未确认当前发送凭证，请补充截图、快递单号或签收记录。",
              f"/cases/{case_id}",
              case_id,
            ),
          )
        elif input_data.action in ("decide_response", "prepare_filing", "close_case"):
          follow_up_status = "in_progress" if input_data.decision in ("promised", "installment", "mediation_requested") else "completed"
          self._complete_full_service_work_items(cursor, case_id, "lawyer_follow_up", follow_up_status)
        self._insert_event(cursor, _new_event(law_case.id, "stage.changed", title, message, payload))
      conn.commit()
    return law_case

  def list_messages(self, user_id: str) -> list[NotificationMessage]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          "SELECT * FROM notification_messages WHERE recipient_user_id = %s ORDER BY created_at DESC",
          (user_id,),
        )
        rows = cursor.fetchall()
      conn.rollback()
    return [_message_from_row(row) for row in rows]

  def mark_message_read(self, user_id: str, message_id: str) -> NotificationMessage | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          "SELECT * FROM notification_messages WHERE id = %s AND recipient_user_id = %s",
          (message_id, user_id),
        )
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        cursor.execute("UPDATE notification_messages SET unread = FALSE WHERE id = %s", (message_id,))
        cursor.execute("SELECT * FROM notification_messages WHERE id = %s", (message_id,))
        updated = cursor.fetchone()
      conn.commit()
    return _message_from_row(updated)

  def list_case_work_items(self, user_id: str, case_id: str) -> list[WorkItem] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM work_items WHERE case_id = %s ORDER BY created_at DESC", (case_id,))
        rows = cursor.fetchall()
      conn.rollback()
    return [_work_item_from_row(row) for row in rows]

  def list_case_documents(self, user_id: str, case_id: str) -> list[LegalDocument] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
          SELECT * FROM legal_documents
          WHERE case_id = %s AND status IN ('pending_client_approval', 'approved', 'sent')
          ORDER BY updated_at DESC
          """,
          (case_id,),
        )
        rows = cursor.fetchall()
      conn.rollback()
    return [_document_from_row(row) for row in rows]

  def approve_document(self, user_id: str, case_id: str, document_id: str) -> tuple[LawCase, LegalDocument] | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM cases WHERE id = %s AND user_id = %s", (case_id, user_id))
        case_row = cursor.fetchone()
        cursor.execute("SELECT * FROM legal_documents WHERE id = %s AND case_id = %s", (document_id, case_id))
        document_row = cursor.fetchone()
        if case_row is None or document_row is None:
          conn.rollback()
          return None
        if document_row["status"] != "pending_client_approval":
          conn.rollback()
          raise InvalidStateError("INVALID_STATE")
        law_case = self._case_from_row(cursor, case_row)
        document = _document_from_row(document_row)
        document.status = "approved"
        document.updatedBy = user_id
        document.updatedAt = _iso(_now())
        law_case.status = _approved_document_status(document.type)
        _mark_stage_for_document(law_case, document.type)
        self._update_case_state(cursor, law_case)
        self._update_document_row(cursor, document)
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "document.updated",
            "文书已确认",
            f"用户已确认：{document.title}",
            {"documentId": document.id, "documentType": document.type},
          ),
        )
        self._insert_message(
          cursor,
          _new_message(
            law_case.userId or "",
            "document",
            "文书已确认",
            _approved_document_client_message(law_case, document),
            f"/cases/{case_id}",
            case_id,
          ),
        )
        self._notify_lawyers(
          cursor,
          "用户已确认文书",
          _approved_document_lawyer_notification(law_case, document),
          f"/lawyer/cases/{case_id}/documents/{document_id}",
          case_id,
        )
      conn.commit()
    return law_case, document

  def list_lawyer_tasks(self, lawyer_id: str) -> list[WorkItem] | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute(
          """
          SELECT * FROM work_items
          WHERE kind <> 'ai_guidance' AND (assignee_id IS NULL OR assignee_id = %s OR status = 'pending')
          ORDER BY created_at DESC
          """,
          (lawyer_id,),
        )
        rows = cursor.fetchall()
      conn.rollback()
    return [_work_item_from_row(row) for row in rows]

  def get_lawyer_task(self, lawyer_id: str, task_id: str) -> WorkItem | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM work_items WHERE id = %s AND kind <> 'ai_guidance'", (task_id,))
        row = cursor.fetchone()
      conn.rollback()
    return _work_item_from_row(row) if row else None

  def get_lawyer_case(self, lawyer_id: str, case_id: str) -> LawCase | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM cases WHERE id = %s", (case_id,))
        row = cursor.fetchone()
        law_case = self._case_from_row(cursor, row) if row else None
      conn.rollback()
    return law_case

  def list_lawyer_case_documents(self, lawyer_id: str, case_id: str) -> list[LegalDocument] | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT id FROM cases WHERE id = %s", (case_id,))
        if cursor.fetchone() is None:
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM legal_documents WHERE case_id = %s ORDER BY updated_at DESC", (case_id,))
        rows = cursor.fetchall()
      conn.rollback()
    return [_document_from_row(row) for row in rows]

  def get_lawyer_case_evidence_file(
    self,
    lawyer_id: str,
    case_id: str,
    category_id: str,
    file_id: str,
  ) -> tuple[EvidenceFile, str] | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute(
          """
          SELECT id FROM work_items
          WHERE case_id = %s
            AND kind = 'lawyer_review'
            AND (assignee_id IS NULL OR assignee_id = %s OR status = 'pending')
          LIMIT 1
          """,
          (case_id, lawyer_id),
        )
        if cursor.fetchone() is None:
          conn.rollback()
          return None
        cursor.execute(
          """
          SELECT * FROM evidence_files
          WHERE case_id = %s AND category_id = %s AND id = %s
          """,
          (case_id, category_id, file_id),
        )
        row = cursor.fetchone()
      conn.rollback()
    if row is None or not row["storage_path"]:
      return None
    return (
      EvidenceFile(
        id=row["id"],
        name=row["name"],
        size=row["size"],
        mimeType=row["mime_type"],
        uploadedAt=row["uploaded_at"],
      ),
      row["storage_path"],
    )

  def submit_review(
    self,
    lawyer_id: str,
    task_id: str,
    input_data: SubmitReviewInput,
  ) -> tuple[LawCase, WorkItem, ReviewOpinion] | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM work_items WHERE id = %s AND kind = 'lawyer_review'", (task_id,))
        task_row = cursor.fetchone()
        if task_row is None:
          conn.rollback()
          return None
        task = _work_item_from_row(task_row)
        cursor.execute("SELECT * FROM cases WHERE id = %s", (task.caseId,))
        case_row = cursor.fetchone()
        if case_row is None:
          conn.rollback()
          return None
        law_case = self._case_from_row(cursor, case_row)
        now = _iso(_now())
        task.status = "completed"
        task.assigneeId = lawyer_id
        task.updatedAt = now
        opinion = ReviewOpinion(
          id=f"review-{uuid4().hex[:8]}",
          caseId=law_case.id,
          workItemId=task.id,
          lawyerId=lawyer_id,
          conclusion=input_data.conclusion,
          riskLevel=input_data.riskLevel,
          evidenceGaps=input_data.evidenceGaps,
          advice=input_data.advice,
          nextAction=input_data.nextAction,
          createdAt=now,
        )
        law_case.status = "待确认律师意见"
        review_stage = next((stage for stage in law_case.stages if stage.key == "review"), None)
        if review_stage is not None:
          review_stage.status = "done"
          review_stage.at = _format_datetime(_now())
          review_stage.description = "律师已提交复核意见"
        self._update_case_state(cursor, law_case)
        self._update_work_item_row(cursor, task)
        self._insert_review_opinion(cursor, opinion)
        self._insert_event(
          cursor,
          _new_event(
            law_case.id,
            "review.submitted",
            "律师复核意见已提交",
            input_data.conclusion,
            {"workItemId": task.id, "reviewId": opinion.id, "nextAction": input_data.nextAction},
          ),
        )
        self._insert_message(
          cursor,
          _new_message(
            law_case.userId or "",
            "review",
            "律师复核意见已提交",
            input_data.advice,
            f"/cases/{law_case.id}",
            law_case.id,
          ),
        )
      conn.commit()
    return law_case, task, opinion

  def create_document(
    self,
    lawyer_id: str,
    case_id: str,
    input_data: CreateDocumentInput,
  ) -> LegalDocument | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT id FROM cases WHERE id = %s", (case_id,))
        if cursor.fetchone() is None:
          conn.rollback()
          return None
        document = _new_document(case_id, lawyer_id, input_data)
        self._insert_document(cursor, document)
        self._insert_event(cursor, _new_event(case_id, "document.updated", "文书草稿已创建", document.title, {"documentId": document.id}))
      conn.commit()
    return document

  def update_document(
    self,
    lawyer_id: str,
    case_id: str,
    document_id: str,
    input_data: UpdateDocumentInput,
  ) -> LegalDocument | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM legal_documents WHERE id = %s AND case_id = %s", (document_id, case_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        if row["status"] != "draft":
          conn.rollback()
          raise InvalidStateError("INVALID_STATE")
        document = _document_from_row(row)
        _apply_document_update(document, lawyer_id, input_data)
        self._update_document_row(cursor, document)
        self._insert_event(cursor, _new_event(case_id, "document.updated", "文书草稿已更新", document.title, {"documentId": document.id}))
      conn.commit()
    return document

  def archive_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM legal_documents WHERE id = %s AND case_id = %s", (document_id, case_id))
        row = cursor.fetchone()
        if row is None:
          conn.rollback()
          return None
        if row["status"] != "draft":
          conn.rollback()
          raise InvalidStateError("INVALID_STATE")
        document = _document_from_row(row)
        document.status = "archived"
        document.updatedBy = lawyer_id
        document.updatedAt = _iso(_now())
        self._update_document_row(cursor, document)
        self._insert_event(cursor, _new_event(case_id, "document.updated", "文书已归档", document.title, {"documentId": document.id}))
      conn.commit()
    return document

  def submit_document(self, lawyer_id: str, case_id: str, document_id: str) -> LegalDocument | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        if not self._is_lawyer(cursor, lawyer_id):
          conn.rollback()
          return None
        cursor.execute("SELECT * FROM cases WHERE id = %s", (case_id,))
        case_row = cursor.fetchone()
        cursor.execute("SELECT * FROM legal_documents WHERE id = %s AND case_id = %s", (document_id, case_id))
        document_row = cursor.fetchone()
        if case_row is None or document_row is None:
          conn.rollback()
          return None
        if document_row["status"] != "draft":
          conn.rollback()
          raise InvalidStateError("INVALID_STATE")
        law_case = self._case_from_row(cursor, case_row)
        document = _document_from_row(document_row)
        _require_document_submission_fields(document)
        document.status = "pending_client_approval"
        document.updatedBy = lawyer_id
        document.updatedAt = _iso(_now())
        law_case.status = "文书待用户确认"
        self._update_case_state(cursor, law_case)
        self._update_document_row(cursor, document)
        self._insert_event(cursor, _new_event(case_id, "document.updated", "文书待确认", document.title, {"documentId": document.id}))
        self._insert_message(
          cursor,
          _new_message(
            law_case.userId or "",
            "document",
            "文书待确认",
            f"律师已提交 {document.title}，请确认后进入下一阶段。",
            f"/cases/{case_id}",
            case_id,
          ),
        )
      conn.commit()
    return document

  def list_events(self, user_id: str, case_id: str) -> list[CaseEvent] | None:
    if self.get_case(user_id, case_id) is None:
      return None
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM case_events WHERE case_id = %s ORDER BY created_at ASC", (case_id,))
        rows = cursor.fetchall()
      conn.rollback()
    return [_event_from_row(row) for row in rows]

  async def stream_case_events(self, case_id: str) -> AsyncIterator[CaseEvent]:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM case_events WHERE case_id = %s ORDER BY created_at ASC", (case_id,))
        rows = cursor.fetchall()
      conn.rollback()
    for row in rows:
      yield _event_from_row(row)

  def _get_or_create_user(self, cursor, phone: str) -> User:
    cursor.execute("SELECT * FROM users WHERE phone = %s", (phone,))
    row = cursor.fetchone()
    if row is not None:
      return _user_from_row(row)
    user = _new_user(phone)
    self._insert_user(cursor, user)
    return user

  def _verify_otp(self, cursor, phone: str, code: str, purpose: str = "register") -> bool:
    cursor.execute(
      "SELECT code, attempts, expires_at FROM otp_codes WHERE phone = %s AND purpose = %s",
      (phone, purpose),
    )
    otp = cursor.fetchone()
    if otp is None or _parse_iso(otp["expires_at"]) < _now() or otp["attempts"] >= self.settings.SMS_MAX_ATTEMPTS:
      return False
    if otp["code"] == code:
      return True
    cursor.execute(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = %s AND purpose = %s",
      (phone, purpose),
    )
    return False

  def _insert_session(self, cursor, user_id: str) -> tuple[str, datetime]:
    token, expires_at = create_access_token(self.settings, subject=user_id)
    cursor.execute(
      "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (%s, %s, %s, %s)",
      (token, user_id, _iso(expires_at), _iso(_now())),
    )
    return token, expires_at

  def _insert_user(self, cursor, user: User) -> None:
    cursor.execute(
      """
      INSERT INTO users (
        id, phone, name, role, account_status, lawyer_review_status, rejected_reason,
        law_firm, license_number, practice_region, specialties_json, created_at, updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        user.id,
        user.phone,
        user.name,
        user.role,
        user.accountStatus,
        user.lawyerReviewStatus,
        user.rejectedReason,
        user.lawFirm,
        user.licenseNumber,
        user.practiceRegion,
        Jsonb(user.specialties),
        user.createdAt,
        user.updatedAt or user.createdAt,
      ),
    )

  def _set_user_password(self, cursor, user_id: str, password: str | None) -> None:
    if password is None:
      return
    cursor.execute(
      "UPDATE users SET password_hash = %s, updated_at = %s WHERE id = %s",
      (hash_password(password), _iso(_now()), user_id),
    )

  def _update_user_row(self, cursor, user: User) -> None:
    cursor.execute(
      """
      UPDATE users
      SET name = %s, role = %s, account_status = %s, lawyer_review_status = %s,
        rejected_reason = %s, law_firm = %s, license_number = %s, practice_region = %s,
        specialties_json = %s, updated_at = %s
      WHERE id = %s
      """,
      (
        user.name,
        user.role,
        user.accountStatus,
        user.lawyerReviewStatus,
        user.rejectedReason,
        user.lawFirm,
        user.licenseNumber,
        user.practiceRegion,
        Jsonb(user.specialties),
        user.updatedAt or _iso(_now()),
        user.id,
      ),
    )

  def _would_remove_final_admin(self, cursor, user: User, input_data: AdminUpdateUserInput) -> bool:
    if user.role != "admin" or user.accountStatus != "active":
      return False
    will_stop_being_admin = input_data.role is not None and input_data.role != "admin"
    will_be_disabled = input_data.accountStatus == "disabled"
    if not will_stop_being_admin and not will_be_disabled:
      return False
    cursor.execute(
      """
      SELECT COUNT(*) AS active_admins
      FROM users
      WHERE id <> %s AND role = 'admin' AND account_status = 'active'
      """,
      (user.id,),
    )
    row = cursor.fetchone()
    return row["active_admins"] == 0

  def _case_from_row(self, cursor, row: dict[str, Any]) -> LawCase:
    case_type = normalize_case_type(row.get("case_type"))
    evidence = _create_evidence_categories(case_type)
    cursor.execute("SELECT * FROM evidence_files WHERE case_id = %s ORDER BY uploaded_at ASC", (row["id"],))
    for file_row in cursor.fetchall():
      category = next((item for item in evidence if item.id == file_row["category_id"]), None)
      if category is None:
        continue
      category.files.append(
        EvidenceFile(
          id=file_row["id"],
          name=file_row["name"],
          size=file_row["size"],
          mimeType=file_row["mime_type"],
          uploadedAt=file_row["uploaded_at"],
        )
      )
      category.status = "recognized"
      category.insight = "已识别关键信息"
    assessment = AssessmentResult.model_validate(row["assessment_json"]) if row["assessment_json"] else None
    stages = [CaseStage.model_validate(item) for item in row["stages_json"]]
    return LawCase(
      id=row["id"],
      userId=row["user_id"],
      caseType=case_type,
      debtorName=row["debtor_name"],
      contactName=row["contact_name"],
      contactPhone=row["contact_phone"],
      amount=row["amount"],
      contractDate=row["contract_date"],
      dispute=row["dispute"],
      dueStatus=row["due_status"],
      partyRole=row.get("party_role") or "",
      counterpartyName=row.get("counterparty_name") or row["debtor_name"],
      region=row.get("region") or "",
      incidentDate=row.get("incident_date") or row["contract_date"],
      claimType=row.get("claim_type") or "",
      claimSummary=row.get("claim_summary") or row["dispute"],
      privacyConsent=bool(row.get("privacy_consent", True)),
      matterFields=row.get("matter_fields_json") or {},
      status=row["status"],
      createdAt=row["created_at"],
      caseNo=row["case_no"],
      evidence=evidence,
      stages=stages,
      selectedPlan=row["selected_plan"],
      assessment=assessment,
    )

  def _insert_case(self, cursor, law_case: LawCase) -> None:
    cursor.execute(
      """
      INSERT INTO cases (
        id, user_id, case_type, debtor_name, contact_name, contact_phone, amount, contract_date,
        dispute, due_status, party_role, counterparty_name, region, incident_date, claim_type,
        claim_summary, privacy_consent, matter_fields_json, status, created_at, case_no,
        selected_plan, assessment_json, stages_json
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        law_case.id,
        law_case.userId,
        law_case.caseType,
        law_case.debtorName,
        law_case.contactName,
        law_case.contactPhone,
        law_case.amount,
        law_case.contractDate,
        law_case.dispute,
        law_case.dueStatus,
        law_case.partyRole,
        law_case.counterpartyName,
        law_case.region,
        law_case.incidentDate,
        law_case.claimType,
        law_case.claimSummary,
        law_case.privacyConsent,
        Jsonb(law_case.matterFields),
        law_case.status,
        law_case.createdAt,
        law_case.caseNo,
        law_case.selectedPlan,
        Jsonb(law_case.assessment.model_dump(mode="json") if law_case.assessment else None),
        Jsonb([stage.model_dump(mode="json") for stage in law_case.stages]),
      ),
    )

  def _update_case_state(self, cursor, law_case: LawCase) -> None:
    cursor.execute(
      """
      UPDATE cases
      SET status = %s, selected_plan = %s, assessment_json = %s, stages_json = %s
      WHERE id = %s
      """,
      (
        law_case.status,
        law_case.selectedPlan,
        Jsonb(law_case.assessment.model_dump(mode="json") if law_case.assessment else None),
        Jsonb([stage.model_dump(mode="json") for stage in law_case.stages]),
        law_case.id,
      ),
    )

  def _insert_event(self, cursor, event: CaseEvent) -> None:
    cursor.execute(
      """
      INSERT INTO case_events (id, case_id, type, title, message, payload, created_at)
      VALUES (%s, %s, %s, %s, %s, %s, %s)
      """,
      (event.id, event.caseId, event.type, event.title, event.message, Jsonb(event.payload), event.createdAt),
    )

  def _persist_assessment(self, law_case: LawCase, job: AssessmentJob, events: list[CaseEvent]) -> None:
    with self.database.connection() as conn:
      with conn.cursor() as cursor:
        self._update_case_state(cursor, law_case)
        cursor.execute(
          """
          INSERT INTO assessment_jobs (
            id, case_id, status, result_json, error_code, error_message, created_at, completed_at
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            job.id,
            job.caseId,
            job.status,
            Jsonb(job.result.model_dump(mode="json") if job.result else None),
            job.errorCode,
            job.errorMessage,
            job.createdAt,
            job.completedAt,
          ),
        )
        for event in events:
          self._insert_event(cursor, event)
      conn.commit()

  def _create_plan_follow_up(
    self,
    cursor,
    law_case: LawCase,
    user_id: str,
    plan_id: PlanId,
    self_service_payload: SelfServicePayload | None = None,
  ) -> None:
    if plan_id == "self-service":
      payload = self_service_payload or build_self_service_payload(law_case)
      task = _new_work_item(law_case.id, "ai_guidance", "AI自助处理包", payload.taskSummary)
      task.status = "in_progress"
      task.updatedAt = _iso(_now())
      self._insert_work_item(cursor, task)
      document = _new_document(
        law_case.id,
        user_id,
        CreateDocumentInput(
          type=payload.documentType,
          title=payload.title,
          fields=payload.fields,
          body=payload.body,
        ),
      )
      document.status = "approved"
      self._insert_document(cursor, document)
      apply_self_service_outcome(law_case, payload, _format_datetime(_now()))
      self._update_case_state(cursor, law_case)
      self._insert_event(
        cursor,
        _new_event(
          law_case.id,
          "document.updated",
          "AI自助文书已生成",
          payload.title,
          {"documentId": document.id, "documentType": document.type, "source": "ai_self_service"},
        ),
      )
      self._insert_event(
        cursor,
        _new_event(
          law_case.id,
          "task.updated",
          "AI自助处理包已生成",
          payload.taskSummary,
          {"workItemId": task.id},
        ),
      )
      self._insert_message(
        cursor,
        _new_message(
          user_id,
          "document",
          payload.messageTitle,
          payload.messageBody,
          f"/cases/{law_case.id}",
          law_case.id,
        ),
      )
      return

    lawyer_id = self._first_lawyer_id(cursor)
    task = _new_work_item(
      law_case.id,
      "lawyer_review",
      "律师复核待办",
      f"复核 {law_case.debtorName} 的案件资料、证据和 AI 评估结果。",
      lawyer_id,
    )
    self._insert_work_item(cursor, task)
    self._insert_event(cursor, _new_event(law_case.id, "task.created", "律师复核待办已创建", task.summary, {"workItemId": task.id}))
    self._insert_message(
      cursor,
      _new_message(
        user_id,
        "task",
        "律师复核已受理",
        "系统已生成律师复核待办，律师将查看材料并反馈补证或处理建议。",
        f"/cases/{law_case.id}",
        law_case.id,
      ),
    )
    self._notify_lawyers(cursor, "新的律师复核待办", task.summary, f"/lawyer/tasks/{task.id}", law_case.id)

  def _is_lawyer(self, cursor, user_id: str) -> bool:
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    row = cursor.fetchone()
    return row is not None and _is_active_approved_lawyer(_user_from_row(row))

  def _first_lawyer_id(self, cursor) -> str | None:
    cursor.execute(
      """
      SELECT id FROM users
      WHERE role = 'lawyer' AND account_status = 'active' AND lawyer_review_status = 'approved'
      ORDER BY created_at ASC
      LIMIT 1
      """
    )
    row = cursor.fetchone()
    return row["id"] if row is not None else None

  def _has_approved_lawyer_letter(self, cursor, case_id: str) -> bool:
    cursor.execute(
      """
      SELECT id FROM legal_documents
      WHERE case_id = %s AND type = 'lawyer_letter' AND status = 'approved'
      LIMIT 1
      """,
      (case_id,),
    )
    return cursor.fetchone() is not None

  def _upsert_lawyer_follow_up_work_item(self, cursor, law_case: LawCase, note: str | None = None) -> tuple[WorkItem, bool]:
    summary = _lawyer_follow_up_summary(law_case, note)
    cursor.execute(
      """
      SELECT * FROM work_items
      WHERE case_id = %s AND kind = 'lawyer_follow_up' AND status IN ('pending', 'in_progress')
      ORDER BY created_at ASC
      LIMIT 1
      """,
      (law_case.id,),
    )
    row = cursor.fetchone()
    if row is not None:
      task = _work_item_from_row(row)
      task.status = "pending"
      task.summary = summary
      task.updatedAt = _iso(_now())
      self._update_work_item_row(cursor, task)
      return task, False
    task = _new_work_item(law_case.id, "lawyer_follow_up", "协商跟进待办", summary, self._first_lawyer_id(cursor))
    self._insert_work_item(cursor, task)
    return task, True

  def _full_service_send_proof_confirmed(self, cursor, case_id: str) -> bool:
    cursor.execute(
      """
      SELECT id FROM work_items
      WHERE case_id = %s AND kind = 'send_proof_review' AND status = 'completed'
      LIMIT 1
      """,
      (case_id,),
    )
    return cursor.fetchone() is not None

  def _full_service_case_work_items(self, cursor, case_id: str) -> list[WorkItem]:
    cursor.execute(
      """
      SELECT * FROM work_items
      WHERE case_id = %s AND kind IN ('send_proof_review', 'lawyer_follow_up')
      ORDER BY created_at ASC
      """,
      (case_id,),
    )
    return [_work_item_from_row(row) for row in cursor.fetchall()]

  def _upsert_full_service_work_item(
    self,
    cursor,
    law_case: LawCase,
    kind: str,
    title: str,
    summary: str,
  ) -> tuple[WorkItem, bool]:
    cursor.execute(
      """
      SELECT * FROM work_items
      WHERE case_id = %s AND kind = %s AND status IN ('pending', 'in_progress')
      ORDER BY created_at ASC
      LIMIT 1
      """,
      (law_case.id, kind),
    )
    row = cursor.fetchone()
    if row is not None:
      task = _work_item_from_row(row)
      task.status = "pending"
      task.title = title
      task.summary = summary
      task.updatedAt = _iso(_now())
      self._update_work_item_row(cursor, task)
      return task, False
    task = _new_work_item(law_case.id, kind, title, summary, self._first_lawyer_id(cursor))
    self._insert_work_item(cursor, task)
    return task, True

  def _complete_full_service_work_items(self, cursor, case_id: str, kind: str, status: str) -> None:
    now = _iso(_now())
    cursor.execute(
      """
      UPDATE work_items
      SET status = %s, updated_at = %s
      WHERE case_id = %s AND kind = %s AND status IN ('pending', 'in_progress')
      """,
      (status, now, case_id, kind),
    )

  def _notify_lawyers(self, cursor, title: str, body: str, action_href: str, case_id: str | None = None) -> None:
    cursor.execute(
      """
      SELECT id FROM users
      WHERE role = 'lawyer' AND account_status = 'active' AND lawyer_review_status = 'approved'
      """
    )
    for row in cursor.fetchall():
      self._insert_message(cursor, _new_message(row["id"], "task", title, body, action_href, case_id))

  def _insert_work_item(self, cursor, work_item: WorkItem) -> None:
    cursor.execute(
      """
      INSERT INTO work_items (id, case_id, kind, status, assignee_id, title, summary, due_at, created_at, updated_at)
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        work_item.id,
        work_item.caseId,
        work_item.kind,
        work_item.status,
        work_item.assigneeId,
        work_item.title,
        work_item.summary,
        work_item.dueAt,
        work_item.createdAt,
        work_item.updatedAt,
      ),
    )

  def _update_work_item_row(self, cursor, work_item: WorkItem) -> None:
    cursor.execute(
      """
      UPDATE work_items
      SET status = %s, assignee_id = %s, title = %s, summary = %s, due_at = %s, updated_at = %s
      WHERE id = %s
      """,
      (
        work_item.status,
        work_item.assigneeId,
        work_item.title,
        work_item.summary,
        work_item.dueAt,
        work_item.updatedAt,
        work_item.id,
      ),
    )

  def _insert_review_opinion(self, cursor, opinion: ReviewOpinion) -> None:
    cursor.execute(
      """
      INSERT INTO review_opinions (
        id, case_id, work_item_id, lawyer_id, conclusion, risk_level, evidence_gaps_json, advice, next_action, created_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        opinion.id,
        opinion.caseId,
        opinion.workItemId,
        opinion.lawyerId,
        opinion.conclusion,
        opinion.riskLevel,
        Jsonb(opinion.evidenceGaps),
        opinion.advice,
        opinion.nextAction,
        opinion.createdAt,
      ),
    )

  def _insert_document(self, cursor, document: LegalDocument) -> None:
    cursor.execute(
      """
      INSERT INTO legal_documents (
        id, case_id, type, status, title, fields_json, body, version, created_by, updated_by, created_at, updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        document.id,
        document.caseId,
        document.type,
        document.status,
        document.title,
        Jsonb(document.fields),
        document.body,
        document.version,
        document.createdBy,
        document.updatedBy,
        document.createdAt,
        document.updatedAt,
      ),
    )

  def _update_document_row(self, cursor, document: LegalDocument) -> None:
    cursor.execute(
      """
      UPDATE legal_documents
      SET status = %s, title = %s, fields_json = %s, body = %s, version = %s, updated_by = %s, updated_at = %s
      WHERE id = %s
      """,
      (
        document.status,
        document.title,
        Jsonb(document.fields),
        document.body,
        document.version,
        document.updatedBy,
        document.updatedAt,
        document.id,
      ),
    )

  def _insert_message(self, cursor, message: NotificationMessage) -> None:
    if not message.recipientUserId:
      return
    cursor.execute(
      """
      INSERT INTO notification_messages (
        id, recipient_user_id, case_id, type, title, body, unread, action_href, created_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        message.id,
        message.recipientUserId,
        message.caseId,
        message.type,
        message.title,
        message.body,
        message.unread,
        message.actionHref,
        message.createdAt,
      ),
    )
    if message.caseId is not None:
      self._insert_event(
        cursor,
        _new_event(message.caseId, "notification.created", message.title, message.body, {"messageId": message.id}),
      )


def _create_evidence_categories(case_type: str | None = None) -> list[EvidenceCategory]:
  return create_catalog_evidence_categories(normalize_case_type(case_type))


def _ensure_full_service_evidence_category(law_case: LawCase) -> None:
  if any(category.id == "send_proof" for category in law_case.evidence):
    return
  law_case.evidence.append(
    EvidenceCategory(
      id="send_proof",
      name="发送/送达凭证",
      status="optional",
      required=False,
      files=[],
      insight="留存客户自行发送后的截图、快递单号或签收记录",
    )
  )


def _has_send_proof_file(law_case: LawCase) -> bool:
  return any(category.id == "send_proof" and bool(category.files) for category in law_case.evidence)


def _new_case(user_id: str, input_data: CreateCaseInput) -> LawCase:
  created_at = _now()
  case_type = normalize_case_type(input_data.caseType)
  counterparty_name = input_data.counterpartyName or input_data.debtorName
  incident_date = input_data.incidentDate or input_data.contractDate
  claim_summary = input_data.claimSummary or input_data.dispute
  label = get_case_type_label(case_type)
  return LawCase(
    id=f"case-{uuid4().hex[:8]}",
    userId=user_id,
    caseType=case_type,
    debtorName=input_data.debtorName,
    contactName=input_data.contactName,
    contactPhone=input_data.contactPhone,
    amount=input_data.amount,
    contractDate=input_data.contractDate,
    dispute=input_data.dispute,
    dueStatus=input_data.dueStatus,
    partyRole=input_data.partyRole,
    counterpartyName=counterparty_name,
    region=input_data.region,
    incidentDate=incident_date,
    claimType=input_data.claimType,
    claimSummary=claim_summary,
    privacyConsent=input_data.privacyConsent,
    matterFields=input_data.matterFields,
    status="待补充证据" if case_type == "debt_collection" else f"待补充{label}材料",
    createdAt=_iso(created_at),
    caseNo=f"AL{created_at.strftime('%Y%m%d')}{uuid4().int % 9000 + 1000}",
    evidence=_create_evidence_categories(case_type),
    stages=create_case_stages(case_type, _format_datetime(created_at)),
  )


def _new_user(phone: str) -> User:
  now = _iso(_now())
  return User(
    id=f"user-{uuid4().hex[:8]}",
    phone=phone,
    name=f"用户{phone[-4:]}",
    role="client",
    accountStatus="active",
    lawyerReviewStatus="none",
    createdAt=now,
    updatedAt=now,
  )


def _is_active_approved_lawyer(user: User) -> bool:
  return user.role == "lawyer" and user.accountStatus == "active" and user.lawyerReviewStatus == "approved"


def _new_evidence_file(file_name: str, file_size: int, mime_type: str) -> EvidenceFile:
  return EvidenceFile(
    id=f"file-{uuid4().hex[:8]}",
    name=file_name,
    size=file_size,
    mimeType=mime_type,
    uploadedAt=_iso(_now()),
  )


def _mark_evidence_uploaded(law_case: LawCase, category: EvidenceCategory) -> None:
  category.status = "recognized"
  category.insight = "已识别关键信息"
  law_case.status = "AI评估中"
  evidence_stage = next((stage for stage in law_case.stages if stage.key == "evidence"), None)
  if evidence_stage is not None:
    evidence_stage.status = "done"
    evidence_stage.at = _format_datetime(_now())
    evidence_stage.description = f"已上传 {sum(len(item.files) for item in law_case.evidence)} 份材料"


def _apply_selected_plan(law_case: LawCase, plan_id: PlanId) -> None:
  law_case.selectedPlan = plan_id
  if plan_id == "self-service":
    # 自助路径不进入律师复核语义，最终阶段/状态由 AI 闭环写入。
    law_case.status = "AI方案处理中"
    return
  if plan_id == "full-service":
    _ensure_full_service_evidence_category(law_case)
  law_case.status = "律师复核中"
  review_stage = next((stage for stage in law_case.stages if stage.key == "review"), None)
  if review_stage is not None:
    review_stage.status = "active"
    review_stage.description = law_case.status


def _new_event(
  case_id: str,
  event_type: CaseEventType,
  title: str,
  message: str,
  payload: dict[str, Any] | None = None,
) -> CaseEvent:
  return CaseEvent(
    id=f"evt-{uuid4().hex[:8]}",
    caseId=case_id,
    type=event_type,
    title=title,
    message=message,
    createdAt=_iso(_now()),
    payload=payload or {},
  )


def _new_work_item(
  case_id: str,
  kind: str,
  title: str,
  summary: str,
  assignee_id: str | None = None,
) -> WorkItem:
  now = _iso(_now())
  due_at = _iso(_now() + timedelta(hours=24))
  return WorkItem(
    id=f"task-{uuid4().hex[:8]}",
    caseId=case_id,
    kind=kind,
    status="pending",
    assigneeId=assignee_id,
    title=title,
    summary=summary,
    dueAt=due_at,
    createdAt=now,
    updatedAt=now,
  )


def _missing_required_evidence(law_case: LawCase) -> list[str]:
  return [
    category.name
    for category in law_case.evidence
    if category.required and not category.files and category.status != "recognized"
  ]


def _require_required_evidence(law_case: LawCase) -> None:
  if _missing_required_evidence(law_case):
    raise InvalidStateError("REQUIRED_EVIDENCE_MISSING")


def _stage(law_case: LawCase, stage_key: str) -> CaseStage | None:
  return next((item for item in law_case.stages if item.key == stage_key), None)


def _set_stage(law_case: LawCase, stage_key: str, status: str, description: str, at: str | None = None) -> None:
  stage = _stage(law_case, stage_key)
  if stage is None:
    return
  stage.status = status
  stage.description = description
  stage.at = at if status == "done" else None


def _complete_self_service_document_stage(law_case: LawCase, completed_at: str) -> None:
  _set_stage(law_case, "letter", "done", "AI自助处理包已使用并记录结果", completed_at)


def _activate_self_service_response_stage(law_case: LawCase) -> None:
  _set_stage(law_case, "negotiation", "active", "等待对方回应，继续保留送达、沟通和履行记录")


def _close_self_service_filing_stage(law_case: LawCase, completed_at: str) -> None:
  _set_stage(law_case, "filing", "done", "自助处理已完成，无需继续准备立案材料", completed_at)


def _set_lawyer_letter_stage(law_case: LawCase, status: str, description: str, at: str | None = None) -> None:
  stage = _stage(law_case, "letter")
  if stage is None:
    return
  stage.title = "发送律师函"
  stage.status = status
  stage.description = description
  stage.at = at if status == "done" else None


def _set_lawyer_negotiation_stage(law_case: LawCase, status: str, description: str, at: str | None = None) -> None:
  stage = _stage(law_case, "negotiation")
  if stage is None:
    return
  stage.title = "协商跟进"
  stage.status = status
  stage.description = description
  stage.at = at if status == "done" else None


def _complete_lawyer_letter_stage(law_case: LawCase, completed_at: str) -> None:
  _set_lawyer_letter_stage(law_case, "done", "客户已确认自行发送律师函", completed_at)


def _activate_lawyer_negotiation_stage(law_case: LawCase) -> None:
  _set_lawyer_negotiation_stage(law_case, "active", "等待对方回应；如有承诺、协商请求、无回应或拒绝，请记录结果")


def _apply_self_service_action(law_case: LawCase, input_data: SelfServiceActionInput, completed_at: str) -> tuple[str, str, dict[str, Any]]:
  payload = {
    "action": input_data.action,
    "channel": input_data.channel,
    "response": input_data.response,
    "note": input_data.note,
  }
  if input_data.action == "copy_template":
    return "已复制自助模板", "用户已复制 AI 自助模板，可自行使用并记录处理结果。", payload
  if input_data.action == "download_template":
    return "已下载自助模板", "用户已下载 AI 自助模板，可自行使用并记录处理结果。", payload
  if input_data.action in ("mark_sent", "upload_proof"):
    law_case.status = "已自行处理，等待对方回应" if input_data.action == "mark_sent" else "已记录送达凭证，等待对方回应"
    _complete_self_service_document_stage(law_case, completed_at)
    _activate_self_service_response_stage(law_case)
    title = "已记录自行处理" if input_data.action == "mark_sent" else "已记录送达凭证"
    message = input_data.note or "用户已记录自行处理动作，等待对方回应。"
    return title, message, payload
  if input_data.action == "record_response":
    _complete_self_service_document_stage(law_case, completed_at)
    if input_data.response in ("paid", "completed"):
      law_case.status = "已完成自助处理"
      _set_stage(law_case, "negotiation", "done", "已记录对方履行或处理完成", completed_at)
      _close_self_service_filing_stage(law_case, completed_at)
      _set_stage(law_case, "recovery", "done", "已确认回款或自助处理完成", completed_at)
      return "自助处理已完成", input_data.note or "用户已记录自助处理完成。", payload
    if input_data.response in ("promised", "installment"):
      law_case.status = "对方承诺履行，继续跟进"
      _activate_self_service_response_stage(law_case)
      return "对方承诺履行", input_data.note or "用户已记录对方承诺履行，继续跟进。", payload
    law_case.status = "建议准备材料或升级人工服务"
    _set_stage(law_case, "negotiation", "done", "已记录对方拒绝、无回应或需人工复核", completed_at)
    _set_stage(law_case, "filing", "active", "可整理材料包，或升级人工复核/代办服务")
    return "建议准备材料或升级人工服务", input_data.note or "用户已记录对方无回应、拒绝或需人工复核。", payload
  if input_data.action == "close_case":
    law_case.status = "已完成自助处理"
    _complete_self_service_document_stage(law_case, completed_at)
    _set_stage(law_case, "negotiation", "done", "用户已确认自助处理完成", completed_at)
    _close_self_service_filing_stage(law_case, completed_at)
    _set_stage(law_case, "recovery", "done", "用户已确认结案", completed_at)
    return "自助案件已结案", input_data.note or "用户已确认自助处理完成。", payload
  if input_data.action == "upgrade_service":
    law_case.status = "已申请升级人工服务"
    _complete_self_service_document_stage(law_case, completed_at)
    _set_stage(law_case, "negotiation", "done", "已记录对方拒绝、无回应或需人工复核", completed_at)
    _set_stage(law_case, "filing", "done", "已申请升级人工服务，399 自助处理已交接", completed_at)
    return "已申请升级人工服务", input_data.note or "用户已申请升级人工复核或代办服务。", payload
  return "自助动作已记录", input_data.note or "用户已记录自助处理动作。", payload


def _apply_lawyer_service_action(law_case: LawCase, input_data: LawyerServiceActionInput, completed_at: str) -> tuple[str, str, dict[str, Any]]:
  payload = {
    "action": input_data.action,
    "channel": input_data.channel,
    "response": input_data.response,
    "note": input_data.note,
  }
  if input_data.action == "copy_document":
    return "已复制律师定稿文书", input_data.note or "客户已复制律师定稿文书，可自行发送并保留送达凭证。", payload
  if input_data.action == "download_document":
    return "已下载律师定稿文书", input_data.note or "客户已下载律师定稿文书，可自行发送并保留送达凭证。", payload
  if input_data.action == "mark_sent":
    law_case.status = "已记录自行发送，等待对方回应"
    _complete_lawyer_letter_stage(law_case, completed_at)
    _activate_lawyer_negotiation_stage(law_case)
    return "已记录自行发送", input_data.note or "客户确认已自行发送律师定稿文书，等待对方回应。", payload
  if input_data.action == "record_response":
    _complete_lawyer_letter_stage(law_case, completed_at)
    if input_data.response in ("paid", "completed"):
      law_case.status = "对方已履行，案件可结案"
      _set_lawyer_negotiation_stage(law_case, "done", "已记录对方履行或事项完成", completed_at)
      _set_stage(law_case, "filing", "done", "对方已履行，暂不需要准备立案材料", completed_at)
      _set_stage(law_case, "recovery", "done", "已确认回款或事项完成", completed_at)
      return "对方已履行", input_data.note or "客户已记录对方履行或事项完成。", payload
    if input_data.response in ("promised", "installment", "mediation_requested"):
      law_case.status = "对方承诺履行，律师继续跟进"
      _activate_lawyer_negotiation_stage(law_case)
      return "对方回应需律师跟进", input_data.note or "客户已记录对方承诺、分期或协商请求，律师继续跟进。", payload
    law_case.status = "对方无回应或拒绝，建议准备立案材料"
    _set_lawyer_negotiation_stage(law_case, "done", "已记录对方无回应或拒绝", completed_at)
    _set_stage(law_case, "filing", "active", "可整理证据、送达和沟通记录，准备立案材料")
    return "建议准备立案材料", input_data.note or "客户已记录对方无回应或拒绝，建议进入立案材料准备。", payload
  if input_data.action == "request_lawyer_followup":
    law_case.status = "已请求律师继续协商跟进"
    _complete_lawyer_letter_stage(law_case, completed_at)
    _activate_lawyer_negotiation_stage(law_case)
    return "已请求律师继续跟进", input_data.note or "客户已请求律师继续协商跟进。", payload
  if input_data.action == "prepare_filing":
    law_case.status = "已进入立案材料准备"
    _complete_lawyer_letter_stage(law_case, completed_at)
    _set_lawyer_negotiation_stage(law_case, "done", "客户选择进入立案材料准备", completed_at)
    _set_stage(law_case, "filing", "active", "整理证据、送达和沟通记录，准备立案材料")
    return "已进入立案材料准备", input_data.note or "客户已选择进入立案材料准备。", payload
  if input_data.action == "close_case":
    law_case.status = "客户已确认结案"
    _complete_lawyer_letter_stage(law_case, completed_at)
    _set_lawyer_negotiation_stage(law_case, "done", "客户已确认结案", completed_at)
    _set_stage(law_case, "filing", "done", "客户已确认结案，无需继续准备材料", completed_at)
    _set_stage(law_case, "recovery", "done", "客户已确认结案", completed_at)
    return "客户已确认结案", input_data.note or "客户已确认案件处理完成。", payload
  return "律师服务动作已记录", input_data.note or "客户已记录律师服务后续动作。", payload


def _validate_full_service_client_action(
  input_data: FullServiceActionInput,
  send_proof_confirmed: bool,
  has_send_proof_file: bool,
) -> None:
  if input_data.action == "submit_send_proof":
    if not has_send_proof_file or not ((input_data.channel or "").strip() or (input_data.note or "").strip()):
      raise InvalidStateError("SEND_PROOF_REQUIRED")
  if input_data.action == "record_response":
    if input_data.response is None:
      raise InvalidStateError("RESPONSE_REQUIRED")
    if not send_proof_confirmed:
      raise InvalidStateError("SEND_PROOF_CONFIRMATION_REQUIRED")


def _validate_full_service_lawyer_action(
  input_data: LawyerFullServiceActionInput,
  work_items: Iterable[WorkItem],
  case_id: str,
) -> None:
  case_work_items = [item for item in work_items if item.caseId == case_id]
  if input_data.action in ("confirm_send_proof", "reject_send_proof"):
    has_pending_proof = any(
      item.kind == "send_proof_review" and item.status in ("pending", "in_progress")
      for item in case_work_items
    )
    if not has_pending_proof:
      raise InvalidStateError("SEND_PROOF_REQUIRED")
  if input_data.action in ("decide_response", "prepare_filing", "close_case"):
    if input_data.action == "decide_response" and input_data.decision is None:
      raise InvalidStateError("DECISION_REQUIRED")
    has_pending_follow_up = any(
      item.kind == "lawyer_follow_up" and item.status in ("pending", "in_progress")
      for item in case_work_items
    )
    if not has_pending_follow_up:
      raise InvalidStateError("RESPONSE_REQUIRED")


def _apply_full_service_client_action(law_case: LawCase, input_data: FullServiceActionInput, completed_at: str) -> tuple[str, str, dict[str, Any]]:
  payload = {
    "action": input_data.action,
    "channel": input_data.channel,
    "response": input_data.response,
    "note": input_data.note,
  }
  if input_data.action == "copy_document":
    return "已复制律师定稿文书", input_data.note or "客户已复制律师定稿文书，可自行发送并保留凭证。", payload
  if input_data.action == "download_document":
    return "已下载律师定稿文书", input_data.note or "客户已下载律师定稿文书，可自行发送并保留凭证。", payload
  if input_data.action == "submit_send_proof":
    law_case.status = "发送凭证待律师确认"
    _set_lawyer_letter_stage(law_case, "active", "客户已提交发送凭证，待律师确认后进入对方回应阶段")
    _set_lawyer_negotiation_stage(law_case, "todo", "律师确认发送凭证后进入对方回应阶段")
    return "发送凭证已提交", input_data.note or "客户已提交律师函自行发送凭证，等待律师确认。", payload
  if input_data.action == "record_response":
    law_case.status = "已记录对方回应，待律师跟进"
    _set_lawyer_negotiation_stage(law_case, "active", "客户已记录对方回应，待律师判断下一步")
    _set_stage(law_case, "filing", "todo", "律师评估后决定是否准备诉讼/仲裁材料")
    return "对方回应已记录", input_data.note or "客户已记录对方回应，等待律师跟进。", payload
  if input_data.action == "close_case":
    law_case.status = "客户已确认结案"
    _set_lawyer_negotiation_stage(law_case, "done", "客户已确认结案", completed_at)
    _set_stage(law_case, "filing", "done", "客户已确认结案，无需继续准备材料", completed_at)
    _set_stage(law_case, "recovery", "done", "客户已确认结案", completed_at)
    return "客户已确认结案", input_data.note or "客户已确认案件处理完成。", payload
  return "全程跟进动作已记录", input_data.note or "客户已记录 5999 全程跟进动作。", payload


def _apply_full_service_lawyer_action(
  law_case: LawCase,
  input_data: LawyerFullServiceActionInput,
  completed_at: str,
) -> tuple[str, str, dict[str, Any]]:
  payload = {
    "action": input_data.action,
    "decision": input_data.decision,
    "note": input_data.note,
  }
  if input_data.action == "confirm_send_proof":
    law_case.status = "发送凭证已确认，等待对方回应"
    _set_lawyer_letter_stage(law_case, "done", "律师已确认客户发送凭证", completed_at)
    _set_lawyer_negotiation_stage(law_case, "active", "等待对方回应，客户可记录付款、承诺、拒绝或无回应")
    return "发送凭证已确认", input_data.note or "律师已确认发送凭证，案件进入对方回应阶段。", payload
  if input_data.action == "reject_send_proof":
    law_case.status = "发送凭证需补充"
    _set_lawyer_letter_stage(law_case, "active", "律师未确认当前发送凭证，请客户补充")
    _set_lawyer_negotiation_stage(law_case, "todo", "律师确认发送凭证后进入对方回应阶段")
    return "发送凭证需补充", input_data.note or "律师未确认当前发送凭证，请客户补充材料。", payload
  if input_data.action == "prepare_filing":
    law_case.status = "对方无回应或拒绝，进入立案材料准备"
    _set_lawyer_negotiation_stage(law_case, "done", "律师确认进入诉讼/仲裁材料准备", completed_at)
    _set_stage(law_case, "filing", "active", "整理证据、发送凭证和沟通记录，准备诉讼/仲裁材料")
    return "进入立案材料准备", input_data.note or "律师已确认进入诉讼/仲裁材料准备。", payload
  if input_data.action == "close_case":
    law_case.status = "客户已确认结案"
    _set_lawyer_negotiation_stage(law_case, "done", "律师确认案件可结案", completed_at)
    _set_stage(law_case, "filing", "done", "案件已结案，无需继续准备材料", completed_at)
    _set_stage(law_case, "recovery", "done", "案件已结案", completed_at)
    return "案件已结案", input_data.note or "律师已确认案件处理完成。", payload
  decision = input_data.decision
  if decision in ("paid", "completed"):
    law_case.status = "对方已履行，案件可结案"
    _set_lawyer_negotiation_stage(law_case, "done", "律师确认对方已履行或事项完成", completed_at)
    _set_stage(law_case, "filing", "done", "对方已履行，暂不需要准备诉讼/仲裁材料", completed_at)
    _set_stage(law_case, "recovery", "done", "已确认回款或事项完成", completed_at)
    return "对方已履行", input_data.note or "律师已确认对方履行或事项完成。", payload
  if decision in ("promised", "installment", "mediation_requested"):
    law_case.status = "对方承诺履行，律师继续跟进"
    _set_lawyer_negotiation_stage(law_case, "active", "律师继续跟进承诺履行、分期或协商请求")
    _set_stage(law_case, "filing", "todo", "继续诉前跟进，暂不进入材料准备")
    _set_stage(law_case, "recovery", "todo", "等待承诺履行结果")
    return "律师继续跟进", input_data.note or "律师将继续跟进对方承诺、分期或协商请求。", payload
  if decision == "delivery_failed":
    law_case.status = "发送凭证异常，需重新确认或补充发送"
    _set_lawyer_letter_stage(law_case, "active", "发送凭证异常，需重新确认或补充发送")
    _set_lawyer_negotiation_stage(law_case, "active", "律师跟进发送异常并确认是否需要重新发送")
    _set_stage(law_case, "filing", "todo", "发送凭证确认前暂不进入材料准备")
    _set_stage(law_case, "recovery", "todo", "等待发送凭证重新确认")
    return "发送凭证异常", input_data.note or "律师判断发送凭证异常，需要重新确认或补充发送。", payload
  law_case.status = "对方无回应或拒绝，进入立案材料准备"
  _set_lawyer_negotiation_stage(law_case, "done", "律师确认对方无回应或拒绝", completed_at)
  _set_stage(law_case, "filing", "active", "整理证据、发送凭证和沟通记录，准备诉讼/仲裁材料")
  _set_stage(law_case, "recovery", "todo", "等待后续履行或程序结果")
  return "进入立案材料准备", input_data.note or "律师已确认对方无回应或拒绝，进入材料准备。", payload


def _full_service_send_proof_confirmed(work_items: Iterable[WorkItem], case_id: str) -> bool:
  return any(
    item.caseId == case_id and item.kind == "send_proof_review" and item.status == "completed"
    for item in work_items
  )


def _send_proof_review_summary(law_case: LawCase, input_data: FullServiceActionInput) -> str:
  channel = f"发送方式：{input_data.channel}。" if input_data.channel else ""
  note = f"客户记录：{input_data.note}" if input_data.note else "客户已提交发送凭证，请核对收函主体、发送方式和凭证完整性。"
  return f"确认 {law_case.debtorName} 律师函发送凭证。{channel}{note}"


def _full_service_follow_up_summary(law_case: LawCase, input_data: FullServiceActionInput) -> str:
  response = input_data.response or "未填写"
  note = f"客户记录：{input_data.note}" if input_data.note else "客户已记录对方回应，请判断继续协商、结案或准备材料。"
  return f"处理 {law_case.debtorName} 律师函发送后的对方回应（{response}）。{note}"


def _lawyer_service_needs_follow_up(input_data: LawyerServiceActionInput) -> bool:
  return input_data.action == "request_lawyer_followup" or (
    input_data.action == "record_response" and input_data.response in ("promised", "installment", "mediation_requested")
  )


def _lawyer_follow_up_summary(law_case: LawCase, note: str | None = None) -> str:
  detail = f"客户记录：{note}" if note else "客户记录对方有回应，需要律师继续协商跟进。"
  return f"跟进 {law_case.debtorName} 律师函发送后的对方回应。{detail}"


def _has_approved_lawyer_letter(law_case: LawCase, documents: Iterable[LegalDocument]) -> bool:
  return any(
    document.caseId == law_case.id and document.type == "lawyer_letter" and document.status == "approved"
    for document in documents
  )


def _self_service_work_item_status(input_data: SelfServiceActionInput) -> str:
  if input_data.action in ("close_case", "upgrade_service"):
    return "completed"
  if input_data.action == "record_response" and input_data.response in ("paid", "completed"):
    return "completed"
  return "in_progress"


def _document_field_value(document: LegalDocument, field_name: str) -> str:
  value = document.fields.get(field_name)
  return str(value).strip() if value is not None else ""


def _require_document_submission_fields(document: LegalDocument) -> None:
  required_fields = ("recipient", "request", "deadline")
  if any(not _document_field_value(document, field_name) for field_name in required_fields):
    raise InvalidStateError("REQUIRED_DOCUMENT_FIELDS_MISSING")


def _ai_guidance_summary(law_case: LawCase) -> str:
  missing_required = [
    category.name
    for category in law_case.evidence
    if category.required and not category.files and category.status != "recognized"
  ]
  missing_text = "、".join(missing_required[:3]) if missing_required else "暂无缺失的必传材料"
  route = law_case.assessment.suggestedRoute if law_case.assessment is not None else "补充材料后重新评估"
  return f"下一步：补充{missing_text}；生成材料草稿；按“{route}”跟进进度。"


def _new_document(case_id: str, lawyer_id: str, input_data: CreateDocumentInput) -> LegalDocument:
  now = _iso(_now())
  return LegalDocument(
    id=f"doc-{uuid4().hex[:8]}",
    caseId=case_id,
    type=input_data.type,
    status="draft",
    title=input_data.title,
    fields=input_data.fields,
    body=input_data.body,
    version=1,
    createdBy=lawyer_id,
    updatedBy=lawyer_id,
    createdAt=now,
    updatedAt=now,
  )


def _apply_document_update(document: LegalDocument, lawyer_id: str, input_data: UpdateDocumentInput) -> None:
  if input_data.title is not None:
    document.title = input_data.title
  if input_data.fields is not None:
    document.fields = {**document.fields, **input_data.fields}
  if input_data.body is not None:
    document.body = input_data.body
  document.version += 1
  document.updatedBy = lawyer_id
  document.updatedAt = _iso(_now())


def _new_message(
  recipient_user_id: str,
  message_type: str,
  title: str,
  body: str,
  action_href: str,
  case_id: str | None = None,
) -> NotificationMessage:
  return NotificationMessage(
    id=f"msg-{uuid4().hex[:8]}",
    recipientUserId=recipient_user_id,
    caseId=case_id,
    type=message_type,
    title=title,
    body=body,
    unread=True,
    actionHref=action_href,
    createdAt=_iso(_now()),
  )


def _approved_document_status(document_type: str) -> str:
  if document_type == "contract_review_opinion":
    return "合同审查意见已确认"
  if document_type == "arbitration_material":
    return "仲裁材料已确认"
  return "律师函已定稿，待客户自行发送"


def _approved_document_client_message(law_case: LawCase, document: LegalDocument) -> str:
  if law_case.selectedPlan == "full-service" and document.type == "lawyer_letter":
    return f"已确认《{document.title}》，请下载或复制后自行发送，并提交发送凭证；律师确认凭证后再进入对方回应阶段。"
  return f"已确认《{document.title}》，请下载或复制后自行发送，并保留送达、沟通和签收凭证。"


def _approved_document_lawyer_notification(law_case: LawCase, document: LegalDocument) -> str:
  if law_case.selectedPlan == "full-service" and document.type == "lawyer_letter":
    return f"{law_case.debtorName} 已确认 {document.title}，等待客户自行发送并提交发送凭证。"
  return f"{law_case.debtorName} 已确认 {document.title}，等待客户自行发送并记录对方回应。"


def _mark_stage_for_document(law_case: LawCase, document_type: str) -> None:
  if document_type == "lawyer_letter":
    description = "律师函已定稿，待客户下载或复制后自行发送"
    negotiation_description = "客户自行发送后记录对方回应"
    if law_case.selectedPlan == "full-service":
      description = "律师函已定稿，待客户自行发送并提交发送凭证"
      negotiation_description = "律师确认发送凭证后进入对方回应阶段"
    _set_lawyer_letter_stage(law_case, "active", description)
    stage = _stage(law_case, "negotiation")
    if stage is not None and stage.status == "todo":
      stage.title = "协商跟进"
      stage.description = negotiation_description
    return
  stage_key = "filing" if document_type == "arbitration_material" else "letter"
  stage = next((item for item in law_case.stages if item.key == stage_key), None)
  if stage is not None:
    stage.status = "done"
    stage.at = _format_datetime(_now())
    stage.description = _approved_document_status(document_type)


def _user_from_row(row: dict[str, Any]) -> User:
  return User(
    id=row["id"],
    phone=row["phone"],
    name=row["name"],
    role=row.get("role") or "client",
    accountStatus=row.get("account_status") or "active",
    lawyerReviewStatus=row.get("lawyer_review_status") or ("approved" if row.get("role") == "lawyer" else "none"),
    rejectedReason=row.get("rejected_reason"),
    lawFirm=row.get("law_firm"),
    licenseNumber=row.get("license_number"),
    practiceRegion=row.get("practice_region"),
    specialties=row.get("specialties_json") or [],
    createdAt=row["created_at"],
    updatedAt=row.get("updated_at") or row["created_at"],
  )


def _event_from_row(row: dict[str, Any]) -> CaseEvent:
  return CaseEvent(
    id=row["id"],
    caseId=row["case_id"],
    type=row["type"],
    title=row["title"],
    message=row["message"],
    createdAt=row["created_at"],
    payload=row["payload"] or {},
  )


def _work_item_from_row(row: dict[str, Any]) -> WorkItem:
  return WorkItem(
    id=row["id"],
    caseId=row["case_id"],
    kind=row["kind"],
    status=row["status"],
    assigneeId=row["assignee_id"],
    title=row["title"],
    summary=row["summary"],
    dueAt=row["due_at"],
    createdAt=row["created_at"],
    updatedAt=row["updated_at"],
  )


def _document_from_row(row: dict[str, Any]) -> LegalDocument:
  return LegalDocument(
    id=row["id"],
    caseId=row["case_id"],
    type=row["type"],
    status=row["status"],
    title=row["title"],
    fields=row["fields_json"] or {},
    body=row["body"],
    version=row["version"],
    createdBy=row["created_by"],
    updatedBy=row["updated_by"],
    createdAt=row["created_at"],
    updatedAt=row["updated_at"],
  )


def _message_from_row(row: dict[str, Any]) -> NotificationMessage:
  return NotificationMessage(
    id=row["id"],
    recipientUserId=row["recipient_user_id"],
    caseId=row["case_id"],
    type=row["type"],
    title=row["title"],
    body=row["body"],
    unread=bool(row["unread"]),
    actionHref=row["action_href"],
    createdAt=row["created_at"],
  )


def _normalize_phone(phone: str) -> str:
  return "".join(character for character in phone if character.isdigit())


def _create_token() -> str:
  return f"local_{token_urlsafe(24)}"


def _now() -> datetime:
  return datetime.now(UTC)


def _iso(value: datetime) -> str:
  return value.isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
  return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _format_datetime(value: datetime) -> str:
  return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M")
