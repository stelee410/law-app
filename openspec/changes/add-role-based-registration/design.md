## Context

The current app has OTP login, persisted sessions, a `User` model with `client | lawyer`, and a shortcut that creates lawyers from phone numbers ending in `9999`. Frontend route guards and lawyer queries only inspect `user.role`. This change replaces the shortcut with explicit client registration, controlled lawyer onboarding, and admin-managed access.

The implementation must preserve the existing MVP case workflow while tightening access rules. The repository has both in-memory and Postgres stores, so the new behavior must be implemented in the `AppStore` protocol and both store implementations. No new runtime dependency is needed.

## Goals / Non-Goals

**Goals:**
- Introduce `client`, `lawyer`, and `admin` roles.
- Require explicit client registration before client case work.
- Require lawyer onboarding and admin approval before lawyer workspace/API access.
- Provide admin UI and APIs for global visibility, lawyer review, role updates, and account disable/restore.
- Support first-admin creation through startup environment variables and a backend operations command.
- Keep registration consent separate from case-material authorization.
- Preserve existing sessions for pending/rejected lawyers, while routing them to status-only UI.
- Immediately reject disabled accounts on authenticated requests.

**Non-Goals:**
- No full RBAC permission table in this change.
- No physical user or business-data deletion.
- No admin operation audit UI.
- No paid identity verification or external lawyer registry integration.
- No replacement of the existing OTP provider.

## Decisions

### Three roles with explicit account state

Use `UserRole = client | lawyer | admin`, plus `AccountStatus = active | disabled`. Lawyers also carry `LawyerReviewStatus = none | pending_review | approved | rejected`.

Alternative considered: full RBAC permissions. RBAC is more flexible but too broad for this MVP stage. The three-role model satisfies current operations needs and keeps test scope manageable.

### Login no longer creates arbitrary users

The `/auth/login` path only authenticates existing active accounts. User creation happens through explicit client registration, lawyer onboarding, admin bootstrap, or admin operations command.

Alternative considered: keep OTP login auto-registration for clients. That weakens the requirement for explicit registration and makes agreement consent ambiguous.

### Admin is highest privilege, not a separate app

Admin uses the same H5 frontend shell with role-aware navigation and admin routes. Admin APIs require `_get_current_admin`. Admin can view all users and business data, approve/reject lawyer applications, disable/restore accounts, and adjust roles.

Alternative considered: backend-only admin APIs. That would not meet the requirement for admin interface, menu, and permissions.

### Lawyer approval gates lawyer work, not login

Pending/rejected lawyers keep valid sessions. The frontend routes them to a review status page. The backend lawyer guard rejects access unless the user is active, has role `lawyer`, and has `lawyerReviewStatus == approved`.

Alternative considered: block login for unapproved lawyers. That hides review status and rejected reason from the user.

### Admin bootstrap supports environment and CLI

Startup reads `ADMIN_PHONE` and `ADMIN_NAME`; when both are present the store ensures an active admin user exists. A Python stdlib `argparse` command also creates or upgrades an admin manually.

Alternative considered: direct database edits. That is fragile for operations and bypasses application invariants.

### Legal documents are built-in frontend pages

The frontend adds static pages for service agreement, privacy policy, and case-material authorization. Registration forms link to service and privacy pages. Case creation links to case authorization and still requires the current case-level consent.

Alternative considered: external CMS links. Built-in pages keep the MVP self-contained and allow later text replacement.

## Data Model

Backend schema types in `apps/api/app/schemas.py`:
- `UserRole = Literal["client", "lawyer", "admin"]`
- `AccountStatus = Literal["active", "disabled"]`
- `LawyerReviewStatus = Literal["none", "pending_review", "approved", "rejected"]`
- `User` fields: `id`, `phone`, `name`, `role`, `accountStatus`, `lawyerReviewStatus`, `rejectedReason`, `lawFirm`, `licenseNumber`, `practiceRegion`, `specialties`, `createdAt`, `updatedAt`
- `ClientRegisterInput`: `phone`, `code`, `name`, `acceptedTerms`, `acceptedPrivacy`
- `LawyerOnboardingInput`: `phone`, `code`, `name`, `lawFirm`, `licenseNumber`, `practiceRegion`, `specialties`, `acceptedTerms`, `acceptedPrivacy`
- `AdminUpdateUserInput`: optional `role`, optional `accountStatus`
- `AdminReviewLawyerInput`: `status`, optional `rejectedReason`

Postgres columns in `users`:
- `account_status TEXT NOT NULL DEFAULT 'active'`
- `lawyer_review_status TEXT NOT NULL DEFAULT 'none'`
- `rejected_reason TEXT`
- `law_firm TEXT`
- `license_number TEXT`
- `practice_region TEXT`
- `specialties_json JSONB NOT NULL DEFAULT '[]'::jsonb`
- `updated_at TEXT`

## Backend Surface

New route functions in `apps/api/app/api/v1/routes.py`:
- `register_client(payload: ClientRegisterInput, store: AppStore)`
- `onboard_lawyer(payload: LawyerOnboardingInput, store: AppStore)`
- `_get_current_admin(current_user: User) -> User`
- `admin_users(current_admin: User, store: AppStore)`
- `admin_update_user(user_id: str, payload: AdminUpdateUserInput, current_admin: User, store: AppStore)`
- `admin_lawyer_applications(current_admin: User, store: AppStore)`
- `admin_review_lawyer(user_id: str, payload: AdminReviewLawyerInput, current_admin: User, store: AppStore)`
- Optional admin global case/document reads can be added under `/admin/*` only where needed for the admin UI.

Store protocol additions in `apps/api/app/store.py`:
- `register_client(input_data: ClientRegisterInput) -> AuthToken | None`
- `onboard_lawyer(input_data: LawyerOnboardingInput) -> AuthToken | None`
- `create_admin(phone: str, name: str) -> User`
- `list_admin_users() -> list[User]`
- `update_user_admin(user_id: str, input_data: AdminUpdateUserInput) -> User | None`
- `list_lawyer_applications() -> list[User]`
- `review_lawyer_application(user_id: str, input_data: AdminReviewLawyerInput) -> User | None`

## Frontend Surface

New or changed routes in `apps/web/src/router.tsx`:
- `/register/client`
- `/register/lawyer`
- `/lawyer/review-status`
- `/admin`
- `/admin/users`
- `/admin/lawyers`
- `/legal/terms`
- `/legal/privacy`
- `/legal/case-authorization`

Login page keeps OTP login and replaces demo buttons with formal registration/onboarding entries. Demo affordances remain behind `VITE_ENABLE_DEMO_LOGIN`, defaulting to hidden.

`RootLayout` routes active admins to admin UI, approved lawyers to lawyer UI, pending/rejected lawyers to review status, and clients to client routes. `BottomNav` adds an admin navigation set.

## Error Handling

- Invalid OTP returns `401 INVALID_CODE`.
- Unknown phone on login returns a clear non-registration error.
- Disabled account returns `403 ACCOUNT_DISABLED` and frontend clears session.
- Pending lawyer access returns `403 LAWYER_NOT_APPROVED`.
- Rejected lawyer access returns `403 LAWYER_REJECTED`.
- Non-admin admin access returns `403 FORBIDDEN`.
- Attempting to remove or disable the final active admin returns `409 LAST_ADMIN_REQUIRED`.
- Rejected lawyer review requires a non-empty rejection reason.

## Migration Plan

1. Add compatible `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements.
2. Backfill existing users as active.
3. Existing lawyer users become `lawyerReviewStatus = approved` to preserve current tests and local demo data.
4. Existing client users become `lawyerReviewStatus = none`.
5. Startup bootstrap creates or upgrades the configured admin user when env vars are present.
6. Rollback can ignore new columns; no destructive migration is required.

## Risks / Trade-offs

- Existing tests depend on phone suffix lawyer creation -> Update fixtures to create/approve lawyers explicitly or seed an approved lawyer helper.
- Admin global visibility exposes sensitive case data -> Limit global reads to admin-only guards and avoid physical deletion.
- Login no longer auto-creates users -> Provide explicit registration and clear frontend errors.
- Last admin can be disabled by mistake -> Block disabling or demoting the final active admin.
- Static legal text may not be final -> Keep pages centralized for later replacement.

## Open Questions

- Exact admin global data views can start with summary lists and expand during implementation if existing route structure makes a narrow read cheaper.
- The final public legal text will be replaced later; this change only needs usable built-in text pages.
