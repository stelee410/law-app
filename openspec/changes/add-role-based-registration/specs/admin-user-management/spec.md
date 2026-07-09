## ADDED Requirements

### Requirement: Admin role has highest access
The system SHALL support an `admin` role that can access admin UI and admin APIs with global business visibility.

#### Scenario: Admin opens admin workspace
- **WHEN** an active admin logs in
- **THEN** the frontend routes the admin to an admin workspace with admin navigation

#### Scenario: Non-admin requests admin data
- **WHEN** a non-admin authenticated user requests an admin API
- **THEN** the system rejects the request with a forbidden error

### Requirement: Admin bootstrap
The system SHALL support first-admin creation through startup environment variables and through a backend operations command.

#### Scenario: Startup admin bootstrap
- **WHEN** the API starts with admin phone and admin name environment variables configured
- **THEN** the system ensures an active admin user exists for that phone

#### Scenario: Operations command creates admin
- **WHEN** an operator runs the backend create-admin command with phone and name
- **THEN** the system creates or upgrades that user to an active admin account

### Requirement: Admin manages lawyer applications
The system SHALL let admins list pending lawyer applications and approve or reject lawyer access.

#### Scenario: Admin approves lawyer
- **WHEN** an admin approves a pending lawyer application
- **THEN** the system sets that user to role `lawyer` with review status `approved`

#### Scenario: Admin rejects lawyer
- **WHEN** an admin rejects a pending lawyer application with a reason
- **THEN** the system sets that user's lawyer review status to `rejected` and stores the rejection reason

### Requirement: Admin manages user roles and account status
The system SHALL let admins update user roles and disable or restore accounts without physical deletion.

#### Scenario: Admin disables user
- **WHEN** an admin disables a user account
- **THEN** the account remains stored and subsequent authenticated requests from that user are rejected

#### Scenario: Admin restores user
- **WHEN** an admin restores a disabled user account
- **THEN** the user can authenticate and access routes allowed by their role and review status

#### Scenario: Admin changes user role
- **WHEN** an admin changes a user's role
- **THEN** the system persists the new role and applies role-aware routing and API guards

### Requirement: Final active admin protection
The system SHALL prevent an admin action from leaving the system without at least one active admin.

#### Scenario: Disable final admin
- **WHEN** an admin attempts to disable the final active admin account
- **THEN** the system rejects the operation with `LAST_ADMIN_REQUIRED`

#### Scenario: Demote final admin
- **WHEN** an admin attempts to change the final active admin to a non-admin role
- **THEN** the system rejects the operation with `LAST_ADMIN_REQUIRED`

### Requirement: Admin global business visibility
The system SHALL provide admin-only visibility into business records needed for operations.

#### Scenario: Admin views global case data
- **WHEN** an active admin opens the admin workspace
- **THEN** the system exposes admin-only summaries or lists of users and relevant case workflow data

#### Scenario: Non-admin views global case data
- **WHEN** a client or lawyer attempts to access admin global data
- **THEN** the system rejects the request with a forbidden error
