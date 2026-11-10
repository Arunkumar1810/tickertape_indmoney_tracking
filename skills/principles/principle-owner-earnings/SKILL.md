---
name: principle-owner-earnings
description: Warren Buffett Owner Earnings & Dilution evaluation engine. Computes authentic cash earnings (CFO - CapEx - SBC) and stock-based compensation dilution. Use when calculating true owner earnings, checking free cash flow dilution, or auditing capital conversion.
---

# principle-owner-earnings

Warren Buffett Owner Earnings & Dilution evaluation engine. Computes authentic cash earnings net of maintenance capital expenditures and non-cash stock-based compensation dilution.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-owner-earnings/scripts/evaluate_owner_earnings.js --data reports/financials/INFY.json

# Evaluate existing report by ticker:
node skills/principles/principle-owner-earnings/scripts/evaluate_owner_earnings.js --ticker INFY
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"owner-earnings"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `classification`: Cash quality category
- `metrics`: `raw_owner_earnings`, `true_owner_earnings`, `sbc_dilution_pct`, `operating_cash_flow`, `capex_used`, `sbc_used`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings
