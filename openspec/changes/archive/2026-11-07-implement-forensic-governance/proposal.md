# Proposal: Implement forensic-governance Gatekeeper with Veto Protocol

## Why

In fundamental equity analysis, evaluating valuation multiples or growth prospects on companies with compromised accounting integrity, aggressive promoter pledging, or governance rot exposes investors to catastrophic downside risk. Story 3.1 builds the `forensic-governance` skill as the first and mandatory Tier 3 Gatekeeper in the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`). It executes independent forensic audits on Indian and US equities, enforcing the Gatekeeper Veto Protocol (`is_veto: true`, `stance: "VETO_DISQUALIFIED"`) to protect capital before downstream valuation engines run.

## What Changes

- Implement `.agents/skills/forensic-governance/scripts/forensic_governance.js` providing:
  - **Pattern C Dual-Mode CLI Execution**:
    - `--data <path>`: Deterministic offline mode evaluating a local `NormalizedCompanyFinancials` JSON file.
    - `--ticker <SYMBOL> [--market <IN|US>]`: Autonomous mode querying `provider-tickertape` or local financial cache.
    - `--holdings <path>`: Batch evaluation mode ingesting an `AccountHoldingsSnapshot` and emitting an Option C consolidated portfolio batch envelope.
    - `--out <dir>` and `--json-output` options.
  - **Forensic Audit Engine & Hard Veto Rules**:
    - **Promoter Pledging**: Warning at >25%, hard veto (`VETO_DISQUALIFIED`, `is_veto: true`) at >50%.
    - **Related-Party Transactions (RPT)**: Warning at >10% of revenue, hard veto at >25%.
    - **Auditor Continuity & Independence**: Hard veto on `auditor_resignation_flag: true` or `qualified_opinion_flag: true`.
    - **Beneish M-Score**: Warning at > -2.22, hard veto at > -1.78 (high probability of earnings manipulation).
    - **Sloan Accrual Ratio**: Warning at > 0.10, hard veto at > 0.25 (excessive non-cash accruals).
    - **SEBI / Exchange Surveillance**: Hard veto on ASM/GSM stages 3 and 4.
    - **Share Dilution / SBC Growth**: Warning at YoY expansion >5%, hard veto at >10%.
    - **Index ETF Bypass**: Broad market index ETFs (`VOO`, `QQQ`, `SPY`, etc.) bypass single-company corporate governance filters with automatic `PASS` and score 100.
  - **Canonical Contract Output**: Emits `UniformVerdictContract` (SingleVerdict or VerdictBatch) adhering to draft-07 JSON Schema.
  - **Standalone Offline HTML Audit Dashboard**: Renders a self-contained HTML audit dashboard (`assets/forensic-template.html`) displaying metric gauges, red-flag checklists, stance badges, and zero external network leaks (Invariant 2).
- Create skill definition `.agents/skills/forensic-governance/SKILL.md`.
- Provide comprehensive test coverage in `.agents/skills/forensic-governance/tests/forensic_governance.test.js` validating clean pass securities, promoter pledge vetoes, auditor resignation vetoes, earnings manipulation vetoes, Index ETF bypass, Pattern C dual-mode, and `artifact_harness` verification.

## Capabilities

### New Capabilities
- `skills/forensic-governance`: Deterministic Tier 3 gatekeeper evaluation engine enforcing the Gatekeeper Veto Protocol (`is_veto: true`, `VETO_DISQUALIFIED`) across accounting, promoter, and forensic risks.

### Modified Capabilities
<!-- None -->

## Impact

- Adds new skill directory `.agents/skills/forensic-governance/`.
- Ingests `NormalizedCompanyFinancials` and emits `UniformVerdictContract`.
- Reuses `.agents/shared/framework/` schemas, contract validators, and verification harness.
- Unlocks Story 3.1 and kicks off Epic 3 (`Tier 3 Five-Pillar Valuation Suite`).

