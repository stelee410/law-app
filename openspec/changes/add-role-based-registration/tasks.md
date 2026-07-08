## 1. Backend Data Model

- [x] 1.1 Extend `apps/api/app/schemas.py` with admin role, account status, lawyer review status, expanded `User`, and registration/admin input models.
- [x] 1.2 Extend `apps/api/app/core/schema.py` with compatible `users` table columns and backfill-safe defaults.
- [x] 1.3 Update row conversion helpers in `apps/api/app/store.py` to read and write expanded user fields.
- [x] 1.4 Remove the phone-suffix lawyer shortcut and replace it with explicit account creation paths.

## 2. Backend Store Behavior

- [x] 2.1 Extend the `AppStore` protocol with client registration, lawyer onboarding, admin bootstrap, user management, and lawyer review methods.
- [x] 2.2 Implement the new account methods in `InMemoryStore`.
- [x] 2.3 Implement the new account methods in `PostgresStore`.
- [x] 2.4 Enforce final-active-admin protection for disable and demotion operations.
- [x] 2.5 Ensure disabled users are rejected on token lookup or authenticated request handling.

## 3. Backend API And Operations

- [x] 3.1 Add `/auth/register/client` and `/auth/onboard-lawyer` routes.
- [x] 3.2 Add `_get_current_admin` and update `_get_current_lawyer` to require approved active lawyers.
- [x] 3.3 Add admin user list, account update, lawyer application list, and lawyer review routes.
- [x] 3.4 Add admin-only global business visibility routes needed by the admin UI.
- [x] 3.5 Add startup admin bootstrap from `ADMIN_PHONE` and `ADMIN_NAME`.
- [x] 3.6 Add `apps/api/app/cli.py` with a stdlib `create-admin` operations command.

## 4. Frontend API And State

- [x] 4.1 Extend `apps/web/src/lib/types.ts` with role, account status, lawyer review status, expanded user, and admin/register input types.
- [x] 4.2 Extend `apps/web/src/lib/api.ts` with registration, lawyer onboarding, admin user, admin review, and legal-document route support.
- [x] 4.3 Extend `apps/web/src/hooks/useCaseQueries.ts` with registration, onboarding, admin user, and admin review mutations/queries.
- [x] 4.4 Update auth/session handling so disabled-account responses clear local auth state.

## 5. Frontend Routes And UI

- [x] 5.1 Update `apps/web/src/router.tsx` with client registration, lawyer onboarding, lawyer review status, admin, admin users, admin lawyers, and legal document routes.
- [x] 5.2 Update `apps/web/src/routes/LoginPage.tsx` to keep OTP login and replace demo buttons with client registration and lawyer onboarding links.
- [x] 5.3 Add a frontend demo-login environment switch and keep demo affordances hidden by default.
- [x] 5.4 Add client registration route UI with name, phone, OTP, agreement consent, and privacy consent.
- [x] 5.5 Add lawyer onboarding route UI with required lawyer profile fields, OTP, agreement consent, and privacy consent.
- [x] 5.6 Add lawyer review status route UI for pending and rejected lawyers.
- [x] 5.7 Add admin workspace and admin bottom navigation.
- [x] 5.8 Add admin user management UI for role update and disable/restore.
- [x] 5.9 Add admin lawyer review UI for approve/reject with rejection reason.
- [x] 5.10 Add built-in service agreement, privacy policy, and case-material authorization pages.
- [x] 5.11 Keep case creation authorization separate from registration consent and link to the authorization page.

## 6. Backend Tests

- [x] 6.1 Add API tests for explicit client registration and required consent.
- [x] 6.2 Add API tests proving login does not create unknown users.
- [x] 6.3 Add API tests for lawyer onboarding pending status and denied lawyer API access.
- [x] 6.4 Add API tests for admin approval enabling lawyer API access.
- [x] 6.5 Add API tests for admin rejection and rejected reason visibility.
- [x] 6.6 Add API tests for account disable causing authenticated access rejection.
- [x] 6.7 Add API tests for admin role updates and final-active-admin protection.
- [x] 6.8 Update existing lawyer closed-loop tests to create or approve lawyer users explicitly.

## 7. Frontend Tests

- [x] 7.1 Add tests for login page registration/onboarding entry labels and hidden demo actions.
- [x] 7.2 Add tests for client registration consent validation.
- [x] 7.3 Add tests for lawyer onboarding fields and pending review routing.
- [x] 7.4 Add tests for rejected lawyer status display.
- [x] 7.5 Add tests for admin navigation and admin user management surfaces.
- [x] 7.6 Add tests that legal document pages are reachable.
- [x] 7.7 Add tests that disabled-account API errors clear session.

## 8. Verification

- [x] 8.1 Run `pnpm test`.
- [x] 8.2 Run `pnpm typecheck`.
- [x] 8.3 Run `pnpm lint`.
- [x] 8.4 Run `pnpm build`.
- [x] 8.5 Review implementation against proposal, design, specs, and this task list.
