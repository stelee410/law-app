from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


EvidenceStatus = Literal["pending", "uploaded", "recognized", "optional"]
DueStatus = Literal["已到期", "部分到期", "不确定"]
CaseType = Literal["debt_collection", "lawyer_letter", "labor_dispute", "rental_dispute", "contract_review"]
PlanId = Literal["self-service", "lawyer-review", "full-service"]
UserRole = Literal["client", "lawyer", "admin"]
AccountStatus = Literal["active", "disabled"]
LawyerReviewStatus = Literal["none", "pending_review", "approved", "rejected"]
WorkItemKind = Literal["ai_guidance", "lawyer_review", "document_draft", "document_revision", "send_proof_review", "lawyer_follow_up"]
WorkItemStatus = Literal["pending", "in_progress", "completed", "cancelled"]
RiskLevel = Literal["low", "medium", "high"]
ReviewNextAction = Literal[
  "request_evidence",
  "draft_lawyer_letter",
  "prepare_arbitration",
  "prepare_litigation",
  "deliver_contract_review",
  "close_case",
]
LegalDocumentType = Literal["lawyer_letter", "arbitration_material", "contract_review_opinion"]
LegalDocumentStatus = Literal["draft", "pending_client_approval", "approved", "sent", "archived"]
NotificationType = Literal["case", "task", "review", "document", "system"]
SelfServiceAction = Literal[
  "copy_template",
  "download_template",
  "mark_sent",
  "upload_proof",
  "record_response",
  "close_case",
  "upgrade_service",
]
SelfServiceResponse = Literal[
  "paid",
  "promised",
  "installment",
  "rejected",
  "no_response",
  "need_review",
  "completed",
]
LawyerServiceAction = Literal[
  "copy_document",
  "download_document",
  "mark_sent",
  "record_response",
  "request_lawyer_followup",
  "prepare_filing",
  "close_case",
]
LawyerServiceResponse = Literal[
  "paid",
  "completed",
  "promised",
  "installment",
  "mediation_requested",
  "rejected",
  "no_response",
]
FullServiceAction = Literal[
  "copy_document",
  "download_document",
  "submit_send_proof",
  "record_response",
  "close_case",
]
FullServiceResponse = Literal[
  "paid",
  "completed",
  "promised",
  "installment",
  "mediation_requested",
  "rejected",
  "no_response",
  "delivery_failed",
]
LawyerFullServiceAction = Literal[
  "confirm_send_proof",
  "reject_send_proof",
  "decide_response",
  "prepare_filing",
  "close_case",
]
LawyerFullServiceDecision = FullServiceResponse
CaseStageKey = Literal[
  "submit",
  "evidence",
  "review",
  "letter",
  "negotiation",
  "filing",
  "recovery",
]
CaseEventType = Literal[
  "case.updated",
  "evidence.updated",
  "assessment.progress",
  "plan.selected",
  "stage.changed",
  "task.created",
  "task.updated",
  "review.submitted",
  "document.updated",
  "notification.created",
]
ErrorCode = Literal[
  "AUTH_REQUIRED",
  "INVALID_CODE",
  "CASE_NOT_FOUND",
  "EVIDENCE_REQUIRED",
  "UPLOAD_FAILED",
  "ASSESSMENT_RUNNING",
  "WORKFLOW_FAILED",
  "LLM_UNAVAILABLE",
  "INTERNAL_ERROR",
  "USER_NOT_FOUND",
  "ACCOUNT_DISABLED",
  "APPROVED_LAWYER_LETTER_REQUIRED",
  "DECISION_REQUIRED",
  "FULL_SERVICE_REQUIRED",
  "LAWYER_NOT_APPROVED",
  "LAWYER_REJECTED",
  "FORBIDDEN",
  "LAST_ADMIN_REQUIRED",
  "RESPONSE_REQUIRED",
  "SEND_PROOF_CONFIRMATION_REQUIRED",
  "SEND_PROOF_REQUIRED",
  "SMS_NOT_CONFIGURED",
  "SMS_PROVIDER_ERROR",
  "SMS_TEMPLATE_MISSING",
  "SMS_TOO_FREQUENT",
]


class ApiModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True)


class EvidenceFile(ApiModel):
  id: str
  name: str
  size: int
  mimeType: str
  uploadedAt: str


class EvidenceCategory(ApiModel):
  id: str
  name: str
  status: EvidenceStatus
  required: bool
  files: list[EvidenceFile] = Field(default_factory=list)
  insight: str | None = None


class ServicePlan(ApiModel):
  id: PlanId
  name: str
  subtitle: str
  price: int
  fee: str
  features: list[str]
  recommended: bool | None = None


class AssessmentResult(ApiModel):
  winRate: int
  confidence: Literal["中等", "较高", "高"]
  summary: str
  suggestedRoute: str
  estimatedDays: str
  estimatedRecovery: int
  findings: list[str]
  plans: list[ServicePlan]
  generatedAt: str


class CaseStage(ApiModel):
  key: CaseStageKey
  title: str
  description: str
  status: Literal["done", "active", "todo"]
  at: str | None = None


class LawCase(ApiModel):
  id: str
  caseType: CaseType = "debt_collection"
  debtorName: str
  contactName: str
  contactPhone: str
  amount: float
  contractDate: str
  dispute: str
  dueStatus: DueStatus
  partyRole: str = ""
  counterpartyName: str = ""
  region: str = ""
  incidentDate: str = ""
  claimType: str = ""
  claimSummary: str = ""
  privacyConsent: bool = True
  matterFields: dict[str, Any] = Field(default_factory=dict)
  status: str
  createdAt: str
  caseNo: str
  evidence: list[EvidenceCategory]
  stages: list[CaseStage]
  userId: str | None = None
  selectedPlan: PlanId | None = None
  assessment: AssessmentResult | None = None


class User(ApiModel):
  id: str
  phone: str
  name: str
  role: UserRole = "client"
  accountStatus: AccountStatus = "active"
  lawyerReviewStatus: LawyerReviewStatus = "none"
  rejectedReason: str | None = None
  lawFirm: str | None = None
  licenseNumber: str | None = None
  practiceRegion: str | None = None
  specialties: list[str] = Field(default_factory=list)
  createdAt: str
  updatedAt: str | None = None


class AuthToken(ApiModel):
  token: str
  user: User
  expiresAt: str


class LoginCodeResponse(ApiModel):
  phone: str
  expiresAt: str
  mockCode: str | None = None


class ApiError(ApiModel):
  code: ErrorCode
  message: str


class CaseEvent(ApiModel):
  id: str
  caseId: str
  type: CaseEventType
  title: str
  message: str
  createdAt: str
  payload: dict[str, Any] = Field(default_factory=dict)


class WorkItem(ApiModel):
  id: str
  caseId: str
  kind: WorkItemKind
  status: WorkItemStatus
  assigneeId: str | None = None
  title: str
  summary: str
  dueAt: str | None = None
  createdAt: str
  updatedAt: str


class ReviewOpinion(ApiModel):
  id: str
  caseId: str
  workItemId: str
  lawyerId: str
  conclusion: str
  riskLevel: RiskLevel
  evidenceGaps: list[str] = Field(default_factory=list)
  advice: str
  nextAction: ReviewNextAction
  createdAt: str


class LegalDocument(ApiModel):
  id: str
  caseId: str
  type: LegalDocumentType
  status: LegalDocumentStatus
  title: str
  fields: dict[str, Any] = Field(default_factory=dict)
  body: str
  version: int
  createdBy: str
  updatedBy: str
  createdAt: str
  updatedAt: str


class NotificationMessage(ApiModel):
  id: str
  recipientUserId: str
  caseId: str | None = None
  type: NotificationType
  title: str
  body: str
  unread: bool = True
  actionHref: str
  createdAt: str


class PhoneInput(ApiModel):
  phone: str = Field(pattern=r"^1[3-9]\d{9}$")


class RequestCodeInput(PhoneInput):
  purpose: Literal["login", "register"] = "login"


class LoginInput(PhoneInput):
  code: str = Field(min_length=4)


class PasswordLoginInput(PhoneInput):
  password: str = Field(min_length=8, max_length=128)


class ClientRegisterInput(LoginInput):
  name: str = Field(min_length=1)
  password: str | None = Field(default=None, min_length=8, max_length=128)
  acceptedTerms: bool
  acceptedPrivacy: bool

  @field_validator("acceptedTerms")
  @classmethod
  def require_terms(cls, value: bool) -> bool:
    if value is not True:
      raise ValueError("TERMS_REQUIRED")
    return value

  @field_validator("acceptedPrivacy")
  @classmethod
  def require_privacy(cls, value: bool) -> bool:
    if value is not True:
      raise ValueError("PRIVACY_REQUIRED")
    return value


class LawyerOnboardingInput(ClientRegisterInput):
  lawFirm: str = Field(min_length=1)
  licenseNumber: str = Field(min_length=1)
  practiceRegion: str = Field(min_length=1)
  specialties: list[str] = Field(min_length=1)


class AdminUpdateUserInput(ApiModel):
  role: UserRole | None = None
  accountStatus: AccountStatus | None = None


class AdminReviewLawyerInput(ApiModel):
  status: Literal["approved", "rejected"]
  rejectedReason: str | None = None

  @field_validator("rejectedReason")
  @classmethod
  def normalize_rejected_reason(cls, value: str | None) -> str | None:
    if value is None:
      return None
    normalized = value.strip()
    return normalized or None

  @field_validator("status")
  @classmethod
  def require_supported_review_status(cls, value: str) -> str:
    return value

  def model_post_init(self, __context: Any) -> None:
    if self.status == "rejected" and not self.rejectedReason:
      raise ValueError("REJECTED_REASON_REQUIRED")


class CreateCaseInput(ApiModel):
  caseType: CaseType = "debt_collection"
  debtorName: str = Field(min_length=2)
  contactName: str = Field(min_length=2)
  contactPhone: str = Field(min_length=6)
  amount: float = Field(gt=0)
  contractDate: str = Field(min_length=8)
  dispute: str
  dueStatus: DueStatus
  partyRole: str = ""
  counterpartyName: str | None = None
  region: str = ""
  incidentDate: str = ""
  claimType: str = ""
  claimSummary: str
  privacyConsent: bool = True
  matterFields: dict[str, Any] = Field(default_factory=dict)

  @field_validator("dispute", "claimSummary")
  @classmethod
  def require_non_blank_case_text(cls, value: str) -> str:
    if not value.strip():
      raise ValueError("CASE_TEXT_REQUIRED")
    return value

  @field_validator("privacyConsent")
  @classmethod
  def require_privacy_consent(cls, value: bool) -> bool:
    if value is not True:
      raise ValueError("PRIVACY_CONSENT_REQUIRED")
    return value


class SelectPlanInput(ApiModel):
  planId: PlanId


class SelfServiceActionInput(ApiModel):
  action: SelfServiceAction
  channel: str | None = None
  response: SelfServiceResponse | None = None
  note: str | None = None


class LawyerServiceActionInput(ApiModel):
  action: LawyerServiceAction
  channel: str | None = None
  response: LawyerServiceResponse | None = None
  note: str | None = None


class FullServiceActionInput(ApiModel):
  action: FullServiceAction
  channel: str | None = None
  response: FullServiceResponse | None = None
  note: str | None = None


class LawyerFullServiceActionInput(ApiModel):
  action: LawyerFullServiceAction
  decision: LawyerFullServiceDecision | None = None
  note: str | None = None


class SubmitReviewInput(ApiModel):
  conclusion: str = Field(min_length=2)
  riskLevel: RiskLevel
  evidenceGaps: list[str] = Field(default_factory=list)
  advice: str = Field(min_length=2)
  nextAction: ReviewNextAction


class CreateDocumentInput(ApiModel):
  type: LegalDocumentType
  title: str = Field(min_length=2)
  fields: dict[str, Any] = Field(default_factory=dict)
  body: str = Field(min_length=2)


class UpdateDocumentInput(ApiModel):
  title: str | None = None
  fields: dict[str, Any] | None = None
  body: str | None = None


class AssessmentJob(ApiModel):
  id: str
  caseId: str
  status: Literal["completed", "failed"]
  result: AssessmentResult | None = None
  errorCode: str | None = None
  errorMessage: str | None = None
  createdAt: str
  completedAt: str | None = None
