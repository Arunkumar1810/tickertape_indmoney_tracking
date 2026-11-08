# Proposal: Snapshot Caching & Interactive Token Renewal Handler

## Why

External market data providers and broker APIs (Angel One SmartAPI, INDmoney MCP, Tickertape Pro) are subject to intermittent network dropouts, rate limiting, and routine token/session expirations (JWT expiration, OAuth token expiration, invalid TOTP). In the absence of a standardized fallback protocol, an upstream outage or expired session halts the entire portfolio analysis pipeline and degrades user experience with opaque error traces.

Implementing local snapshot fallback ensures uninterrupted operation by gracefully serving the most recent valid snapshot while injecting a prominent alert banner in the offline HTML dashboard. Pairing this with a standardized, interactive token renewal handler gives users step-by-step guidance in CLI/chat to refresh expired credentials and automatically persists them into local environment configuration. This closes the final requirement of Story 2.4 and completes Epic 2 (`Tier 1 & Tier 2 Ingestion Pipelines`).

## What Changes

- Implement `.agents/shared/framework/auth_manager.js` providing:
  - `detectAuthError(service, error)`: Unified detection of expired JWTs, HTTP 401/403 status codes, and invalid session signatures across Angel One, INDmoney, and Tickertape Pro.
  - `formatRenewalInstructions(service, options)`: Formats step-by-step renewal instructions tailored to the specific provider and configuration source.
  - `updateEnvCredentials(updates, envPath)`: Idempotently updates or appends key-value pairs in `.env` without mangling existing comments or formatting.
  - `saveServiceCredentials(service, credentials, options)`: Persists refreshed credentials into `.env` or provider-specific configuration files (`tokens.json`).
  - `promptTokenRenewal(service, options)`: Interactive CLI prompt (when stdin is TTY) guiding credential entry and verification, with non-interactive fallback.
- Provide a standardized CLI utility `.agents/shared/framework/renew_token.js` (`renew-token`) supporting interactive and argument-driven renewal for Angel One, INDmoney, and Tickertape.
- Export all `auth_manager` APIs via `.agents/shared/framework/index.js`.
- Update `fetch-angelone`, `fetch-indmoney-us`, and `provider-tickertape`:
  - Intercept network errors, HTTP 429/5xx, and auth failures, falling back to local cached snapshots.
  - When fallback is active, inject a prominent warning banner into the self-contained HTML dashboard:
    `[WARNING] Cached Snapshot Active: Data as of YYYY-MM-DD HH:MM:SS. Upstream provider unreachable.`
  - When authentication fails, trigger `auth_manager` detection and display actionable renewal instructions before falling back to cached snapshots.
- Add comprehensive test suite in `.agents/shared/framework/tests/auth_manager.test.js` validating auth error detection, instruction formatting, credential persistence, cache fallback, and alert banner rendering.

## Capabilities

### New Capabilities
- `framework/snapshot-caching-token-renewal`: Standardized snapshot caching fallback and interactive token renewal handler ensuring graceful degradation upon provider/network outage and interactive credential recovery upon auth failure.

### Modified Capabilities
- `skills/fetch-angelone`: Integrate snapshot caching fallback with offline alert banner and interactive token renewal prompt on SmartAPI auth failure.
- `skills/fetch-indmoney-us`: Integrate snapshot caching fallback with offline alert banner and interactive token renewal prompt on INDmoney MCP auth failure.
- `skills/provider-tickertape`: Integrate snapshot caching fallback with offline alert banner and interactive token renewal prompt on Tickertape auth failure.

## Impact

- Adds `.agents/shared/framework/auth_manager.js` and `.agents/shared/framework/renew_token.js`.
- Updates `.agents/shared/framework/index.js` to re-export auth management utilities.
- Enhances `.agents/skills/fetch-angelone/scripts/fetch_angelone.js`, `.agents/skills/fetch-indmoney-us/scripts/fetch_indmoney_us.js`, and `.agents/skills/provider-tickertape/scripts/provider_tickertape.js` with graceful cache fallback and banner injection.
- Preserves Invariant 2 (Universal "1 JSON + 1 HTML" Contract) with 100% offline self-containment and zero external asset leaks.
- Completes Story 2.4 and finishes Epic 2 (`epic-ingestion-pipelines`), unlocking Epic 3 (`epic-valuation-suite`).

