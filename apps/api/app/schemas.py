from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


EvidenceStatus = Literal["pending", "uploaded", "recognized", "optional"]
DueStatus = Literal["已到期", "部分到期", "不确定"]
PlanId = Literal["self-service", "lawyer-review", "full-service"]
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
  debtorName: str
  contactName: str
  contactPhone: str
  amount: float
  contractDate: str
  dispute: str
  dueStatus: DueStatus
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


class RequestCodeInput(ApiModel):
  phone: str = Field(min_length=6)


class LoginInput(RequestCodeInput):
  code: str = Field(min_length=4)


class CreateCaseInput(ApiModel):
  debtorName: str = Field(min_length=2)
  contactName: str = Field(min_length=2)
  contactPhone: str = Field(min_length=6)
  amount: float = Field(gt=0)
  contractDate: str = Field(min_length=8)
  dispute: str = Field(min_length=10)
  dueStatus: DueStatus


class SelectPlanInput(ApiModel):
  planId: PlanId


class AssessmentJob(ApiModel):
  id: str
  caseId: str
  status: Literal["completed", "failed"]
  result: AssessmentResult | None = None
  errorCode: str | None = None
  errorMessage: str | None = None
  createdAt: str
  completedAt: str | None = None
