# Specification: framework/snapshot-caching-token-renewal

## Purpose

Provides a centralized framework for detecting provider authentication expiration, guiding interactive token renewal, and executing graceful fallback to local cached snapshots with prominent offline dashboard alert banners.

## Requirements

### Requirement: Authentication error detection
The system SHALL inspect API, MCP, and HTTP errors to reliably identify token expiration, authentication failure, or invalid session signatures across supported providers (angelone, indmoney, tickertape).

#### Scenario: Expired JWT or 401 Unauthorized detection
- **WHEN** an API or MCP client returns HTTP 401, 403, "jwt expired", "token invalid", or "unauthorized"
- **THEN** `detectAuthError(service, error)` returns an object with `isAuthError: true` and the normalized provider name

#### Scenario: Non-auth error passed through
- **WHEN** an error is caused by a generic socket timeout, DNS failure, or JSON syntax error
- **THEN** `detectAuthError(service, error)` returns `isAuthError: false`

### Requirement: Interactive and guided token renewal instructions
The system SHALL format step-by-step renewal guidance for the detected service and provide an interactive renewal interface to prompt the user for refreshed credentials.

#### Scenario: Guided CLI prompt formatting
- **WHEN** token renewal is requested for a service
- **THEN** `formatRenewalInstructions(service)` returns formatted instructions detailing required credentials and generation steps

#### Scenario: Non-interactive environment fallback
- **WHEN** running in a non-TTY environment and auth fails
- **THEN** the system logs the renewal instructions to stderr and exits cleanly or signals cache fallback

### Requirement: Automated credential and environment persistence
The system SHALL persist renewed credentials into the corresponding local `.env` or provider configuration file idempotently without mangling existing comments or formatting.

#### Scenario: Update environment variable in .env
- **WHEN** fresh credentials are provided for Angel One or INDmoney
- **THEN** `updateEnvCredentials(updates, envPath)` updates the target keys in `.env` while preserving other contents

#### Scenario: Persist OAuth token to JSON config
- **WHEN** fresh tokens are provided for Tickertape
- **THEN** `saveServiceCredentials(service, credentials)` safely persists them to the service tokens configuration file

### Requirement: Graceful snapshot caching fallback
The system SHALL fallback to the most recent valid local cached snapshot when upstream broker or data provider requests fail due to network errors, rate limits, or unrenewed authentication.

#### Scenario: Cached snapshot fallback on network failure
- **WHEN** a provider request encounters a network error and a valid local cache exists
- **THEN** the system loads the cached data, marks the result as cached, and proceeds with artifact generation

#### Scenario: Error reported when no cached snapshot exists
- **WHEN** a provider request fails and no valid cache file exists
- **THEN** the system raises a descriptive error explaining that upstream is unreachable and no cache is available

### Requirement: Top-level cached snapshot warning banner
The system SHALL inject a prominent top-level alert banner into offline HTML dashboards when rendering fallback cached data, indicating the original snapshot timestamp and provider reachability status.

#### Scenario: Offline dashboard warning banner rendering
- **WHEN** an HTML dashboard is generated from a fallback cached snapshot
- **THEN** the dashboard includes an alert banner stating `[WARNING] Cached Snapshot Active: Data as of YYYY-MM-DD HH:MM:SS. Upstream provider unreachable`

#### Scenario: Complete offline self-containment with zero external assets
- **WHEN** the warning banner is injected into the HTML dashboard
- **THEN** all banner styles use inline CSS with zero external network leaks or font dependencies

