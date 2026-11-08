# Specification: fetch-angelone Skill

## Purpose

Defines the `fetch-angelone` skill as a dedicated Tier 1 Account Fetcher, obtaining live Angel One Demat holdings and cash ledger margins, and producing a canonical `AccountHoldingsSnapshot` JSON artifact and self-contained offline HTML dashboard.

## Requirements

### Requirement: Canonical AccountHoldingsSnapshot output
The system SHALL output Angel One holdings and cash ledger positions conforming to the canonical `AccountHoldingsSnapshot` draft-07 JSON Schema (`account_id: "angelone"`, `broker: "angelone"`, `currency: "INR"`, `timestamp`, `summary`, `margin`, `holdings`).

#### Scenario: Standard holdings snapshot generation
- **WHEN** the skill runs against an Angel One account with equity positions
- **THEN** it outputs a JSON file conforming to `AccountHoldingsSnapshot` with non-empty summary and holdings arrays

#### Scenario: Empty account or zero holdings
- **WHEN** an Angel One account contains zero equity holdings
- **THEN** it outputs a valid snapshot with `summary.holdings_count: 0` and `holdings: []`

### Requirement: Demat cash ledger and margin accounting
The system SHALL query and extract Angel One available cash balances, collateral, utilized margin, and total account equity in INR.

#### Scenario: Live cash and margin retrieved
- **WHEN** margin details are queried from Angel One
- **THEN** the output snapshot contains populated `margin.available_cash`, `margin.collateral`, `margin.utilised`, and `margin.net_margin`

#### Scenario: Zero margin utilization
- **WHEN** an account has no collateral or active derivatives margin utilization
- **THEN** `margin.collateral` and `margin.utilised` are set to `0` and `margin.net_margin` equals `margin.available_cash`

### Requirement: Standalone offline HTML holdings dashboard
The system SHALL generate a self-contained offline HTML holdings dashboard with inline CSS, embedded icons/SVGs, interactive sorting/filtering, and zero external network asset dependencies.

#### Scenario: Offline rendering and interaction
- **WHEN** the generated HTML dashboard is opened in an offline browser via `file://`
- **THEN** all styles, metrics, and holding tables render without making external network requests

#### Scenario: Verification harness conformance
- **WHEN** the generated JSON and HTML pair is verified by `artifact_harness.js`
- **THEN** the verification harness returns `ok: true` with zero external leak errors

### Requirement: Single-ticker filtering mode
The system SHALL support `--only <ticker>` to filter the output snapshot and HTML dashboard to a single specified equity holding.

#### Scenario: Filter by ticker symbol
- **WHEN** the skill runs with `--only INFY`
- **THEN** the resulting holdings array and HTML table display only the INFY position

#### Scenario: Filter for ticker not held in account
- **WHEN** the skill runs with `--only AAPL` on an account that does not hold AAPL
- **THEN** the process exits with an informative message indicating the ticker is not held

### Requirement: CLI execution and options
The fetch-angelone CLI SHALL support `--broker <name>`, `--out <dir>`, `--refresh`, `--only <ticker>`, and `--json-output`, writing `accounts/angelone.json` and `accounts/angelone.html` into the destination directory.

#### Scenario: Standard CLI run
- **WHEN** the CLI is executed without flags
- **THEN** it writes `accounts/angelone.json` and `accounts/angelone.html` to the default output directory and exits with code 0

#### Scenario: Custom output directory
- **WHEN** the CLI is executed with `--out custom_reports/`
- **THEN** artifacts are created at `custom_reports/accounts/angelone.json` and `custom_reports/accounts/angelone.html`

### Requirement: Snapshot cache fallback and token renewal
The fetch-angelone skill SHALL intercept SmartAPI token expiration and network errors, prompting for credential renewal or falling back to the most recent cached snapshot with an alert banner.

#### Scenario: Graceful fallback on unreachable Angel One API
- **WHEN** Angel One SmartAPI is unreachable due to network failure or rate limits
- **THEN** the skill loads the latest cached holdings and generates `accounts/angelone.json` and `accounts/angelone.html` with an active cache alert banner

#### Scenario: SmartAPI JWT expiration handling
- **WHEN** SmartAPI returns a token expired or authentication error
- **THEN** the skill alerts the user with token renewal guidance and falls back to cached data if immediate renewal is not performed


