<!-- bmad:context -->
<!-- Verified 2026-11-09 against 1c346ca927929e19dcfe64cf1879c01009424a54. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## tickertape-indmoney-tracking

Portfolio tracking and multi-pillar fundamental valuation across Indian and US equities. Node.js (CommonJS). Planning and tier architecture specifications live in `skills/`.

## Policy

- Never commit credentials, session tokens, or API secrets — exclude `scripts/tickertape/tokens.json` and any local `.env`.
- Never bypass `scripts/framework/contract_validator.js` — every normalized financial artifact must validate cleanly against registered top-level keys.
- Do not run `git commit` autonomously.

## Where things are

- Tier 2 Providers: Tickertape ingestion at `skills/provider-tickertape/`, Angel One at `skills/fetch-account/fetch-angelone/`, INDmoney US at `skills/fetch-account/fetch-indmoney-us/`, Combined at `skills/fetch-account/fetch-all/`.
- Tier 3 Valuation Engines: `skills/analyze-graham/`, `skills/analyze-lynch/`, `skills/agents/agent-buffet/`, `skills/analyze-klarman-solvency/`, `skills/forensic-governance/`.
- Tier 4 Orchestrators: `skills/way-long-term-strategy/`, `skills/guardrail-engine/`, `skills/holding-blender/`, `skills/strategy-xirr/`.
- Canonical output reports: `reports/financials/<TICKER>.json` and offline visual dashboard `reports/financials/<TICKER>.html`.

## Running and verifying

- Ingest and normalize market data: `node skills/provider-tickertape/scripts/provider_tickertape.js --ticker <TICKER> --market <IN|US> [--refresh]`.
- Execute provider scripts directly from `skills/`, not `.agents/skills/`.
- Run single test files directly with Node: `node skills/provider-tickertape/tests/provider_tickertape.test.js`.
- Do not run `npm test` at repository root — no root test runner is configured.

## Conventions that differ from defaults

- Every normalized entity generates twin artifacts: a canonical JSON data contract and an offline self-contained HTML dashboard with embedded CSS/JS.
- Adding fields to normalized financials requires registering keys in `FINANCIALS_TOP_KEYS` inside `scripts/framework/contract_validator.js`.

## Known pitfalls

- Tickertape API tokens expire periodically; refresh tokens in `scripts/tickertape/tokens.json` when requests return 401/403.
- Contract validator throws `ERR_UNKNOWN_FIELD` if newly fetched API sections are not registered in the schema contract before writing.

<!-- /bmad:context -->

