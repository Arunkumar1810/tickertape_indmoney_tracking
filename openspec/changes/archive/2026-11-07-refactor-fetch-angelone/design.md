# Design

## Context

In Epic 1, the framework established declarative manifest validation (`manifest_validator.js`), company financial schemas (`normalized-company-financials.schema.json`), valuation verdict contracts (`uniform-verdict.schema.json`), and the universal artifact verification harness (`artifact_harness.js`). Story 2.1 implements the Tier 1 broker account fetcher for Angel One (`fetch-angelone`), decoupling account position ingestion from valuation math.

See `proposal.md` for motivation and `specs/skills/fetch-angelone/spec.md` for normative requirements.

## Goals / Non-Goals

**Goals:**
- Define `.agents/shared/framework/schemas/account-holdings-snapshot.schema.json` as the shared contract for all Tier 1 broker fetchers.
- Implement `validateAccountHoldingsSnapshot(payload)` in `contract_validator.js` and register `'holdings'` schema support in `artifact_harness.js`.
- Build `.agents/skills/fetch-angelone/` with `scripts/fetch_angelone.js` outputting `accounts/angelone.json` and a self-contained offline `accounts/angelone.html`.
- Enforce Invariant 2 (Universal "1 JSON + 1 HTML" Contract) verified automatically by `artifact_harness.js`.

**Non-Goals:**
- Fundamental valuation scoring (P/E multiples, Graham numbers, DuPont ROE) — delegated to Tier 3 valuation pillars.
- Interactive terminal JWT renewal prompts — covered in Story 2.4 (`Snapshot Caching & Interactive Token Renewal Handler`).
- Multi-account portfolio blending — covered in Epic 4 Story 4.1.

## Decisions

### 1. Canonical `AccountHoldingsSnapshot` Contract
- **Decision**: Define a draft-07 JSON Schema requiring:
  - Top-level: `account_id`, `broker`, `currency` (e.g., `"INR"`), `timestamp`.
  - `summary`: `total_invested`, `total_current_value`, `unrealized_pnl`, `unrealized_pnl_pct`, `available_cash`, `total_account_equity`, `holdings_count`.
  - `margin`: `available_cash`, `collateral`, `utilised`, `net_margin`.
  - `holdings`: array of holdings (`ticker`, `name`, `isin`, `exchange`, `quantity`, `average_price`, `cmp`, `invested_value`, `current_value`, `unrealized_pnl`, `unrealized_pnl_pct`, `weight_pct`, optional `fractional_shares`, optional `buy_date`).
- **Rationale**: Standardizes holding fields across both Angel One and INDmoney US accounts so Tier 4 strategy engines can ingest them agnostically.

### 2. Standalone Skill Directory: `fetch-angelone`
- **Decision**: Author `.agents/skills/fetch-angelone/` matching `config/investment_ways.yaml` (`accounts.angelone.skill: "fetch-angelone"`).
- **Rationale**: Clean separation from legacy `fetch-lts`, while allowing `fetch-lts` to optionally delegate to `fetch-angelone`.

### 3. Verification Harness Integration
- **Decision**: Use `artifact_harness.verifyArtifactPair` within `fetch_angelone.js` post-run check and test suites to verify that `accounts/angelone.json` matches `'holdings'` schema and `accounts/angelone.html` has zero external network leaks.

## Risks / Trade-offs

- **[Risk] Broker API disconnection or expired session during tests** → **Mitigation**: Support deterministic offline fixture loading and local snapshot cache fallback so tests and offline workflows remain 100% reliable.

## Migration Plan

1. Create `.agents/shared/framework/schemas/account-holdings-snapshot.schema.json`.
2. Add `validateAccountHoldingsSnapshot` to `contract_validator.js` and register `'holdings'` in `artifact_harness.js`.
3. Scaffold `.agents/skills/fetch-angelone/` with `SKILL.md`, `scripts/fetch_angelone.js`, and `assets/report-template.html`.
4. Create `.agents/skills/fetch-angelone/tests/fetch_angelone.test.js` and verify with `node --test`.

