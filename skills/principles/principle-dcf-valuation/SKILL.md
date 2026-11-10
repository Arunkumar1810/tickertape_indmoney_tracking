---
name: principle-dcf-valuation
description: Gordon Growth DCF Intrinsic Valuation engine. Computes enterprise intrinsic value and percentage margin of safety. Use when calculating DCF intrinsic value, estimating future cash flow capitalization, or auditing downside margin of safety.
---

# principle-dcf-valuation

Gordon Growth DCF Intrinsic Valuation engine. Calculates forward cash flow intrinsic enterprise value and compares it against market capitalization to quantify the margin of safety.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-dcf-valuation/scripts/evaluate_dcf.js --data reports/financials/INFY.json

# Evaluate with custom growth and discount rates:
node skills/principles/principle-dcf-valuation/scripts/evaluate_dcf.js --ticker INFY --growth-rate 0.03 --discount-rate 0.09
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |
| `--growth-rate RATE` | Terminal growth rate (default 0.025) |
| `--discount-rate RATE` | Hurdle discount rate (default 0.10) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"dcf-valuation"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `metrics`: `fcf0`, `fcf1`, `intrinsic_value`, `market_cap`, `margin_of_safety_pct`, `price_to_value_ratio`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings

