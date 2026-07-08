import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveCaseDocument,
  archiveLawyerDocument,
  createLawyerDocument,
  createLawCase,
  evaluateCase,
  getCase,
  getCaseDocuments,
  getCaseWorkItems,
  getCases,
  getLawyerCaseDocuments,
  getLawyerTask,
  getLawyerTasks,
  getMe,
  getMessages,
  loginWithCode,
  markMessageRead,
  requestLoginCode,
  selectCasePlan,
  submitLawyerDocument,
  submitLawyerReview,
  updateLawyerDocument,
  uploadEvidence
} from '../lib/api';
import type { CreateDocumentInput, CreateCaseInput, LawCase, PlanId, SubmitReviewInput, UpdateDocumentInput } from '../lib/types';
import { useAuthStore } from '../state/authStore';

export const caseKeys = {
  me: ['me'] as const,
  messages: ['messages'] as const,
  lists: ['cases'] as const,
  detail: (caseId: string) => ['cases', caseId] as const,
  workItems: (caseId: string) => ['cases', caseId, 'work-items'] as const,
  documents: (caseId: string) => ['cases', caseId, 'documents'] as const,
  lawyerTasks: ['lawyer', 'tasks'] as const,
  lawyerTask: (taskId: string) => ['lawyer', 'tasks', taskId] as const,
  lawyerDocuments: (caseId: string) => ['lawyer', 'cases', caseId, 'documents'] as const
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

export function useMessagesQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.messages,
    queryFn: getMessages,
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

export function useCaseWorkItemsQuery(caseId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.workItems(caseId),
    queryFn: () => getCaseWorkItems(caseId),
    enabled: Boolean(token && caseId)
  });
}

export function useCaseDocumentsQuery(caseId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: caseKeys.documents(caseId),
    queryFn: () => getCaseDocuments(caseId),
    enabled: Boolean(token && caseId)
  });
}

export function useLawyerTasksQuery() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.lawyerTasks,
    queryFn: getLawyerTasks,
    enabled: Boolean(token && user?.role === 'lawyer')
  });
}

export function useLawyerTaskQuery(taskId: string) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.lawyerTask(taskId),
    queryFn: () => getLawyerTask(taskId),
    enabled: Boolean(token && user?.role === 'lawyer' && taskId)
  });
}

export function useLawyerCaseDocumentsQuery(caseId: string) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.lawyerDocuments(caseId),
    queryFn: () => getLawyerCaseDocuments(caseId),
    enabled: Boolean(token && user?.role === 'lawyer' && caseId)
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

export function useMarkMessageReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => markMessageRead(messageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.messages });
    }
  });
}

export function useApproveDocumentMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => approveCaseDocument(caseId, documentId),
    onSuccess: async (result) => {
      queryClient.setQueryData(caseKeys.detail(caseId), result.case);
      await queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
      await queryClient.invalidateQueries({ queryKey: caseKeys.messages });
    }
  });
}

export function useSubmitReviewMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitReviewInput) => submitLawyerReview(taskId, input),
    onSuccess: async (result) => {
      queryClient.setQueryData(caseKeys.detail(result.case.id), result.case);
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerTasks });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerTask(taskId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.messages });
    }
  });
}

export function useCreateDocumentMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => createLawyerDocument(caseId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerDocuments(caseId) });
    }
  });
}

export function useUpdateDocumentMutation(caseId: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDocumentInput) => updateLawyerDocument(caseId, documentId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerDocuments(caseId) });
    }
  });
}

export function useArchiveDocumentMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => archiveLawyerDocument(caseId, documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerDocuments(caseId) });
    }
  });
}

export function useSubmitDocumentMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => submitLawyerDocument(caseId, documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lawyerDocuments(caseId) });
      await queryClient.invalidateQueries({ queryKey: caseKeys.messages });
    }
  });
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
