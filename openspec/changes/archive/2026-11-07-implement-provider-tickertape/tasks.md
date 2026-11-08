# Tasks

## 1. Skill Scaffolding & Canonical Transformation Pipeline

- [x] 1.1 Scaffold `.agents/skills/provider-tickertape/` with `SKILL.md` and offline HTML financial statement template `assets/financials-template.html` (inlined CSS, SVG icons, statement tabs, zero external asset leaks), and verify template structure with `verifyHtmlSelfContainment`.
- [x] 1.2 Implement `.agents/skills/provider-tickertape/scripts/provider_tickertape.js` transforming raw Tickertape Pro data into canonical `NormalizedCompanyFinancials` (`financials/<TICKER>.json` and `financials/<TICKER>.html`) with multi-market (`IN` / `US`) scaling, Index ETF detection, `--ticker`, `--market`, `--holdings`, `--out`, `--refresh`, `--mock-data`, and `--json-output`.

## 2. Fixtures & Comprehensive Verification

- [x] 2.1 Create representative multi-market test fixtures in `tests/fixtures/` (`sample_in_financials.json`, `sample_us_financials.json`, and `sample_etf_financials.json`).
- [x] 2.2 Implement unit and CLI test suite in `.agents/skills/provider-tickertape/tests/provider_tickertape.test.js` covering Indian equity normalization, US equity normalization, Index ETF statement bypass, `--holdings` snapshot ingestion mode, and verification harness validation (`verifyArtifactPair` with schema `'financials'`), and verify all tests pass via `node --test .agents/skills/provider-tickertape/tests/provider_tickertape.test.js`.

