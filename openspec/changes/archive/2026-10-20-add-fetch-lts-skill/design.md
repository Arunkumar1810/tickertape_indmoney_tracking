## Context

Existing scripts in the repo (`tickertape_service.js`, `summarize_angelone.js`, `fetch_stock_fundamentals.js`) already talk to the Tickertape MCP endpoint with OAuth tokens in `tokens.json`, and `angelone_holdings.json` / `test_infy.json` show response shapes. A recent probe (`_bmad-output/brainstorm-fetch-lts-skill/probe.json`) returned `Unauthorized`, so token expiry handling is a real concern. "LTS" is treated as long-term stocks review.

## Goals / Non-Goals

**Goals:**
- One command produces an offline HTML report plus JSON with auditable per-stock verdicts.
- Clean split into fetch, score, render, each independently testable.

**Non-Goals:**
- Multi-broker merge, diff mode, what-if scenarios, scheduling, LLM narrative, treemap/radar (V2).
- Investment advice; output is informational.

## Decisions

- **Layout**: `.agents/skills/fetch-lts/` with `SKILL.md`, `scripts/fetch_lts.js` (CLI), `scripts/lib/{fetch,score,render}.js`, `assets/report-template.html`. Alternative of a single monolithic script rejected for testability.
- **Self-contained skill**: everything the skill uses lives under `.agents/skills/fetch-lts/` (scripts, template, `config/lts.config.json`, test fixtures, `state/` for tokens, `reports/`, `.cache/`). Auth is a skill-local copy (`scripts/lib/auth.js`) of the repo's OAuth flow with a one-time import of an existing repo-root login; no dependency on repo scripts or npm packages. Refresh once on 401, else prompt login.
- **Concurrency/cache**: simple promise pool (limit 3); cache files in `<skill>/.cache/<date>/<sid>.json`, gitignored. No new dependencies.
- **Scoring**: pure functions from enrichment JSON to scores/verdict, driven by `config/lts.config.json` merged over defaults. Each verdict records its trigger metrics; confidence = available/expected metrics. Hysteresis thresholds avoid daily flip-flop.
- **Render**: template with a `__DATA__` placeholder replaced by an embedded JSON blob (sanitized to exclude tokens/account ids); inline SVG donut, vanilla JS for filter/sort/search.
- **Testing**: Node built-in `node:test` with fixtures derived from `test_infy.json`.

## Risks / Trade-offs

- Tickertape rate limits or schema drift → cache, concurrency 3, fail-soft partial cards, missing metrics lower confidence.
- Token expiry → single refresh then explicit login prompt.
- Rule-based verdicts may be overconfident → show triggers, confidence, methodology and disclaimer.
- Secret leakage → whitelist fields written to output and add a scan test.

## Open Questions

- Exact Tickertape tool names/fields for scorecard, technicals and forecasts need confirming against `all_tools.json` during implementation.
