## Why

The registration and login entry points now have a clearer brand treatment, but the authenticated H5 app still exposes early MVP UI patterns across client, lawyer, and admin pages. The app also lets users open route shells outside their role, relying on query guards or backend APIs to hide data.

This creates three visible problems:
- Client, lawyer, and admin pages feel inconsistent with the updated login/registration experience.
- The bottom navigation does not show unread message state.
- Non-admin and non-lawyer users can still see admin/lawyer page shells through direct URLs.

## What Changes

- Refresh the mobile H5 shell and shared cards/empty states across client, lawyer, and admin surfaces.
- Add role-aware frontend route gating so each role lands on its own workspace.
- Add a bottom navigation unread badge for client/lawyer message entries.
- Add admin-only case list visibility in the admin UI.
- Keep business state machines and document permissions unchanged.

## Non-Goals

- No new RBAC permission table.
- No new image or runtime dependency.
- No physical deletion or admin audit log.
- No change to case workflow side effects, lawyer document status rules, or plan selection rules.
