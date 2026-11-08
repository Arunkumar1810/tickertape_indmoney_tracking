# Tasks: Implement Multi-Account Holding Blender & Attribution Drawer

## 1. Contract Schema & Framework Validator

- [x] 1.1 Author canonical draft-07 JSON Schema in `.agents/shared/framework/schemas/strategy-holdings-blended.schema.json` defining `strategy_id`, `timestamp`, `base_currency`, `summary`, `accounts_blended`, and `positions` with lot-level `attribution` tranches.
- [x] 1.2 Update `.agents/shared/framework/index.js` to export `validateBlendedHoldings(payload)` and register `schemaType: 'blended-holdings'` in `artifact_harness.js`, adding contract tests in `.agents/shared/framework/tests/`.

## 2. Holding Blender Skill Scaffolding & Pure Mathematical Core

- [x] 2.1 Scaffold `.agents/skills/holding-blender/` directory, author `SKILL.md`, and create test fixtures (`tests/fixtures/sample_angelone_holdings.json`, `tests/fixtures/sample_indmoney_holdings.json`).
- [x] 2.2 Implement pure deterministic blending function `blendHoldings(snapshots, options)` in `.agents/skills/holding-blender/scripts/holding_blender.js` supporting multi-account consolidation, WAC, fractional share precision, multi-currency cash pooling with FX, and immutable lot-level attribution.
- [x] 2.3 Author unit tests in `.agents/skills/holding-blender/tests/holding_blender.test.js` validating mathematical accuracy across domestic, foreign, and fractional positions.

## 3. Interactive Offline Attribution Drawer HTML Dashboard & CLI

- [x] 3.1 Author offline self-contained HTML template in `.agents/skills/holding-blender/assets/holding-blender-template.html` with expandable lot attribution drawers, currency conversion details, and zero external network leaks.
- [x] 3.2 Implement Pattern C Dual-Mode CLI in `holding_blender.js` (`--snapshots <path...>`, `--way <way_id>`, `--manifest <path>`, `--out <dir>`, `--json-output`) and write integration tests validating artifact generation and `verifyArtifactPair` compliance.

## 4. Full Verification & Repository Parity

- [x] 4.1 Run skill test suite (`node --test .agents/skills/holding-blender/tests/holding_blender.test.js`) and verify all scenarios pass.
- [x] 4.2 Run the universal repository test suite (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and confirm zero regressions.

## Workflow follow-up

- Validate and apply change via `/opsx-apply`.
- Archive change and mark Story 4.1 complete in BMad initiative board.
