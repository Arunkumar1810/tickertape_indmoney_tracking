---
name: fetch-angelone
description: Fetches live Angel One Demat equity holdings, cash margins, funds invested, account XIRR, and bank transactions ledger without complex valuation metrics. Emits a canonical AccountHoldingsSnapshot JSON artifact and an offline self-contained HTML dashboard with an interactive ledger popup. Use when the user asks to fetch Angel One holdings, list Indian demat positions, check account XIRR/ledger, or update accounts/angelone.json.
---

# fetch-angelone

Tier 1 broker account fetcher for Angel One Demat & Trading accounts (NSE/BSE).

Fetches live Demat equity holdings, purchase prices, last traded prices (CMP), unrealized P&L, available cash margins, net funds invested, account XIRR, and historical bank ledger transactions from Angel One via SmartAPI / local MCP server. Emits a standardized `AccountHoldingsSnapshot` JSON contract and a self-contained offline interactive HTML dashboard featuring an interactive Bank Transactions Ledger popup accessible by clicking the Account XIRR metric.

## Run

```bash
node .agents/skills/fetch-angelone/scripts/fetch_angelone.js
```

| Flag | Meaning |
|---|---|
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live holdings from SmartAPI |
| `--only TICKER` | Filter to a single ticker |
| `--json-output` | Output execution result as JSON |

Outputs: `accounts/angelone.json` and `accounts/angelone.html`.

