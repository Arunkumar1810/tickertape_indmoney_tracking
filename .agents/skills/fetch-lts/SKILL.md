---
name: fetch-lts
description: Generates an offline HTML long-term holdings review for Angel One holdings using Tickertape data, with an auditable rule-based verdict (Accumulate / Hold / Trim / Review / Exit) for every stock. Use when the user asks to fetch LTS, review long-term holdings, or build the portfolio rationale report.
---

# fetch-lts

Fetches Angel One holdings via the Tickertape MCP server, enriches each ticker, scores it with configurable rules, and writes a single self-contained HTML report plus a JSON side-output.

## Run

```bash
node .agents/skills/fetch-lts/scripts/fetch_lts.js --broker angelone
```

| Flag | Meaning |
|------|---------|
| `--broker angelone` | Only `angelone` is supported in this version |
| `--out DIR` | Output directory (default `<skill>/reports/`, git-ignored) |
| `--refresh` | Ignore the daily cache and refetch everything |
| `--only TICKER` | Process a single holding (sector caps still use the full portfolio) |
| `--config FILE` | Use a different config (default `config/lts.config.json` in the skill) |

Outputs: `<skill>/reports/fetch-lts-YYYY-MM-DD.html` and `.json`. Open the HTML directly; it needs no network.

## How it works

1. **Auth** (`scripts/lib/auth.js`): OAuth tokens and client registration live in the skill's `state/` directory (override with `LTS_STATE_DIR`). On first run an existing repo-root `tokens.json` / `client_credentials.json` is copied in once. On an unauthorized response it refreshes once, then falls back to the interactive login (browser, port 8080).
2. **Holdings**: finds the Angel One broker via `pf_user_brokers_read`, then reads holdings and performance for that gateway only.
3. **Enrichment**: per ticker, screener metrics, scorecard and checklists, quote and 52-week range, peer P/E. At most 3 tickers run concurrently. Results are cached under `<skill>/.cache/<date>/<sid>.json`. A ticker with failed calls shows a warning badge and is not cached.
4. **Scoring** (`scripts/lib/score.js`): quality, valuation, momentum, analyst and risk scores, an overall score, a verdict with its triggering metrics, confidence, red/green flags, concentration warnings and a tax-aware trim note.
5. **Render** (`scripts/lib/render.js`): only whitelisted fields are embedded; the run aborts if any token or client credential value appears in the output.

## Configuration (`config/lts.config.json`)

Weights, verdict thresholds, hysteresis, stock/sector weight caps (15% / 30%), tax window and concurrency. Add `"buyDates": {"INFY": "2025-11-20"}` to enable the tax-aware note (Angel One holdings do not expose purchase dates). Missing keys fall back to defaults.

## Tests

```bash
node --test .agents/skills/fetch-lts/tests/score.test.js .agents/skills/fetch-lts/tests/fetch.test.js .agents/skills/fetch-lts/tests/render.test.js
```

## Notes and limits

- Red/green flags are best-effort signals read from Tickertape checklist titles, not exact promoter/debt trend data.
- Informational only; not investment advice.
