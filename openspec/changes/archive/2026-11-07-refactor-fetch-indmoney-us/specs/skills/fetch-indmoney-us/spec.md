# Spec Delta

## Purpose

Defines the `fetch-indmoney-us` skill as a dedicated Tier 1 Account Fetcher, obtaining live INDmoney / DriveWealth US equity holdings, fractional shares, and USD cash balances, and producing a canonical `AccountHoldingsSnapshot` JSON artifact and self-contained offline HTML dashboard.

## ADDED Requirements

### Requirement: Canonical AccountHoldingsSnapshot output
The system SHALL output INDmoney US equity holdings and cash ledger positions conforming to the canonical `AccountHoldingsSnapshot` draft-07 JSON Schema (`account_id: "indmoney_us"`, `broker: "indmoney"`, `currency: "USD"`, `timestamp`, `summary`, `margin`, `holdings`).

#### Scenario: Standard US holdings snapshot generation
- **WHEN** the skill runs against an INDmoney account with active US equity positions
- **THEN** it outputs a JSON file conforming to `AccountHoldingsSnapshot` with non-empty summary and holdings arrays in USD

#### Scenario: Empty account or zero holdings
- **WHEN** an INDmoney account contains zero equity holdings
- **THEN** it outputs a valid snapshot with `summary.holdings_count: 0` and `holdings: []`

### Requirement: Fractional share and US exchange accounting
The system SHALL support fractional share quantities, US exchange classifications (NASDAQ, NYSE, AMEX), and volume-weighted purchase costs in USD.

#### Scenario: Fractional equity holding representation
- **WHEN** a US holding contains a fractional share quantity (e.g. 12.5 shares)
- **THEN** `quantity` is recorded as a positive float, `fractional_shares` is set to `true`, and `invested_value` equals `round2(quantity * average_price)`

#### Scenario: Whole share holding
- **WHEN** a US holding contains whole integer shares
- **THEN** `fractional_shares` is recorded as `false` or `true` based on position precision

### Requirement: Cash ledger and USD/INR exchange rate tracking
The system SHALL extract settled USD cash balances into `margin.available_cash` and `summary.available_cash`, and track the USD/INR conversion rate in snapshot metadata for downstream currency conversion.

#### Scenario: Cash balance extraction
- **WHEN** USD cash balance is retrieved from INDmoney
- **THEN** `margin.available_cash` reflects the USD ledger balance, with `margin.collateral: 0` and `margin.utilised: 0`

#### Scenario: USD to INR conversion rate tracking
- **WHEN** live or cached FX rate is available
- **THEN** the skill preserves the active USD/INR exchange rate for dual-currency UI presentation and portfolio blending

### Requirement: Standalone offline HTML holdings dashboard
The system SHALL generate a self-contained offline HTML holdings dashboard with inline CSS, embedded icons/SVGs, interactive sorting/filtering, dual USD/INR currency presentation, and zero external network asset dependencies.

#### Scenario: Offline rendering and interaction
- **WHEN** the generated HTML dashboard is opened in an offline browser via `file://`
- **THEN** all styles, metrics, and holding tables render without making external network requests

#### Scenario: Verification harness conformance
- **WHEN** the generated JSON and HTML pair is verified by `artifact_harness.js`
- **THEN** the verification harness returns `ok: true` with zero external leak errors

### Requirement: Single-ticker filtering mode
The system SHALL support `--only <ticker>` to filter the output snapshot and HTML dashboard to a single specified US equity holding.

#### Scenario: Filter by US ticker symbol
- **WHEN** the skill runs with `--only AAPL`
- **THEN** the resulting holdings array and HTML table display only the AAPL position

#### Scenario: Filter for ticker not held in account
- **WHEN** the skill runs with `--only TSLA` on an account that does not hold TSLA
- **THEN** the process exits with an informative message indicating the ticker is not held

### Requirement: CLI execution and options
The fetch-indmoney-us CLI SHALL support `--broker <name>`, `--out <dir>`, `--refresh`, `--only <ticker>`, `--mock-data <file>`, and `--json-output`, writing `accounts/indmoney_us.json` and `accounts/indmoney_us.html` into the destination directory.

#### Scenario: Standard CLI run
- **WHEN** the CLI is executed without flags
- **THEN** it writes `accounts/indmoney_us.json` and `accounts/indmoney_us.html` to the default output directory and exits with code 0

#### Scenario: Custom output directory
- **WHEN** the CLI is executed with `--out custom_reports/`
- **THEN** artifacts are created at `custom_reports/accounts/indmoney_us.json` and `custom_reports/accounts/indmoney_us.html`

#### Scenario: Offline mock data execution
- **WHEN** executed with `--mock-data <path>`
- **THEN** it normalizes the mock fixture without initiating external network or MCP calls

