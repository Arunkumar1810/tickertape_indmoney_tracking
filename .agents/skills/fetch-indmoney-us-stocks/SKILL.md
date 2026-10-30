---
name: fetch-indmoney-us-stocks
description: Fetches and displays live INDmoney US stock holdings, valuations, and portfolio cash balances via the INDmoney MCP server. Produces an offline HTML dashboard and JSON data contract. Use when the user says 'fetch US stocks', 'fetch indmoney holdings', 'show US portfolio', or 'list US stocks'.
---

# fetch-indmoney-us-stocks

Fetches live US stock holdings, share quantities, average purchase prices, current market prices (CMP in USD/INR), unrealized P&L, cash balances, and currency conversion rates from INDmoney via the INDmoney MCP server (`https://mcp.indmoney.com/mcp`).

Produces an offline interactive HTML holdings dashboard and a structured JSON sidecar (`reports/indmoney-us-stocks.json`).

## Run

```bash
node .agents/skills/fetch-indmoney-us-stocks/scripts/fetch_us_stocks.js
```

| Flag | Meaning |
|---|---|
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live data from INDmoney MCP |
| `--only TICKER` | Filter to a single US equity ticker (e.g. `AAPL`, `MSFT`) |

Outputs: `reports/indmoney-us-stocks.html` and `reports/indmoney-us-stocks.json`.

## Configuration

Credentials and endpoint configurations reside in `.agents/config/indmoney-mcp.json` and `.env`:
- `INDMONEY_MCP_URL`: `https://mcp.indmoney.com/mcp` (default)
- `INDMONEY_MCP_TOKEN`: Bearer or session token in `.env` (git-ignored)

When `INDMONEY_MCP_TOKEN` is not set or expired, the script prompts with authentication setup instructions or reads local cached data when available.

## Integration

Serves as the single source of truth for US stock portfolio holdings, valuations, and ledger balances across tracking and fundamental audit workflows.
