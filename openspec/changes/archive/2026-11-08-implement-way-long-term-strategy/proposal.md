# Proposal: Option C Consolidated HTML Dashboard with Embedded Audits (way-long-term-strategy)

## Why

Under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), previous stories implemented individual Tier 4 capabilities: multi-account position blending (`holding-blender`), pooled True Strategy XIRR with friction tracking (`strategy-xirr`), and the Asymmetric Downside Guardrail (`guardrail-engine`). However, investors currently lack a unified, executive master dashboard that synthesizes these disparate components into an actionable, comprehensive strategy review.

Story 4.4 builds the reference Tier 4 Investment Way orchestrator (`way-long-term-strategy`) and the **Option C Consolidated Master HTML Dashboard**. It binds assigned domestic and foreign accounts, unifies blended equity holdings, proves real macroeconomic compounding net of all friction, enforces downside guardrails, and embeds complete Tier 3 valuation audits (Graham, Lynch, Buffett & Munger, Klarman Solvency, and Forensic Governance) into interactive drill-down tabs and drawers, providing high-level executive posture alongside granular auditability.

## What Changes

- **Schema & Framework Validator**:
  - Author `.agents/shared/framework/schemas/strategy-consolidated-portfolio.schema.json` defining the canonical `StrategyConsolidatedPortfolio` draft-07 contract.
  - Export `validateConsolidatedPortfolio(payload)` in `contract_validator.js` and register `schemaType: 'consolidated-portfolio'` in `artifact_harness.js`.
- **Reference Investment Way Orchestrator Skill**:
  - Scaffold `.agents/skills/way-long-term-strategy/` directory layout and author `SKILL.md`.
  - Implement `scripts/lib/orchestrator.js` coordinating multi-account ingestion, holding blending, XIRR solving, and guardrail synthesis.
  - Implement `scripts/lib/audit_embedder.js` embedding Tier 3 valuation and gatekeeper audits into Option C consolidated data structures.
  - Implement `scripts/way_long_term_strategy.js` with Pattern C dual-mode CLI flags (`--way`, `--manifest`, `--blended`, `--xirr`, `--synthesis`, `--out`, `--json-output`).
  - Author `assets/way-long-term-strategy-template.html` self-contained master dashboard featuring executive KPI cards, asset allocation visualizer, interactive lot attribution drawers, and responsive audit tabs for all 5 analysis principles with zero external leaks.
- **Fixtures & Test Suite**:
  - Construct realistic multi-broker strategy fixtures in `tests/fixtures/`.
  - Implement comprehensive unit and integration tests in `tests/way_long_term_strategy.test.js` validating end-to-end orchestration, Option C audit embedding, responsive tab rendering, and CLI execution.

## Capabilities

### New Capabilities
- `skills/way-long-term-strategy`: Master Tier 4 Investment Way orchestrator and Option C consolidated HTML dashboard embedding multi-account blended positions, True Strategy XIRR, downside guardrail verdicts, and interactive Tier 3 valuation audits.

### Modified Capabilities
<!-- None: purely additive reference orchestrator consuming existing framework contracts -->

## Impact

- Provides the primary executive entrypoint for the `fundamental_lts` investment way defined in `config/investment_ways.yaml`.
- Modularly unifies outputs from `holding-blender`, `strategy-xirr`, and `guardrail-engine`.
- Guarantees 100% offline self-containment with zero external network leaks verified via `artifact_harness.js`.

