---
name: fetch-lts
description: Fetches and displays live Angel One equity holdings and account cash margins without complex analysis or metrics. Generates a clean offline HTML dashboard and JSON data, serving as the source of truth for analyze-lts-holdings and fetch-lts-xirr. Use when the user asks to fetch LTS, view holdings, or list demat positions.
---

# fetch-lts

Fetches live Demat equity holdings, purchase prices, last traded prices (CMP), unrealized P&L, and available margin from Angel One via the local Angel One MCP server.

Produces a clean, offline interactive HTML holdings dashboard and JSON sidecar.

## Run

```bash
node .agents/skills/fetch-lts/scripts/fetch_lts.js
```

| Flag | Meaning |
|---|---|
| `--broker angelone` | Broker identifier (default `angelone`) |
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live holdings from SmartAPI |
| `--only TICKER` | Filter to a single ticker |

Outputs: `reports/fetch-lts.html` and `reports/fetch-lts.json`.

## Integration

Downstream skills (`analyze-lts-holdings` and `fetch-lts-xirr`) consume this skill or read its generated output (`reports/fetch-lts.json`), ensuring a single source of truth for Demat holdings and cash balances across the portfolio.
