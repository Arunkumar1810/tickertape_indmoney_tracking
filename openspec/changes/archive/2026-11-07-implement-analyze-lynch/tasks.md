# Tasks: Implement analyze-lynch Deterministic Growth Engine

## 1. Skill Scaffolding & Lynch Valuation Engine

- [x] 1.1 Scaffold `.agents/skills/analyze-lynch/` directory structure, author `SKILL.md`, and create comprehensive test fixtures (`lynch_fast_grower.json`, `lynch_stalwart.json`, `lynch_inventory_glut.json`, `lynch_overvalued_growth.json`, `index_etf.json`).
- [x] 1.2 Implement pure deterministic valuation functions in `.agents/skills/analyze-lynch/scripts/analyze_lynch.js` (PEG, yield-adjusted PEG, Lynch Fair Value, inventory velocity divergence, lifecycle categorization) and map to canonical `UniformVerdictContract`.
- [x] 1.3 Add unit tests in `.agents/skills/analyze-lynch/tests/analyze_lynch.test.js` validating mathematical accuracy across fixtures, inventory divergence thresholding, and contract validation via `validateUniformVerdict`.

## 2. Pattern C Dual-Mode CLI & Option C HTML Dashboard

- [x] 2.1 Implement CLI command handling in `analyze_lynch.js` supporting Pattern C Dual-Mode (`--data <path>`, `--ticker <SYMBOL>`, `--holdings <path>`, `--out <dir>`, `--json-output`) and autonomous Tier 2 provider resolution.
- [x] 2.2 Author offline self-contained HTML audit template in `.agents/skills/analyze-lynch/assets/lynch-template.html` with SVG gauges, PEG valuation meter, inventory divergence alert cards, and single & multi-stock matrix rendering.
- [x] 2.3 Add CLI and Option C batch integration tests in `.agents/skills/analyze-lynch/tests/analyze_lynch.test.js` validating batch envelopes (`validateUniformVerdictBatch`) and offline visual self-containment using `artifact_harness.js`.

## 3. Full Verification & Invariant Parity

- [x] 3.1 Run skill test suite (`node --test .agents/skills/analyze-lynch/tests/analyze_lynch.test.js`) and verify all scenarios pass.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 3.3 complete in BMad initiative board.

