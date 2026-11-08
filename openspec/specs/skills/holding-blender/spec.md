# Spec: skills/holding-blender

## Purpose

Provides a deterministic multi-account holding blender that calculates blended quantity, weighted average purchase cost, and pooled cash across assigned accounts while preserving lot-level attribution tranches.

## Requirements

### Requirement: Canonical StrategyHoldingsBlended Contract Schema
The system SHALL evaluate multiple account holding snapshots and emit a consolidated portfolio object conforming to the canonical `StrategyHoldingsBlended` draft-07 JSON Schema (`strategy_id`, `timestamp`, `base_currency`, `summary`, `accounts_blended`, `positions`).

#### Scenario: Valid blended portfolio generation
- **WHEN** multiple valid account snapshots are blended into a strategy portfolio
- **THEN** the emitted JSON payload validates against `strategy-holdings-blended.schema.json` without errors

#### Scenario: Blended summary property containment
- **WHEN** a blended strategy portfolio is emitted
- **THEN** `summary` contains numeric fields for `total_invested`, `total_current_value`, `unrealized_pnl`, `unrealized_pnl_pct`, `pooled_cash`, `total_strategy_equity`, and an integer `positions_count`

### Requirement: Multi-Account Position Consolidation and Weighted Average Cost
The system SHALL aggregate positions across accounts matching by canonical ticker or ISIN, summing quantities and computing the weighted average cost basis converted into strategy base currency.

#### Scenario: Consolidation across domestic and foreign accounts
- **WHEN** the same security is held across two distinct accounts with different purchase prices
- **THEN** the system blends the lots into a single consolidated position with `quantity` equal to the sum of lot quantities and `average_price` equal to the lot-weighted average cost in base currency

#### Scenario: Fractional share precision preservation
- **WHEN** international accounts contain fractional share quantities (e.g., 0.3541 shares)
- **THEN** the blended position retains full decimal precision without rounding distortion

### Requirement: Multi-Currency Cash Pooling and FX Conversion
The system SHALL pool available cash and margin balances across all participating accounts into the strategy base currency using defined exchange rates.

#### Scenario: Mixed currency cash pooling
- **WHEN** blending an Indian demat account (INR cash) and a US brokerage account (USD cash) into an INR base strategy
- **THEN** the USD cash is converted to INR using the specified exchange rate and added to total pooled cash

#### Scenario: Cash ledger breakdown retention
- **WHEN** cash is pooled across accounts
- **THEN** `accounts_blended` retains the raw original cash balance, currency, FX conversion rate, and converted contribution for each account

### Requirement: Lot-Level Attribution Tranche Preservation
The system SHALL attach an immutable `attribution` array to each blended position detailing contributing account lots.

#### Scenario: Attribution lot inspection
- **WHEN** an investor audits a blended position
- **THEN** the position's `attribution` array lists each contributing account's `account_id`, `broker`, `quantity`, `average_price`, `currency`, `cost_in_base_currency`, and `weight_in_position_pct`

#### Scenario: Single-account position attribution
- **WHEN** a stock is held in only one account
- **THEN** the position's `attribution` array contains exactly one entry with 100.0% weight in position

### Requirement: Offline Interactive Attribution Drawer HTML Dashboard
The system SHALL render a self-contained offline HTML audit report with interactive expandable drawer rows revealing lot-level attribution without external dependencies.

#### Scenario: Attribution drawer expansion
- **WHEN** the user clicks an attribution toggle button in the blended portfolio table
- **THEN** the UI expands an inline drawer displaying the underlying account tranches and purchase cost breakdown

#### Scenario: Verification harness conformance
- **WHEN** the generated HTML dashboard is verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

### Requirement: Dual-Mode CLI Execution
The system SHALL support deterministic offline execution via `--snapshots <path...>` and autonomous strategy ingestion via `--way <way_id>`.

#### Scenario: Offline execution via --snapshots flag
- **WHEN** executed with `--snapshots <path1> <path2>`
- **THEN** the system merges the snapshot files locally without network calls and writes output artifacts

#### Scenario: Autonomous execution via --way flag
- **WHEN** executed with `--way fundamental_lts`
- **THEN** the system resolves assigned accounts from `config/investment_ways.yaml`, loads account snapshots, and emits blended strategy artifacts

