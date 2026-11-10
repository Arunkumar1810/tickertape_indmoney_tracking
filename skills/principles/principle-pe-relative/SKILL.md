---
name: principle-pe-relative
description: P/E Multiple Relative Valuation & PEG evaluation engine. Analyzes Price-to-Earnings ratio against historical bands, industry averages, and growth rate. Use when evaluating P/E valuation multiples, comparing P/E to sector peers, or auditing PEG ratios.
---

# principle-pe-relative

P/E Multiple Relative Valuation & PEG evaluation engine. Compares a stock's current multiple against industry peers and historical norms to detect valuation signals.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-pe-relative/scripts/evaluate_pe.js --data reports/financials/INFY.json

# Evaluate existing report by ticker:
node skills/principles/principle-pe-relative/scripts/evaluate_pe.js --ticker INFY
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"pe-relative"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `classification`: Valuation signal (`"UNDERVALUED"`, `"ATTRACTIVE"`, `"NEUTRAL"`, `"EXPENSIVE"`, `"OVERVALUED"`)
- `metrics`: `current_pe`, `industry_avg_pe`, `peg_ratio`, `relative_to_industry_pct`, `relative_to_history_pct`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings

