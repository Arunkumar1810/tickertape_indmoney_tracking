# Spec: skills/strategy-xirr

## Purpose

Calculates pooled multi-account True Strategy XIRR across domestic and foreign brokerage ledgers, netting internal capital transfers, converting cash flows to base currency, enforcing sub-90-day annualization guardrails, and itemizing friction drag (brokerage, STT, FX fees).

## Requirements

### Requirement: Canonical StrategyXirrReport Contract Schema
The system SHALL aggregate multi-account cash flows and emit a consolidated performance report conforming to the canonical `StrategyXirrReport` draft-07 JSON Schema (`strategy_id`, `timestamp`, `base_currency`, `eval_date`, `xirr`, `xirr_annualized`, `absolute_return`, `total_deposited`, `total_withdrawn`, `net_invested`, `terminal_equity`, `days_held`, `is_sub_annual`, `friction_breakdown`, `account_cashflows_summary`, `cashflows`).

#### Scenario: Valid strategy XIRR report generation
- **WHEN** valid multi-account cashflows and terminal valuation are evaluated
- **THEN** the emitted JSON payload validates against `strategy-xirr.schema.json` without errors

#### Scenario: Key performance indicators containment
- **WHEN** a strategy XIRR report is emitted
- **THEN** the root object contains numeric fields for `total_deposited`, `total_withdrawn`, `net_invested`, `terminal_equity`, `absolute_return`, and boolean `is_sub_annual`

### Requirement: Multi-Account Capital Flow Aggregation and Internal Transfer Netting
The system SHALL aggregate external bank deposits and withdrawals across all assigned accounts into a unified chronological stream, identifying and netting out internal transfers between accounts assigned to the same strategy.

#### Scenario: External bank deposits aggregation
- **WHEN** external bank deposits occur across distinct broker accounts
- **THEN** each deposit is recorded as a negative investor cashflow in the unified stream

#### Scenario: Internal inter-account transfer cancellation
- **WHEN** funds are transferred from one assigned account into another assigned account
- **THEN** the outflow and inflow pair cancels out with zero net impact on strategy XIRR

### Requirement: Multi-Currency Cashflow Normalization to Base Currency
The system SHALL normalize all cash flows originating in foreign currencies into the strategy base currency using defined exchange rates.

#### Scenario: Foreign currency cashflow conversion
- **WHEN** cash flows occur in USD within a strategy configured with INR base currency
- **THEN** amounts are converted to INR using the specified exchange rate prior to numerical solving

#### Scenario: Currency attribution metadata retention
- **WHEN** foreign cashflows are converted to base currency
- **THEN** the cashflow record retains `original_amount`, `original_currency`, and `fx_rate`

### Requirement: Terminal Equity Valuation Injection
The system SHALL inject the current strategy portfolio valuation (blended position market value plus pooled cash balances) at the evaluation date as the terminal cash inflow.

#### Scenario: Terminal valuation insertion
- **WHEN** solving for portfolio XIRR at evaluation date
- **THEN** a positive cashflow equal to total blended equity plus pooled cash is appended at the terminal timestamp

### Requirement: High-Precision Numerical Newton-Raphson Solver with Sub-90-Day Guardrail
The system SHALL compute annualized XIRR using the Newton-Raphson method with bisection fallback, suppressing annualization when investment duration is under 90 days.

#### Scenario: Valid multi-year cashflow convergence
- **WHEN** cash flows span greater than 90 days with valid positive and negative signs
- **THEN** the solver converges to true annualized XIRR within 1e-7 tolerance

#### Scenario: Sub-90-day guardrail suppression
- **WHEN** the elapsed time between initial deposit and evaluation date is strictly less than 90 days
- **THEN** `is_sub_annual` is set to true, `xirr_annualized` is set to null, and `absolute_return` is populated

### Requirement: Itemized Friction Drag Accounting
The system SHALL itemize all transaction-related friction costs (brokerage, STT, turnover charges, currency conversion markup, and regulatory taxes) and compute the net friction drag.

#### Scenario: Friction breakdown calculation
- **WHEN** account ledgers contain trade fees and exchange levies
- **THEN** `friction_breakdown` itemizes `brokerage`, `stt`, `fx_drag`, `taxes_and_charges`, and `total_friction`

#### Scenario: Friction drag impact measurement
- **WHEN** friction costs are audited
- **THEN** the system calculates `friction_drag_pct` representing the percentage point difference between gross and net returns

### Requirement: Offline Interactive HTML Audit Dashboard
The system SHALL render a self-contained offline HTML audit report displaying the capital timeline, cashflow waterfall, XIRR metric badges, and friction breakdown without external dependencies.

#### Scenario: Interactive report rendering
- **WHEN** the user opens the generated HTML audit dashboard offline
- **THEN** the page renders visual KPI cards, cashflow waterfall table, and friction drag breakdown

#### Scenario: Verification harness conformance
- **WHEN** the generated HTML report is verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

### Requirement: Dual-Mode CLI Execution
The system SHALL support deterministic offline execution via `--ledgers <path...>` and autonomous strategy ingestion via `--way <way_id>`.

#### Scenario: Offline execution via --ledgers and --blended flags
- **WHEN** executed with `--ledgers <path...>` and `--blended <path>`
- **THEN** the system processes local files without network calls and writes output artifacts

#### Scenario: Autonomous execution via --way flag
- **WHEN** executed with `--way fundamental_lts`
- **THEN** the system resolves accounts from `config/investment_ways.yaml`, loads account ledgers and blended holdings, and emits verified artifacts

