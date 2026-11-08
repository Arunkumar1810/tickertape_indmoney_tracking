# Spec: skills/analyze-klarman-solvency

## Purpose

Provides a deterministic Seth Klarman downside stress and solvency evaluation engine computing Altman Z-Scores, Net Debt to EBITDA leverage, interest coverage buffers, and debt maturity cliff exposure.

## Requirements

### Requirement: Canonical UniformVerdictContract output
The system SHALL evaluate company financial statements and output verdicts conforming to the canonical `UniformVerdictContract` draft-07 JSON Schema (`principle: "klarman_solvency"`, `ticker`, `timestamp`, `score`, `stance`, `is_veto: false`, `metrics`, `red_flags`, `summary`).

#### Scenario: Fortified balance sheet and safe zone
- **WHEN** an equity with Altman Z-Score above 3.0, net cash position, and zero debt wall is evaluated
- **THEN** it outputs a `UniformVerdictContract` with `stance` in `["BUY", "STRONG_BUY"]`, `is_veto: false`, and `score >= 80.0`

#### Scenario: Metric property containment
- **WHEN** a Klarman solvency valuation verdict is generated
- **THEN** `metrics` contains numeric keys for `altman_z_score`, `net_debt`, `net_debt_to_ebitda`, `interest_coverage`, `debt_maturing_24m`, `cash_to_debt_maturing_ratio`, `accrual_gap`, and `operating_cash_flow_to_debt`

### Requirement: Deterministic Altman Z-Score calculation and zone classification
The system SHALL compute the classical Altman Z-Score using deterministic balance sheet and income statement ratios, classifying the entity into Safe, Grey, or Distress zones.

#### Scenario: Distress zone detection
- **WHEN** an equity produces an Altman Z-Score below 1.81
- **THEN** the system logs a bankruptcy distress warning flag and reduces the solvency score to the bottom distress tier

#### Scenario: Safe zone qualification
- **WHEN** an equity produces an Altman Z-Score strictly greater than 2.99
- **THEN** the system logs a safe zone finding and awards maximum bankruptcy resistance points

### Requirement: Net Debt and leverage burden stress-testing
The system SHALL calculate Net Debt to EBITDA and Operating Cash Flow to Total Debt to assess debt repayment capacity.

#### Scenario: Over-leveraged capital structure
- **WHEN** Net Debt to EBITDA exceeds 4.0 or EBITDA is negative
- **THEN** the system logs an excessive debt leverage warning and deducts points from the solvency score

#### Scenario: Net cash balance sheet
- **WHEN** cash and equivalents exceed total debt (negative net debt)
- **THEN** full balance sheet safety points are awarded with no debt burden deduction

### Requirement: Debt maturity wall and liquidity cliff identification
The system SHALL compare debt obligations maturing within 24 months against liquid cash and annual operating cash flow.

#### Scenario: Imminent refinancing cliff flag
- **WHEN** debt maturing within 24 months exceeds available cash reserves and trailing operating cash flow
- **THEN** the system logs a liquidity cliff alert and flags refinancing exposure

#### Scenario: Well-spaced maturity profile
- **WHEN** available cash reserves cover 100.0% of debt obligations maturing within 24 months
- **THEN** full debt spacing points are awarded with no refinancing penalty

### Requirement: Interest coverage and debt service buffer
The system SHALL calculate the interest coverage ratio ($\text{EBIT} / \text{Interest Expense}$) to evaluate operating profit cushion against fixed debt charges.

#### Scenario: Thin debt service buffer
- **WHEN** interest coverage is below 2.0 or interest expense exceeds operating profit
- **THEN** the system logs an interest coverage danger flag and docks score points

#### Scenario: Robust coverage buffer
- **WHEN** operating profit covers interest expense by 5.0 times or more, or interest expense is zero
- **THEN** full interest coverage safety points are awarded

### Requirement: Passive broad-market Index ETF handling
The system SHALL identify broad-market index ETFs (e.g., `VOO`, `QQQ`, `SPY`) and bypass single-company solvency formulas, returning `score: 100.0`, `stance: "HOLD"`, and `is_veto: false`.

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
The system SHALL render a self-contained offline HTML audit report with inline CSS, visual metric gauges, Altman Z-Score zone meter, debt maturity cliff visualizer, and zero external network asset dependencies.

#### Scenario: Single stock audit report rendering
- **WHEN** the HTML report is opened in an offline browser via `file://`
- **THEN** all visual gauges, distress zone cards, and debt maturity breakdowns render without network requests

#### Scenario: Verification harness conformance
- **WHEN** output artifacts are verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

