# Tasks

## 1. Schema Definition & Shared Contract Validator Integration

- [x] 1.1 Author `.agents/shared/framework/schemas/strategy-consolidated-portfolio.schema.json` defining `StrategyConsolidatedPortfolio` draft-07 JSON schema and verify syntax with `validateSchemaFile`.
- [x] 1.2 Export `validateConsolidatedPortfolio(payload)` in `contract_validator.js` and register `schemaType: 'consolidated-portfolio'` in `artifact_harness.js`.
- [x] 1.3 Add contract validation unit tests in `.agents/shared/framework/tests/contract_validator.test.js` and verify passing status via `node --test`.

## 2. Skill Scaffolding & Fixture Construction

- [x] 2.1 Scaffold `.agents/skills/way-long-term-strategy/` directory layout and author `.agents/skills/way-long-term-strategy/SKILL.md`.
- [x] 2.2 Construct realistic multi-account strategy fixtures in `.agents/skills/way-long-term-strategy/tests/fixtures/` (`sample_consolidated_strategy.json`, `sample_embedded_audits.json`).

## 3. Core Orchestration & Option C Audit Embedding Modules

- [x] 3.1 Implement `scripts/lib/audit_embedder.js` compiling and structuring Tier 3 valuation audits (Forensic Governance, Graham, Lynch, Buffett & Munger, Klarman Solvency) into Option C consolidated per-stock audit records.
- [x] 3.2 Implement `scripts/lib/orchestrator.js` coordinating multi-account ingestion, holding blending via `holding-blender`, True Strategy XIRR calculation via `strategy-xirr`, and downside guardrail synthesis via `guardrail-engine`.

## 4. Pattern C CLI & Master Executive HTML Dashboard Template

- [x] 4.1 Implement `.agents/skills/way-long-term-strategy/scripts/way_long_term_strategy.js` with Pattern C dual-mode CLI flags (`--way`, `--manifest`, `--blended`, `--xirr`, `--synthesis`, `--out`, `--json-output`).
- [x] 4.2 Author `assets/way-long-term-strategy-template.html` self-contained master executive dashboard featuring dark mode styling, hero KPI cards, lot attribution drawers, and responsive audit tabs for all 5 principles, verifying zero external asset leaks via `artifact_harness.js`.

## 5. Verification & Test Suite

- [x] 5.1 Implement unit and integration tests in `.agents/skills/way-long-term-strategy/tests/way_long_term_strategy.test.js` validating end-to-end orchestration, Option C audit embedding, responsive tab rendering, and Pattern C CLI execution.
- [x] 5.2 Execute all workspace test suites (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and verify that `openspec validate --all` passes.

## Workflow follow-up

- Apply this change via `/opsx-apply`.
- Archive the change via `/opsx-archive` and sync `skills/way-long-term-strategy` to main specs.
- Update BMad board marking Story 4.4 as done.

