---
name: fetch-indmoney-us
description: Fetches live INDmoney / DriveWealth US equity holdings, fractional shares, USD cash balances, funds invested, account XIRR, bank transactions ledger, and USD/INR exchange rates. Emits a canonical AccountHoldingsSnapshot JSON artifact and an offline self-contained HTML dashboard with an interactive ledger popup. Use when the user asks to fetch INDmoney holdings, list US positions, check account XIRR/ledger, or update accounts/indmoney_us.json.
---

# fetch-indmoney-us

Tier 1 broker account fetcher for INDmoney / DriveWealth US Equities accounts (NYSE/NASDAQ).

Fetches live US stock holdings, fractional share quantities, volume-weighted average purchase prices, last traded prices (CMP in USD), unrealized P&L, USD cash ledger balances, funds invested, account XIRR, transaction ledger history, and USD/INR foreign exchange rates from INDmoney via MCP / DriveWealth API. Emits a standardized `AccountHoldingsSnapshot` JSON contract and a self-contained offline interactive HTML dashboard with dual-currency USD/INR presentation and interactive bank ledger popup modal.

## Run

```bash
node skills/fetch-account/fetch-indmoney-us/scripts/fetch_indmoney_us.js
```

| Flag | Meaning |
|---|---|
| `--broker indmoney` | Broker identifier (default `indmoney`) |
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Bypass local cache and fetch live holdings from INDmoney MCP |
| `--login`, `--auth` | Launch interactive browser OAuth login (PKCE) on `http://localhost:3000/callback` to refresh token and fetch live |
| `--auth-only` | Run OAuth login and update `.env` without generating portfolio reports |
| `--no-browser` | Prevent auto-opening browser (prints authorization URL to terminal) |
| `--only TICKER` | Filter to a single US equity ticker (e.g. `AAPL`, `MSFT`) |
| `--mock-data PATH` | Load raw holdings from a mock JSON fixture for testing |
| `--json-output` | Output execution result as JSON |

Outputs: `accounts/indmoney_us.json` and `accounts/indmoney_us.html`.

### OAuth Authentication & Token Renewal

When session tokens expire (HTTP 401/403):
1. Run with `--login` to initiate the local PKCE OAuth server:
   ```bash
   node skills/fetch-account/fetch-indmoney-us/scripts/fetch_indmoney_us.js --login
   # Or via slash command:
   /fetch-indmoney-us --login
   ```
2. The browser automatically navigates to `https://mcp.indmoney.com/authorize`.
3. Upon approval, the local server at `http://localhost:3000/callback` exchanges the code for a Bearer token and updates `INDMONEY_MCP_TOKEN` in `config/.env` and `.env`.
4. The skill immediately completes live portfolio fetching and generates verified artifacts.

