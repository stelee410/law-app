import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AssessmentPage } from './routes/AssessmentPage';
import { CaseDetailPage } from './routes/CaseDetailPage';
import { CasesPage } from './routes/CasesPage';
import { EvidencePage } from './routes/EvidencePage';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { LawyerDashboardPage } from './routes/LawyerDashboardPage';
import { LawyerDocumentEditorPage } from './routes/LawyerDocumentEditorPage';
import { LawyerTaskPage } from './routes/LawyerTaskPage';
import { MessagesPage } from './routes/MessagesPage';
import { NewCasePage } from './routes/NewCasePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PlanPage } from './routes/PlanPage';
import { ProfilePage } from './routes/ProfilePage';
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  newCaseRoute,
  casesRoute,
  caseDetailRoute,
  evidenceRoute,
  assessmentRoute,
  planRoute,
  lawyerDashboardRoute,
  lawyerTaskRoute,
  lawyerDocumentRoute,
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
