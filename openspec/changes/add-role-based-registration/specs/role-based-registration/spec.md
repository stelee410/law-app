## ADDED Requirements

### Requirement: Explicit client registration
The system SHALL require clients to create an account through an explicit registration flow before they can start client case work.

#### Scenario: Client registers with consent
- **WHEN** a visitor submits a valid phone OTP, name, service agreement consent, and privacy policy consent
- **THEN** the system creates or updates an active client account and returns an authenticated session

#### Scenario: Client registration without consent
- **WHEN** a visitor submits client registration without service agreement consent or privacy policy consent
- **THEN** the system rejects the registration and does not create an authenticated session

### Requirement: Login does not implicitly create users
The system SHALL authenticate existing users through phone OTP login and MUST NOT create a new user from the login endpoint.

#### Scenario: Existing user logs in
- **WHEN** an existing active user submits a valid phone OTP to the login endpoint
- **THEN** the system returns an authenticated session for that user

#### Scenario: Unknown phone logs in
- **WHEN** a phone number with no registered account submits a valid OTP to the login endpoint
- **THEN** the system rejects the login with a clear non-registration error

### Requirement: Lawyer onboarding requires review
The system SHALL allow lawyer applicants to submit onboarding details and MUST set new lawyer accounts to pending review until an admin approves them.

#### Scenario: Lawyer submits onboarding
- **WHEN** a visitor submits valid phone OTP, name, law firm, license number, practice region, specialties, service agreement consent, and privacy policy consent
- **THEN** the system creates or updates a lawyer account with review status `pending_review` and returns an authenticated session

#### Scenario: Pending lawyer opens the app
- **WHEN** a pending lawyer has an authenticated session
- **THEN** the frontend shows a review status page instead of the lawyer workspace

### Requirement: Approved lawyer access
The system SHALL allow only active lawyers with review status `approved` to access lawyer workspace routes and lawyer APIs.

#### Scenario: Approved lawyer accesses lawyer tasks
- **WHEN** an active lawyer with review status `approved` requests lawyer tasks
- **THEN** the system returns the lawyer task data

#### Scenario: Pending lawyer accesses lawyer tasks
- **WHEN** an active lawyer with review status `pending_review` requests lawyer tasks
- **THEN** the system rejects the request with a lawyer-not-approved error

#### Scenario: Rejected lawyer accesses lawyer tasks
- **WHEN** an active lawyer with review status `rejected` requests lawyer tasks
- **THEN** the system rejects the request and the frontend shows the rejected reason when available

### Requirement: Disabled account access is blocked
The system SHALL reject authenticated requests from disabled accounts and force the frontend session to clear.

#### Scenario: Disabled user requests profile
- **WHEN** a disabled user with an existing token requests `/me`
- **THEN** the system rejects the request and the frontend clears its local session

### Requirement: Login page formal entry points
The frontend SHALL keep phone OTP login and replace demo buttons with formal client registration and lawyer onboarding entries.

#### Scenario: Visitor opens login page
- **WHEN** a visitor opens the login page
- **THEN** the page shows phone OTP login plus client registration and lawyer onboarding entry points

#### Scenario: Demo entries hidden by default
- **WHEN** the frontend demo-login environment switch is not enabled
- **THEN** the login page does not show client demo or lawyer demo actions
