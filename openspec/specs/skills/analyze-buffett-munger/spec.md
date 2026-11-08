# Specification: analyze-buffett-munger Skill

## Purpose

Provides a deterministic Buffett-Munger compounding valuation engine computing true Owner Earnings, 5-step DuPont ROE decomposition, Return on Invested Capital (ROIC), and economic moat quality.

## Requirements

### Requirement: Canonical UniformVerdictContract output
The system SHALL evaluate company financial statements and output verdicts conforming to the canonical `UniformVerdictContract` draft-07 JSON Schema (`principle: "buffett_munger"`, `ticker`, `timestamp`, `score`, `stance`, `is_veto: false`, `metrics`, `red_flags`, `summary`).

#### Scenario: High quality economic compounder
- **WHEN** an equity with high ROIC, disciplined leverage, and strong Owner Earnings yield is evaluated
- **THEN** it outputs a `UniformVerdictContract` with `stance` in `["BUY", "STRONG_BUY"]`, `is_veto: false`, and `score >= 70.0`

#### Scenario: Metric property containment
- **WHEN** a Buffett-Munger valuation verdict is generated
- **THEN** `metrics` contains numeric keys for `owner_earnings`, `owner_earnings_yield_pct`, `sbc_dilution_pct`, `roe_pct`, `tax_burden`, `interest_burden`, `operating_margin_pct`, `asset_turnover`, `financial_leverage`, and `roic_pct`

### Requirement: Deterministic Owner Earnings and dilution calculation
The system SHALL compute true Owner Earnings by subtracting maintenance capital expenditures and stock-based compensation (SBC) from operating cash flow.

#### Scenario: Significant SBC dilution penalty
- **WHEN** stock-based compensation exceeds 15.0% of operating cash flow
- **THEN** the system logs an equity dilution warning flag and deducts points from the Owner Earnings quality score

#### Scenario: Robust owner earnings cash conversion
- **WHEN** true Owner Earnings equal or exceed 80.0% of reported net income
- **THEN** full cash conversion quality points are awarded

### Requirement: 5-Step DuPont ROE decomposition
The system SHALL decompose Return on Equity across Tax Burden, Interest Burden, Operating Margin, Asset Turnover, and Financial Leverage.

#### Scenario: High quality margin-driven ROE
- **WHEN** high ROE is primarily driven by operating margin and asset efficiency with leverage under 2.5
- **THEN** high capital productivity points are awarded with no leverage penalty

#### Scenario: Debt-leveraged artificial ROE warning
- **WHEN** financial leverage exceeds 3.5 while operating margin is deteriorating or below 10.0%
- **THEN** the system logs an artificial leverage warning and penalizes the compounding score

### Requirement: Return on Invested Capital and economic moat assessment
The system SHALL calculate Return on Invested Capital (ROIC) and assess business quality against economic moat criteria.

#### Scenario: Wide economic moat detection
- **WHEN** an equity maintains an ROIC of 15.0% or greater alongside stable operating margins
- **THEN** the system logs a durable economic moat finding and awards top moat points

#### Scenario: Sub-par capital returns
- **WHEN** an equity demonstrates an ROIC below 8.0%
- **THEN** the system flags weak capital reinvestment returns and assigns a low moat score

### Requirement: Passive broad-market Index ETF handling
The system SHALL identify broad-market index ETFs (e.g., `VOO`, `QQQ`, `SPY`) and bypass single-company DuPont decomposition and Owner Earnings calculations, returning `score: 100.0`, `stance: "HOLD"`, and `is_veto: false`.

#### Scenario: Index ETF security evaluation
- **WHEN** an index ETF security is evaluated
- **THEN** the system assigns `score: 100.0`, `stance: "HOLD"`, `is_veto: false`, and an informative benchmark summary

### Requirement: Pattern C dual-mode and portfolio batch execution
The system SHALL support `--data <path>` (offline deterministic mode), `--ticker <SYMBOL>` (autonomous mode), and `--holdings <path>` (Option C portfolio batch mode emitting `VerdictBatch`).

#### Scenario: Offline execution via --data flag
- **WHEN** executed with `--data <path_to_normalized_financials.json>`
- **THEN** the system processes the file without network calls and writes output artifacts

#### Scenario: Autonomous ticker execution via provider integration
- **WHEN** executed with `--ticker <SYMBOL>`
- **THEN** the system queries normalized financial statements from `provider-tickertape` and computes the verdict

#### Scenario: Portfolio batch execution via --holdings
- **WHEN** executed with `--holdings <path_to_account_holdings.json>`
- **THEN** the system processes all positions into a `VerdictBatch` JSON and consolidated HTML audit report

### Requirement: Standalone offline HTML audit dashboard
The system SHALL render a self-contained offline HTML audit report with inline CSS, visual metric gauges, 5-step DuPont decomposition waterfall visualizer, and zero external network asset dependencies.

#### Scenario: Single stock audit report rendering
- **WHEN** the HTML report is opened in an offline browser via `file://`
- **THEN** all visual gauges, DuPont breakdown components, and Owner Earnings meters render without network requests

#### Scenario: Verification harness conformance
- **WHEN** output artifacts are verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

