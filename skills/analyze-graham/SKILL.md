---
name: analyze-graham
description: Tier 3 Benjamin Graham valuation engine computing Net-Net Working Capital (NNWC), Net Current Asset Value (NCAV), Graham Number floor, Margin of Safety, and defensive investor criteria. Emits canonical UniformVerdictContract and offline HTML audit dashboard. Use when running Graham valuation analysis, calculating liquidation floor, checking net-net discounts, or evaluating defensive investor criteria.
---

# analyze-graham

Tier 3 Benjamin Graham valuation engine establishing conservative liquidation floors (NNWC, NCAV) and intrinsic value bounds (Graham Number floor) against Current Market Price (CMP).

Operates as a primary quantitative pillar of the 5-pillar valuation suite under `AID-BMAD-MODULAR-STOCK-V1`. Evaluates normalized financial statements against classic Graham value investing principles and emits canonical `UniformVerdictContract` (SingleVerdict or Option C VerdictBatch) alongside self-contained offline HTML audit dashboards with 0 external network leaks.

## Run

```bash
# Pattern C Offline Mode: evaluate local NormalizedCompanyFinancials JSON
node .agents/skills/analyze-graham/scripts/analyze_graham.js --data reports/financials/INFY.json

# Pattern C Autonomous Mode: query Tier 2 provider and evaluate
node .agents/skills/analyze-graham/scripts/analyze_graham.js --ticker INFY --market IN
node .agents/skills/analyze-graham/scripts/analyze_graham.js --ticker AAPL --market US

# Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot
node .agents/skills/analyze-graham/scripts/analyze_graham.js --holdings reports/accounts/angelone.json
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
- Single: `<out>/verdicts/<TICKER>_graham.json` & `.html`
- Batch: `<out>/verdicts/graham_portfolio_verdicts.json` & `graham_portfolio_audits.html`

