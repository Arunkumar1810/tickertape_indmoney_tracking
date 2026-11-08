# Tasks: Implement forensic-governance Gatekeeper with Veto Protocol

## 1. Skill Scaffolding & Forensic Audit Engine

- [x] 1.1 Scaffold `.agents/skills/forensic-governance/` directory structure, author `SKILL.md`, and create comprehensive test fixtures (`clean_pass.json`, `promoter_pledge_veto.json`, `auditor_resignation_veto.json`, `earnings_manipulation_veto.json`, `index_etf.json`).
- [x] 1.2 Implement deterministic forensic evaluation engine in `.agents/skills/forensic-governance/scripts/forensic_governance.js` calculating metrics, deductions, and enforcing Gatekeeper Veto Protocol (`is_veto: true`, `VETO_DISQUALIFIED`).
- [x] 1.3 Add unit tests in `.agents/skills/forensic-governance/tests/forensic_governance.test.js` covering calculation of metrics, veto trigger rules, and contract validation via `validateUniformVerdict`.

## 2. Pattern C Dual-Mode CLI & Option C HTML Dashboard

- [x] 2.1 Implement CLI command handling in `forensic_governance.js` supporting Pattern C Dual-Mode (`--data <path>`, `--ticker <SYMBOL>`, `--holdings <path>`, `--out <dir>`, `--json-output`) and autonomous Tier 2 provider resolution.
- [x] 2.2 Author offline self-contained HTML audit template in `.agents/skills/forensic-governance/assets/forensic-template.html` with SVG gauges, red-flag checklists, and single & multi-stock matrix rendering.
- [x] 2.3 Add CLI and Option C batch integration tests in `.agents/skills/forensic-governance/tests/forensic_governance.test.js` validating batch envelopes (`validateUniformVerdictBatch`) and offline visual self-containment using `artifact_harness.js`.

## 3. Full Verification & Invariant Parity

- [x] 3.1 Run skill test suite (`node --test .agents/skills/forensic-governance/tests/forensic_governance.test.js`) and verify all scenarios pass.
- [x] 3.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 3.1 complete in BMad initiative board.
