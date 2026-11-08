# Spec Delta

## Purpose

Provides a repeatable, transparent skill that connects to Angel One MCP (`pyalgobot/angelone-mcp`) to ingest trading data and account cashflows, calculates true net-of-friction Investor XIRR alongside individual stock compounding, and renders a self-contained interactive offline HTML report.

## ADDED Requirements

### Requirement: Angel One MCP Connection and Portfolio Discovery
The system SHALL connect to Angel One MCP endpoint (`https://mcpservers.org/servers/pyalgobot/angelone-mcp.git` or local `http://localhost:8000/mcp`) using standard Model Context Protocol client calls to retrieve active equity holdings, current market prices (CMPs), and available margin cash balances.

#### Scenario: Successful Angel One MCP portfolio retrieval
- **WHEN** the skill runs with active Angel One MCP session or credentials
- **THEN** it retrieves the active holdings list, quantities, average prices, live CMPs, and free margin cash from Angel One MCP tools

#### Scenario: Angel One session expired or unauthorized
- **WHEN** Angel One MCP returns a 401 or 403 authentication error
- **THEN** the system logs an actionable warning with token renewal steps and falls back to cached/synchronized Angel One holdings

### Requirement: Account-Level Fund Transfer Cashflow Ingestion
The system SHALL ingest bank account deposits (pay-ins) and withdrawals (payouts) from a local ledger or Angel One Funds statement to establish the true capital timeline.

#### Scenario: Ingesting fund pay-ins and payouts
- **WHEN** fund transfer records are provided via CSV, JSON, or cached ledger
- **THEN** the system records each deposit as an investor cash outflow (-Amount) and each withdrawal as an investor cash inflow (+Amount) on their respective transaction dates

### Requirement: Multi-Year Historical Tradebook Ingestion
The system SHALL ingest historical executed trades spanning multi-year holding periods from Angel One Tradebook exports and merge them with live session trades into a persistent local cache.

#### Scenario: Tradebook ingestion and caching
- **WHEN** a historical tradebook CSV or JSON file is provided
- **THEN** the system parses buy and sell lots, normalizes them by ISIN and scrip symbol, and persists them into `trades_cache.json`

### Requirement: Dual-Perspective XIRR Computation
The system SHALL compute both True Investor XIRR (derived from bank fund transfers and current account equity) and Asset-Level Stock XIRR (derived from individual stock trade cashflows and CMP).

#### Scenario: Computing True Investor XIRR with hidden charges
- **WHEN** fund cashflows and current account equity (Demat market value + free cash margin) are compiled
- **THEN** the system solves for the internal rate of return $r$ where net present value equals zero, inherently factoring in DP charges, taxes, and cash drag

#### Scenario: Computing individual stock XIRRs
- **WHEN** per-stock trade logs and terminal valuations are processed
- **THEN** the system computes independent XIRR percentages for every active and closed stock holding

### Requirement: Sub-90-Day Holding Guardrail
The system SHALL guard against annualized return distortion by suppressing annualized XIRR for positions or fund cashflows active for less than 90 days.

#### Scenario: Short-duration holding evaluated
- **WHEN** a holding period spans fewer than 90 days between initial purchase and current evaluation
- **THEN** the system displays Absolute Return % and tags the annualized XIRR as sub-annual to prevent exaggerated rate percentages

### Requirement: Self-Contained Offline HTML and JSON Report Generation
The system SHALL generate a single offline HTML dashboard and matching JSON summary containing portfolio performance KPIs, cashflow visual waterfall, sortable holdings matrix, slide-out transaction audit drawers, and redacted sensitive identifiers.

#### Scenario: Generating offline HTML report
- **WHEN** calculations are completed
- **THEN** the system writes `reports/fetch-lts-xirr-YYYY-MM-DD.html` with inlined CSS/JS, embedded JSON data, interactive search/sorting, and no external CDN dependencies

#### Scenario: Sensitive data redaction
- **WHEN** generating report outputs
- **THEN** the system redacts Angel One client codes, PAN numbers, bank account numbers, and API tokens from the serialized output
