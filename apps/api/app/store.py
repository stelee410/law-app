from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Any, Protocol
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

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
  EvidenceCategory,
  EvidenceFile,
  LawCase,
  PlanId,
  User,
)
from app.workflows.case_assessment import SERVICE_PLANS, assess_case


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
    self._record_event(law_case.id, "case.updated", "案件已创建", "已提交案件基础信息。")
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
      "证据已上传",
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

    _apply_selected_plan(law_case, plan_id)
    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    self._record_event(
      law_case.id,
      "plan.selected",
      "服务方案已选择",
      f"已选择：{selected_plan.name}",
      {"planId": plan_id},
    )
    return law_case

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
      "正在梳理证据并生成案件评估。",
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
      f"胜诉概率评估为 {law_case.assessment.winRate}%。",
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
          SELECT users.id, users.phone, users.name, users.created_at, sessions.expires_at
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
        self._insert_event(cursor, _new_event(law_case.id, "case.updated", "案件已创建", "已提交案件基础信息。"))
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
            "证据已上传",
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
      "正在梳理证据并生成案件评估。",
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
      f"胜诉概率评估为 {law_case.assessment.winRate}%。",
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
    _apply_selected_plan(law_case, plan_id)
    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    with self.database.connection() as conn:
      with conn.cursor() as cursor:
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
      conn.commit()
    return law_case

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
      "INSERT INTO users (id, phone, name, created_at) VALUES (%s, %s, %s, %s)",
      (user.id, user.phone, user.name, user.createdAt),
    )
    return user

  def _case_from_row(self, cursor, row: dict[str, Any]) -> LawCase:
    evidence = _create_evidence_categories()
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
      debtorName=row["debtor_name"],
      contactName=row["contact_name"],
      contactPhone=row["contact_phone"],
      amount=row["amount"],
      contractDate=row["contract_date"],
      dispute=row["dispute"],
      dueStatus=row["due_status"],
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
        id, user_id, debtor_name, contact_name, contact_phone, amount, contract_date,
        dispute, due_status, status, created_at, case_no, selected_plan, assessment_json, stages_json
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        law_case.id,
        law_case.userId,
        law_case.debtorName,
        law_case.contactName,
        law_case.contactPhone,
        law_case.amount,
        law_case.contractDate,
        law_case.dispute,
        law_case.dueStatus,
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


def _create_evidence_categories() -> list[EvidenceCategory]:
  return [
    EvidenceCategory(id="contract", name="合同/协议", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="invoice", name="发票", required=False, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="chat", name="聊天记录", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="transfer", name="转账记录", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="delivery", name="交付证明", required=False, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="other", name="其他证据", required=False, status="optional", files=[], insight="选填项"),
  ]


def _new_case(user_id: str, input_data: CreateCaseInput) -> LawCase:
  created_at = _now()
  return LawCase(
    id=f"case-{uuid4().hex[:8]}",
    userId=user_id,
    debtorName=input_data.debtorName,
    contactName=input_data.contactName,
    contactPhone=input_data.contactPhone,
    amount=input_data.amount,
    contractDate=input_data.contractDate,
    dispute=input_data.dispute,
    dueStatus=input_data.dueStatus,
    status="待补充证据",
    createdAt=_iso(created_at),
    caseNo=f"AL{created_at.strftime('%Y%m%d')}{uuid4().int % 9000 + 1000}",
    evidence=_create_evidence_categories(),
    stages=[
      CaseStage(key="submit", title="提交信息", description="已提交案件信息", status="done", at=_format_datetime(created_at)),
      CaseStage(key="evidence", title="上传证据", description="等待上传关键证据", status="active"),
      CaseStage(key="review", title="律师复核", description="律师将复核证据与案情", status="todo"),
      CaseStage(key="letter", title="发送律师函", description="生成并发送律师函", status="todo"),
      CaseStage(key="negotiation", title="协商调解", description="跟进对方回应", status="todo"),
      CaseStage(key="filing", title="立案材料准备", description="调解未果将进入立案准备阶段", status="todo"),
      CaseStage(key="recovery", title="回款 / 结案", description="回款完成或法院判决后结案", status="todo"),
    ],
  )


def _new_user(phone: str) -> User:
  return User(id=f"user-{uuid4().hex[:8]}", phone=phone, name=f"用户{phone[-4:]}", createdAt=_iso(_now()))


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
    evidence_stage.description = f"已上传 {sum(len(item.files) for item in law_case.evidence)} 份证据"


def _apply_selected_plan(law_case: LawCase, plan_id: PlanId) -> None:
  law_case.selectedPlan = plan_id
  law_case.status = "文书生成中" if plan_id == "self-service" else "律师复核中"
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


def _user_from_row(row: dict[str, Any]) -> User:
  return User(id=row["id"], phone=row["phone"], name=row["name"], createdAt=row["created_at"])


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
