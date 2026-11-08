# Tasks: Snapshot Caching & Interactive Token Renewal Handler

## 1. Centralized Auth Manager & Token Renewal CLI

- [x] 1.1 Implement `.agents/shared/framework/auth_manager.js` providing `detectAuthError`, `formatRenewalInstructions`, `updateEnvCredentials`, `saveServiceCredentials`, and `promptTokenRenewal`, and re-export them in `.agents/shared/framework/index.js`.
- [x] 1.2 Implement CLI renewal utility `.agents/shared/framework/renew_token.js` supporting `--service <angelone|indmoney|tickertape>`, argument-driven credential updates, and interactive TTY prompting.
- [x] 1.3 Add unit tests in `.agents/shared/framework/tests/auth_manager.test.js` covering error detection (401/403/JWT), renewal instructions, idempotent `.env` updates, and CLI parameter parsing; verify with `node --test .agents/shared/framework/tests/auth_manager.test.js`.

## 2. Ingestion Skill Integration & Alert Banner Injection

- [x] 2.1 Update `.agents/skills/fetch-angelone/scripts/fetch_angelone.js` to invoke `auth_manager` on SmartAPI auth errors, fall back to local cached snapshots on upstream failures, and render the prominent cache warning banner in `accounts/angelone.html`.
- [x] 2.2 Update `.agents/skills/fetch-indmoney-us/scripts/fetch_indmoney_us.js` to invoke `auth_manager` on INDmoney MCP auth errors, fall back to local cached snapshots on upstream failures, and render the prominent cache warning banner in `accounts/indmoney.html`.
- [x] 2.3 Update `.agents/skills/provider-tickertape/scripts/provider_tickertape.js` and `financials-template.html` to invoke `auth_manager` on Tickertape auth errors, fall back to cached financials on upstream failures, and render the prominent cache warning banner in `financials/<TICKER>.html`.

## 3. Full Verification & Invariant 2 Parity

- [x] 3.1 Add integration tests in skill test suites validating cached fallback behavior, warning banner injection, and zero external network leaks using `artifact_harness.js`.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and verify all tests pass with zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 2.4 complete in BMad initiative board.
- Complete Epic 2 (`Tier 1 & Tier 2 Ingestion Pipelines`) and transition to Epic 3.

