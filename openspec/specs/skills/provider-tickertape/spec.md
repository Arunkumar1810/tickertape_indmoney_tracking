# Specification: provider-tickertape Skill

## Purpose

Defines the `provider-tickertape` skill as a dedicated Tier 2 Market Data Provider, ingesting raw Tickertape Pro market data, balance sheets, income statements, and cash flows across Indian (IN) and US (US) equities, and transforming them into canonical `NormalizedCompanyFinancials` JSON artifacts and self-contained offline HTML dashboards.

## Requirements

### Requirement: Canonical NormalizedCompanyFinancials output
The system SHALL ingest and transform company data into the canonical `NormalizedCompanyFinancials` draft-07 JSON Schema (`ticker`, `name`, `market`, `currency`, `timestamp`, `market_data`, and financial statement sections).

#### Scenario: Standard Indian equity normalization
- **WHEN** the skill runs for an Indian equity (e.g. `INFY` with market `IN`)
- **THEN** it outputs a JSON file conforming to `NormalizedCompanyFinancials` with `market: "IN"`, `currency: "INR"`, and populated `income_statement`, `balance_sheet`, and `cash_flow`

#### Scenario: Standard US equity normalization
- **WHEN** the skill runs for a US equity (e.g. `AAPL` with market `US`)
- **THEN** it outputs a JSON file conforming to `NormalizedCompanyFinancials` with `market: "US"`, `currency: "USD"`, and populated GAAP financial statements

### Requirement: Multi-market currency and unit scaling
The system SHALL support Indian (`IN` / `INR` / `CRORES`) and US (`US` / `USD` / `MILLIONS`) jurisdictions, normalizing raw figures to consistent unit scales with proper exchange attribution.

#### Scenario: Indian market figures in Crores
- **WHEN** Indian financial statements are processed
- **THEN** monetary statement values are scaled consistently and `unit_scale` is recorded as `CRORES` or `ABSOLUTE`

#### Scenario: US market figures in Millions
- **WHEN** US GAAP financial statements are processed
- **THEN** monetary statement values are scaled consistently and `unit_scale` is recorded as `MILLIONS` or `ABSOLUTE`

### Requirement: Passive Index ETF handling
The system SHALL identify passive broad-market Index ETFs (such as `VOO`, `QQQ`, `SPY`, `IVV`, `VTI`), setting `is_index_etf: true`, populating market data, and permitting null single-company financial statements.

#### Scenario: Index ETF normalization
- **WHEN** the skill processes an Index ETF ticker
- **THEN** `is_index_etf` is set to `true`, `market_data.cmp` is populated, and single-company statement fields are set to `null` without schema validation errors

### Requirement: Standalone offline HTML financial dashboard
The system SHALL generate a self-contained offline HTML report per ticker displaying valuation multiples, financial statements, and forensics with inline CSS, embedded SVGs, and zero external network asset dependencies.

#### Scenario: Offline statement viewing
- **WHEN** the generated HTML report is viewed offline via `file://`
- **THEN** all KPI cards, statement tables, and ratio tabs render without making external network requests

#### Scenario: Verification harness conformance
- **WHEN** the generated JSON and HTML pair is verified by `artifact_harness.js`
- **THEN** the verification harness returns `ok: true` with zero external leak errors

### Requirement: CLI execution and ingestion modes
The provider-tickertape CLI SHALL support `--ticker <SYMBOL>`, `--market <IN|US>`, `--holdings <path>`, `--out <dir>`, `--refresh`, `--mock-data <path>`, and `--json-output`, writing `financials/<TICKER>.json` and `financials/<TICKER>.html`.

#### Scenario: Single ticker execution
- **WHEN** executed with `--ticker INFY --market IN`
- **THEN** it generates `financials/INFY.json` and `financials/INFY.html` in the output directory and exits with code 0

#### Scenario: Holdings snapshot ingestion mode
- **WHEN** executed with `--holdings accounts/angelone.json`
- **THEN** it extracts distinct tickers from the snapshot and generates financial artifacts for each held position

#### Scenario: Offline mock data execution
- **WHEN** executed with `--mock-data <path>`
- **THEN** it normalizes the mock fixture without initiating external network or MCP calls

### Requirement: Snapshot cache fallback and token renewal
The provider-tickertape skill SHALL intercept Tickertape Pro auth expiration and network errors, prompting for OAuth token renewal or falling back to the most recent cached financial data with an alert banner.

#### Scenario: Graceful fallback on unreachable Tickertape API
- **WHEN** Tickertape Pro API or MCP is unreachable due to network outage or rate limiting
- **THEN** the skill loads the latest cached financials and generates `financials/<TICKER>.json` and `financials/<TICKER>.html` with an active cache alert banner

#### Scenario: Tickertape auth token expiration handling
- **WHEN** Tickertape requests fail with 401 Unauthorized or expired token errors
- **THEN** the skill alerts the user with token renewal guidance and falls back to cached data if immediate renewal is not performed


