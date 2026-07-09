import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveCaseDocument,
  archiveLawyerDocument,
  createLawyerDocument,
  createLawCase,
  evaluateCase,
  getAdminCases,
  getAdminLawyerApplications,
  getAdminOverview,
  getAdminUsers,
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
  loginWithPassword,
  markMessageRead,
  onboardLawyer,
  recordSelfServiceAction,
  requestLoginCode,
  registerClient,
  reviewAdminLawyer,
  selectCasePlan,
  submitLawyerDocument,
  submitLawyerReview,
  updateAdminUser,
  updateLawyerDocument,
  uploadEvidence
} from '../lib/api';
import type {
  AdminReviewLawyerInput,
  AdminUpdateUserInput,
  ClientRegisterInput,
  CreateDocumentInput,
  CreateCaseInput,
  LawCase,
  LawyerOnboardingInput,
  PasswordLoginInput,
  PlanId,
  SelfServiceActionInput,
  SubmitReviewInput,
  UpdateDocumentInput
} from '../lib/types';
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
  lawyerDocuments: (caseId: string) => ['lawyer', 'cases', caseId, 'documents'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminCases: ['admin', 'cases'] as const,
  adminUsers: ['admin', 'users'] as const,
  adminLawyers: ['admin', 'lawyers'] as const
};

function isApprovedLawyer(user: ReturnType<typeof useAuthStore.getState>['user']) {
  return user?.role === 'lawyer' && user.lawyerReviewStatus === 'approved';
}

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
    enabled: Boolean(token && isApprovedLawyer(user))
  });
}

export function useLawyerTaskQuery(taskId: string) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.lawyerTask(taskId),
    queryFn: () => getLawyerTask(taskId),
    enabled: Boolean(token && isApprovedLawyer(user) && taskId)
  });
}

export function useLawyerCaseDocumentsQuery(caseId: string) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.lawyerDocuments(caseId),
    queryFn: () => getLawyerCaseDocuments(caseId),
    enabled: Boolean(token && isApprovedLawyer(user) && caseId)
  });
}

export function useAdminOverviewQuery() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.adminOverview,
    queryFn: getAdminOverview,
    enabled: Boolean(token && user?.role === 'admin')
  });
}

export function useAdminCasesQuery() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.adminCases,
    queryFn: getAdminCases,
    enabled: Boolean(token && user?.role === 'admin')
  });
}

export function useAdminUsersQuery() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.adminUsers,
    queryFn: getAdminUsers,
    enabled: Boolean(token && user?.role === 'admin')
  });
}

export function useAdminLawyersQuery() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: caseKeys.adminLawyers,
    queryFn: getAdminLawyerApplications,
    enabled: Boolean(token && user?.role === 'admin')
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
    mutationFn: (input: ({ mode: 'code'; code: string } | { mode: 'password'; password: string }) & { phone: string }) => {
      if (input.mode === 'password') {
        const passwordInput: PasswordLoginInput = { phone: input.phone, password: input.password };
        return loginWithPassword(passwordInput);
      }
      return loginWithCode(input.phone, input.code);
    },
    onSuccess: async (session) => {
      setSession(session);
      queryClient.setQueryData(caseKeys.me, session.user);
      queryClient.removeQueries({ queryKey: caseKeys.lists });
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
    }
  });
}

export function useRegisterClientMutation() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (input: ClientRegisterInput) => registerClient(input),
    onSuccess: async (session) => {
      setSession(session);
      queryClient.setQueryData(caseKeys.me, session.user);
      await queryClient.invalidateQueries({ queryKey: caseKeys.lists });
    }
  });
}

export function useOnboardLawyerMutation() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (input: LawyerOnboardingInput) => onboardLawyer(input),
    onSuccess: (session) => {
      setSession(session);
      queryClient.setQueryData(caseKeys.me, session.user);
    }
  });
}

export function useUpdateAdminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AdminUpdateUserInput }) => updateAdminUser(userId, input),
    onSuccess: async (user) => {
      queryClient.setQueryData(caseKeys.adminUsers, (users: unknown) =>
        Array.isArray(users) ? users.map((item) => (typeof item === 'object' && item !== null && 'id' in item && item.id === user.id ? user : item)) : users
      );
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminUsers });
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminLawyers });
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminOverview });
    }
  });
}

export function useReviewAdminLawyerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AdminReviewLawyerInput }) => reviewAdminLawyer(userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminUsers });
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminLawyers });
      await queryClient.invalidateQueries({ queryKey: caseKeys.adminOverview });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: PlanId) => selectCasePlan(caseId, planId),
    onSuccess: async (lawCase) => {
      queryClient.setQueryData(caseKeys.detail(caseId), lawCase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: caseKeys.lists }),
        queryClient.invalidateQueries({ queryKey: caseKeys.workItems(caseId) }),
        queryClient.invalidateQueries({ queryKey: caseKeys.documents(caseId) }),
        queryClient.invalidateQueries({ queryKey: caseKeys.messages })
      ]);
    }
  });
}

export function useRecordSelfServiceActionMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SelfServiceActionInput) => recordSelfServiceAction(caseId, input),
    onSuccess: async (lawCase) => {
      queryClient.setQueryData(caseKeys.detail(caseId), lawCase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: caseKeys.lists }),
        queryClient.invalidateQueries({ queryKey: caseKeys.workItems(caseId) }),
        queryClient.invalidateQueries({ queryKey: caseKeys.messages })
      ]);
    }
  });
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
