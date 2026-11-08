# Tasks: Implement analyze-graham Deterministic Valuation Engine

## 1. Skill Scaffolding & Graham Valuation Engine

- [x] 1.1 Scaffold `.agents/skills/analyze-graham/` directory structure, author `SKILL.md`, and create comprehensive test fixtures (`graham_deep_value.json`, `graham_net_net.json`, `graham_overvalued.json`, `graham_negative_eps.json`, `index_etf.json`).
- [x] 1.2 Implement pure deterministic valuation functions in `.agents/skills/analyze-graham/scripts/analyze_graham.js` (Graham Number floor, NNWC, NCAV, Margin of Safety, defensive checks) and map to canonical `UniformVerdictContract`.
- [x] 1.3 Add unit tests in `.agents/skills/analyze-graham/tests/analyze_graham.test.js` validating mathematical accuracy across fixtures, edge cases (negative EPS/BVPS), and contract validation via `validateUniformVerdict`.

## 2. Pattern C Dual-Mode CLI & Option C HTML Dashboard

- [x] 2.1 Implement CLI command handling in `analyze_graham.js` supporting Pattern C Dual-Mode (`--data <path>`, `--ticker <SYMBOL>`, `--holdings <path>`, `--out <dir>`, `--json-output`) and autonomous Tier 2 provider resolution.
- [x] 2.2 Author offline self-contained HTML audit template in `.agents/skills/analyze-graham/assets/graham-template.html` with SVG gauges, valuation floor comparisons, defensive checklist table, and single & multi-stock matrix rendering.
- [x] 2.3 Add CLI and Option C batch integration tests in `.agents/skills/analyze-graham/tests/analyze_graham.test.js` validating batch envelopes (`validateUniformVerdictBatch`) and offline visual self-containment using `artifact_harness.js`.

## 3. Full Verification & Invariant Parity

- [x] 3.1 Run skill test suite (`node --test .agents/skills/analyze-graham/tests/analyze_graham.test.js`) and verify all scenarios pass.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 3.2 complete in BMad initiative board.
