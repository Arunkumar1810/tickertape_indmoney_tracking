# Spec Delta: skills/analyze-lynch

## Purpose

Provides a deterministic Peter Lynch Growth-At-A-Reasonable-Price (GARP) valuation engine computing PEG ratios, yield-adjusted PEG, inventory-to-sales velocity divergence, and company lifecycle categorization.

## ADDED Requirements

### Requirement: Canonical UniformVerdictContract output
The system SHALL evaluate company financial statements and output verdicts conforming to the canonical `UniformVerdictContract` draft-07 JSON Schema (`principle: "lynch"`, `ticker`, `timestamp`, `score`, `stance`, `is_veto: false`, `metrics`, `red_flags`, `summary`).

#### Scenario: High growth at reasonable price
- **WHEN** an equity with PEG ratio below 1.0 and sound balance sheet is evaluated
- **THEN** it outputs a `UniformVerdictContract` with `stance` in `["BUY", "STRONG_BUY"]`, `is_veto: false`, and `score >= 70.0`

#### Scenario: Metric property containment
- **WHEN** a Lynch valuation verdict is generated
- **THEN** `metrics` contains numeric keys for `peg_ratio`, `yield_adjusted_peg_ratio`, `eps_growth_rate_pct`, `dividend_yield_pct`, `pe_ratio`, `lynch_fair_value`, `inventory_divergence_pct`, and `debt_to_equity`

### Requirement: Deterministic PEG and Fair Value calculations
The system SHALL compute classic Lynch PEG, yield-adjusted PEG, and Lynch Fair Value line strictly using deterministic mathematical formulas.

#### Scenario: Negative or zero growth handling
- **WHEN** an equity has zero or negative EPS growth rate
- **THEN** `peg_ratio` is set to `null` and a red flag is logged indicating lack of positive earnings expansion

#### Scenario: Exceptional PEG bargain detection
- **WHEN** an equity has a PEG ratio below 0.5
- **THEN** the system logs an exceptional growth bargain observation and awards maximum PEG valuation score points

### Requirement: Inventory velocity divergence detection
The system SHALL compare inventory expansion against revenue growth to detect operational slowdowns and channel-stuffing risks.

#### Scenario: Severe inventory buildup flag
- **WHEN** inventory growth exceeds revenue growth by more than 5.0 percentage points
- **THEN** the system logs an inventory divergence red flag and deducts points from the Lynch score

#### Scenario: Healthy inventory velocity
- **WHEN** inventory growth is equal to or slower than sales growth
- **THEN** no inventory divergence warning is issued and full operational efficiency points are awarded

### Requirement: Peter Lynch company lifecycle categorization
The system SHALL classify companies into canonical Lynch categories (Fast Grower, Stalwart, Slow Grower, Cyclical, Turnaround, or Asset Play) based on historical growth and operational profile.

#### Scenario: Fast grower classification
- **WHEN** an equity demonstrates 5-year EPS CAGR of 20.0% or higher
- **THEN** the company is categorized as a Fast Grower in the verdict narrative and audit summary

#### Scenario: Stalwart classification
- **WHEN** an equity demonstrates steady 5-year EPS CAGR between 10.0% and 20.0%
- **THEN** the company is categorized as a Stalwart in the verdict narrative and audit summary

### Requirement: Passive broad-market Index ETF handling
The system SHALL identify broad-market index ETFs (e.g., `VOO`, `QQQ`, `SPY`) and bypass single-company growth and inventory formulas, returning `score: 100.0`, `stance: "HOLD"`, and `is_veto: false`.

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
The system SHALL render a self-contained offline HTML audit report with inline CSS, visual metric gauges, PEG valuation meters, and inventory divergence visualizers with zero external network asset dependencies.

#### Scenario: Single stock audit report rendering
- **WHEN** the HTML report is opened in an offline browser via `file://`
- **THEN** all visual gauges, category badges, and PEG meters render without network requests

#### Scenario: Verification harness conformance
- **WHEN** output artifacts are verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

