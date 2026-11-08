Created At: 2026-11-07T21:05:01+05:30
Completed At: 2026-11-07T21:12:00+05:30

# Tasks: Implement analyze-klarman-solvency Downside Stress Engine

## 1. Skill Scaffolding & Klarman Solvency Engine

- [x] 1.1 Scaffold `.agents/skills/analyze-klarman-solvency/` directory structure, author `SKILL.md`, and create comprehensive test fixtures (`klarman_fortress.json`, `klarman_distress_cliff.json`, `klarman_leveraged_ebitda.json`, `klarman_thin_interest_coverage.json`, `index_etf.json`).
- [x] 1.2 Implement pure deterministic solvency functions in `.agents/skills/analyze-klarman-solvency/scripts/analyze_klarman_solvency.js` (Altman Z-Score, Net Debt / EBITDA, debt maturity cliff, interest coverage, accrual gap) and map to canonical `UniformVerdictContract`.
- [x] 1.3 Add unit tests in `.agents/skills/analyze-klarman-solvency/tests/analyze_klarman_solvency.test.js` validating mathematical accuracy across fixtures, Altman Z-Score zones, debt cliff thresholding, and contract validation via `validateUniformVerdict`.

## 2. Pattern C Dual-Mode CLI & Option C HTML Dashboard

- [x] 2.1 Implement CLI command handling in `analyze_klarman_solvency.js` supporting Pattern C Dual-Mode (`--data <path>`, `--ticker <SYMBOL>`, `--holdings <path>`, `--out <dir>`, `--json-output`) and autonomous Tier 2 provider resolution.
- [x] 2.2 Author offline self-contained HTML audit template in `.agents/skills/analyze-klarman-solvency/assets/klarman-solvency-template.html` with SVG gauges, Altman Z-Score zone meter, debt maturity cliff visualizer, and single & multi-stock matrix rendering.
- [x] 2.3 Add CLI and Option C batch integration tests in `.agents/skills/analyze-klarman-solvency/tests/analyze_klarman_solvency.test.js` validating batch envelopes (`validateUniformVerdictBatch`) and offline visual self-containment using `artifact_harness.js`.

## 3. Full Verification & Invariant Parity

- [x] 3.1 Run skill test suite (`node --test .agents/skills/analyze-klarman-solvency/tests/analyze_klarman_solvency.test.js`) and verify all scenarios pass.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 3.5 complete in BMad initiative board.
