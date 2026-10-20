# Proposal

## Why

Portfolio data already flows from Angel One into Tickertape via ad-hoc scripts (`summarize_angelone.js`, `fetch_stock_fundamentals.js`, `tickertape_service.js`), but there is no repeatable way to turn it into a decision-ready report. Raw numbers without context or reasoning aren't actionable. A reusable `fetch-lts` skill that produces one self-contained HTML report with an auditable, per-stock rationale closes that gap (see `_bmad-output/brainstorm-fetch-lts-skill`).

## What Changes

- Add a `fetch-lts` skill at `.agents/skills/fetch-lts/` (SKILL.md, `scripts/fetch_lts.js`, `assets/report-template.html`) invoked via `node scripts/fetch_lts.js --broker angelone`.
- Fetch Angel One holdings through Tickertape (using skill-local auth with the existing Tickertape login), then enrich each ticker (fundamentals, scorecard, forecasts, technicals) with concurrency limit 3.
- Add a per-day on-disk cache (key: sid + date), `--refresh` to bypass and `--only TICKER` to run one stock.
- Add a deterministic, rule-based rationale engine: five scores (quality, valuation, momentum, analyst, risk) plus position context, verdict (Accumulate / Hold / Trim / Review / Exit), triggering metrics, confidence meter, red/green flags. Thresholds and weights live in the skill's `config/lts.config.json`.
- Render a single offline HTML report (inline CSS/JS, embedded JSON): hero summary, sector donut, card grid and sortable table, filters/search, expandable drawers, methodology drawer, disclaimer, dark mode default. Also write a JSON side-output.
- Fail-soft: a failed ticker enrichment yields a partial card with a warning badge. No tokens or account IDs are embedded in the output.
- Out of scope (V2): diff mode, what-if scenarios, multi-broker merge (Kite), scheduled runs, LLM narrative, treemap/radar charts.

## Capabilities

### New Capabilities
- `skills/fetch-lts-skill`: The fetch-lts skill end to end: Angel One holdings fetch, per-ticker enrichment with caching and fail-soft behavior, config-driven rationale scoring and verdicts, and the self-contained HTML and JSON report.

### Modified Capabilities

(none; no existing specs)

## Impact

- New files only under `.agents/skills/fetch-lts/` (including config; `reports/`, `.cache/` and `state/` are git-ignored).
- Self-contained: all scripts, assets, config, fixtures, state and outputs live inside the skill directory; no runtime dependency on repo scripts or npm packages.
- Risks: Tickertape rate limits and token expiry (mitigated by cache, concurrency limit, fail-soft). Informational output only, not investment advice.
