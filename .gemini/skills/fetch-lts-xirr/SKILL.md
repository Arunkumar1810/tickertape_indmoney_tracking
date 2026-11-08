---
name: fetch-lts-xirr
description: Calculates True Investor XIRR and asset compounding for Angel One accounts using ledger deposits, CMPs, and tradebooks, rendering an offline HTML dashboard with friction drag breakdown. Use when the user asks to calculate portfolio XIRR, audit true investor returns, check bank ledger friction, or analyze asset compounding.
---

# fetch-lts-xirr

Connects to Angel One MCP (`pyalgobot/angelone-mcp`) to fetch live portfolio holdings, current market prices (CMPs), and free margin cash, integrates bank deposit/withdrawal ledgers to compute **True Investor XIRR (Net of All Hidden Charges & Taxes)**, and renders a self-contained interactive offline HTML report.

## Run

```bash
node .agents/skills/fetch-lts-xirr/scripts/fetch_lts_xirr.js
```

| Flag | Meaning |
|---|---|
| `--ledger FILE` | Path to Angel One Broking Ledger `.xlsx` (copied into `.cache/`), or a Funds statement CSV / JSON. If omitted, `config/ledger.json|csv`, then the newest `.xlsx` in `.cache/` is used |
| `--tradebook FILE` | Path to Angel One Tradebook CSV or JSON for historical trades |
| `--refresh` | Bypass the local cache and refetch fresh data from Angel One MCP |
| `--only TICKER` | Filter the report view to a single stock ticker |
| `--out DIR` | Output directory (default `.agents/skills/fetch-lts-xirr/reports/`, git-ignored) |
| `--config FILE` | Use a custom configuration file (default `config/xirr.config.json`) |

Outputs: `.agents/skills/fetch-lts-xirr/reports/fetch-lts-xirr.html` and `.json` (date is embedded inside the file). Open the HTML file in any browser; it requires no internet connection.

## Pipeline

1. **Holdings & Ledger Ingestion**: Fetches live Angel One holdings, CMPs, margin balances, and historical tradebooks via MCP, paired with bank deposit/withdrawal ledgers.
2. **Cashflow Reconciliation**: Automatically reconciles multi-year buy tranches, verified corporate dividends, and terminal equity, absorbing DP charges, STT, and broker levies.
3. **High-Precision XIRR Engine**: Employs a robust Newton-Raphson solver with bisection fallback to calculate True Investor XIRR alongside Gross Stock XIRR and friction drag spread.
4. **Interactive Offline Dashboard**: Renders a standalone dashboard (`reports/fetch-lts-xirr.html`) with per-column sorting, sub-90-day guardrails, and audit drawers.

## Tests

```bash
node --test .agents/skills/fetch-lts-xirr/tests/*.test.js
```
