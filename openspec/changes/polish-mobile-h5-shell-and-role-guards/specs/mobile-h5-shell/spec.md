## ADDED Requirements

### Requirement: Role routes show only authorized workspaces
The frontend SHALL prevent authenticated users from viewing route shells that do not belong to their role.

#### Scenario: Client opens admin route
- **WHEN** a client directly opens an admin route
- **THEN** the frontend redirects the client to the client workspace

#### Scenario: Client opens lawyer route
- **WHEN** a client directly opens an approved-lawyer workspace route
- **THEN** the frontend redirects the client to the client workspace

#### Scenario: Pending lawyer opens lawyer workspace
- **WHEN** a pending or rejected lawyer opens an approved-lawyer workspace route
- **THEN** the frontend redirects the lawyer to the review status page

#### Scenario: Admin opens client route
- **WHEN** an admin directly opens a client workflow route
- **THEN** the frontend redirects the admin to the admin workspace

### Requirement: Bottom navigation exposes unread messages
The frontend SHALL show unread notification count on message navigation entries for roles that have a message tab.

#### Scenario: User has unread messages
- **WHEN** a client or approved lawyer has unread messages
- **THEN** the bottom navigation shows a visible unread badge on the message tab

### Requirement: Admin can view global cases
The system SHALL provide admin-only case visibility in the admin workspace.

#### Scenario: Admin views cases
- **WHEN** an active admin opens the admin cases page
- **THEN** the frontend shows globally visible cases returned by the admin API

#### Scenario: Non-admin requests admin cases
- **WHEN** a non-admin authenticated user requests the admin cases API
- **THEN** the backend rejects the request with a forbidden error

### Requirement: Authenticated H5 surfaces use consistent mobile UI
The authenticated client, lawyer, and admin surfaces SHALL use consistent mobile-friendly headers, cards, empty states, and action buttons.

#### Scenario: Client opens main app pages
- **WHEN** a client opens home, case list, messages, profile, or case workflow pages
- **THEN** those pages use the updated shared mobile H5 visual patterns

#### Scenario: Lawyer opens workspace pages
- **WHEN** an approved lawyer opens lawyer workspace pages
- **THEN** those pages use the updated shared mobile H5 visual patterns

#### Scenario: Admin opens operations pages
- **WHEN** an admin opens admin workspace pages
- **THEN** those pages use the updated shared mobile H5 visual patterns
