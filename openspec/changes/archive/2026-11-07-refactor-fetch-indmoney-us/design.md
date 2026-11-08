# Design: Refactor fetch-indmoney-us for Canonical AccountHoldingsSnapshot

## Context

In the 4-tier decoupled architecture, Tier 1 skills are strictly responsible for account ingestion, credential management, and normalizing broker data into the canonical `AccountHoldingsSnapshot` contract. The existing `fetch-indmoney-us-stocks` combined ingestion with fundamental financial statement analysis and emitted non-standard payloads. This design refactors the capability into `.agents/skills/fetch-indmoney-us/` matching `config/investment_ways.yaml` (`account_id: "indmoney_us"`, `broker: "indmoney"`, `currency: "USD"`).

## Goals / Non-Goals

**Goals:**
- Implement dedicated Tier 1 Account Fetcher in `.agents/skills/fetch-indmoney-us/`.
- Emit canonical `AccountHoldingsSnapshot` JSON adhering to `account-holdings-snapshot.schema.json` with `currency: "USD"` and full fractional share support (`fractional_shares: true`).
- Extract cash ledger balances (`margin.available_cash`) and retain USD/INR exchange rate metadata.
- Generate a 100% offline self-contained HTML dashboard with dual USD/INR currency presentation and zero external network leaks (verified via `verifyHtmlSelfContainment`).
- Verify artifact pairs via `artifact_harness.js` (`verifyArtifactPair` with `schemaType: 'holdings'`).
- Maintain backward compatibility for existing scripts expecting outputs at `reports/indmoney-us-stocks.json`.

**Non-Goals:**
- Fundamental valuation mathematics (Graham number, Owner Earnings, Altman Z) — strictly isolated in Tier 3 analysis principles.
- Cross-account holding aggregation and strategy-level XIRR calculation — isolated in Tier 4 orchestrators (`way-long-term-strategy`).
- Interactive token renewal flow — addressed in Story 2.4 (`Snapshot Caching & Interactive Token Renewal Handler`).

## Decisions

### Decision 1: Canonical Skill Directory & Backward Compatibility Wrapper
- **Choice**: Scaffold `.agents/skills/fetch-indmoney-us/` as the primary canonical implementation matching `investment_ways.yaml`. Update `.agents/skills/fetch-indmoney-us-stocks/` as a backward-compatibility proxy delegating to the new canonical skill.
- **Rationale**: Aligns skill directory names with registered identifiers in the global manifest (`fetch-angelone`, `fetch-indmoney-us`) while preventing breakage of any legacy test or developer references.

### Decision 2: Dual Output Paths
- **Choice**: Write primary artifacts to `<out>/accounts/indmoney_us.json` and `<out>/accounts/indmoney_us.html`. Concurrently write `<out>/indmoney-us-stocks.json` and `<out>/indmoney-us-stocks.html` when `--out reports/` is used.
- **Rationale**: Standardizes multi-account layout (`accounts/<account_id>.*`) required by Tier 4 orchestrators while maintaining zero-friction upgrade paths for existing consumers.

### Decision 3: Fractional Share & FX Metadata Normalization
- **Choice**: US broker DriveWealth supports fractional shares (e.g. 12.5 shares). The normalizer sets `fractional_shares: true` whenever non-integer shares are held, and formats quantities with up to 4 decimal places. The USD/INR conversion rate is captured from MCP or default fallback (e.g. 87.20) and embedded into snapshot metadata so HTML dashboards can display dual USD/INR metrics without live forex requests.

### Decision 4: Tiered Offline Data Fallback
- **Choice**:
  1. If `--mock-data <path>` provided, load from path.
  2. If live MCP client is authenticated, fetch live data and update `.cache/us_stocks_cache.json`.
  3. If unauthenticated and cache exists, load cached data with a notice.
  4. If in test mode, fall back to `tests/fixtures/sample_us_holdings.json`.
- **Rationale**: Enables deterministic offline test execution and keeps local development fast and resilient to network dropouts.

## Risks / Trade-offs

- **[Risk]** Missing or expired MCP token causes run failure.
  - *Mitigation*: Gracefully catch auth errors, log an actionable renewal prompt, and fallback to local cache or fixtures when offline. Story 2.4 will layer interactive prompt renewal on top.
- **[Risk]** Currency conversion divergence between snapshots and downstream blending.
  - *Mitigation*: The snapshot explicitly records the exchange rate at snapshot capture time, ensuring downstream strategy calculations can reference the exact historical rate.

