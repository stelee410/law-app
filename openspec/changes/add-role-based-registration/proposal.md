## Why

The MVP currently creates users implicitly during OTP login and uses a phone suffix rule to grant lawyer access. That is unsafe for production because clients need explicit registration consent, lawyers need controlled onboarding, and operations need an admin role to review access and manage accounts.

## What Changes

- Add explicit client registration with phone OTP, name, service agreement consent, and privacy policy consent.
- Add lawyer onboarding with phone OTP, profile fields, service agreement consent, privacy policy consent, and review status.
- Remove the phone-suffix lawyer shortcut; logging in no longer creates arbitrary lawyer users.
- Add an `admin` role with highest access, admin UI navigation, user management, lawyer application review, and global business data visibility.
- Support admin bootstrap from environment variables and a backend `create-admin` operations command.
- Add account disable/restore and role update controls without physical deletion.
- Make disabled accounts lose access immediately on subsequent authenticated requests.
- Gate lawyer workspace and lawyer APIs on `lawyerReviewStatus == "approved"`.
- Preserve sessions for pending or rejected lawyer users and show review status instead of the lawyer workspace.
- Replace login-page demo buttons with formal `Client Registration` and `Lawyer Onboarding` entries.
- Add a frontend environment switch for any demo-login affordance; default behavior hides demo entry points.
- Add built-in frontend pages for service agreement, privacy policy, and case-material authorization.
- Preserve case-level material authorization when creating a case, separate from platform registration consent.
- No admin operation audit UI in this change.

## Capabilities

### New Capabilities

- `role-based-registration`: Client registration, lawyer onboarding, OTP-based identity confirmation, account status, and role-aware access gates.
- `admin-user-management`: Admin role bootstrap, admin UI access, user account status management, role management, lawyer application review, and global data visibility.
- `legal-consent-documents`: Platform agreement consent, privacy policy consent, case-material authorization, and built-in frontend document pages.

### Modified Capabilities

- None. The existing repository has no committed OpenSpec capability specs yet.

## Impact

- Backend schemas, store protocol, in-memory store, Postgres store, auth routes, lawyer guards, admin routes, startup bootstrap, and operations CLI.
- Frontend user types, API client, query/mutation hooks, route tree, login page, registration pages, lawyer status page, admin pages, bottom navigation, and legal document pages.
- PostgreSQL schema compatibility migration through `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Tests for backend API authorization and frontend route/UI behavior.
- No new runtime dependencies are required.
