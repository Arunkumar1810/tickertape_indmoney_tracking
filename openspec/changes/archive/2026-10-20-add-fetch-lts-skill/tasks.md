# Tasks

## 1. Scaffolding and config

- [x] 1.1 Create `.agents/skills/fetch-lts/` with `SKILL.md`, `scripts/`, `assets/`
- [x] 1.2 Add `config/lts.config.json` inside the skill with default thresholds, weights, concentration caps
- [x] 1.3 Git-ignore `state/`, `reports/` and `.cache/` (skill-local .gitignore)
- [x] 1.4 Confirm Tickertape tool names/fields against `all_tools.json` and `test_infy.json`

## 2. Data pipeline

- [x] 2.1 Implement CLI parsing (`--broker`, `--out`, `--refresh`, `--only`)
- [x] 2.2 Skill-local Tickertape client/auth with token refresh-on-401 then login prompt
- [x] 2.3 Fetch Angel One holdings
- [x] 2.4 Implement per-ticker enrichment with concurrency limit 3
- [x] 2.5 Implement daily on-disk cache and `--refresh` bypass
- [x] 2.6 Implement fail-soft partial results with warning markers

## 3. Rationale engine

- [x] 3.1 Implement the five dimension scores with missing-metric handling
- [x] 3.2 Implement verdict logic with hysteresis, one-line reason and trigger metrics
- [x] 3.3 Implement confidence, red/green flags, concentration warnings, tax-aware trim note
- [x] 3.4 Unit tests with fixtures from `test_infy.json`

## 4. HTML report

- [x] 4.1 Build `assets/report-template.html` with dark/light theme, print CSS, responsive layout
- [x] 4.2 Hero summary, sector donut, cards and sortable table views
- [x] 4.3 Filters, search, expandable drawers, methodology section, disclaimer
- [x] 4.4 Render with sanitized embedded data; write `fetch-lts-YYYY-MM-DD.html` and JSON side-output
- [x] 4.5 Test that outputs contain no tokens, secrets or account IDs

## 5. Docs and verification

- [x] 5.1 Write SKILL.md usage and README credentials section
- [x] 5.2 Run end-to-end against live data and verify the report opens offline
