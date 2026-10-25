# Design

## Context

See [proposal.md](file:///c:/ak/MyRepo/tickertape_indmoney_tracking/tickertape_indmoney_tracking/openspec/changes/add-fetch-lts-xirr-skill/proposal.md) for motivation. The repository currently has a working `fetch-lts` skill for Angel One and Tickertape data under `.agents/skills/fetch-lts/`. This design specifies how the new `fetch-lts-xirr` skill connects to Angel One MCP (`pyalgobot/angelone-mcp`), parses both live broker data and multi-year account ledgers, calculates mathematically rigorous XIRR rates, and renders an offline HTML report.

## Goals / Non-Goals

**Goals:**
- Provide a Node.js-based CLI (`node scripts/fetch_lts_xirr.js`) that runs within `.agents/skills/fetch-lts-xirr/`.
- Connect to Angel One MCP (`https://mcpservers.org/servers/pyalgobot/angelone-mcp.git`) to fetch live holdings, CMPs, and free cash margins.
- Ingest bank fund transfer history (pay-in deposits and payout withdrawals) to establish the true investor cashflow timeline.
- Absorb 100% of hidden fees (DP charges, STT, GST, turnover charges, AMC, cash drag) through the account-level equity delta.
- Ingest historical tradebook logs into a persistent local cache (`trades_cache.json`) to compute per-stock XIRR compounding.
- Implement a 100% convergent hybrid numerical XIRR solver (Newton-Raphson + bounded Bisection).
- Generate a single self-contained, privacy-redacted offline HTML dashboard with interactive search, sorting, and cashflow drawers.

**Non-Goals:**
- Real-time order execution or automated algorithmic trading (read-only portfolio analysis).
- Modifying or breaking the existing `fetch-lts` skill for Angel One.
- External cloud backend or remote server requirements (100% client/local execution).

## Decisions

### 1. Angel One MCP Connection via SmartAPI JSON-RPC / SSE
- **Decision**: Connect to Angel One MCP server (`pyalgobot/angelone-mcp`) using standard Model Context Protocol client calls over HTTP/SSE or stdio.
- **Rationale**: Standardizes tool calls (`get_holdings`, `get_rms_limits`, `get_trade_book`) without writing brittle web-scraping scripts.
- **Alternatives Considered**:
  - Direct SmartAPI Python SDK: Involves separate runtime environment; using the Angel One MCP standard interface keeps tooling unified.

### 2. Primary Cashflow Baseline: Account Fund Transfers (True Investor XIRR)
- **Decision**: Primary portfolio XIRR uses bank-to-Angel-One deposits as negative cash flows ($-$), Angel-One-to-bank withdrawals as positive cash flows ($+$), and today's total account equity ($+\text{Holdings CMP} + \text{Available Cash Margin}$) as the terminal cash flow.
- **Rationale**: Automatically accounts for all hidden deductions (₹13.5 + GST per debit DP charges, STT, turnover charges, SEBI fees, stamp duty, and quarterly AMC) and uninvested cash drag without complex manual tax line-item reconstruction.
- **Alternatives Considered**:
  - Trade-only execution XIRR: Ignores idle cash drag, account AMC, DP charges deducted on selling, and deposit timing, giving a misleadingly high return.

### 3. Per-Stock Compounding via Historical Tradebook Cache
- **Decision**: Support Angel One Tradebook CSV/JSON import into `trades_cache.json` for per-stock transaction histories.
- **Rationale**: Daily session trades only show current day trades. A local cache seeded with past exports bridges the multi-year history gap permanently.
- **Alternatives Considered**:
  - Only computing holding-level return from average buy price: Fails to capture realized gains/losses from partial sales or exact purchase dates across multiple tranches.

### 4. Hybrid Numerical Solver (Newton-Raphson + Bisection)
- **Decision**: Solve $NPV(r) = \sum_{i=0}^N \frac{C_i}{(1+r)^{\frac{d_i - d_0}{365}}} = 0$ using analytical derivative Newton-Raphson, with automated fallback to bounded Bisection if derivative oscillates or approaches zero.
- **Rationale**: Guarantees 100% numerical convergence without infinite loops, even on non-monotonic cashflow polynomials.
- **Alternatives Considered**:
  - Pure Bisection: Slower, takes up to 60 iterations.
  - Pure Newton-Raphson: Prone to divergence or division by zero on multiple sign alternations.

### 5. Single-File Self-Contained HTML Architecture
- **Decision**: Bundle inline CSS, vanilla JavaScript, and embedded JSON data into a single output file with no external CDN or script tags.
- **Rationale**: Ensures the report opens instantly offline anywhere, is portable, and can be archived or converted to PDF without broken assets.
- **Alternatives Considered**:
  - External CDN scripts (Chart.js / Tailwind): Breaks when offline, creates security/privacy exposure.

## Risks / Trade-offs

- **[SmartAPI Token Expiry]** → Angel One sessions expire periodically. *Mitigation*: Skill detects 401/403 status, displays clear re-authentication prompt, and allows offline reporting using cached or synchronized portfolio data.
- **[Sub-90-Day Annualization Distortion]** → Holdings under 90 days produce extreme annualized XIRR percentages (+3,000%). *Mitigation*: Engine suppresses annualized rate for short periods, highlighting Absolute Return % instead.
- **[Direct Bank Dividend Credits]** → Equity dividends are credited directly to bank accounts rather than the trading ledger. *Mitigation*: Provide optional Dividend statement ingestion to capture dividend yields.
- **[Sensitive Data Exposure]** → Account IDs, PANs, client codes, and tokens present in raw responses. *Mitigation*: Explicit serialization filter scrubs all sensitive fields before generating HTML/JSON reports.
