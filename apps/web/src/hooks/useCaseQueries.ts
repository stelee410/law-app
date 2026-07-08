import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLawCase,
  evaluateCase,
  getCase,
  getCases,
  getMe,
  loginWithCode,
  requestLoginCode,
  selectCasePlan,
  uploadEvidence
} from '../lib/api';
import type { CreateCaseInput, LawCase, PlanId } from '../lib/types';
import { useAuthStore } from '../state/authStore';

export const caseKeys = {
  me: ['me'] as const,
  lists: ['cases'] as const,
  detail: (caseId: string) => ['cases', caseId] as const
};

export function useMeQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.me,
    queryFn: getMe,
    enabled: Boolean(token)
  });
}

export function useCasesQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.lists,
    queryFn: getCases,
    enabled: Boolean(token)
  });
}

export function useCaseQuery(caseId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.detail(caseId),
    queryFn: () => getCase(caseId),
    enabled: Boolean(token && caseId)
  });
}

export function useRequestCodeMutation() {
  return useMutation({
    mutationFn: (phone: string) => requestLoginCode(phone)
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) => loginWithCode(phone, code),
    onSuccess: async (session) => {
      setSession(session);
      queryClient.setQueryData(caseKeys.me, session.user);
      queryClient.removeQueries({ queryKey: caseKeys.lists });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
    }
  });
}

export function useCreateCaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaseInput) => createLawCase(input),
    onSuccess: async (lawCase) => {
      queryClient.setQueryData(caseKeys.detail(lawCase.id), lawCase);
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
    }
  });
}

export function useUploadEvidenceMutation(caseId: string) {
  return useCaseMutation(caseId, ({ categoryId, file }: { categoryId: string; file: File }) =>
    uploadEvidence(caseId, categoryId, file)
  );
}

export function useEvaluateCaseMutation(caseId: string) {
  return useCaseMutation(caseId, () => evaluateCase(caseId));
}

export function useSelectPlanMutation(caseId: string) {
  return useCaseMutation(caseId, (planId: PlanId) => selectCasePlan(caseId, planId));
}

function useCaseMutation<TInput>(caseId: string, mutationFn: (input: TInput) => Promise<LawCase>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (lawCase) => {
      queryClient.setQueryData(caseKeys.detail(caseId), lawCase);
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
    }
  });
}
