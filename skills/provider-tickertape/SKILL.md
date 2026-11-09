---
name: provider-tickertape
description: Tier 2 Market Data Provider ingesting and transforming raw Tickertape Pro market data into canonical NormalizedCompanyFinancials contracts and offline dashboards across Indian and US equities. Use when normalizing fundamental statements, fetching financial data, or updating financials/<TICKER>.json.
---

# provider-tickertape

Tier 2 Market Data Provider bridging external vendor APIs (Tickertape Pro) and Tier 3 Analysis Principles.

Transforms raw income statements, balance sheets, cash flow statements, valuation multiples, and ownership forensics into canonical `NormalizedCompanyFinancials` JSON contracts and self-contained offline HTML statement dashboards for Indian (`IN`) and US (`US`) equities and passive Index ETFs.

## Run

```bash
# Single Indian equity
node .agents/skills/provider-tickertape/scripts/provider_tickertape.js --ticker INFY --market IN

# Single US equity
node .agents/skills/provider-tickertape/scripts/provider_tickertape.js --ticker AAPL --market US

# Batch ingestion from an AccountHoldingsSnapshot
node .agents/skills/provider-tickertape/scripts/provider_tickertape.js --holdings reports/accounts/angelone.json
```

| Flag | Meaning |
|---|---|
| `--ticker SYMBOL` | Canonical equity ticker (e.g. `INFY`, `AAPL`, `VOO`) |
| `--market IN\|US` | Market jurisdiction code (default inferred or `IN`) |
| `--holdings PATH` | Path to an `AccountHoldingsSnapshot` JSON to batch process all positions |
| `--out DIR` | Output destination directory (default `reports/`) |
| `--refresh` | Bypass local cache and re-query vendor API |
| `--mock-data PATH` | Load raw metrics from a mock fixture for deterministic testing |
| `--json-output` | Output execution result as structured JSON |

Outputs: `<out>/financials/<TICKER>.json` and `<out>/financials/<TICKER>.html`.

