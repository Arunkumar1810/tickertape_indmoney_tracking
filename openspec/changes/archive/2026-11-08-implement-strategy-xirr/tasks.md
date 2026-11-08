# Tasks

## 1. Schema Definition & Shared Contract Validator Integration

- [x] 1.1 Author `.agents/shared/framework/schemas/strategy-xirr.schema.json` defining `StrategyXirrReport` draft-07 JSON schema and verify syntax with `validateSchemaFile`.
- [x] 1.2 Export `validateStrategyXirr(payload)` in `contract_validator.js` and register `schemaType: 'strategy-xirr'` in `artifact_harness.js`.
- [x] 1.3 Add contract validation unit tests in `.agents/shared/framework/tests/contract_validator.test.js` and verify passing status via `node --test`.

## 2. Skill Scaffolding & Fixture Construction

- [x] 2.1 Scaffold `.agents/skills/strategy-xirr/` directory layout and author `.agents/skills/strategy-xirr/SKILL.md`.
- [x] 2.2 Construct realistic multi-account ledger fixtures in `.agents/skills/strategy-xirr/tests/fixtures/` (`sample_angelone_ledger.json`, `sample_indmoney_ledger.json`, `sample_blended_holdings.json`) containing known cash flows, internal transfer pairs, and itemized friction fees.

## 3. Mathematical Core Engines Implementation

- [x] 3.1 Implement `scripts/lib/xirr_math.js` with high-precision analytical Newton-Raphson iteration, bounded bisection fallback $[-0.9999, 10.0]$, and sub-90-day guardrail suppression.
- [x] 3.2 Implement `scripts/lib/ledger_aggregator.js` supporting multi-account cashflow merging, internal transfer cancellation ($net = 0$), multi-currency FX normalization to strategy base currency, and terminal valuation injection.
- [x] 3.3 Implement `scripts/lib/friction_tracker.js` aggregating brokerage, STT, currency conversion markups, and regulatory taxes into an itemized friction deduction audit.

## 4. Pattern C CLI & Offline Dashboard Template

- [x] 4.1 Implement `.agents/skills/strategy-xirr/scripts/strategy_xirr.js` with Pattern C dual-mode CLI flags (`--ledgers`, `--blended`, `--way`, `--manifest`, `--base-currency`, `--fx`, `--out`, `--json-output`).
- [x] 4.2 Author `assets/strategy-xirr-template.html` self-contained offline dashboard with capital timeline waterfall, XIRR metric badges, and friction breakdown, verifying zero external asset leaks via `artifact_harness.js`.

## 5. Verification & Test Suite

- [x] 5.1 Implement unit and integration tests in `.agents/skills/strategy-xirr/tests/strategy_xirr.test.js` validating mathematical convergence, sub-90-day guardrail, internal transfer cancellation, FX normalization, and Pattern C CLI execution.
- [x] 5.2 Execute all workspace test suites (`node --test .agents/skills/*/tests/*.test.js .agents/shared/framework/tests/*.test.js`) and verify that `openspec validate --all` passes.

## Workflow follow-up

- Apply this change via `/opsx-apply`.
- Archive the change via `/opsx-archive` and sync `skills/strategy-xirr` to main specs.
- Update BMad board marking Story 4.2 as done.

