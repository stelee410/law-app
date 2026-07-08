export type EvidenceStatus = 'pending' | 'uploaded' | 'recognized' | 'optional';

export type HealthStatusValue = string | number | boolean | null;

export type HealthResponse = {
  ok: boolean;
  service: string;
  storage?: string;
  security?: HealthStatusValue | Record<string, HealthStatusValue>;
};

export type CaseType =
  | 'debt_collection'
  | 'lawyer_letter'
  | 'labor_dispute'
  | 'rental_dispute'
  | 'contract_review';

export type DueStatus = '已到期' | '部分到期' | '不确定';

export type EvidenceFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
};

export type EvidenceCategory = {
  id: string;
  name: string;
  status: EvidenceStatus;
  required: boolean;
  files: EvidenceFile[];
  insight?: string;
};

export type CaseStageKey =
  | 'submit'
  | 'evidence'
  | 'review'
  | 'letter'
  | 'negotiation'
  | 'filing'
  | 'recovery';

export type CaseStage = {
  key: CaseStageKey;
  title: string;
  description: string;
  status: 'done' | 'active' | 'todo';
  at?: string;
};

export type PlanId = 'self-service' | 'lawyer-review' | 'full-service';
export type UserRole = 'client' | 'lawyer' | 'admin';
export type AccountStatus = 'active' | 'disabled';
export type LawyerReviewStatus = 'none' | 'pending_review' | 'approved' | 'rejected';
export type WorkItemKind = 'ai_guidance' | 'lawyer_review' | 'document_draft' | 'document_revision';
export type WorkItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ReviewNextAction =
  | 'request_evidence'
  | 'draft_lawyer_letter'
  | 'prepare_arbitration'
  | 'prepare_litigation'
  | 'deliver_contract_review'
  | 'close_case';
export type LegalDocumentType = 'lawyer_letter' | 'arbitration_material' | 'contract_review_opinion';
export type LegalDocumentStatus = 'draft' | 'pending_client_approval' | 'approved' | 'sent' | 'archived';
export type NotificationType = 'case' | 'task' | 'review' | 'document' | 'system';

export type ServicePlan = {
  id: PlanId;
  name: string;
  subtitle: string;
  price: number;
  fee: string;
  recommended?: boolean;
  features: string[];
};

export type AssessmentResult = {
  winRate: number;
  confidence: '中等' | '较高' | '高';
  summary: string;
  suggestedRoute: string;
  estimatedDays: string;
  estimatedRecovery: number;
  findings: string[];
  plans: ServicePlan[];
  generatedAt: string;
};

export type MatterFields = Record<string, string | number | boolean>;

export type LawCase = {
  id: string;
  userId?: string;
  caseType: CaseType;
  debtorName: string;
  contactName: string;
  contactPhone: string;
  amount: number;
  contractDate: string;
  dispute: string;
  dueStatus: DueStatus;
  partyRole: string;
  counterpartyName: string;
  region: string;
  incidentDate: string;
  claimType: string;
  claimSummary: string;
  privacyConsent: boolean;
  matterFields: MatterFields;
  status: string;
  createdAt: string;
  caseNo: string;
  selectedPlan?: PlanId;
  evidence: EvidenceCategory[];
  assessment?: AssessmentResult;
  stages: CaseStage[];
};

export type User = {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  accountStatus: AccountStatus;
  lawyerReviewStatus: LawyerReviewStatus;
  rejectedReason?: string;
  lawFirm?: string;
  licenseNumber?: string;
  practiceRegion?: string;
  specialties: string[];
  createdAt: string;
  updatedAt?: string;
};

export type AuthToken = {
  token: string;
  user: User;
  expiresAt: string;
};

export type OtpResponse = {
  phone: string;
  mockCode?: string;
  expiresAt: string;
};

export type ClientRegisterInput = {
  phone: string;
  code: string;
  name: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
};

export type LawyerOnboardingInput = ClientRegisterInput & {
  lawFirm: string;
  licenseNumber: string;
  practiceRegion: string;
  specialties: string[];
};

export type AdminUpdateUserInput = {
  role?: UserRole;
  accountStatus?: AccountStatus;
};

export type AdminReviewLawyerInput = {
  status: 'approved' | 'rejected';
  rejectedReason?: string;
};

export type AdminOverview = {
  summary: {
    totalUsers: number;
    totalCases: number;
    pendingLawyers: number;
  };
  recentCases: LawCase[];
};

export type CreateCaseInput = {
  caseType: CaseType;
  debtorName: string;
  contactName: string;
  contactPhone: string;
  amount: number;
  contractDate: string;
  dispute: string;
  dueStatus: DueStatus;
  partyRole: string;
  counterpartyName?: string;
  region: string;
  incidentDate: string;
  claimType: string;
  claimSummary: string;
  privacyConsent: boolean;
  matterFields: MatterFields;
};

export type CaseEvent = {
  id?: string;
  caseId: string;
  type:
    | 'case.updated'
    | 'evidence.updated'
    | 'assessment.progress'
    | 'plan.selected'
    | 'stage.changed'
    | 'task.created'
    | 'task.updated'
    | 'review.submitted'
    | 'document.updated'
    | 'notification.created';
  title: string;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type WorkItem = {
  id: string;
  caseId: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  assigneeId?: string;
  title: string;
  summary: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewOpinion = {
  id: string;
  caseId: string;
  workItemId: string;
  lawyerId: string;
  conclusion: string;
  riskLevel: RiskLevel;
  evidenceGaps: string[];
  advice: string;
  nextAction: ReviewNextAction;
  createdAt: string;
};

export type LegalDocument = {
  id: string;
  caseId: string;
  type: LegalDocumentType;
  status: LegalDocumentStatus;
  title: string;
  fields: Record<string, string | number | boolean>;
  body: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationMessage = {
  id: string;
  recipientUserId: string;
  caseId?: string;
  type: NotificationType;
  title: string;
  body: string;
  unread: boolean;
  actionHref: string;
  createdAt: string;
};

export type SubmitReviewInput = {
  conclusion: string;
  riskLevel: RiskLevel;
  evidenceGaps: string[];
  advice: string;
  nextAction: ReviewNextAction;
};

export type CreateDocumentInput = {
  type: LegalDocumentType;
  title: string;
  fields: Record<string, string | number | boolean>;
  body: string;
};

export type UpdateDocumentInput = {
  title?: string;
  fields?: Record<string, string | number | boolean>;
  body?: string;
};
