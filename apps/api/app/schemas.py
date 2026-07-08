from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


EvidenceStatus = Literal["pending", "uploaded", "recognized", "optional"]
DueStatus = Literal["已到期", "部分到期", "不确定"]
CaseType = Literal["debt_collection", "lawyer_letter", "labor_dispute", "rental_dispute", "contract_review"]
PlanId = Literal["self-service", "lawyer-review", "full-service"]
UserRole = Literal["client", "lawyer"]
WorkItemKind = Literal["ai_guidance", "lawyer_review", "document_draft", "document_revision"]
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
  createdAt: str


class AuthToken(ApiModel):
  token: str
  user: User
  expiresAt: str


class LoginCodeResponse(ApiModel):
  phone: str
  expiresAt: str
  mockCode: str


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


class RequestCodeInput(ApiModel):
  phone: str = Field(min_length=6)


class LoginInput(RequestCodeInput):
  code: str = Field(min_length=4)


class CreateCaseInput(ApiModel):
  caseType: CaseType = "debt_collection"
  debtorName: str = Field(min_length=2)
  contactName: str = Field(min_length=2)
  contactPhone: str = Field(min_length=6)
  amount: float = Field(gt=0)
  contractDate: str = Field(min_length=8)
  dispute: str = Field(min_length=10)
  dueStatus: DueStatus
  partyRole: str = ""
  counterpartyName: str | None = None
  region: str = ""
  incidentDate: str = ""
  claimType: str = ""
  claimSummary: str = ""
  privacyConsent: bool = True
  matterFields: dict[str, Any] = Field(default_factory=dict)

  @field_validator("privacyConsent")
  @classmethod
  def require_privacy_consent(cls, value: bool) -> bool:
    if value is not True:
      raise ValueError("PRIVACY_CONSENT_REQUIRED")
    return value


class SelectPlanInput(ApiModel):
  planId: PlanId


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
