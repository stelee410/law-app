export type EvidenceStatus = 'pending' | 'uploaded' | 'recognized' | 'optional';

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

export type PlanId = 'self-service' | 'lawyer-review' | 'full-service';

export type ServicePlan = {
  id: PlanId;
  name: string;
  subtitle: string;
  price: number;
  fee: string;
  recommended?: boolean;
  features: string[];
};

export type CaseStage = {
  key: string;
  title: string;
  description: string;
  status: 'done' | 'active' | 'todo';
  at?: string;
};

export type Assessment = {
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

export type LawCase = {
  id: string;
  debtorName: string;
  contactName: string;
  contactPhone: string;
  amount: number;
  contractDate: string;
  dispute: string;
  dueStatus: '已到期' | '部分到期' | '不确定';
  status: string;
  createdAt: string;
  caseNo: string;
  selectedPlan?: PlanId;
  evidence: EvidenceCategory[];
  assessment?: Assessment;
  stages: CaseStage[];
};

export type User = {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  user: User;
  expiresAt: string;
};

export type OtpResponse = {
  phone: string;
  mockCode: string;
  expiresAt: string;
};

export type CaseInput = {
  debtorName: string;
  contactName: string;
  contactPhone: string;
  amount: number;
  contractDate: string;
  dispute: string;
  dueStatus: '已到期' | '部分到期' | '不确定';
};
