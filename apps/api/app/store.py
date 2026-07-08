from collections.abc import AsyncIterator
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
from app.core.config import Settings
from app.core.database import Database
from app.schemas import (
  AssessmentJob,
  AssessmentResult,
  AuthToken,
  CaseEvent,
  CaseEventType,
  CaseStage,
  CreateCaseInput,
  CreateDocumentInput,
  EvidenceCategory,
  EvidenceFile,
  LawCase,
  LegalDocument,
  NotificationMessage,
  PlanId,
  ReviewOpinion,
  SubmitReviewInput,
  UpdateDocumentInput,
  User,
  WorkItem,
)
from app.workflows.case_assessment import SERVICE_PLANS, assess_case


class InvalidStateError(Exception):
  pass


class AppStore(Protocol):
  settings: Settings

  def request_login_code(self, phone: str) -> dict[str, str]: ...
  def login_with_code(self, phone: str, code: str) -> AuthToken | None: ...
  def get_user_by_token(self, token: str) -> User | None: ...
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
  def list_messages(self, user_id: str) -> list[NotificationMessage]: ...
  def mark_message_read(self, user_id: str, message_id: str) -> NotificationMessage | None: ...
  def list_case_work_items(self, user_id: str, case_id: str) -> list[WorkItem] | None: ...
  def list_case_documents(self, user_id: str, case_id: str) -> list[LegalDocument] | None: ...
  def approve_document(self, user_id: str, case_id: str, document_id: str) -> tuple[LawCase, LegalDocument] | None: ...
  def list_lawyer_tasks(self, lawyer_id: str) -> list[WorkItem] | None: ...
  def get_lawyer_task(self, lawyer_id: str, task_id: str) -> WorkItem | None: ...
  def get_lawyer_case(self, lawyer_id: str, case_id: str) -> LawCase | None: ...
  def list_lawyer_case_documents(self, lawyer_id: str, case_id: str) -> list[LegalDocument] | None: ...
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
    self._otps: dict[str, tuple[str, datetime]] = {}
    self._users_by_phone: dict[str, User] = {}
    self._users_by_id: dict[str, User] = {}
    self._sessions: dict[str, tuple[str, datetime]] = {}
    self._cases: dict[str, LawCase] = {}
    self._events: dict[str, list[CaseEvent]] = {}
    self._work_items: dict[str, WorkItem] = {}
    self._review_opinions: dict[str, ReviewOpinion] = {}
    self._documents: dict[str, LegalDocument] = {}
    self._messages: dict[str, NotificationMessage] = {}

  def request_login_code(self, phone: str) -> dict[str, str]:
    normalized_phone = _normalize_phone(phone)
    expires_at = _now() + timedelta(minutes=self.settings.OTP_EXPIRE_MINUTES)
    self._otps[normalized_phone] = (self.settings.MOCK_OTP_CODE, expires_at)
    return {
      "phone": normalized_phone,
      "code": self.settings.MOCK_OTP_CODE,
      "expiresAt": _iso(expires_at),
    }

  def login_with_code(self, phone: str, code: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    otp = self._otps.get(normalized_phone)
    if otp is None:
      return None
    expected_code, expires_at = otp
    if expected_code != code or expires_at < _now():
      return None

    user = self._get_or_create_user(normalized_phone)
    token = _create_token()
    session_expires_at = _now() + timedelta(days=self.settings.TOKEN_EXPIRE_DAYS)
    self._sessions[token] = (user.id, session_expires_at)
    return AuthToken(token=token, user=user, expiresAt=_iso(session_expires_at))

  def get_user_by_token(self, token: str) -> User | None:
    session = self._sessions.get(token)
    if session is None:
      return None
    user_id, expires_at = session
    if expires_at < _now():
      self._sessions.pop(token, None)
      return None
    return self._users_by_id.get(user_id)

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
    return self._run_assessment(law_case)

  def select_plan(self, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None or law_case.assessment is None:
      return None
    if not any(plan.id == plan_id for plan in law_case.assessment.plans):
      return None
    if law_case.selectedPlan == plan_id:
      return law_case
    if law_case.selectedPlan is not None:
      raise InvalidStateError("INVALID_STATE")

    _apply_selected_plan(law_case, plan_id)
    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    self._record_event(
      law_case.id,
      "plan.selected",
      "服务方案已选择",
      f"已选择：{selected_plan.name}",
      {"planId": plan_id},
    )
    self._create_plan_follow_up(law_case, user_id, plan_id)
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
      [document for document in self._documents.values() if document.caseId == case_id],
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
    self._notify_lawyers(
      "用户已确认文书",
      f"{law_case.debtorName} 已确认 {document.title}。",
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

  def _create_plan_follow_up(self, law_case: LawCase, user_id: str, plan_id: PlanId) -> None:
    if plan_id == "self-service":
      task = _new_work_item(law_case.id, "ai_guidance", "AI自助任务", "根据 AI 评估继续补证、生成材料草稿并跟进进度。")
      self._work_items[task.id] = task
      self._create_message(
        user_id,
        "task",
        "AI自助流程已启动",
        "系统将根据评估结果提示补证、生成材料草稿和下一步动作。",
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
      if user.role == "lawyer":
        self._create_message(user.id, "task", title, body, action_href, case_id)

  def _first_lawyer_id(self) -> str | None:
    lawyer = next((user for user in self._users_by_id.values() if user.role == "lawyer"), None)
    return lawyer.id if lawyer is not None else None

  def _is_lawyer(self, user_id: str) -> bool:
    user = self._users_by_id.get(user_id)
    return user is not None and user.role == "lawyer"


class PostgresStore:
  def __init__(self, settings: Settings, database: Database):
    self.settings = settings
    self.database = database

  def request_login_code(self, phone: str) -> dict[str, str]:
    normalized_phone = _normalize_phone(phone)
    now = _now()
    expires_at = now + timedelta(minutes=self.settings.OTP_EXPIRE_MINUTES)
    with self.database.connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute(
          """
          INSERT INTO otp_codes (phone, code, expires_at, created_at)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (phone) DO UPDATE
          SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at
          """,
          (normalized_phone, self.settings.MOCK_OTP_CODE, _iso(expires_at), _iso(now)),
        )
      conn.commit()
    return {"phone": normalized_phone, "code": self.settings.MOCK_OTP_CODE, "expiresAt": _iso(expires_at)}

  def login_with_code(self, phone: str, code: str) -> AuthToken | None:
    normalized_phone = _normalize_phone(phone)
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT code, expires_at FROM otp_codes WHERE phone = %s", (normalized_phone,))
        otp = cursor.fetchone()
        if otp is None or otp["code"] != code or _parse_iso(otp["expires_at"]) < _now():
          conn.rollback()
          return None
        user = self._get_or_create_user(cursor, normalized_phone)
        token = _create_token()
        expires_at = _now() + timedelta(days=self.settings.TOKEN_EXPIRE_DAYS)
        cursor.execute(
          "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (%s, %s, %s, %s)",
          (token, user.id, _iso(expires_at), _iso(_now())),
        )
      conn.commit()
    return AuthToken(token=token, user=user, expiresAt=_iso(expires_at))

  def get_user_by_token(self, token: str) -> User | None:
    with self.database.connection() as conn:
      with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
          SELECT users.id, users.phone, users.name, users.role, users.created_at, sessions.expires_at
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
        if _parse_iso(row["expires_at"]) < _now():
          cursor.execute("DELETE FROM sessions WHERE token = %s", (token,))
          conn.commit()
          return None
      conn.rollback()
    return _user_from_row(row)

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
    if law_case.selectedPlan == plan_id:
      return law_case
    if law_case.selectedPlan is not None:
      raise InvalidStateError("INVALID_STATE")
    _apply_selected_plan(law_case, plan_id)
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
        self._create_plan_follow_up(cursor, law_case, user_id, plan_id)
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
        cursor.execute("SELECT * FROM legal_documents WHERE case_id = %s ORDER BY updated_at DESC", (case_id,))
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
        self._notify_lawyers(
          cursor,
          "用户已确认文书",
          f"{law_case.debtorName} 已确认 {document.title}。",
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
    cursor.execute(
      "INSERT INTO users (id, phone, name, role, created_at) VALUES (%s, %s, %s, %s, %s)",
      (user.id, user.phone, user.name, user.role, user.createdAt),
    )
    return user

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

  def _create_plan_follow_up(self, cursor, law_case: LawCase, user_id: str, plan_id: PlanId) -> None:
    if plan_id == "self-service":
      task = _new_work_item(law_case.id, "ai_guidance", "AI自助任务", "根据 AI 评估继续补证、生成材料草稿并跟进进度。")
      self._insert_work_item(cursor, task)
      self._insert_message(
        cursor,
        _new_message(
          user_id,
          "task",
          "AI自助流程已启动",
          "系统将根据评估结果提示补证、生成材料草稿和下一步动作。",
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
    cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
    row = cursor.fetchone()
    return row is not None and row["role"] == "lawyer"

  def _first_lawyer_id(self, cursor) -> str | None:
    cursor.execute("SELECT id FROM users WHERE role = 'lawyer' ORDER BY created_at ASC LIMIT 1")
    row = cursor.fetchone()
    return row["id"] if row is not None else None

  def _notify_lawyers(self, cursor, title: str, body: str, action_href: str, case_id: str | None = None) -> None:
    cursor.execute("SELECT id FROM users WHERE role = 'lawyer'")
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
  role = "lawyer" if phone.endswith("9999") else "client"
  name = f"律师{phone[-4:]}" if role == "lawyer" else f"用户{phone[-4:]}"
  return User(id=f"user-{uuid4().hex[:8]}", phone=phone, name=name, role=role, createdAt=_iso(_now()))


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
  law_case.status = "AI方案处理中" if plan_id == "self-service" else "律师复核中"
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
  return "律师函已确认"


def _mark_stage_for_document(law_case: LawCase, document_type: str) -> None:
  stage_key = "filing" if document_type == "arbitration_material" else "letter"
  stage = next((item for item in law_case.stages if item.key == stage_key), None)
  if stage is not None:
    stage.status = "done"
    stage.at = _format_datetime(_now())
    stage.description = _approved_document_status(document_type)


def _user_from_row(row: dict[str, Any]) -> User:
  return User(id=row["id"], phone=row["phone"], name=row["name"], role=row.get("role") or "client", createdAt=row["created_at"])


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
