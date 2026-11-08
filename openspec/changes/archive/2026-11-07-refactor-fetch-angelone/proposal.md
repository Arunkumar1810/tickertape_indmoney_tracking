# Proposal

## Why

Under the 4-tier Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), Tier 1 Account Fetchers must focus strictly on broker authentication, demat holdings retrieval, and cash ledger extraction without performing valuation math or emitting ad-hoc scoring metrics. Refactoring the Angel One fetcher into `fetch-angelone` (bound in `config/investment_ways.yaml` under `accounts.angelone`) and establishing the canonical `AccountHoldingsSnapshot` contract provides downstream strategy orchestrators (`way-long-term-strategy`) with a pure, standardized portfolio snapshot and an offline self-contained HTML dashboard.

## What Changes

- Define `.agents/shared/framework/schemas/account-holdings-snapshot.schema.json` (draft-07 JSON Schema) establishing the canonical Tier 1 account snapshot format across Indian and US broker accounts (`account_id`, `broker`, `currency`, `timestamp`, `summary`, `margin`, `holdings`).
- Implement `validateAccountHoldingsSnapshot(payload)` in `.agents/shared/framework/contract_validator.js` and register schema type `'holdings'` in `.agents/shared/framework/artifact_harness.js`.
- Refactor the Angel One fetcher into `.agents/skills/fetch-angelone/` with CLI script `scripts/fetch_angelone.js` that:
  - Connects to Angel One SmartAPI (or local cache / fixtures).
  - Normalizes equity positions and cash margins into the canonical `AccountHoldingsSnapshot` format.
  - Generates `accounts/angelone.json` and a self-contained offline HTML dashboard `accounts/angelone.html`.
  - Supports `--broker angelone`, `--out <dir>`, `--refresh`, and `--only <ticker>`.
  - Validates output pairs using `.agents/shared/framework/artifact_harness.js`.
- Add test suite `.agents/skills/fetch-angelone/tests/fetch_angelone.test.js` verifying snapshot generation, schema compliance, offline HTML rendering, and single-ticker filtering.

## Capabilities

### New Capabilities
- `skills/fetch-angelone`: Tier 1 broker account fetcher for Angel One, emitting canonical `AccountHoldingsSnapshot` JSON and self-contained offline HTML dashboards.

### Modified Capabilities
<!-- None -->

## Impact

- Extends `.agents/shared/framework/` with `schemas/account-holdings-snapshot.schema.json` and adds `'holdings'` validation support.
- Establishes `.agents/skills/fetch-angelone/` matching `config/investment_ways.yaml` (`accounts.angelone.skill: "fetch-angelone"`).
- Leaves legacy `fetch-lts` intact while providing a migration/compatibility wrapper.
- Completes Story 2.1 and unblocks Story 2.2 (`fetch-indmoney-us`), Story 2.4 (`snapshot caching & token renewal`), and Epic 4 orchestrators.

