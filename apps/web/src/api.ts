import type { AuthSession, CaseInput, LawCase, OtpResponse, PlanId, User } from './types';

const baseUrl = import.meta.env.VITE_API_URL ?? '';
const tokenKey = 'law-ai-token';

export function getAuthToken(): string {
  return localStorage.getItem(tokenKey) ?? '';
}

export function setAuthToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearAuthToken() {
  localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function requestLoginCode(phone: string): Promise<OtpResponse> {
  return request<OtpResponse>('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ phone })
  });
}

export async function loginWithCode(phone: string, code: string): Promise<AuthSession> {
  const session = await request<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, code })
  });
  setAuthToken(session.token);
  return session;
}

export async function getMe(): Promise<User> {
  const data = await request<{ user: User }>('/api/me');
  return data.user;
}

export async function getCases(): Promise<LawCase[]> {
  const data = await request<{ cases: LawCase[] }>('/api/cases');
  return data.cases;
}

export async function createLawCase(input: CaseInput): Promise<LawCase> {
  const data = await request<{ case: LawCase }>('/api/cases', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  return data.case;
}

export async function uploadEvidence(caseId: string, categoryId: string, file: File): Promise<LawCase> {
  const form = new FormData();
  form.append('file', file);
  const data = await request<{ case: LawCase }>(`/api/cases/${caseId}/evidence/${categoryId}`, {
    method: 'POST',
    body: form
  });
  return data.case;
}

export async function evaluateCase(caseId: string): Promise<LawCase> {
  const data = await request<{ case: LawCase }>(`/api/cases/${caseId}/evaluate`, {
    method: 'POST'
  });
  return data.case;
}

export async function selectPlan(caseId: string, planId: PlanId): Promise<LawCase> {
  const data = await request<{ case: LawCase }>(`/api/cases/${caseId}/plan`, {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  return data.case;
}
