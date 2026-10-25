---
name: analyze-lts-holdings
description: Deep analysis and rule-based scoring of long-term holdings retrieved from fetch-lts. Enriches tickers with Tickertape screener metrics, valuation, quality, financial health, red/green flags, sector concentration caps, and auditable verdicts (Accumulate / Hold / Trim / Review / Exit). Use when the user asks to analyze LTS holdings, review stock metrics, or generate the portfolio rationale report.
---

# analyze-lts-holdings

Consumes equity holdings from the `fetch-lts` skill, enriches each position via the Tickertape MCP server, evaluates quality/valuation/momentum/risk dimensions against configurable thresholds, and produces an offline interactive HTML report plus JSON sidecar.

## Run

```bash
node .agents/skills/analyze-lts-holdings/scripts/analyze_lts_holdings.js
```

| Flag | Meaning |
|---|---|
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Ignore daily cache and refetch fresh Tickertape metrics |
| `--only TICKER` | Analyze a single holding |
| `--config FILE` | Use custom configuration (default `config/lts.config.json`) |

Outputs: `reports/analyze-lts-holdings-YYYY-MM-DD.html` and `.json`.

## How it works

1. **Ingest**: Calls `fetch-lts` to obtain current Demat positions, purchase dates, and portfolio capital.
2. **Tickertape Enrichment**: Fetches screener metrics, scorecard, red/green flags, 52-week ranges, and peer valuations.
3. **Scoring Engine**: Evaluates metrics against configurable weights and hysteresis to determine actionable verdicts (`Accumulate`, `Hold`, `Trim`, `Review`, `Exit`).
4. **Offline HTML Dashboard**: Generates a self-contained, interactive review with sector donut chart, health gauge, and audit drawer.
