# fetch-account — Multi-Broker Account Fetchers Suite

This folder groups all broker position ingestion and cash margin fetcher skills for the portfolio tracking framework:

## Sub-Skills

1. **[`fetch-angelone`](./fetch-angelone/)**:
   - Fetches live Angel One Demat equity positions, CMP, cash margins, bank ledger, and account XIRR.
   - Emits canonical `AccountHoldingsSnapshot`: `reports/accounts/angelone.json` & `angelone.html`.
   - Run: `node skills/fetch-account/fetch-angelone/scripts/fetch_angelone.js`

2. **[`fetch-indmoney-us`](./fetch-indmoney-us/)**:
   - Fetches live INDmoney / DriveWealth US fractional equities, USD cash balances, bank transactions ledger, and USD/INR exchange rates.
   - Emits canonical `AccountHoldingsSnapshot`: `reports/accounts/indmoney_us.json` & `indmoney_us.html`.
   - Run: `node skills/fetch-account/fetch-indmoney-us/scripts/fetch_indmoney_us.js`

3. **[`fetch-all`](./fetch-all/)**:
   - Sequentially orchestrates `fetch-angelone` and `fetch-indmoney-us`.
   - Normalizes multi-currency balances via live FX rates into a unified portfolio.
   - Emits canonical `AccountHoldingsSnapshot`: `reports/accounts/combined.json` & `combined.html`.
   - Run: `node skills/fetch-account/fetch-all/scripts/fetch_all.js`

