# Design: Implement provider-tickertape with Normalized Schema Transformation

## Context

In the 4-tier decoupled architecture, Tier 2 Market Data Providers bridge raw vendor APIs and Tier 3 Analysis Principles. Under Invariant 3 (Source-Agnostic Principle Isolation), valuation principles must have zero broker or network dependencies, receiving only canonical `NormalizedCompanyFinancials` contracts. This design establishes `.agents/skills/provider-tickertape/` matching `config/investment_ways.yaml` (`data_providers: provider-tickertape`, `markets: ["IN", "US"]`).

## Goals / Non-Goals

**Goals:**
- Implement dedicated Tier 2 Market Data Provider in `.agents/skills/provider-tickertape/`.
- Transform raw Tickertape Pro data into canonical `NormalizedCompanyFinancials` draft-07 JSON Schema.
- Support both Indian (`IN`, INR, `CRORES`) and US (`US`, USD, `MILLIONS`) equity markets.
- Recognize passive broad-market Index ETFs (`is_index_etf: true`) and bypass single-company financial statement constraints without validation failure.
- Provide single-ticker (`--ticker <SYMBOL>`), holdings ingestion (`--holdings <path>`), and mock (`--mock-data <path>`) execution modes.
- Output `<out>/financials/<TICKER>.json` and `<out>/financials/<TICKER>.html` passing `artifact_harness.js` verification with 0 external network leaks.

**Non-Goals:**
- Valuation modeling or stance determination (Graham, Lynch, Buffett-Munger, Klarman) — isolated in Tier 3.
- Forensic accounting veto short-circuiting — isolated in Tier 3 `forensic-governance`.
- Interactive OAuth token renewal UX — addressed in Story 2.4.

## Decisions

### Decision 1: Transformation Pipeline & Scale Normalization
- **Choice**: The normalizer inspects the target market (`IN` or `US`):
  - For Indian stocks: Uses INR currency and `CRORES` unit scaling, extracting Tickertape SID metrics, income statements, balance sheets, cash flows, and promoter pledge forensics.
  - For US stocks: Uses USD currency and `MILLIONS` unit scaling, extracting GAAP 10-K statements and market multiples.
- **Rationale**: Aligns with domestic reporting standards while preserving numerical precision across different international accounting frameworks.

### Decision 2: Index ETF Detection & Nullable Statements
- **Choice**: Security classification checks a known index ETF registry (e.g. `VOO`, `QQQ`, `SPY`, `IVV`, `VTI`, `RSP`, `NIFTYBEES`) or sector metadata (`Index ETF`). For ETFs, `is_index_etf` is set to `true`, and single-company statement sections (`income_statement`, `balance_sheet`, `cash_flow`, `forensics`) are set to `null`.
- **Rationale**: Downstream valuation pillars immediately recognize ETFs as passive index anchors without failing forensic single-stock audits.

### Decision 3: Cascading Tiered Offline Cache
- **Choice**:
  1. Explicit `--mock-data <path>` takes highest precedence.
  2. If live client session is active, fetch from Tickertape Pro MCP / HTTP and update `.cache/<MARKET>/<TICKER>.json`.
  3. If offline or unauthenticated, check `.cache/`.
  4. Fallback to existing historical caches in `fundamental-stock-analysis/cache/` (for Indian stocks) and `fundamental-us-stock-analysis/.cache/` (for US stocks).
  5. Fallback to test fixtures in `tests/fixtures/`.
- **Rationale**: Guarantees zero-network deterministic testing in CI/CD while allowing developers to work seamlessly offline.

### Decision 4: Output Organization
- **Choice**: Output artifacts per ticker into `<out>/financials/<TICKER>.json` and `<out>/financials/<TICKER>.html`.
- **Rationale**: Matches Invariant 2 requirements and provides a structured directory format for Tier 3 principles and Tier 4 orchestrators to read.

## Risks / Trade-offs

- **[Risk]** Missing or non-reported statement fields from vendor for specific tickers.
  - *Mitigation*: In `NormalizedCompanyFinancials`, all statement sub-fields are nullable (`["number", "null"]`). If a metric is omitted by Tickertape, it defaults safely to `null`.
- **[Risk]** Ambiguous ticker symbols between Indian and US markets (e.g. conflicting symbols).
  - *Mitigation*: Require `--market <IN|US>` when running single-ticker mode, or infer market automatically when ingesting from `accounts/angelone.json` (`IN`) or `accounts/indmoney_us.json` (`US`).

