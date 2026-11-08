# Spec Delta: skills/fetch-indmoney-us

## ADDED Requirements

### Requirement: Snapshot cache fallback and token renewal
The fetch-indmoney-us skill SHALL intercept INDmoney MCP session expiration and network errors, prompting for OAuth token renewal or falling back to the most recent cached snapshot with an alert banner.

#### Scenario: Graceful fallback on unreachable INDmoney MCP
- **WHEN** INDmoney MCP server is unreachable due to network outage or server downtime
- **THEN** the skill loads the latest cached US holdings and generates `accounts/indmoney.json` and `accounts/indmoney.html` with an active cache alert banner

#### Scenario: INDmoney session expiration handling
- **WHEN** INDmoney MCP requests fail with 401 Unauthorized or expired token errors
- **THEN** the skill alerts the user with token renewal guidance and falls back to cached data if immediate renewal is not performed

