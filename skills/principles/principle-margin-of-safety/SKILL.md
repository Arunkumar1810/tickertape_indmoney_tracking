---
name: principle-margin-of-safety
description: Warren Buffett Margin of Safety & Valuation Yield evaluation engine. Computes Owner Earnings Yield against market capitalization to confirm value floor. Use when auditing margin of safety, evaluating owner earnings yield, or checking valuation multiple support.
---

# principle-margin-of-safety

Warren Buffett Margin of Safety & Valuation Yield evaluation engine. Evaluates whether a stock offers an adequate cash return on purchase price.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-margin-of-safety/scripts/evaluate_margin_of_safety.js --data reports/financials/INFY.json

# Evaluate existing report by ticker:
node skills/principles/principle-margin-of-safety/scripts/evaluate_margin_of_safety.js --ticker INFY
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"margin-of-safety"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `classification`: Valuation multiple category
- `metrics`: `market_cap`, `true_owner_earnings`, `owner_earnings_yield_pct`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings
