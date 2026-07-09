import ky from 'ky';
import { useAuthStore } from '../state/authStore';
import type {
  AdminOverview,
  AdminReviewLawyerInput,
  AdminUpdateUserInput,
  AuthToken,
  CaseEvent,
  ClientRegisterInput,
  CreateDocumentInput,
  CreateCaseInput,
  HealthResponse,
  LawyerServiceActionInput,
  LawyerOnboardingInput,
  LegalDocument,
  LawCase,
  NotificationMessage,
  OtpResponse,
  PasswordLoginInput,
  PlanId,
  ReviewOpinion,
  SelfServiceActionInput,
  SubmitReviewInput,
  UpdateDocumentInput,
  User,
  WorkItem
} from './types';

const DEFAULT_API_BASE_URL = '/api/v1';

export function resolveApiBaseUrl(value: string | undefined) {
  const configured = value?.trim();
  if (!configured) return DEFAULT_API_BASE_URL;
  return configured.replace(/\/+$/, '') || '/';
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const api = ky.create({
  baseUrl: typeof window === 'undefined' ? undefined : window.location.origin,
  timeout: 30000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = useAuthStore.getState().token;
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      }
    ],
    afterResponse: [
      async ({ response }) => {
        if (response.status !== 403) return response;
        const body = await response.clone().json<{ detail?: string }>().catch(() => undefined);
        if (body?.detail === 'ACCOUNT_DISABLED') {
          useAuthStore.getState().logout();
        }
        return response;
      }
    ]
  }
});

export function apiUrl(path: string) {
  const normalizedBase = API_BASE_URL === '/' ? '' : API_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function getHealth(): Promise<HealthResponse> {
  return api.get(apiUrl('/health')).json<HealthResponse>();
}

export async function requestLoginCode(phone: string): Promise<OtpResponse> {
  return api.post(apiUrl('/auth/request-code'), { json: { phone } }).json<OtpResponse>();
}

export async function loginWithCode(phone: string, code: string): Promise<AuthToken> {
  return api.post(apiUrl('/auth/login'), { json: { phone, code } }).json<AuthToken>();
}

export async function loginWithPassword(input: PasswordLoginInput): Promise<AuthToken> {
  return api.post(apiUrl('/auth/login/password'), { json: input }).json<AuthToken>();
}

export async function registerClient(input: ClientRegisterInput): Promise<AuthToken> {
  return api.post(apiUrl('/auth/register/client'), { json: input }).json<AuthToken>();
}

export async function onboardLawyer(input: LawyerOnboardingInput): Promise<AuthToken> {
  return api.post(apiUrl('/auth/onboard-lawyer'), { json: input }).json<AuthToken>();
}

export async function getMe(): Promise<User> {
  const response = await api.get(apiUrl('/me')).json<{ user: User }>();
  return response.user;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return api.get(apiUrl('/admin/overview')).json<AdminOverview>();
}

export async function getAdminCases(): Promise<LawCase[]> {
  const response = await api.get(apiUrl('/admin/cases')).json<{ cases: LawCase[] }>();
  return response.cases;
}

export async function getAdminUsers(): Promise<User[]> {
  const response = await api.get(apiUrl('/admin/users')).json<{ users: User[] }>();
  return response.users;
}

export async function updateAdminUser(userId: string, input: AdminUpdateUserInput): Promise<User> {
  const response = await api.patch(apiUrl(`/admin/users/${userId}`), { json: input }).json<{ user: User }>();
  return response.user;
}

export async function getAdminLawyerApplications(): Promise<User[]> {
  const response = await api.get(apiUrl('/admin/lawyers')).json<{ lawyers: User[] }>();
  return response.lawyers;
}

export async function reviewAdminLawyer(userId: string, input: AdminReviewLawyerInput): Promise<User> {
  const response = await api.post(apiUrl(`/admin/lawyers/${userId}/review`), { json: input }).json<{ user: User }>();
  return response.user;
}

export async function getCases(): Promise<LawCase[]> {
  const response = await api.get(apiUrl('/cases')).json<{ cases: LawCase[] }>();
  return response.cases;
}

export async function getCase(caseId: string): Promise<LawCase> {
  const response = await api.get(apiUrl(`/cases/${caseId}`)).json<{ case: LawCase }>();
  return response.case;
}

export async function createLawCase(input: CreateCaseInput): Promise<LawCase> {
  const response = await api.post(apiUrl('/cases'), { json: input }).json<{ case: LawCase }>();
  return response.case;
}

export async function uploadEvidence(caseId: string, categoryId: string, file: File): Promise<LawCase> {
  const formData = new FormData();
  formData.set('file', file);
  const response = await api
    .post(apiUrl(`/cases/${caseId}/evidence/${categoryId}`), { body: formData })
    .json<{ case: LawCase }>();
  return response.case;
}

export async function evaluateCase(caseId: string): Promise<LawCase> {
  const response = await api.post(apiUrl(`/cases/${caseId}/evaluate`)).json<{ case: LawCase }>();
  return response.case;
}

export async function selectCasePlan(caseId: string, planId: PlanId): Promise<LawCase> {
  const response = await api.post(apiUrl(`/cases/${caseId}/plan`), { json: { planId } }).json<{ case: LawCase }>();
  return response.case;
}

export async function recordSelfServiceAction(caseId: string, input: SelfServiceActionInput): Promise<LawCase> {
  const response = await api
    .post(apiUrl(`/cases/${caseId}/self-service/actions`), { json: input })
    .json<{ case: LawCase }>();
  return response.case;
}

export async function recordLawyerServiceAction(caseId: string, input: LawyerServiceActionInput): Promise<LawCase> {
  const response = await api
    .post(apiUrl(`/cases/${caseId}/lawyer-service/actions`), { json: input })
    .json<{ case: LawCase }>();
  return response.case;
}

export async function getMessages(): Promise<NotificationMessage[]> {
  const response = await api.get(apiUrl('/messages')).json<{ messages: NotificationMessage[] }>();
  return response.messages ?? [];
}

export async function markMessageRead(messageId: string): Promise<NotificationMessage> {
  const response = await api.post(apiUrl(`/messages/${messageId}/read`)).json<{ message: NotificationMessage }>();
  return response.message;
}

export async function getCaseWorkItems(caseId: string): Promise<WorkItem[]> {
  const response = await api.get(apiUrl(`/cases/${caseId}/work-items`)).json<{ workItems: WorkItem[] }>();
  return response.workItems;
}

export async function getCaseDocuments(caseId: string): Promise<LegalDocument[]> {
  const response = await api.get(apiUrl(`/cases/${caseId}/documents`)).json<{ documents: LegalDocument[] }>();
  return response.documents;
}

export async function approveCaseDocument(caseId: string, documentId: string): Promise<{ case: LawCase; document: LegalDocument }> {
  return api.post(apiUrl(`/cases/${caseId}/documents/${documentId}/approve`)).json<{ case: LawCase; document: LegalDocument }>();
}

export async function getLawyerTasks(): Promise<WorkItem[]> {
  const response = await api.get(apiUrl('/lawyer/tasks')).json<{ tasks: WorkItem[] }>();
  return response.tasks;
}

export async function getLawyerTask(taskId: string): Promise<{ task: WorkItem; case: LawCase }> {
  return api.get(apiUrl(`/lawyer/tasks/${taskId}`)).json<{ task: WorkItem; case: LawCase }>();
}

export async function getLawyerCaseDocuments(caseId: string): Promise<LegalDocument[]> {
  const response = await api.get(apiUrl(`/lawyer/cases/${caseId}/documents`)).json<{ documents: LegalDocument[] }>();
  return response.documents;
}

export async function getLawyerEvidenceFile(caseId: string, categoryId: string, fileId: string): Promise<Blob> {
  return api.get(apiUrl(`/lawyer/cases/${caseId}/evidence/${categoryId}/files/${fileId}`)).blob();
}

export async function submitLawyerReview(taskId: string, input: SubmitReviewInput): Promise<{ case: LawCase; workItem: WorkItem; review: ReviewOpinion }> {
  return api.post(apiUrl(`/lawyer/tasks/${taskId}/review`), { json: input }).json<{ case: LawCase; workItem: WorkItem; review: ReviewOpinion }>();
}

export async function createLawyerDocument(caseId: string, input: CreateDocumentInput): Promise<LegalDocument> {
  const response = await api.post(apiUrl(`/lawyer/cases/${caseId}/documents`), { json: input }).json<{ document: LegalDocument }>();
  return response.document;
}

export async function updateLawyerDocument(caseId: string, documentId: string, input: UpdateDocumentInput): Promise<LegalDocument> {
  const response = await api.patch(apiUrl(`/lawyer/cases/${caseId}/documents/${documentId}`), { json: input }).json<{ document: LegalDocument }>();
  return response.document;
}

export async function archiveLawyerDocument(caseId: string, documentId: string): Promise<LegalDocument> {
  const response = await api.delete(apiUrl(`/lawyer/cases/${caseId}/documents/${documentId}`)).json<{ document: LegalDocument }>();
  return response.document;
}

export async function submitLawyerDocument(caseId: string, documentId: string): Promise<LegalDocument> {
  const response = await api.post(apiUrl(`/lawyer/cases/${caseId}/documents/${documentId}/submit`)).json<{ document: LegalDocument }>();
  return response.document;
}

export function parseCaseEvent(caseId: string, eventName: string, rawData: string): CaseEvent | undefined {
  if (!rawData.trim()) return undefined;
  try {
    const parsed = JSON.parse(rawData) as Partial<CaseEvent>;
    return {
      caseId,
      type: (parsed.type as CaseEvent['type']) ?? (eventName as CaseEvent['type']),
      title: parsed.title ?? '案件状态更新',
      message: parsed.message ?? rawData,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      id: parsed.id,
      payload: parsed.payload
    };
  } catch {
    return {
      caseId,
      type: eventName === 'message' ? 'case.updated' : (eventName as CaseEvent['type']),
      title: '案件状态更新',
      message: rawData,
      createdAt: new Date().toISOString()
    };
  }
}
