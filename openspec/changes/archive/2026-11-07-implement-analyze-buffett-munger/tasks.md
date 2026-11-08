# Tasks: Implement analyze-buffett-munger Compounding Engine

## 1. Skill Scaffolding & Buffett-Munger Engine

- [x] 1.1 Scaffold `.agents/skills/analyze-buffett-munger/` directory structure, author `SKILL.md`, and create comprehensive test fixtures (`buffett_wide_moat.json`, `buffett_sbc_dilution.json`, `buffett_leveraged_roe.json`, `buffett_capital_destructive.json`, `index_etf.json`).
- [x] 1.2 Implement pure deterministic compounding valuation functions in `.agents/skills/analyze-buffett-munger/scripts/analyze_buffett_munger.js` (true Owner Earnings, SBC dilution, 5-step DuPont ROE, ROIC calculation, economic moat scoring) and map to canonical `UniformVerdictContract`.
- [x] 1.3 Add unit tests in `.agents/skills/analyze-buffett-munger/tests/analyze_buffett_munger.test.js` validating mathematical accuracy across fixtures, SBC dilution thresholds, DuPont decomposition integrity, and contract validation via `validateUniformVerdict`.

## 2. Pattern C Dual-Mode CLI & Option C HTML Dashboard

- [x] 2.1 Implement CLI command handling in `analyze_buffett_munger.js` supporting Pattern C Dual-Mode (`--data <path>`, `--ticker <SYMBOL>`, `--holdings <path>`, `--out <dir>`, `--json-output`) and autonomous Tier 2 provider resolution.
- [x] 2.2 Author offline self-contained HTML audit template in `.agents/skills/analyze-buffett-munger/assets/buffett-munger-template.html` with SVG gauges, 5-step DuPont decomposition cards, Owner Earnings meters, and single & multi-stock matrix rendering.
- [x] 2.3 Add CLI and Option C batch integration tests in `.agents/skills/analyze-buffett-munger/tests/analyze_buffett_munger.test.js` validating batch envelopes (`validateUniformVerdictBatch`) and offline visual self-containment using `artifact_harness.js`.

## 3. Full Verification & Invariant Parity

- [x] 3.1 Run skill test suite (`node --test .agents/skills/analyze-buffett-munger/tests/analyze_buffett_munger.test.js`) and verify all scenarios pass.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 3.4 complete in BMad initiative board.

