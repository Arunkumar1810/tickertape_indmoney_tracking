---
name: principle-economic-moat
description: Warren Buffett Economic Moat & ROIC evaluation engine. Evaluates return on invested capital hurdle and sustainable competitive advantage. Use when auditing economic moats, evaluating competitive barriers, or testing ROIC hurdles.
---

# principle-economic-moat

Warren Buffett Economic Moat & ROIC evaluation engine. Evaluates whether a company demonstrates a sustainable competitive advantage and high capital efficiency net of reinvestment.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-economic-moat/scripts/evaluate_moat.js --data reports/financials/INFY.json

# Evaluate existing report by ticker:
node skills/principles/principle-economic-moat/scripts/evaluate_moat.js --ticker INFY
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"economic-moat"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `classification`: Moat category (`"Wide Economic Moat"`, `"Strong Economic Moat"`, etc.)
- `metrics`: `roic_pct`, `nopat`, `invested_capital`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings
