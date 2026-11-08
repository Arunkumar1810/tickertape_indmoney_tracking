---
name: fetch-angelone
description: Fetches live Angel One Demat equity holdings and cash margins without complex analysis or valuation metrics. Emits a canonical AccountHoldingsSnapshot JSON artifact and an offline self-contained HTML dashboard. Use when the user asks to fetch Angel One holdings, list Indian demat positions, or update accounts/angelone.json.
---

# fetch-angelone

Tier 1 broker account fetcher for Angel One Demat & Trading accounts (NSE/BSE).

Fetches live Demat equity holdings, purchase prices, last traded prices (CMP), unrealized P&L, and available cash margins from Angel One via SmartAPI / local MCP server. Emits a standardized `AccountHoldingsSnapshot` JSON contract and a self-contained offline interactive HTML dashboard.

## Run

```bash
node .agents/skills/fetch-angelone/scripts/fetch_angelone.js
```

| Flag | Meaning |
|---|---|
| `--broker angelone` | Broker identifier (default `angelone`) |
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live holdings from SmartAPI |
| `--only TICKER` | Filter to a single ticker |
| `--json-output` | Output execution result as JSON |

Outputs: `accounts/angelone.json` and `accounts/angelone.html`.

