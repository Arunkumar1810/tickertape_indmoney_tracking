---
name: fetch-all
description: Fetches all broker holdings and generates combined portfolio artifacts. Use when the user asks to "fetch all accounts", "fetch all holdings", "update all portfolios", "run fetch-all", or "generate combined holdings snapshot".
---

# fetch-all

Tier 1 multi-broker account orchestrator and portfolio consolidator.

Invokes `fetch-angelone` and `fetch-indmoney-us` to retrieve domestic (Indian NSE/BSE Demat) and foreign (US NASDAQ/NYSE) holdings and cash ledgers, normalizes currencies using live USD/INR exchange rates, recalculates portfolio weights, and emits a canonical combined `AccountHoldingsSnapshot` JSON contract and an interactive self-contained offline HTML dashboard.

## Run

```bash
node skills/fetch-account/fetch-all/scripts/fetch_all.js
```

### Options

| Flag | Meaning |
|---|---|
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Force live API/SmartAPI refresh across all underlying brokers |
| `--only TICKER` | Filter combined holdings to a single ticker |
| `--json-output` | Output execution metadata and artifact paths as JSON |
| `--mock-data PATH` | Override input with a mock JSON snapshot file |

### Outputs

- **Canonical JSON Contract**: `reports/accounts/combined.json` (also mirrored at `reports/combined.json`)
- **Offline HTML Dashboard**: `reports/accounts/combined.html` (also mirrored at `reports/combined.html`)
- **Underlying Account Artifacts**:
  - `reports/accounts/angelone.json` & `reports/accounts/angelone.html`
  - `reports/accounts/indmoney_us.json` & `reports/accounts/indmoney_us.html`

