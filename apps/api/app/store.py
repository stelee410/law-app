from collections.abc import AsyncIterator
from typing import Any
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from uuid import uuid4

from app.core.config import Settings
from app.schemas import (
  AssessmentJob,
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
    token = f"local_{token_urlsafe(24)}"
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
    created_at = _now()
    law_case = LawCase(
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
  ) -> EvidenceFile | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None:
      return None

    category = next((item for item in law_case.evidence if item.id == category_id), None)
    if category is None:
      return None

    evidence_file = EvidenceFile(
      id=f"file-{uuid4().hex[:8]}",
      name=file_name,
      size=file_size,
      mimeType=mime_type,
      uploadedAt=_iso(_now()),
    )
    category.files.append(evidence_file)
    category.status = "recognized"
    category.insight = "已识别关键信息"
    law_case.status = "AI评估中"
    evidence_stage = next((stage for stage in law_case.stages if stage.key == "evidence"), None)
    if evidence_stage is not None:
      evidence_stage.status = "done"
      evidence_stage.at = _format_datetime(_now())
      evidence_stage.description = f"已上传 {sum(len(item.files) for item in law_case.evidence)} 份证据"

    self._record_event(
      law_case.id,
      "evidence.updated",
      "证据已上传",
      f"已上传 {category.name}：{file_name}",
      {"categoryId": category_id, "fileName": file_name},
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
      law_case.assessment = assess_case(law_case)
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

  def select_plan(self, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
    law_case = self.get_case(user_id, case_id)
    if law_case is None or law_case.assessment is None:
      return None
    if not any(plan.id == plan_id for plan in law_case.assessment.plans):
      return None

    selected_plan = next(plan for plan in law_case.assessment.plans if plan.id == plan_id)
    law_case.selectedPlan = plan_id
    law_case.status = "文书生成中" if plan_id == "self-service" else "律师复核中"
    review_stage = next((stage for stage in law_case.stages if stage.key == "review"), None)
    if review_stage is not None:
      review_stage.status = "active"
      review_stage.description = law_case.status
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

  def _get_or_create_user(self, phone: str) -> User:
    user = self._users_by_phone.get(phone)
    if user is not None:
      return user

    user = User(
      id=f"user-{uuid4().hex[:8]}",
      phone=phone,
      name=f"用户{phone[-4:]}",
      createdAt=_iso(_now()),
    )
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
    event = CaseEvent(
      id=f"evt-{uuid4().hex[:8]}",
      caseId=case_id,
      type=event_type,
      title=title,
      message=message,
      createdAt=_iso(_now()),
      payload=payload or {},
    )
    self._events.setdefault(case_id, []).append(event)


def _create_evidence_categories() -> list[EvidenceCategory]:
  return [
    EvidenceCategory(id="contract", name="合同/协议", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="invoice", name="发票", required=False, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="chat", name="聊天记录", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="transfer", name="转账记录", required=True, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="delivery", name="交付证明", required=False, status="pending", files=[], insight="待上传"),
    EvidenceCategory(id="other", name="其他证据", required=False, status="optional", files=[], insight="选填项"),
  ]


def _normalize_phone(phone: str) -> str:
  return "".join(character for character in phone if character.isdigit())


def _now() -> datetime:
  return datetime.now(UTC)


def _iso(value: datetime) -> str:
  return value.isoformat().replace("+00:00", "Z")


def _format_datetime(value: datetime) -> str:
  return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M")
