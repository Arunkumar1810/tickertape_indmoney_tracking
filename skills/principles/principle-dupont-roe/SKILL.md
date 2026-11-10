---
name: principle-dupont-roe
description: Warren Buffett & Charlie Munger 5-step DuPont ROE decomposition engine. Separates operational compounding efficiency from artificial financial leverage. Use when decomposing ROE, auditing operational margins against leverage, or checking capital discipline.
---

# principle-dupont-roe

Warren Buffett & Charlie Munger 5-step DuPont ROE decomposition engine. Separates authentic operational compounding power from artificial balance sheet leverage.

## Run

```bash
# Evaluate from local NormalizedCompanyFinancials JSON:
node skills/principles/principle-dupont-roe/scripts/evaluate_dupont_roe.js --data reports/financials/INFY.json

# Evaluate existing report by ticker:
node skills/principles/principle-dupont-roe/scripts/evaluate_dupont_roe.js --ticker INFY
```

## Options

| Flag | Description |
|---|---|
| `--data PATH` | Path to normalized financials JSON |
| `--ticker SYMBOL` | Canonical ticker symbol (resolves against reports/financials/<SYMBOL>.json) |

## Output Contract

Emits deterministic JSON output:
- `principle`: `"dupont-roe"`
- `ticker`: canonical symbol
- `status`: `"PASS"`, `"WARN"`, or `"FAIL"`
- `score`: integer from 0 to 100
- `classification`: Compounding quality category
- `metrics`: `roe_pct`, `tax_burden`, `interest_burden`, `operating_margin_pct`, `asset_turnover`, `financial_leverage`
- `summary`: One-line verdict summary
- `observations`: Bulleted factual findings
