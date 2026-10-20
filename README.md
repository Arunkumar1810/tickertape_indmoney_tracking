# Tickertape & INDmoney Investment Tracking

A skills-based repository for tracking, analyzing, and reviewing investment portfolios via Tickertape and linked brokers.

## Available Skills

### `fetch-lts`
Generates an offline HTML long-term holdings review and portfolio rationale report for Angel One holdings using Tickertape data, with auditable rule-based verdicts (`Accumulate`, `Hold`, `Trim`, `Review`, `Exit`).

#### Usage
```bash
node .agents/skills/fetch-lts/scripts/fetch_lts.js --broker angelone
```

#### Flags
| Flag | Description |
|------|-------------|
| `--broker angelone` | Broker to review (defaults to `angelone`) |
| `--out DIR` | Output directory (default: `<skill>/reports/`) |
| `--refresh` | Bypass the daily cache and fetch fresh live data |
| `--only TICKER` | Run rationale report for a single holding |
| `--config FILE` | Custom config file (default: `<skill>/config/lts.config.json`) |

- **Outputs:** `<skill>/reports/fetch-lts-YYYY-MM-DD.html` and `.json`.
- **Credentials:** Kept self-contained in `.agents/skills/fetch-lts/state/` (git-ignored).
- **Skill Documentation:** See [`.agents/skills/fetch-lts/SKILL.md`](.agents/skills/fetch-lts/SKILL.md) for full architecture and configuration options.
