# Spec Delta: skills/fetch-angelone

## ADDED Requirements

### Requirement: Snapshot cache fallback and token renewal
The fetch-angelone skill SHALL intercept SmartAPI token expiration and network errors, prompting for credential renewal or falling back to the most recent cached snapshot with an alert banner.

#### Scenario: Graceful fallback on unreachable Angel One API
- **WHEN** Angel One SmartAPI is unreachable due to network failure or rate limits
- **THEN** the skill loads the latest cached holdings and generates `accounts/angelone.json` and `accounts/angelone.html` with an active cache alert banner

#### Scenario: SmartAPI JWT expiration handling
- **WHEN** SmartAPI returns a token expired or authentication error
- **THEN** the skill alerts the user with token renewal guidance and falls back to cached data if immediate renewal is not performed

