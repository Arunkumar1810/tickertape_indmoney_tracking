---
name: analyze-buffett-munger
description: Tier 3 Warren Buffett & Charlie Munger compounding valuation engine computing true Owner Earnings (CFO - CapEx - SBC), 5-step DuPont ROE decomposition, Return on Invested Capital (ROIC), and economic moat durability. Emits canonical UniformVerdictContract and offline HTML audit dashboard. Use when auditing economic moats, evaluating capital allocation efficiency, calculating true Owner Earnings, or decomposing ROE quality.
---

# analyze-buffett-munger

Tier 3 Warren Buffett & Charlie Munger Compounding Valuation Engine establishing whether a company possesses a durable economic moat, demonstrates disciplined capital allocation, and generates authentic cash earnings net of dilution.

Operates as a primary quantitative valuation pillar of the 5-pillar valuation suite under `AID-BMAD-MODULAR-STOCK-V1`. Evaluates normalized financial statements against classic Buffett-Munger principles, decomposes ROE via the 5-step DuPont model to uncover artificial leverage, calculates true Owner Earnings $(\text{CFO} - \text{Maintenance CapEx} - \text{SBC})$, and emits canonical `UniformVerdictContract` (SingleVerdict or Option C VerdictBatch) alongside self-contained offline HTML audit dashboards with 0 external network leaks.

## Run

```bash
# Pattern C Offline Mode: evaluate local NormalizedCompanyFinancials JSON
node .agents/skills/analyze-buffett-munger/scripts/analyze_buffett_munger.js --data reports/financials/INFY.json

# Pattern C Autonomous Mode: query Tier 2 provider and evaluate
node .agents/skills/analyze-buffett-munger/scripts/analyze_buffett_munger.js --ticker INFY --market IN
node .agents/skills/analyze-buffett-munger/scripts/analyze_buffett_munger.js --ticker AAPL --market US

# Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot
node .agents/skills/analyze-buffett-munger/scripts/analyze_buffett_munger.js --holdings reports/accounts/angelone.json
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
- Single: `<out>/verdicts/<TICKER>_buffett_munger.json` & `.html`
- Batch: `<out>/verdicts/buffett_munger_portfolio_verdicts.json` & `buffett_munger_portfolio_audits.html`

