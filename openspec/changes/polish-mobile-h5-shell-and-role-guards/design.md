## Context

The app is a mobile H5 legal workflow with three roles: client, lawyer, and admin. Login and registration already use brand assets under `apps/web/src/assets`, while authenticated pages still use standalone text headers, black hero cards, hard blue buttons, and inconsistent empty states.

The previous role-registration change introduced backend guards for admin and lawyer APIs. The remaining gap is mainly frontend route visibility: users can open page shells that their role should not use.

## Decisions

### Shared mobile shell polish

Use small shared H5 components for the brand header and empty states. Keep cards compact and utility-focused instead of turning the app into a marketing page. Reuse `brand-logo.png` and `login-hero.png`; do not introduce new assets.

### Role-aware frontend gating

`RootLayout` owns route gating because it already restores the session, knows the current path, and renders the bottom navigation. Route groups stay simple:
- public: login, registration, legal documents
- client: client case workflow routes
- lawyer: approved lawyer workspace routes
- pending/rejected lawyer: review status page
- admin: admin workspace routes
- shared authenticated: messages and profile

If a user opens a route outside the allowed group, redirect to that role's home route.

### Admin visibility

Admin is the highest operations role, but admin should not execute client/lawyer workflow actions as if they were another role. Admin receives admin-only case visibility through `/admin/cases` and an admin cases page.

### Messages

The source of truth remains the `/messages` API. The bottom navigation reads the same query and displays unread count. Empty message state stays honest: if there are no backend notifications, show an empty state and action hint rather than inventing notifications.

## Risks

- `RootLayout` redirects must not fight session restore before `user` is available.
- Admin navigation now has five items, so bottom nav must preserve tap target size and avoid label overflow.
- Existing dirty files must be edited carefully without reverting unrelated work.
