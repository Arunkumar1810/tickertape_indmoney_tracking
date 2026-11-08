---
name: fetch-indmoney-us
description: Fetches live INDmoney / DriveWealth US equity holdings, fractional shares, USD cash balances, and USD/INR exchange rates. Emits a canonical AccountHoldingsSnapshot JSON artifact and an offline self-contained HTML dashboard. Use when the user asks to fetch INDmoney holdings, list US positions, or update accounts/indmoney_us.json.
---

# fetch-indmoney-us

Tier 1 broker account fetcher for INDmoney / DriveWealth US Equities accounts (NYSE/NASDAQ).

Fetches live US stock holdings, fractional share quantities, volume-weighted average purchase prices, last traded prices (CMP in USD), unrealized P&L, USD cash ledger balances, and USD/INR foreign exchange rates from INDmoney via MCP / DriveWealth API. Emits a standardized `AccountHoldingsSnapshot` JSON contract and a self-contained offline interactive HTML dashboard with dual-currency USD/INR presentation.

## Run

```bash
node .agents/skills/fetch-indmoney-us/scripts/fetch_indmoney_us.js
```

| Flag | Meaning |
|---|---|
| `--broker indmoney` | Broker identifier (default `indmoney`) |
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live holdings from INDmoney MCP |
| `--only TICKER` | Filter to a single US equity ticker (e.g. `AAPL`, `MSFT`) |
| `--mock-data PATH` | Load raw holdings from a mock JSON fixture for testing |
| `--json-output` | Output execution result as JSON |

Outputs: `accounts/indmoney_us.json` and `accounts/indmoney_us.html`.

