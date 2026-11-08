# Proposal: Implement provider-tickertape with Normalized Schema Transformation

## Why

In the decoupled 4-tier investment framework, Tier 3 Valuation Principles (`analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`, and `forensic-governance`) must operate on source-agnostic canonical financial data models with zero direct network or API dependencies. Currently, market data retrieval is fragmented and tightly coupled inside legacy evaluation scripts. Implementing `provider-tickertape` establishes a dedicated Tier 2 Market Data Provider capable of extracting, transforming, and normalizing multi-market (IN/US) equity fundamentals and Index ETF data into schema-compliant `NormalizedCompanyFinancials` JSON artifacts and self-contained offline HTML financial statement dashboards.

## What Changes

- **Scaffold `provider-tickertape` Skill**: Create `.agents/skills/provider-tickertape/` matching `config/investment_ways.yaml` (`markets: ["IN", "US"]`).
- **Canonical Schema Transformation**: Implement robust transformation logic converting raw Tickertape Pro metrics, income statements, balance sheets, cash flows, and forensic ratios into the canonical `NormalizedCompanyFinancials` schema (`validateNormalizedFinancials`).
- **Multi-Market Support (IN & US)**:
  - **Indian Equities (IN)**: Standardize NSE/BSE symbols, Crores/Absolute unit scaling, INR currency, promoter holdings, and pledge metrics.
  - **US Equities (US)**: Standardize NASDAQ/NYSE symbols, Millions/Absolute unit scaling, USD currency, and handle passive broad-market Index ETFs (`is_index_etf: true`).
- **100% Offline Self-Contained HTML Financial Dashboard**: Build `assets/financials-template.html` with inlined CSS, embedded SVGs, and zero external leaks, presenting interactive financial statement tabs, valuation multiples, and forensic indicators.
- **CLI & Ingestion Modes**: Provide `scripts/provider_tickertape.js` supporting single ticker mode (`--ticker <SYMBOL>`), market selection (`--market <IN|US>`), holdings ingestion (`--holdings <path>`), `--out <dir>`, `--refresh`, `--mock-data <path>`, and `--json-output`.
- **Outputs**: Generates `<out>/financials/<TICKER>.json` and `<out>/financials/<TICKER>.html` verified with `artifact_harness.js` (`verifyArtifactPair` with `schemaType: 'financials'`).
- **Verification & Test Suite**: Add unit and CLI test suite in `tests/provider_tickertape.test.js` validating schema compliance, market handling, ETF bypass, and offline self-containment.

## Capabilities

### New Capabilities
- `skills/provider-tickertape`: Tier 2 Market Data Provider ingesting and transforming raw Tickertape Pro market data into canonical `NormalizedCompanyFinancials` contracts and offline dashboards across Indian and US equities.

### Modified Capabilities
*(None; new capability introduced to complete Tier 2 ingestion).*

## Impact

- **Decoupling**: Fully separates market data ingestion from valuation mathematics (unblocking Tier 3 analysis suite in Epic 3).
- **Universal Contract**: Enforces Invariant 2 (Universal 1 JSON + 1 HTML pair verified by harness).
- **Downstream Consumer**: Directly unblocks Story 2.4 (Snapshot Caching & Token Renewal) and Epic 3 valuation engines.

