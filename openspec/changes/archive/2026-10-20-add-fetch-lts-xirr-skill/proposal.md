# Proposal

## Why

Traditional portfolio tracking evaluates performance purely on isolated stock transactions, ignoring true deposit timelines, cash drag, and hidden fees (such as DP charges of ₹13.5 + GST per debit, STT, turnover charges, SEBI fees, stamp duty, and quarterly AMC). Calculating XIRR anchored to actual bank fund transfers into Angel One provides the investor with their true net-of-friction, post-tax compound rate of return. A reusable `fetch-lts-xirr` skill leveraging Angel One MCP (`https://mcpservers.org/servers/pyalgobot/angelone-mcp.git`) paired with account ledger cashflows and an interactive HTML report delivers complete transparency into investor wealth creation.

## What Changes

- Add a new skill `fetch-lts-xirr` under `.agents/skills/fetch-lts-xirr/` (with `SKILL.md`, CLI script `scripts/fetch_lts_xirr.js`, and offline report generator `assets/report-template.html`).
- Ingest Angel One live session data (holdings, current market prices, margins, today's trades) via Angel One MCP (`pyalgobot/angelone-mcp` over SmartAPI).
- Ingest bank fund transfer cashflows (pay-ins and payouts) and historical multi-year trades via persistent local cache (`trades_cache.json`) and Angel One Tradebook / Funds Ledger CSV or JSON import.
- Integrate optional Tickertape broker cross-referencing (`pf_stocks_holdings_read`) for automated ISIN resolution, sector categorization, and fundamental scorecard metrics.
- Build a robust hybrid numerical XIRR engine: primary analytical Newton-Raphson backed by a bounded Bisection / Brent fallback solver to ensure 100% convergence across complex multi-tranche cashflow series.
- Implement guardrails against sub-90-day annualization explosion, suppressing annualized XIRR in favor of Absolute Return % for short-term positions.
- Render a single, self-contained offline HTML report (inline CSS and vanilla JS, embedded JSON, zero external dependencies) displaying:
  - Hero KPIs: Total Capital Deposited, Current Account Equity (Stocks + Cash), Net Investor XIRR %, and Friction Drag %.
  - Visual Cashflow Waterfall: Cumulative capital deposited over time vs portfolio equity curve.
  - Sortable Holdings Matrix: Table/Card view with per-stock XIRR %, Absolute Return %, and holding duration.
  - Slide-out Ledger Drawer: Full audit trail for every deposit tranche, trade execution, and dividend payout.
  - Privacy scrubbing: Automatic redaction of PAN, Angel One client codes, bank account numbers, and auth tokens.
- Generate structured JSON sidecar reports (`reports/fetch-lts-xirr-YYYY-MM-DD.json`).

## Capabilities

### New Capabilities
- `skills/fetch-lts-xirr-skill`: End-to-end `fetch-lts-xirr` skill covering Angel One MCP connection, fund ledger and tradebook ingestion, robust dual XIRR solver (True Investor XIRR + Asset Stock XIRR), and the self-contained offline HTML and JSON dashboard.

### Modified Capabilities

(none; existing `skills/fetch-lts-skill` remains intact)

## Impact

- All new code lives inside `.agents/skills/fetch-lts-xirr/` and `openspec/changes/add-fetch-lts-xirr-skill/`.
- Seamlessly aligns with existing `fetch-lts` skill using Angel One broker holdings.
- Reports (`reports/`), cache (`.cache/`), and local state are git-ignored to prevent credential or personal portfolio leakage.
