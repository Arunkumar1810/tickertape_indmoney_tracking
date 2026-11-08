---
name: analyze-klarman-solvency
description: Tier 3 Seth Klarman downside stress and solvency valuation engine computing Altman Z-Score, Net Debt to EBITDA leverage, interest coverage buffer, and debt maturity cliff exposure. Emits canonical UniformVerdictContract and offline HTML audit dashboard. Use when stress-testing balance sheets, checking insolvency risk, auditing debt maturity walls, or assessing downside margin of safety.
---

# analyze-klarman-solvency

Tier 3 Seth Klarman Downside Stress and Solvency Valuation Engine establishing whether a business possesses the financial fortitude to endure adverse economic conditions, refinancing freezes, and liquidity shocks.

Operates as the fifth quantitative pillar of the 5-pillar valuation suite under `AID-BMAD-MODULAR-STOCK-V1`. Evaluates normalized financial statements against classic Klarman margin of safety principles, calculates the classical Altman Z-Score to detect bankruptcy distress zones, audits Net Debt to EBITDA leverage burdens, identifies debt maturity cliffs maturing within 24 months, and emits canonical `UniformVerdictContract` (SingleVerdict or Option C VerdictBatch) alongside self-contained offline HTML audit dashboards with 0 external network leaks.

## Run

```bash
# Pattern C Offline Mode: evaluate local NormalizedCompanyFinancials JSON
node .agents/skills/analyze-klarman-solvency/scripts/analyze_klarman_solvency.js --data reports/financials/INFY.json

# Pattern C Autonomous Mode: query Tier 2 provider and evaluate
node .agents/skills/analyze-klarman-solvency/scripts/analyze_klarman_solvency.js --ticker INFY --market IN
node .agents/skills/analyze-klarman-solvency/scripts/analyze_klarman_solvency.js --ticker AAPL --market US

# Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot
node .agents/skills/analyze-klarman-solvency/scripts/analyze_klarman_solvency.js --holdings reports/accounts/angelone.json
```

| Flag | Meaning |
|---|---|
| `--data PATH` | Path to local `NormalizedCompanyFinancials` JSON (deterministic offline mode) |
| `--ticker SYMBOL` | Canonical equity ticker (autonomous mode querying `provider-tickertape`) |
| `--market IN\|US` | Market jurisdiction code (default inferred or `IN`) |
| `--holdings PATH` | Path to `AccountHoldingsSnapshot` JSON to evaluate entire portfolio into `VerdictBatch` |
| `--out DIR` | Output destination directory (default `reports/`) |
| `--json-output` | Output verdict object or batch directly to stdout |
| `--refresh` | Force provider refresh in autonomous mode |

Outputs:
- Single: `<out>/verdicts/<TICKER>_klarman_solvency.json` & `.html`
- Batch: `<out>/verdicts/klarman_solvency_portfolio_verdicts.json` & `klarman_solvency_portfolio_audits.html`

