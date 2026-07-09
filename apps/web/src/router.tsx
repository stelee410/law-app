import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AdminCasesPage, AdminDashboardPage, AdminLawyersPage, AdminUsersPage } from './routes/AdminPages';
import { AssessmentPage } from './routes/AssessmentPage';
import { CaseDetailPage } from './routes/CaseDetailPage';
import { CasesPage } from './routes/CasesPage';
import { EvidencePage } from './routes/EvidencePage';
import { HomePage } from './routes/HomePage';
import { CaseAuthorizationPage, PrivacyPage, TermsPage } from './routes/LegalDocumentPages';
import { LoginPage } from './routes/LoginPage';
import { LawyerDashboardPage } from './routes/LawyerDashboardPage';
import { LawyerDocumentEditorPage } from './routes/LawyerDocumentEditorPage';
import { LawyerReviewStatusPage } from './routes/LawyerReviewStatusPage';
import { LawyerTaskPage } from './routes/LawyerTaskPage';
import { MessagesPage } from './routes/MessagesPage';
import { NewCasePage } from './routes/NewCasePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PlanPage } from './routes/PlanPage';
import { ProfilePage } from './routes/ProfilePage';
import { ClientRegistrationPage, LawyerOnboardingPage } from './routes/RegistrationPages';
import { RootLayout } from './routes/RootLayout';

const rootRoute = createRootRoute({
  component: RootLayout
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage
});

const clientRegistrationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'register/client',
  component: ClientRegistrationPage
});

const lawyerOnboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'register/lawyer',
  component: LawyerOnboardingPage
});

const newCaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases/new',
  component: NewCasePage
});

const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases',
  component: CasesPage
});

const caseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases/$caseId',
  component: CaseDetailPage
});

const evidenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases/$caseId/evidence',
  component: EvidencePage
});

const assessmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases/$caseId/assessment',
  component: AssessmentPage
});

const planRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cases/$caseId/plans',
  component: PlanPage
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'me',
  component: ProfilePage
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'messages',
  component: MessagesPage
});

const lawyerDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lawyer',
  component: LawyerDashboardPage
});

const lawyerReviewStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lawyer/review-status',
  component: LawyerReviewStatusPage
});

const lawyerTaskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lawyer/tasks/$taskId',
  component: LawyerTaskPage
});

const lawyerDocumentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lawyer/cases/$caseId/documents/$documentId',
  component: LawyerDocumentEditorPage
});

const adminDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin',
  component: AdminDashboardPage
});

const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin/users',
  component: AdminUsersPage
});

const adminCasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin/cases',
  component: AdminCasesPage
});

const adminLawyersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin/lawyers',
  component: AdminLawyersPage
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'legal/terms',
  component: TermsPage
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'legal/privacy',
  component: PrivacyPage
});

const caseAuthorizationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'legal/case-authorization',
  component: CaseAuthorizationPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  clientRegistrationRoute,
  lawyerOnboardingRoute,
  newCaseRoute,
  casesRoute,
  caseDetailRoute,
  evidenceRoute,
  assessmentRoute,
  planRoute,
  lawyerDashboardRoute,
  lawyerReviewStatusRoute,
  lawyerTaskRoute,
  lawyerDocumentRoute,
  adminDashboardRoute,
  adminCasesRoute,
  adminUsersRoute,
  adminLawyersRoute,
  termsRoute,
  privacyRoute,
  caseAuthorizationRoute,
  messagesRoute,
  profileRoute
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultNotFoundComponent: NotFoundPage
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
