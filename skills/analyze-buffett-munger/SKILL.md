---
name: analyze-buffett-munger
description: Deprecated alias for agent-buffet. Replaced by agent-buffet (Warren Buffett Value Investing Advisor). Evaluates true Owner Earnings, 5-step DuPont ROE decomposition, Return on Invested Capital (ROIC), and economic moat durability.
---

# analyze-buffett-munger (Replaced by agent-buffet)

> [!NOTE]
> This skill has been replaced by **`agent-buffet`** (`skills/agent-buffet/`).
> All active investment ways and valuation workflows execute through `agent-buffet`.

Please use `agent-buffet` directly:

```bash
# Analyze Indian equity:
node skills/agent-buffet/scripts/orchestrate_buffett_analysis.js --ticker INFY

# Analyze US equity:
node skills/agent-buffet/scripts/orchestrate_buffett_analysis.js --ticker AAPL --market US

# Portfolio batch mode:
node skills/agent-buffet/scripts/orchestrate_buffett_analysis.js --holdings reports/accounts/angelone.json
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

