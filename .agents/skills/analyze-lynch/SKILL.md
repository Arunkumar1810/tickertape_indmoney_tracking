---
name: analyze-lynch
description: Tier 3 Peter Lynch Growth-At-A-Reasonable-Price (GARP) valuation engine computing PEG ratio, yield-adjusted PEG, inventory-to-sales velocity divergence, and company lifecycle categorization. Emits canonical UniformVerdictContract and offline HTML audit dashboard. Use when evaluating growth stocks, calculating PEG ratios, detecting inventory divergence, or classifying companies into Lynch archetypes.
---

# analyze-lynch

Tier 3 Peter Lynch Growth-At-A-Reasonable-Price (GARP) valuation engine establishing whether company valuation multiples are justified by underlying earnings expansion and capital returns.

Operates as a primary quantitative pillar of the 5-pillar valuation suite under `AID-BMAD-MODULAR-STOCK-V1`. Evaluates normalized financial statements against classic Lynch GARP principles, detects operational inventory accumulation traps, categorizes company lifecycle stages, and emits canonical `UniformVerdictContract` (SingleVerdict or Option C VerdictBatch) alongside self-contained offline HTML audit dashboards with 0 external network leaks.

## Run

```bash
# Pattern C Offline Mode: evaluate local NormalizedCompanyFinancials JSON
node .agents/skills/analyze-lynch/scripts/analyze_lynch.js --data reports/financials/INFY.json

# Pattern C Autonomous Mode: query Tier 2 provider and evaluate
node .agents/skills/analyze-lynch/scripts/analyze_lynch.js --ticker INFY --market IN
node .agents/skills/analyze-lynch/scripts/analyze_lynch.js --ticker AAPL --market US

# Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot
node .agents/skills/analyze-lynch/scripts/analyze_lynch.js --holdings reports/accounts/angelone.json
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
- Single: `<out>/verdicts/<TICKER>_lynch.json` & `.html`
- Batch: `<out>/verdicts/lynch_portfolio_verdicts.json` & `lynch_portfolio_audits.html`

