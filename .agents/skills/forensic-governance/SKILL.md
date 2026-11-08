---
name: forensic-governance
description: Tier 3 Gatekeeper evaluation engine enforcing the Gatekeeper Veto Protocol across accounting integrity, promoter pledging, related-party transactions, auditor continuity, Beneish M-Score, and Sloan accrual ratio. Emits canonical UniformVerdictContract and offline HTML audit dashboard. Use when running forensic governance audit, checking promoter pledge risk, vetting stock accounting integrity, or running gatekeeper veto checks.
---

# forensic-governance

Tier 3 Gatekeeper evaluation engine enforcing the Gatekeeper Veto Protocol (`is_veto: true`, `stance: "VETO_DISQUALIFIED"`) across accounting integrity, corporate governance, and promoter risk.

Acts as the mandatory first filter of the 5-pillar valuation suite. Evaluates normalized financial statements against forensic rules and emits canonical `UniformVerdictContract` (SingleVerdict or Option C VerdictBatch) alongside self-contained offline HTML audit dashboards with 0 external network leaks.

## Run

```bash
# Pattern C Offline Mode: evaluate local NormalizedCompanyFinancials JSON
node .agents/skills/forensic-governance/scripts/forensic_governance.js --data reports/financials/INFY.json

# Pattern C Autonomous Mode: query Tier 2 provider and evaluate
node .agents/skills/forensic-governance/scripts/forensic_governance.js --ticker INFY --market IN
node .agents/skills/forensic-governance/scripts/forensic_governance.js --ticker AAPL --market US

# Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot
node .agents/skills/forensic-governance/scripts/forensic_governance.js --holdings reports/accounts/angelone.json
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
- Single: `<out>/verdicts/forensic_governance_<TICKER>.json` & `.html`
- Batch: `<out>/verdicts/forensic_governance_portfolio_verdicts.json` & `forensic_governance_portfolio_audits.html`

