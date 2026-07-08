## ADDED Requirements

### Requirement: Platform registration consent
The system SHALL require service agreement and privacy policy consent during client registration and lawyer onboarding.

#### Scenario: Client registration consent links
- **WHEN** a visitor opens the client registration page
- **THEN** the page provides links to service agreement and privacy policy pages next to unchecked consent controls

#### Scenario: Lawyer onboarding consent links
- **WHEN** a visitor opens the lawyer onboarding page
- **THEN** the page provides links to service agreement and privacy policy pages next to unchecked consent controls

### Requirement: Built-in legal document pages
The frontend SHALL provide built-in pages for service agreement, privacy policy, and case-material authorization text.

#### Scenario: User opens service agreement
- **WHEN** a user opens `/legal/terms`
- **THEN** the frontend displays the built-in service agreement text

#### Scenario: User opens privacy policy
- **WHEN** a user opens `/legal/privacy`
- **THEN** the frontend displays the built-in privacy policy text

#### Scenario: User opens case authorization
- **WHEN** a user opens `/legal/case-authorization`
- **THEN** the frontend displays the built-in case-material authorization text

### Requirement: Case-material authorization remains separate
The system SHALL preserve case-level authorization when a client creates a case, separate from registration consent.

#### Scenario: Client creates case with authorization
- **WHEN** a client submits a new case with case-material authorization consent
- **THEN** the system accepts the case when all other case validation passes

#### Scenario: Client creates case without authorization
- **WHEN** a client submits a new case without case-material authorization consent
- **THEN** the system rejects the case and does not create case records

### Requirement: Consent controls are explicit
The frontend SHALL present consent controls as explicit unchecked choices rather than pre-selected consent.

#### Scenario: Registration form opens
- **WHEN** a visitor opens a registration or onboarding form
- **THEN** the agreement and privacy consent controls are not checked by default

#### Scenario: Case form opens
- **WHEN** a client opens the case creation form
- **THEN** the case-material authorization control is not checked by default
