# Tasks

## 1. Skill Scaffolding & Canonical Normalizer

- [x] 1.1 Scaffold `.agents/skills/fetch-indmoney-us/` with `SKILL.md` and offline HTML dashboard `assets/report-template.html` (inlined CSS, SVG icons, dual USD/INR currency rendering, zero external asset leaks), and verify template structure with `verifyHtmlSelfContainment`.
- [x] 1.2 Implement `.agents/skills/fetch-indmoney-us/scripts/fetch_indmoney_us.js` normalizing INDmoney MCP / cache data into canonical `AccountHoldingsSnapshot` (`accounts/indmoney_us.json` and `accounts/indmoney_us.html`) with `--broker`, `--out`, `--refresh`, `--only`, `--mock-data`, and `--json-output`.

## 2. Backward Compatibility & Test Suite Verification

- [x] 2.1 Update `.agents/skills/fetch-indmoney-us-stocks/` as a backward-compatibility proxy delegating to `fetch-indmoney-us` and emitting legacy compatibility paths (`reports/indmoney-us-stocks.json`).
- [x] 2.2 Create test fixture `tests/fixtures/sample_us_holdings.json` and test suite `.agents/skills/fetch-indmoney-us/tests/fetch_indmoney_us.test.js` covering snapshot schema validation, fractional shares, cash margins, `--only <ticker>` filtering, and verification harness validation (`verifyArtifactPair` with schema `'holdings'`), and verify all tests pass via `node --test .agents/skills/fetch-indmoney-us/tests/fetch_indmoney_us.test.js`.

