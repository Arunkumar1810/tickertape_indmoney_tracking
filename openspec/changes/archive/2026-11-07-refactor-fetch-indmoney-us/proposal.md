# Proposal: Refactor fetch-indmoney-us for Canonical AccountHoldingsSnapshot

## Why

In the current repository, `fetch-indmoney-us-stocks` couples broker account fetching directly with fundamental valuation analysis, violating the 4-tier decoupled architecture and failing to emit the canonical `AccountHoldingsSnapshot` contract. To enable the Tier 4 orchestrator (`way-long-term-strategy`) to seamlessly aggregate, blend, and calculate cross-border strategy returns across domestic and US portfolios, `fetch-indmoney-us` must be refactored into a dedicated Tier 1 Broker Account Fetcher.

## What Changes

- **Refactor `fetch-indmoney-us` Skill**: Establish `.agents/skills/fetch-indmoney-us/` conforming to `config/investment_ways.yaml` (`account_id: "indmoney_us"`, `broker: "indmoney"`, `currency: "USD"`).
- **Canonical Schema Conformance**: Generate `AccountHoldingsSnapshot` JSON adhering strictly to `account-holdings-snapshot.schema.json` with fractional share precision, volume-weighted purchase costs, unrealized P&L, portfolio weight percentages, cash ledger accounting, and USD/INR conversion rate metadata.
- **Decouple Valuation Logic**: Strip single-company fundamental valuation audits out of the fetcher tier, reserving analysis exclusively for Tier 3 principles (`analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`, `forensic-governance`).
- **100% Offline Self-Contained HTML Dashboard**: Implement `assets/report-template.html` displaying portfolio equity, cash margins, holding weights, and dual-currency figures (USD and INR at live/cached FX conversion) with inlined CSS, embedded SVGs, and zero external network leaks (satisfying Invariant 2).
- **CLI & Standard Execution**: Provide `scripts/fetch_indmoney_us.js` supporting `--broker indmoney`, `--out <dir>`, `--refresh`, `--only <ticker>`, `--mock-data <file>`, and `--json-output`. Outputs artifacts to `accounts/indmoney_us.json` and `accounts/indmoney_us.html`.
- **Harness Verification & Testing**: Verify outputs with `artifact_harness.js` (`verifyArtifactPair` with schema `'holdings'`) and add unit and CLI test coverage in `tests/fetch_indmoney_us.test.js`.

## Capabilities

### New Capabilities
- `skills/fetch-indmoney-us`: Tier 1 broker fetcher capability obtaining INDmoney US equity holdings, fractional shares, cash balances, and USD/INR exchange rates, emitting canonical `AccountHoldingsSnapshot` JSON and offline HTML dashboards.

### Modified Capabilities
*(None; this is a new canonical capability specification matching the modular framework architecture).*

## Impact

- **Ingestion Pipeline**: Provides the standard US equity holdings source for Tier 4 orchestrators and Tier 3 valuation runs.
- **Architecture**: Enforces Invariant 1 (Strict Account Partitioning) and Invariant 2 (Universal 1 JSON + 1 HTML pair verified by harness).
- **Backwards Compatibility**: Can produce compatibility aliases/symlinks for existing workflows expecting `reports/indmoney-us-stocks.json`.

