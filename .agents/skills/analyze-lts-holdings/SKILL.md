---
name: analyze-lts-holdings
description: Deep analysis, rule-based scoring, and individual fundamental valuation auditing of long-term holdings from fetch-lts using fundamental-stock-analysis. Generates portfolio dashboards and detailed stock valuation reports (Graham numbers, Owner Earnings, 5-step DuPont ROE, Klarman solvency). Use when the user says 'analyze LTS holdings', 'audit portfolio stocks', 'run fundamental analysis on portfolio', or 'generate portfolio rationale report'.
---

# analyze-lts-holdings

Consumes equity holdings from the `fetch-lts` skill, enriches each position via the Tickertape MCP server, generates an individual deep valuation audit report for each holding via `fundamental-stock-analysis`, and produces a unified offline interactive HTML portfolio dashboard plus JSON sidecar.

## Run

```bash
node .agents/skills/analyze-lts-holdings/scripts/analyze_lts_holdings.js
```

| Flag | Meaning |
|---|---|
| `--out DIR` | Output directory (default `reports/`) |
| `--refresh` | Ignore daily cache and refetch fresh Tickertape metrics |
| `--only TICKER` | Analyze and audit a single holding |
| `--config FILE` | Use custom configuration (default `config/lts.config.json`) |
| `--skip-reports` | Skip generating individual stock fundamental valuation reports |

Outputs:
- Portfolio Dashboard: `reports/analyze-lts-holdings.html` and `.json` (plus dated copies)
- Stock Fundamental Audits: `reports/fundamentals/<TICKER>.html` and `<TICKER>.md`

## How it works

1. **Ingest**: Calls `fetch-lts` to obtain current Demat positions, purchase dates, and portfolio capital.
2. **Tickertape Enrichment**: Fetches screener metrics, scorecard, red/green flags, 52-week ranges, and peer valuations.
3. **Fundamental Stock Valuation Audit**: Invokes `fundamental-stock-analysis` for each portfolio holding to deterministically compute Graham Number floor, Owner Earnings, 5-step DuPont ROE, Lynch PEG, and Klarman Solvency (Net Debt / EBITDA, Interest coverage, CFO accrual quality), writing individual markdown and HTML reports under `reports/fundamentals/`.
4. **Scoring Engine**: Evaluates metrics against configurable weights and hysteresis to determine actionable verdicts (`Accumulate`, `Hold`, `Trim`, `Review`, `Exit`).
5. **Interactive Portfolio Dashboard**: Generates a self-contained offline dashboard with sector donut chart, health gauge, audit drawer, and direct links to each holding's fundamental valuation report.

