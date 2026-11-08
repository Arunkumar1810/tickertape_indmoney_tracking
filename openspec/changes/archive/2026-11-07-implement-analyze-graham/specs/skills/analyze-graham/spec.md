# Spec Delta: skills/analyze-graham

## Purpose

Provides a deterministic Benjamin Graham value-investing evaluation engine calculating Net-Net Working Capital (NNWC), Net Current Asset Value (NCAV), Graham Number floor, Margin of Safety, and defensive investor criteria.

## ADDED Requirements

### Requirement: Canonical UniformVerdictContract output
The system SHALL evaluate company financial statements and output verdicts conforming to the canonical `UniformVerdictContract` draft-07 JSON Schema (`principle: "graham"`, `ticker`, `timestamp`, `score`, `stance`, `is_veto: false`, `metrics`, `red_flags`, `summary`).

#### Scenario: Deep value discount evaluation
- **WHEN** an equity trading below its Graham Number or NNWC floor is evaluated
- **THEN** it outputs a `UniformVerdictContract` with `stance` in `["BUY", "STRONG_BUY"]`, `is_veto: false`, `score >= 70.0`, and positive margin of safety

#### Scenario: Metric property containment
- **WHEN** a Graham valuation verdict is generated
- **THEN** `metrics` contains numeric keys for `graham_number`, `nnwc_per_share`, `ncav_per_share`, `margin_of_safety_pct`, `current_ratio`, `pe_ratio`, `pb_ratio`, and `pe_x_pb`

### Requirement: Deterministic liquidation floor and valuation calculations
The system SHALL compute liquidation floors, Graham Numbers, and margins of safety strictly using deterministic mathematical formulas without external assumptions.

#### Scenario: Negative EPS or book value handling
- **WHEN** an equity has negative EPS or negative book value per share
- **THEN** `graham_number` is set to `null` and a red flag is recorded for lack of positive earnings/equity floor

#### Scenario: Net-Net bargain detection
- **WHEN** an equity CMP is below its per-share Net-Net Working Capital (NNWC)
- **THEN** the system logs a high-conviction deep-value finding and awards full valuation score points

### Requirement: Defensive investor screening and stance assignment
The system SHALL evaluate Graham defensive investor criteria (Current Ratio, Debt-to-NCAV, P/E, P/B, dividend yield) and assign stances (`STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`).

#### Scenario: Premium growth overvaluation
- **WHEN** an equity trades at high multiples (e.g., P/E > 30, CMP > 2x Graham Number)
- **THEN** the system assigns `stance` in `["REDUCE", "STRONG_SELL"]` with negative margin of safety and logs valuation stretch warnings

#### Scenario: Weak liquidity or high leverage flag
- **WHEN** current ratio is below 1.5 or long-term debt exceeds Net Current Assets
- **THEN** the system deducts points from the Graham score and appends balance sheet risk flags

### Requirement: Passive broad-market Index ETF handling
The system SHALL identify broad-market index ETFs (e.g., `VOO`, `QQQ`, `SPY`) and bypass single-company liquidation formulas, returning `score: 100.0`, `stance: "HOLD"`, and `is_veto: false`.

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
The system SHALL render a self-contained offline HTML audit report with inline CSS, visual metric gauges, valuation waterfall floor comparisons, and zero external network asset dependencies.

#### Scenario: Single stock audit report rendering
- **WHEN** the HTML report is opened in an offline browser via `file://`
- **THEN** all visual gauges, defensive checklists, and valuation floor cards render without network requests

#### Scenario: Verification harness conformance
- **WHEN** output artifacts are verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

