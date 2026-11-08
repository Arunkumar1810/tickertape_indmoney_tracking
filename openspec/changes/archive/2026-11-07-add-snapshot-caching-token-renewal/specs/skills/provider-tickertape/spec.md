# Spec Delta: skills/provider-tickertape

## ADDED Requirements

### Requirement: Snapshot cache fallback and token renewal
The provider-tickertape skill SHALL intercept Tickertape Pro auth expiration and network errors, prompting for OAuth token renewal or falling back to the most recent cached financial data with an alert banner.

#### Scenario: Graceful fallback on unreachable Tickertape API
- **WHEN** Tickertape Pro API or MCP is unreachable due to network outage or rate limiting
- **THEN** the skill loads the latest cached financials and generates `financials/<TICKER>.json` and `financials/<TICKER>.html` with an active cache alert banner

#### Scenario: Tickertape auth token expiration handling
- **WHEN** Tickertape requests fail with 401 Unauthorized or expired token errors
- **THEN** the skill alerts the user with token renewal guidance and falls back to cached data if immediate renewal is not performed

