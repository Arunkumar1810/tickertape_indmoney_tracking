# Tasks

## 1. Schema Definition & Shared Contract Validator Integration

- [x] 1.1 Author `.agents/shared/framework/schemas/strategy-verdict-synthesis.schema.json` defining `StrategyVerdictSynthesis` draft-07 JSON schema and verify syntax with `validateSchemaFile`.
- [x] 1.2 Export `validateVerdictSynthesis(payload)` in `contract_validator.js` and register `schemaType: 'verdict-synthesis'` in `artifact_harness.js`.
- [x] 1.3 Add contract validation unit tests in `.agents/shared/framework/tests/contract_validator.test.js` and verify passing status via `node --test`.

## 2. Skill Scaffolding & Fixture Construction

- [x] 2.1 Scaffold `.agents/skills/guardrail-engine/` directory layout and author `.agents/skills/guardrail-engine/SKILL.md`.
- [x] 2.2 Construct realistic multi-verdict fixtures in `.agents/skills/guardrail-engine/tests/fixtures/` (`sample_disqualified_stock.json`, `sample_guardrail_review_stock.json`, `sample_approved_stock.json`, `sample_portfolio_verdicts.json`).

## 3. Core Synthesis & Guardrail Modules

- [x] 3.1 Implement `scripts/lib/gatekeeper_short_circuit.js` to immediately short-circuit forensic governance vetoes to `DISQUALIFIED` with zero capital allocation.
- [x] 3.2 Implement `scripts/lib/downside_guardrail.js` enforcing the Asymmetric Downside Guardrail rule, intercepting any `STRONG_SELL` stance and forcing stance to `NEEDS_REVIEW`.
- [x] 3.3 Implement `scripts/lib/verdict_synthesizer.js` computing weighted composite scores from `config/investment_ways.yaml` weights, applying the `REDUCE` ceiling rule, and aggregating portfolio risk posture metrics (`portfolio_health_score`, `capital_at_risk`).

## 4. Pattern C CLI & Offline Dashboard Template

- [x] 4.1 Implement `.agents/skills/guardrail-engine/scripts/guardrail_engine.js` with Pattern C dual-mode CLI flags (`--verdicts`, `--blended`, `--way`, `--manifest`, `--out`, `--json-output`).
- [x] 4.2 Author `assets/guardrail-engine-template.html` self-contained offline dashboard with portfolio risk gauge, disqualified stock cards, and guardrail warning drawers, verifying zero external asset leaks via `artifact_harness.js`.

## 5. Verification & Test Suite

- [x] 5.1 Implement unit and integration tests in `.agents/skills/guardrail-engine/tests/guardrail_engine.test.js` validating gatekeeper short-circuits, asymmetric downside guardrail, composite weighting, `REDUCE` capping, and Pattern C CLI execution.
- [x] 5.2 Execute all workspace test suites (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and verify that `openspec validate --all` passes.

## Workflow follow-up

- Apply this change via `/opsx-apply`.
- Archive the change via `/opsx-archive` and sync `skills/guardrail-engine` to main specs.
- Update BMad board marking Story 4.3 as done.

