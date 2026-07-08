import ky from 'ky';
import { useAuthStore } from '../state/authStore';
import type {
  AuthToken,
  CaseEvent,
  CreateCaseInput,
  HealthResponse,
  LawCase,
  OtpResponse,
  PlanId,
  User
} from './types';

const DEFAULT_API_BASE_URL = '/api/v1';

export function resolveApiBaseUrl(value: string | undefined) {
  const configured = value?.trim();
  if (!configured) return DEFAULT_API_BASE_URL;
  return configured.replace(/\/+$/, '') || '/';
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const api = ky.create({
  timeout: 30000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = useAuthStore.getState().token;
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
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

export async function getMe(): Promise<User> {
  const response = await api.get(apiUrl('/me')).json<{ user: User }>();
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
